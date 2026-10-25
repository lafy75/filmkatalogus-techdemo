# Filmkatalógus – tech demo: egy frontend, négy backend

A Frontend órák filmkatalógusára épülő, szándékosan minimális webalkalmazás. **Ugyanaz az adatbázis és ugyanaz a frontend** működik négy, egymással teljesen felcserélhető backenddel. A frontenden egy legördülő menüvel lehet váltani köztük, újraindítás nélkül.

| Backend | Technológia | Port |
|---|---|---|
| `backend-csharp` | C# – ASP.NET Core Minimal API (.NET 10) + MySqlConnector + Dapper | 5001 |
| `backend-node` | Node.js – Express 5 + mysql2 | 5002 |
| `backend-flask` | Python – Flask + PyMySQL | 5003 |
| `backend-fastapi` | Python – FastAPI + PyMySQL | 5004 |

A közös szerződés az **[API.md](API.md)**: végpontok, mezők, validációs szabályok, hibaüzenetek. A **`contract-test`** mappában lévő teszt bármelyik backendről eldönti, hogy pontosan ezt valósítja-e meg.

## Mappaszerkezet

```
filmkatalogus-techdemo/
  API.md                    a kozos szerzodes
  database/filmkatalogus.sql
  frontend/                 index.html, style.css, app.js (nincs build step)
  backend-csharp/           FilmApi.csproj, Program.cs
  backend-node/             package.json, server.js
  backend-flask/            requirements.txt, app.py
  backend-fastapi/          requirements.txt, main.py
  contract-test/            contract-test.mjs
  docs/                     kepernyokepek
```

## Előfeltételek

- **XAMPP** – a „MySQL” modulja valójában MariaDB: a régebbi XAMPP 8.2.12-ben 10.4, a most letölthető 8.3–8.5-ös változatokban 10.11. Az SQL 10.4-kompatibilis, a tesztek 10.11-en futottak. Root felhasználó, üres jelszó (alapbeállítás).
- **Node.js 18+** – a Node backendhez és a contract teszthez. Ajánlott a 24-es LTS.
- **Python 3.10+** – a két Python backendhez.
- **.NET 10 SDK** – a C# backendhez. Visual Studióból csak a **VS 2026** nyitja meg; VS 2022-vel a `dotnet` parancssorból (pl. VS Code-ból) futtatható.

## Indítás (Windows)

**1. Adatbázis.** Az XAMPP Control Panelen indítsd el a MySQL-t, majd a phpMyAdminban: *Importálás* → `database/filmkatalogus.sql`. Parancssorból is mehet:

```
C:\xampp\mysql\bin\mysql -u root < database\filmkatalogus.sql
```

Az import a meglévő `filmkatalogus` adatbázist törli és újra létrehozza – így bármikor vissza lehet állni az öt mintafilmre.

**2. Backendek** – mindegyik külön terminálban, a projekt gyökeréből indulva:

```
cd backend-csharp
dotnet run
```

```
cd backend-node
npm install
npm start
```

```
cd backend-flask
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

```
cd backend-fastapi
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

A FastAPI automatikus API-dokumentációja: `http://127.0.0.1:5004/docs`.

**3. Frontend.** Nyisd meg a `frontend/index.html`-t VS Code-ban, és indítsd Live Serverrel (vagy egyszerűen nyisd meg a fájlt a böngészőben). A fejlécben válaszd ki a backendet. A választást a böngésző megjegyzi.

**4. Contract teszt** – a projekt gyökeréből:

```
node contract-test\contract-test.mjs                          (mind a negy backend)
node contract-test\contract-test.mjs http://127.0.0.1:5001    (csak a C#)
node contract-test\contract-test.mjs --laza http://...        (diakmegoldashoz: a hibauzenet szovege nem szamit)
```

A nem futó backendeket „NEM ERHETO EL” jelzéssel átugorja. A teszt saját, egyedi műfajú filmet hoz létre és töröl; a mintaadatokat nem módosítja.

## Ellenőrzési állapot

| Mi | Eredmény | Hol |
|---|---|---|
| Node, Flask, FastAPI – contract teszt | **53/53** mindhárom | MariaDB 10.11, Linux |
| Frontend – végponttól végpontig, valódi böngészőben | **52/52**: lista, szűrés, hibaüzenet, felvitel, szerkesztés, törlés mindhárom backenddel; 390 / 768 / 1366 px elrendezés | Chrome 153 (headless) |
| Adatbázis-leállás | mindhárom backend `500` + szerződés szerinti üzenet, újraindítás után helyreáll | MariaDB 10.11 |
| **C# backend** | **itt nem fordítható** (a NuGet és a .NET SDK letöltése tiltott volt). Szintaktikai elemzés: 0 hiba. Független forráskód-review a .NET 10 / Dapper / MySqlConnector forrása alapján: nincs blokkoló hiba. | – |

**A C# backendet ezért elsőként a saját gépeden kell ellenőrizni:**

```
cd backend-csharp
dotnet run
```

majd egy másik terminálban, a projekt gyökeréből:

```
node contract-test\contract-test.mjs http://127.0.0.1:5001
```

Elvárt eredmény: `53/53 OK`. Ha bármelyik sor `HIBA`, a teljes kimenetet hozd vissza, és javítom.

## Szerződésen kívüli, ismert eltérések

- `HEAD` kérésre a C# `404`-et ad, a másik három `200`-at (a `MapGet` csak a GET-et regisztrálja). A frontend nem használja.
- A CORS-fejléc értéke a Flasknál a kérés originje, a többinél `*` – a böngésző szempontjából azonos.
- Az ékezetes karaktereket a C# a JSON-ban `\u00e1` alakban küldi, a többi nyersen – a beolvasott adat azonos.

## Megjegyzések

- **Ékezetek a forráskódban:** a szabálykönyv NY4 pontja szerint a forráskódban nincs ékezet (kommentek, szövegkonstansok, a felület feliratai). Az adatbázis adatai (pl. „Mátrix”) ékezetesek. Ha a felületen ékezetet szeretnél, az NY4 alóli kivétel kell.
- **Miért `127.0.0.1` és nem `localhost`?** A `localhost` egyes rendszereken IPv6-ra (`::1`) oldódik fel, amin az XAMPP MariaDB nem feltétlenül figyel. A fix IPv4-cím ezt a hibalehetőséget kizárja.
- **Környezeti változók** (mind a négy backendben): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`.
- **Nyers SQL mindenhol:** a négy backend ugyanazt az öt SQL-utasítást futtatja, így sorról sorra összehasonlítható. A C# ezért nem Entity Framework Core-t használ. Ráadásul az EF Core 10-hez nincs ingyenes, MariaDB-t támogató provider: a Pomelo legutóbbi kiadása 9.0.0, az Oracle `MySql.EntityFrameworkCore` 10.x csak MySQL-t támogat, a Devart-féle fizetős (ellenőrizve 2026-10-25).
