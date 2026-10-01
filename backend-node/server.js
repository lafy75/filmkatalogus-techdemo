// Filmkatalogus REST API - Node.js + Express 5 + mysql2
// Inditas: npm install, majd npm start  ->  http://127.0.0.1:5002
// A szerzodes: ../API.md
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const PORT = Number(process.env.PORT ?? 5002);

// Kapcsolat a MariaDB/MySQL szerverhez - alapbol az XAMPP beallitasai
const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'filmkatalogus',
});

const OSZLOPOK = 'id, cim, ev, perc, mufaj, ertekeles, kedvenc';

const HIBA = {
  json: 'A keres torzse nem ervenyes JSON objektum.',
  cim: 'A cim kotelezo: 1-100 karakteres szoveg.',
  ev: 'Az ev kotelezo: egesz szam 1900 es 2100 kozott.',
  perc: 'A perc kotelezo: egesz szam 1 es 600 kozott.',
  mufaj: 'A mufaj kotelezo: 1-30 karakteres szoveg.',
  ertekeles: 'Az ertekeles kotelezo: egesz szam 0 es 5 kozott.',
  kedvenc: 'A kedvenc kotelezo: true vagy false.',
  nincs: 'A keresett film vagy utvonal nem talalhato.',
  szerver: 'Szerverhiba - fut az adatbazis?',
};

// Az adatbazis a BOOLEAN-t 0/1-kent adja vissza, ezert true/false-ra alakitjuk
function filmbol(sor) {
  return {
    id: sor.id, cim: sor.cim, ev: sor.ev, perc: sor.perc,
    mufaj: sor.mufaj, ertekeles: sor.ertekeles, kedvenc: Boolean(sor.kedvenc),
  };
}

function szoveg(ertek, max) {
  return typeof ertek === 'string' && ertek.trim().length >= 1 && ertek.trim().length <= max;
}

function egesz(ertek, min, max) {
  return Number.isInteger(ertek) && ertek >= min && ertek <= max;
}

// Visszaad: { hiba } vagy { film } - a mezoket az API.md sorrendjeben nezi
function ellenoriz(torzs) {
  if (typeof torzs !== 'object' || torzs === null || Array.isArray(torzs)) return { hiba: HIBA.json };
  const { cim, ev, perc, mufaj, ertekeles, kedvenc } = torzs;
  if (!szoveg(cim, 100)) return { hiba: HIBA.cim };
  if (!egesz(ev, 1900, 2100)) return { hiba: HIBA.ev };
  if (!egesz(perc, 1, 600)) return { hiba: HIBA.perc };
  if (!szoveg(mufaj, 30)) return { hiba: HIBA.mufaj };
  if (!egesz(ertekeles, 0, 5)) return { hiba: HIBA.ertekeles };
  if (typeof kedvenc !== 'boolean') return { hiba: HIBA.kedvenc };
  return { film: { cim: cim.trim(), ev, perc, mufaj: mufaj.trim(), ertekeles, kedvenc } };
}

// Az utvonalbol erkezo id csak szamjegyekbol allhat, kulonben nincs ilyen film
function idBol(ertek) {
  return /^\d+$/.test(ertek) ? Number(ertek) : null;
}

function nincs(res) {
  return res.status(404).json({ error: HIBA.nincs });
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/filmek', async (req, res) => {
  const mufaj = typeof req.query.mufaj === 'string' ? req.query.mufaj : undefined;
  const [sorok] = mufaj === undefined
    ? await pool.query(`SELECT ${OSZLOPOK} FROM filmek ORDER BY id`)
    : await pool.query(`SELECT ${OSZLOPOK} FROM filmek WHERE mufaj = ? ORDER BY id`, [mufaj]);
  res.json(sorok.map(filmbol));
});

app.get('/filmek/:id', async (req, res) => {
  const id = idBol(req.params.id);
  if (id === null) return nincs(res);
  const [sorok] = await pool.query(`SELECT ${OSZLOPOK} FROM filmek WHERE id = ?`, [id]);
  if (sorok.length === 0) return nincs(res);
  res.json(filmbol(sorok[0]));
});

app.post('/filmek', async (req, res) => {
  const { hiba, film } = ellenoriz(req.body);
  if (hiba) return res.status(400).json({ error: hiba });
  const [eredmeny] = await pool.query(
    'INSERT INTO filmek (cim, ev, perc, mufaj, ertekeles, kedvenc) VALUES (?, ?, ?, ?, ?, ?)',
    [film.cim, film.ev, film.perc, film.mufaj, film.ertekeles, film.kedvenc],
  );
  res.status(201).json({ id: eredmeny.insertId, ...film });
});

app.put('/filmek/:id', async (req, res) => {
  const id = idBol(req.params.id);
  if (id === null) return nincs(res);
  const { hiba, film } = ellenoriz(req.body);
  if (hiba) return res.status(400).json({ error: hiba }); // a 400 megelozi a 404-et
  const [talalat] = await pool.query('SELECT id FROM filmek WHERE id = ?', [id]);
  if (talalat.length === 0) return nincs(res);
  await pool.query(
    'UPDATE filmek SET cim = ?, ev = ?, perc = ?, mufaj = ?, ertekeles = ?, kedvenc = ? WHERE id = ?',
    [film.cim, film.ev, film.perc, film.mufaj, film.ertekeles, film.kedvenc, id],
  );
  res.json({ id, ...film });
});

app.delete('/filmek/:id', async (req, res) => {
  const id = idBol(req.params.id);
  if (id === null) return nincs(res);
  const [eredmeny] = await pool.query('DELETE FROM filmek WHERE id = ?', [id]);
  if (eredmeny.affectedRows === 0) return nincs(res);
  res.status(204).end();
});

// Minden mas utvonal: 404
app.use((req, res) => nincs(res));

// Hibakezelo: hibas JSON -> 400, minden mas (pl. nem fut az adatbazis) -> 500
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: HIBA.json });
  console.error(err);
  res.status(500).json({ error: HIBA.szerver });
});

app.listen(PORT, () => console.log(`Node.js backend: http://127.0.0.1:${PORT}`));
