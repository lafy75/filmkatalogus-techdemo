// Filmkatalogus REST API - C# + ASP.NET Core Minimal API (.NET 10) + MySqlConnector + Dapper
// Inditas: dotnet run  ->  http://127.0.0.1:5001
// A szerzodes: ../API.md
using System.Text.Json;
using Dapper;
using MySqlConnector;

// Kapcsolat a MariaDB/MySQL szerverhez - alapbol az XAMPP beallitasai
string Env(string nev, string alap) => Environment.GetEnvironmentVariable(nev) ?? alap;

string kapcsolat =
    $"Server={Env("DB_HOST", "127.0.0.1")};Port={Env("DB_PORT", "3306")};" +
    $"User ID={Env("DB_USER", "root")};Password={Env("DB_PASSWORD", "")};" +
    $"Database={Env("DB_NAME", "filmkatalogus")}";
string port = Env("PORT", "5001");

const string Oszlopok = "id, cim, ev, perc, mufaj, ertekeles, kedvenc";

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors();
var app = builder.Build();

// Adatbazis-hiba (pl. nem fut a MariaDB): 500
app.UseExceptionHandler(hibaApp => hibaApp.Run(async context =>
{
    context.Response.StatusCode = 500;
    await context.Response.WriteAsJsonAsync(new { error = Hiba.Szerver });
}));
app.UseCors(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());

app.MapGet("/filmek", async (string? mufaj) =>
{
    await using var conn = new MySqlConnection(kapcsolat);
    var filmek = mufaj is null
        ? await conn.QueryAsync<Film>($"SELECT {Oszlopok} FROM filmek ORDER BY id")
        : await conn.QueryAsync<Film>($"SELECT {Oszlopok} FROM filmek WHERE mufaj = @mufaj ORDER BY id", new { mufaj });
    return Results.Ok(filmek);
});

app.MapGet("/filmek/{id:int}", async (int id) =>
{
    await using var conn = new MySqlConnection(kapcsolat);
    var film = await conn.QuerySingleOrDefaultAsync<Film>($"SELECT {Oszlopok} FROM filmek WHERE id = @id", new { id });
    return film is null ? Hiba.NemTalalhato() : Results.Ok(film);
});

app.MapPost("/filmek", async (HttpRequest request) =>
{
    var (film, hiba) = await Ellenorzes.Beolvas(request);
    if (film is null) return Hiba.RosszKeres(hiba!);

    await using var conn = new MySqlConnection(kapcsolat);
    await conn.OpenAsync(); // egy kapcsolaton kell maradnia a LAST_INSERT_ID() miatt
    await conn.ExecuteAsync(
        "INSERT INTO filmek (cim, ev, perc, mufaj, ertekeles, kedvenc) " +
        "VALUES (@Cim, @Ev, @Perc, @Mufaj, @Ertekeles, @Kedvenc)", film);
    film.Id = await conn.ExecuteScalarAsync<int>("SELECT LAST_INSERT_ID()");
    return Results.Created($"/filmek/{film.Id}", film);
});

app.MapPut("/filmek/{id:int}", async (int id, HttpRequest request) =>
{
    var (film, hiba) = await Ellenorzes.Beolvas(request);
    if (film is null) return Hiba.RosszKeres(hiba!); // a 400 megelozi a 404-et

    await using var conn = new MySqlConnection(kapcsolat);
    var letezik = await conn.ExecuteScalarAsync<int?>("SELECT id FROM filmek WHERE id = @id", new { id });
    if (letezik is null) return Hiba.NemTalalhato();

    film.Id = id;
    await conn.ExecuteAsync(
        "UPDATE filmek SET cim = @Cim, ev = @Ev, perc = @Perc, mufaj = @Mufaj, " +
        "ertekeles = @Ertekeles, kedvenc = @Kedvenc WHERE id = @Id", film);
    return Results.Ok(film);
});

app.MapDelete("/filmek/{id:int}", async (int id) =>
{
    await using var conn = new MySqlConnection(kapcsolat);
    int torolt = await conn.ExecuteAsync("DELETE FROM filmek WHERE id = @id", new { id });
    return torolt == 0 ? Hiba.NemTalalhato() : Results.NoContent();
});

// Minden mas utvonal (es a nem egesz szamu id, pl. /filmek/abc vagy /filmek/1.5): 404
// A "{*path}" minta kell: az alapertelmezett minta a pontot tartalmazo utvonalakat kihagyja
app.MapFallback("{*path}", () => Hiba.NemTalalhato());

app.Run($"http://localhost:{port}");


// A film - a JSON-ban camelCase nevekkel jelenik meg: id, cim, ev, ...
class Film
{
    public int Id { get; set; }
    public string Cim { get; set; } = "";
    public int Ev { get; set; }
    public int Perc { get; set; }
    public string Mufaj { get; set; } = "";
    public int Ertekeles { get; set; }
    public bool Kedvenc { get; set; }
}

static class Hiba
{
    public const string Json = "A keres torzse nem ervenyes JSON objektum.";
    public const string Cim = "A cim kotelezo: 1-100 karakteres szoveg.";
    public const string Ev = "Az ev kotelezo: egesz szam 1900 es 2100 kozott.";
    public const string Perc = "A perc kotelezo: egesz szam 1 es 600 kozott.";
    public const string Mufaj = "A mufaj kotelezo: 1-30 karakteres szoveg.";
    public const string Ertekeles = "Az ertekeles kotelezo: egesz szam 0 es 5 kozott.";
    public const string Kedvenc = "A kedvenc kotelezo: true vagy false.";
    public const string Nincs = "A keresett film vagy utvonal nem talalhato.";
    public const string Szerver = "Szerverhiba - fut az adatbazis?";

    public static IResult RosszKeres(string uzenet) => Results.Json(new { error = uzenet }, statusCode: 400);
    public static IResult NemTalalhato() => Results.Json(new { error = Nincs }, statusCode: 404);
}

// A torzset kezzel olvassuk be, hogy a tipusokat szigoruan ellenorizzuk:
// "1999" nem szam, true nem szam, 1 nem logikai ertek (lasd API.md)
static class Ellenorzes
{
    public static async Task<(Film? film, string? hiba)> Beolvas(HttpRequest request)
    {
        // Mint a tobbi backendnel: csak Content-Type: application/json torzset fogadunk el
        if (!request.HasJsonContentType()) return (null, Hiba.Json);

        JsonDocument dokumentum;
        try
        {
            dokumentum = await JsonDocument.ParseAsync(request.Body);
        }
        catch (JsonException)
        {
            return (null, Hiba.Json); // hibas vagy hianyzo JSON
        }

        using (dokumentum)
        {
            return Ellenoriz(dokumentum.RootElement);
        }
    }

    // A mezoket az API.md sorrendjeben nezi, az elso hiba dont
    static (Film? film, string? hiba) Ellenoriz(JsonElement torzs)
    {
        if (torzs.ValueKind != JsonValueKind.Object) return (null, Hiba.Json);
        if (!Szoveg(torzs, "cim", 100, out string cim)) return (null, Hiba.Cim);
        if (!Egesz(torzs, "ev", 1900, 2100, out int ev)) return (null, Hiba.Ev);
        if (!Egesz(torzs, "perc", 1, 600, out int perc)) return (null, Hiba.Perc);
        if (!Szoveg(torzs, "mufaj", 30, out string mufaj)) return (null, Hiba.Mufaj);
        if (!Egesz(torzs, "ertekeles", 0, 5, out int ertekeles)) return (null, Hiba.Ertekeles);
        if (!torzs.TryGetProperty("kedvenc", out JsonElement kedvenc) ||
            (kedvenc.ValueKind != JsonValueKind.True && kedvenc.ValueKind != JsonValueKind.False))
            return (null, Hiba.Kedvenc);

        var film = new Film
        {
            Cim = cim, Ev = ev, Perc = perc, Mufaj = mufaj,
            Ertekeles = ertekeles, Kedvenc = kedvenc.GetBoolean(),
        };
        return (film, null);
    }

    static bool Szoveg(JsonElement torzs, string nev, int max, out string ertek)
    {
        ertek = "";
        if (!torzs.TryGetProperty(nev, out JsonElement elem) || elem.ValueKind != JsonValueKind.String) return false;
        ertek = elem.GetString()!.Trim();
        return ertek.Length >= 1 && ertek.Length <= max;
    }

    static bool Egesz(JsonElement torzs, string nev, int min, int max, out int ertek)
    {
        ertek = 0;
        return torzs.TryGetProperty(nev, out JsonElement elem)
            && elem.ValueKind == JsonValueKind.Number
            && elem.TryGetInt32(out ertek)
            && ertek >= min && ertek <= max;
    }
}
