// Filmkatalogus - kozos frontend a negy backendhez (lasd: ../API.md)
// Nincs build step: Live Serverrel vagy a fajl megnyitasaval is fut.

const backendValaszto = document.getElementById('backend');
const allapot = document.getElementById('allapot');
const urlap = document.getElementById('urlap');
const urlapCim = document.getElementById('urlap-cim');
const urlapHiba = document.getElementById('urlap-hiba');
const megseGomb = document.getElementById('megse');
const szuro = document.getElementById('szuro');
const mufajJavaslatok = document.getElementById('mufajok');
const uzenet = document.getElementById('uzenet');
const lista = document.getElementById('lista');

const TAROLO_KULCS = 'filmkatalogus-backend';

let filmek = [];            // az utoljara betoltott (esetleg szurt) lista
let szerkesztettId = null;  // null: uj film, kulonben a szerkesztett film id-ja

// ---------- kommunikacio az API-val ----------

// Kerest kuld a kivalasztott backendnek. Hiba eseten a szerver uzenetevel dob hibat.
async function keres(utvonal, beallitas = {}) {
  let valasz;
  try {
    valasz = await fetch(backendValaszto.value + utvonal, beallitas);
  } catch {
    throw new Error(`A backend nem erheto el: ${backendValaszto.value}`);
  }
  if (valasz.status === 204) return null; // DELETE: nincs torzs
  const adat = await valasz.json().catch(() => null);
  if (!valasz.ok) throw new Error(adat?.error ?? `Hiba: ${valasz.status}`);
  return adat;
}

function jsonKeres(metodus, adat) {
  return {
    method: metodus,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adat),
  };
}

// ---------- betoltes es megjelenites ----------

async function betoltes() {
  try {
    const mind = await keres('/filmek');
    mufajokFrissitese(mind);
    filmek = szuro.value === ''
      ? mind
      : await keres('/filmek?mufaj=' + encodeURIComponent(szuro.value));
    allapotBeallitasa(true, `Kapcsolodva - ${mind.length} film`);
  } catch (hiba) {
    filmek = [];
    allapotBeallitasa(false, hiba.message);
  }
  megjelenites();
}

// A szuro es az urlap mufaj-javaslatai a teljes listabol keszulnek
function mufajokFrissitese(mind) {
  const mufajok = [...new Set(mind.map(f => f.mufaj))].sort((a, b) => a.localeCompare(b, 'hu'));
  const kivalasztott = szuro.value;
  szuro.replaceChildren(new Option('mind', ''), ...mufajok.map(m => new Option(m, m)));
  szuro.value = mufajok.includes(kivalasztott) ? kivalasztott : '';
  mufajJavaslatok.replaceChildren(...mufajok.map(m => new Option(m, m)));
}

function megjelenites() {
  uzenet.textContent = filmek.length === 0 ? 'Nincs megjelenitheto film.' : '';
  lista.replaceChildren(...filmek.map(kartya));
}

function elem(tag, osztaly, szoveg) {
  const e = document.createElement(tag);
  if (osztaly) e.className = osztaly;
  if (szoveg !== undefined) e.textContent = szoveg;
  return e;
}

function kartya(film) {
  const li = elem('li', 'kartya');

  const cim = elem('h3', 'kartya-cim', film.cim);
  if (film.kedvenc) {
    const jel = elem('span', 'kedvenc', ' ♥'); // szív
    jel.title = 'kedvenc';
    cim.append(jel);
  }

  const csillag = film.ertekeles === 0
    ? elem('p', 'csillagok nincs', 'meg nincs ertekelve')
    : elem('p', 'csillagok', '★'.repeat(film.ertekeles) + '☆'.repeat(5 - film.ertekeles));
  csillag.setAttribute('aria-label', `Ertekeles: ${film.ertekeles} / 5`);

  const szerkeszt = elem('button', 'masodlagos', 'Szerkesztes');
  szerkeszt.type = 'button';
  szerkeszt.addEventListener('click', () => szerkesztes(film));

  const torles = elem('button', 'veszelyes', 'Torles');
  torles.type = 'button';
  torles.addEventListener('click', () => torol(film));

  const gombok = elem('div', 'gombsor');
  gombok.append(szerkeszt, torles);

  li.append(cim, elem('p', 'adatok', `${film.ev} | ${film.perc} perc | ${film.mufaj}`), csillag, gombok);
  return li;
}

function allapotBeallitasa(rendben, szoveg) {
  allapot.textContent = szoveg;
  allapot.className = 'allapot ' + (rendben ? 'jo' : 'rossz');
}

// ---------- urlap: felvitel es szerkesztes ----------

urlap.addEventListener('submit', async esemeny => {
  esemeny.preventDefault();
  const m = urlap.elements;
  const adat = {
    cim: m.cim.value,
    ev: Number(m.ev.value),
    perc: Number(m.perc.value),
    mufaj: m.mufaj.value,
    ertekeles: Number(m.ertekeles.value),
    kedvenc: m.kedvenc.checked,
  };
  urlapHiba.textContent = '';
  try {
    if (szerkesztettId === null) {
      await keres('/filmek', jsonKeres('POST', adat));
    } else {
      await keres(`/filmek/${szerkesztettId}`, jsonKeres('PUT', adat));
    }
    urlapAlaphelyzet();
    await betoltes();
  } catch (hiba) {
    urlapHiba.textContent = hiba.message; // a backend hibauzenete, pl. "Az ev kotelezo: ..."
  }
});

function szerkesztes(film) {
  szerkesztettId = film.id;
  const m = urlap.elements;
  m.cim.value = film.cim;
  m.ev.value = film.ev;
  m.perc.value = film.perc;
  m.mufaj.value = film.mufaj;
  m.ertekeles.value = String(film.ertekeles);
  m.kedvenc.checked = film.kedvenc;
  urlapCim.textContent = `Szerkesztes: ${film.cim}`;
  megseGomb.hidden = false;
  urlapHiba.textContent = '';
  m.cim.focus();
}

function urlapAlaphelyzet() {
  szerkesztettId = null;
  urlap.reset();
  urlapCim.textContent = 'Uj film';
  megseGomb.hidden = true;
  urlapHiba.textContent = '';
}

megseGomb.addEventListener('click', urlapAlaphelyzet);

// ---------- torles ----------

async function torol(film) {
  if (!confirm(`Biztosan torlod ezt a filmet: ${film.cim}?`)) return;
  try {
    await keres(`/filmek/${film.id}`, { method: 'DELETE' });
    if (szerkesztettId === film.id) urlapAlaphelyzet();
    await betoltes();
  } catch (hiba) {
    uzenet.textContent = hiba.message;
  }
}

// ---------- backendvaltas es szures ----------

backendValaszto.addEventListener('change', () => {
  try {
    localStorage.setItem(TAROLO_KULCS, backendValaszto.value);
  } catch {
    // privat bongeszes: nem tudjuk megjegyezni, de a valtas mukodik
  }
  urlapAlaphelyzet();
  betoltes();
});

szuro.addEventListener('change', betoltes);

// Indulas: az utoljara valasztott backend visszaallitasa
try {
  const mentett = localStorage.getItem(TAROLO_KULCS);
  if ([...backendValaszto.options].some(o => o.value === mentett)) backendValaszto.value = mentett;
} catch {
  // nincs localStorage: marad az alapertelmezett backend
}
betoltes();
