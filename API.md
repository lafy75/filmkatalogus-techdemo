# Filmkatalógus API – közös szerződés

Ez a dokumentum az **egyetlen igazságforrás** a négy backend számára. Mind a négy backend pontosan ezt valósítja meg, ezért a frontend bármelyikkel változtatás nélkül működik. A megfelelést a `contract-test/contract-test.mjs` ellenőrzi.

## Backendek és portok

| Backend | Technológia | Cím |
|---|---|---|
| C# | ASP.NET Core Minimal API (.NET 10) + MySqlConnector + Dapper | `http://127.0.0.1:5001` |
| Node.js | Express 5 + mysql2 | `http://127.0.0.1:5002` |
| Python | Flask + PyMySQL | `http://127.0.0.1:5003` |
| Python | FastAPI + PyMySQL | `http://127.0.0.1:5004` |

Adatbázis: `filmkatalogus` (MariaDB/MySQL, `127.0.0.1:3306`, felhasználó `root`, jelszó üres – az XAMPP alapértelmezése). Mindegyik backend felülírható környezeti változókkal: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`.

## A film objektum

```json
{ "id": 1, "cim": "Mátrix", "ev": 1999, "perc": 136, "mufaj": "sci-fi", "ertekeles": 5, "kedvenc": true }
```

| Mező | JSON-típus | Szabály (kérésben) |
|---|---|---|
| `id` | egész szám | Csak a válaszban. A kérés törzsében lévő `id`-t a backend figyelmen kívül hagyja. |
| `cim` | szöveg | Kötelező. A két szélén lévő szóközöket a backend levágja, utána 1–100 karakter. |
| `ev` | egész szám | Kötelező, 1900–2100. |
| `perc` | egész szám | Kötelező, 1–600. |
| `mufaj` | szöveg | Kötelező. Levágott szóközökkel 1–30 karakter. |
| `ertekeles` | egész szám | Kötelező, 0–5 (0 = még nincs értékelve). |
| `kedvenc` | logikai | Kötelező, `true` vagy `false`. |

A típus szigorú: `"1999"` (szöveg) nem egész szám, `true` nem egész szám, `1` nem logikai érték. Az ismeretlen mezőket a backend figyelmen kívül hagyja.

## Végpontok

| Metódus | Útvonal | Siker | Hiba |
|---|---|---|---|
| `GET` | `/filmek` | `200` + a filmek tömbje `id` szerint növekvő sorrendben | – |
| `GET` | `/filmek?mufaj=sci-fi` | `200` + csak az adott műfajú filmek | – |
| `GET` | `/filmek/{id}` | `200` + a film | `404` |
| `POST` | `/filmek` | `201` + a létrehozott film, benne az új `id` | `400` |
| `PUT` | `/filmek/{id}` | `200` + a módosított film (teljes csere, minden mező kötelező) | `400`, `404` |
| `DELETE` | `/filmek/{id}` | `204`, üres törzs | `404` |

## Hibaválaszok

Minden hibaválasz JSON, egyetlen mezővel:

```json
{ "error": "Az ev kotelezo: egesz szam 1900 es 2100 kozott." }
```

| Státusz | Mikor | `error` szövege |
|---|---|---|
| `400` | A törzs nem érvényes JSON, nem objektum (pl. tömb), hiányzik, vagy a `Content-Type` nem `application/json` | `A keres torzse nem ervenyes JSON objektum.` |
| `400` | Hibás `cim` | `A cim kotelezo: 1-100 karakteres szoveg.` |
| `400` | Hibás `ev` | `Az ev kotelezo: egesz szam 1900 es 2100 kozott.` |
| `400` | Hibás `perc` | `A perc kotelezo: egesz szam 1 es 600 kozott.` |
| `400` | Hibás `mufaj` | `A mufaj kotelezo: 1-30 karakteres szoveg.` |
| `400` | Hibás `ertekeles` | `Az ertekeles kotelezo: egesz szam 0 es 5 kozott.` |
| `400` | Hibás `kedvenc` | `A kedvenc kotelezo: true vagy false.` |
| `404` | Nincs ilyen `id`, az `id` nem egész szám, vagy ismeretlen útvonal | `A keresett film vagy utvonal nem talalhato.` |
| `500` | Adatbázis-hiba (pl. nem fut a MariaDB) | `Szerverhiba - fut az adatbazis?` |

Szabályok:

- **Ha több mező hibás, az első hibás mező üzenete jön**, ebben a sorrendben: `cim`, `ev`, `perc`, `mufaj`, `ertekeles`, `kedvenc`.
- **A `400` megelőzi a `404`-et:** hibás törzzsel küldött `PUT` nem létező, de egész számú `id`-re `400`-at ad. Ha az `id` nem egész szám (pl. `/filmek/abc`), az útvonal nem létezik, ezért mindig `404` jön, a törzstől függetlenül.
- Az üzenetek szövege mind a négy backendben betűre azonos. A contract teszt alapból a szöveget is betűre ellenőrzi; a `--laza` kapcsolóval csak azt nézi, hogy az `error` nem üres szöveg (diákmegoldásokhoz).
- Az `500` törzse *legjobb szándékú*: ha a hiba a backend saját kódján kívül keletkezik, a böngésző CORS miatt nem biztos, hogy látja. A frontend ezért egy általános hibaüzenetet is mutat.

## CORS

Minden backend bármely originről engedi a kéréseket (`Access-Control-Allow-Origin: *`, a Flask a `*` helyett a kérés originjét adja vissza – a böngésző szempontjából ez azonos), a `GET`, `POST`, `PUT` és `DELETE` metódust és a `Content-Type` fejlécet. A preflight (`OPTIONS`) kérésre 2xx a válasz. Így a frontend Live Serverről (5500-as port) és közvetlenül fájlként megnyitva is működik.

## Eltérés a json-servertől (a Frontend órák miatt fontos)

A Frontend tanmenet 109–122. óráján json-serverrel dolgoznak. A json-server 1.0.0-beta.15 (az `npm install json-server` ezt telepíti) **szövegként adja vissza az `id`-t** (`"1"`), és az új elemeknek véletlen szöveges azonosítót ad (pl. `"HJR2M8L2H4U"`). Ez az API **számot** ad. Ha a frontend kód `f.id === id` alakban hasonlít, és az `id` az URL-ből érkező szöveg, akkor `Number(id)`-re kell alakítani. További eltérések: a json-server nem validál (nincs `400`), és törléskor `200`-at ad a törölt elemmel, nem `204`-et.
