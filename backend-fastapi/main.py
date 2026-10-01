# Filmkatalogus REST API - Python + FastAPI + PyMySQL
# Inditas: pip install -r requirements.txt, majd python main.py  ->  http://127.0.0.1:5004
# Automatikus API-dokumentacio: http://127.0.0.1:5004/docs
# A szerzodes: ../API.md
import os
from typing import Annotated

import pymysql
import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from starlette.exceptions import HTTPException as StarletteHTTPException

PORT = int(os.environ.get("PORT", 5004))

OSZLOPOK = "id, cim, ev, perc, mufaj, ertekeles, kedvenc"

HIBA = {
    "json": "A keres torzse nem ervenyes JSON objektum.",
    "cim": "A cim kotelezo: 1-100 karakteres szoveg.",
    "ev": "Az ev kotelezo: egesz szam 1900 es 2100 kozott.",
    "perc": "A perc kotelezo: egesz szam 1 es 600 kozott.",
    "mufaj": "A mufaj kotelezo: 1-30 karakteres szoveg.",
    "ertekeles": "Az ertekeles kotelezo: egesz szam 0 es 5 kozott.",
    "kedvenc": "A kedvenc kotelezo: true vagy false.",
    "nincs": "A keresett film vagy utvonal nem talalhato.",
    "szerver": "Szerverhiba - fut az adatbazis?",
}
MEZOK = ("cim", "ev", "perc", "mufaj", "ertekeles", "kedvenc")

app = FastAPI(title="Filmkatalogus API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class FilmBe(BaseModel):
    """A POST es a PUT torzse. strict=True: nincs automatikus tipusatalakitas ("1999" nem szam)."""

    model_config = ConfigDict(strict=True)

    cim: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    ev: Annotated[int, Field(ge=1900, le=2100)]
    perc: Annotated[int, Field(ge=1, le=600)]
    mufaj: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    ertekeles: Annotated[int, Field(ge=0, le=5)]
    kedvenc: bool


# Kapcsolat a MariaDB/MySQL szerverhez - alapbol az XAMPP beallitasai
def kapcsolat():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "filmkatalogus"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


# Az adatbazis a BOOLEAN-t 0/1-kent adja vissza, ezert True/False-ra alakitjuk
def filmbol(sor):
    return {
        "id": sor["id"], "cim": sor["cim"], "ev": sor["ev"], "perc": sor["perc"],
        "mufaj": sor["mufaj"], "ertekeles": sor["ertekeles"], "kedvenc": bool(sor["kedvenc"]),
    }


def hiba(statusz, uzenet):
    return JSONResponse(status_code=statusz, content={"error": uzenet})


# A FastAPI alapbol 422-t ad a hibas kerésre - a kozos szerzodes szerint 400 (vagy 404) kell
@app.exception_handler(RequestValidationError)
async def ervenytelen_keres(request: Request, exc: RequestValidationError):
    hely = exc.errors()[0]["loc"]  # az elso hiba dont, a mezok sorrendjeben jonnek
    if hely[0] == "path":          # pl. /filmek/abc: nincs ilyen film
        return hiba(404, HIBA["nincs"])
    mezo = hely[1] if len(hely) > 1 else None
    return hiba(400, HIBA[mezo] if mezo in MEZOK else HIBA["json"])


# Ismeretlen utvonal: a FastAPI alapbol {"detail": ...}-t adna
@app.exception_handler(StarletteHTTPException)
async def http_hiba(request: Request, exc: StarletteHTTPException):
    return hiba(exc.status_code, HIBA["nincs"] if exc.status_code == 404 else str(exc.detail))


# Adatbazis-hiba (pl. nem fut a MariaDB): 500
@app.exception_handler(pymysql.MySQLError)
async def adatbazis_hiba(request: Request, exc: pymysql.MySQLError):
    return hiba(500, HIBA["szerver"])


@app.get("/filmek")
def lista(mufaj: str | None = None):
    with kapcsolat() as conn, conn.cursor() as cur:
        if mufaj is None:
            cur.execute(f"SELECT {OSZLOPOK} FROM filmek ORDER BY id")
        else:
            cur.execute(f"SELECT {OSZLOPOK} FROM filmek WHERE mufaj = %s ORDER BY id", (mufaj,))
        return [filmbol(sor) for sor in cur.fetchall()]


@app.get("/filmek/{film_id}")
def egy_film(film_id: int):
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT {OSZLOPOK} FROM filmek WHERE id = %s", (film_id,))
        sor = cur.fetchone()
    if sor is None:
        return hiba(404, HIBA["nincs"])
    return filmbol(sor)


@app.post("/filmek", status_code=201)
def letrehoz(film: FilmBe):
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO filmek (cim, ev, perc, mufaj, ertekeles, kedvenc) VALUES (%s, %s, %s, %s, %s, %s)",
            (film.cim, film.ev, film.perc, film.mufaj, film.ertekeles, film.kedvenc),
        )
        return {"id": cur.lastrowid, **film.model_dump()}


@app.put("/filmek/{film_id}")
def modosit(film_id: int, film: FilmBe):
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM filmek WHERE id = %s", (film_id,))
        if cur.fetchone() is None:
            return hiba(404, HIBA["nincs"])
        cur.execute(
            "UPDATE filmek SET cim = %s, ev = %s, perc = %s, mufaj = %s, ertekeles = %s, kedvenc = %s WHERE id = %s",
            (film.cim, film.ev, film.perc, film.mufaj, film.ertekeles, film.kedvenc, film_id),
        )
    return {"id": film_id, **film.model_dump()}


@app.delete("/filmek/{film_id}", status_code=204)
def torol(film_id: int):
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM filmek WHERE id = %s", (film_id,))
        torolt = cur.rowcount
    if torolt == 0:
        return hiba(404, HIBA["nincs"])
    return Response(status_code=204)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
