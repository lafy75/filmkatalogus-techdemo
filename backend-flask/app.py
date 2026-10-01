# Filmkatalogus REST API - Python + Flask + PyMySQL
# Inditas: pip install -r requirements.txt, majd python app.py  ->  http://127.0.0.1:5003
# A szerzodes: ../API.md
import os

import pymysql
from flask import Flask, jsonify, request
from flask_cors import CORS

PORT = int(os.environ.get("PORT", 5003))

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

app = Flask(__name__)
app.json.sort_keys = False     # a mezok sorrendje maradjon: id, cim, ev, ...
app.json.ensure_ascii = False  # az ekezetes betuk olvashatoan menjenek ki
CORS(app)


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


def szoveg(ertek, maximum):
    return isinstance(ertek, str) and 1 <= len(ertek.strip()) <= maximum


def egesz(ertek, minimum, maximum):
    # Pythonban a bool is int (True == 1), ezert kulon ki kell zarni
    return isinstance(ertek, int) and not isinstance(ertek, bool) and minimum <= ertek <= maximum


def ellenoriz(torzs):
    """Visszaad: (film, None) vagy (None, hibauzenet) - a mezoket az API.md sorrendjeben nezi."""
    if not isinstance(torzs, dict):
        return None, HIBA["json"]
    if not szoveg(torzs.get("cim"), 100):
        return None, HIBA["cim"]
    if not egesz(torzs.get("ev"), 1900, 2100):
        return None, HIBA["ev"]
    if not egesz(torzs.get("perc"), 1, 600):
        return None, HIBA["perc"]
    if not szoveg(torzs.get("mufaj"), 30):
        return None, HIBA["mufaj"]
    if not egesz(torzs.get("ertekeles"), 0, 5):
        return None, HIBA["ertekeles"]
    if not isinstance(torzs.get("kedvenc"), bool):
        return None, HIBA["kedvenc"]
    film = {
        "cim": torzs["cim"].strip(), "ev": torzs["ev"], "perc": torzs["perc"],
        "mufaj": torzs["mufaj"].strip(), "ertekeles": torzs["ertekeles"], "kedvenc": torzs["kedvenc"],
    }
    return film, None


def hiba(statusz, uzenet):
    return jsonify(error=uzenet), statusz


@app.get("/filmek")
def lista():
    mufaj = request.args.get("mufaj")
    with kapcsolat() as conn, conn.cursor() as cur:
        if mufaj is None:
            cur.execute(f"SELECT {OSZLOPOK} FROM filmek ORDER BY id")
        else:
            cur.execute(f"SELECT {OSZLOPOK} FROM filmek WHERE mufaj = %s ORDER BY id", (mufaj,))
        return jsonify([filmbol(sor) for sor in cur.fetchall()])


@app.get("/filmek/<int:film_id>")
def egy_film(film_id):
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT {OSZLOPOK} FROM filmek WHERE id = %s", (film_id,))
        sor = cur.fetchone()
    if sor is None:
        return hiba(404, HIBA["nincs"])
    return jsonify(filmbol(sor))


@app.post("/filmek")
def letrehoz():
    film, uzenet = ellenoriz(request.get_json(silent=True))
    if uzenet:
        return hiba(400, uzenet)
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO filmek (cim, ev, perc, mufaj, ertekeles, kedvenc) VALUES (%s, %s, %s, %s, %s, %s)",
            (film["cim"], film["ev"], film["perc"], film["mufaj"], film["ertekeles"], film["kedvenc"]),
        )
        return jsonify({"id": cur.lastrowid, **film}), 201


@app.put("/filmek/<int:film_id>")
def modosit(film_id):
    film, uzenet = ellenoriz(request.get_json(silent=True))
    if uzenet:
        return hiba(400, uzenet)  # a 400 megelozi a 404-et
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM filmek WHERE id = %s", (film_id,))
        if cur.fetchone() is None:
            return hiba(404, HIBA["nincs"])
        cur.execute(
            "UPDATE filmek SET cim = %s, ev = %s, perc = %s, mufaj = %s, ertekeles = %s, kedvenc = %s WHERE id = %s",
            (film["cim"], film["ev"], film["perc"], film["mufaj"], film["ertekeles"], film["kedvenc"], film_id),
        )
    return jsonify({"id": film_id, **film})


@app.delete("/filmek/<int:film_id>")
def torol(film_id):
    with kapcsolat() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM filmek WHERE id = %s", (film_id,))
        torolt = cur.rowcount
    if torolt == 0:
        return hiba(404, HIBA["nincs"])
    return "", 204


# Minden mas utvonal (es a nem egesz szamu id): 404
@app.errorhandler(404)
def nem_talalhato(_):
    return hiba(404, HIBA["nincs"])


# Adatbazis-hiba (pl. nem fut a MariaDB): 500
@app.errorhandler(pymysql.MySQLError)
def adatbazis_hiba(e):
    app.logger.error(e)
    return hiba(500, HIBA["szerver"])


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
