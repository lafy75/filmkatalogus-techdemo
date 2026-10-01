// Kozos contract teszt a Filmkatalogus API backendjeihez (lasd: API.md).
//
// Futtatas (Node.js 18+ kell, mas fuggoseg nincs):
//   node contract-test.mjs                          -> mind a negy alapertelmezett cim
//   node contract-test.mjs http://127.0.0.1:5001    -> csak a megadott backend(ek)
//   node contract-test.mjs --laza http://...        -> a hibauzenetek szovegét nem, csak a letezeset nezi
//
// A teszt sajat, egyedi mufaju filmet hoz letre, es a vegen torli.
// A mintaadatokat (1-5. film) nem modositja.

const ALAPERTELMEZETT = [
  ['C# - ASP.NET Core', 'http://127.0.0.1:5001'],
  ['Node.js - Express', 'http://127.0.0.1:5002'],
  ['Python - Flask', 'http://127.0.0.1:5003'],
  ['Python - FastAPI', 'http://127.0.0.1:5004'],
];

// Az API.md-ben rogzitett hibauzenetek - betukre azonosnak kell lenniuk
const UZENET = {
  json: 'A keres torzse nem ervenyes JSON objektum.',
  cim: 'A cim kotelezo: 1-100 karakteres szoveg.',
  ev: 'Az ev kotelezo: egesz szam 1900 es 2100 kozott.',
  perc: 'A perc kotelezo: egesz szam 1 es 600 kozott.',
  mufaj: 'A mufaj kotelezo: 1-30 karakteres szoveg.',
  ertekeles: 'Az ertekeles kotelezo: egesz szam 0 es 5 kozott.',
  kedvenc: 'A kedvenc kotelezo: true vagy false.',
  nincs: 'A keresett film vagy utvonal nem talalhato.',
};

const MEZOK = ['id', 'cim', 'ev', 'perc', 'mufaj', 'ertekeles', 'kedvenc'];
const NEM_LETEZO_ID = 999999999;

const args = process.argv.slice(2);
const LAZA = args.includes('--laza');
const cimek = args.filter(a => !a.startsWith('--'));
const celok = cimek.length > 0 ? cimek.map(c => [c, c.replace(/\/$/, '')]) : ALAPERTELMEZETT;

// ---------- segedfuggvenyek ----------

async function kuld(alap, metodus, utvonal, { body, nyers, fejlecek = {} } = {}) {
  const beallitas = { method: metodus, headers: { ...fejlecek }, signal: AbortSignal.timeout(8000) };
  // a Content-Type csak akkor application/json, ha a hivo nem adott meg mast
  if ((body !== undefined || nyers !== undefined) && !('Content-Type' in beallitas.headers)) {
    beallitas.headers['Content-Type'] = 'application/json';
  }
  if (body !== undefined) beallitas.body = JSON.stringify(body);
  else if (nyers !== undefined) beallitas.body = nyers;
  const valasz = await fetch(alap + utvonal, beallitas);
  const szoveg = await valasz.text();
  let json;
  try { json = JSON.parse(szoveg); } catch { json = undefined; }
  return { status: valasz.status, headers: valasz.headers, szoveg, json };
}

function filmE(x) {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const kulcsok = Object.keys(x).sort();
  if (kulcsok.join(',') !== [...MEZOK].sort().join(',')) return false;
  return Number.isInteger(x.id) && typeof x.cim === 'string' && Number.isInteger(x.ev)
    && Number.isInteger(x.perc) && typeof x.mufaj === 'string'
    && Number.isInteger(x.ertekeles) && typeof x.kedvenc === 'boolean';
}

function egyezik(a, b) {
  return filmE(a) && MEZOK.every(m => a[m] === b[m]);
}

function roviden(x) {
  const s = typeof x === 'string' ? x : JSON.stringify(x);
  return s === undefined ? 'undefined' : (s.length > 160 ? s.slice(0, 160) + '...' : s);
}

// ---------- a teszt egy backendre ----------

async function tesztel(alap) {
  const eredmeny = [];
  const ellenoriz = (nev, feltetel, reszlet) =>
    eredmeny.push({ nev, ok: Boolean(feltetel), reszlet: feltetel ? '' : roviden(reszlet) });

  // hibavalasz: statusz + {"error": ...} (szigoru modban a pontos szoveg is)
  const hibaValasz = (nev, v, statusz, uzenet) => {
    const joHiba = v.json !== null && typeof v.json === 'object' && !Array.isArray(v.json)
      && typeof v.json.error === 'string' && v.json.error.length > 0
      && (LAZA || v.json.error === uzenet);
    ellenoriz(nev, v.status === statusz && joHiba, `${v.status} ${v.szoveg}`);
  };

  const egyedi = 'teszt-' + Date.now().toString(36);
  let ujId = null;
  let torolve = false;

  // 1. Lista
  let lista;
  try {
    lista = await kuld(alap, 'GET', '/filmek');
  } catch (hiba) {
    return { elerheto: false, hiba: hiba.cause?.code ?? hiba.message };
  }

  try {
    ellenoriz('GET /filmek -> 200', lista.status === 200, lista.status);
    ellenoriz('GET /filmek -> Content-Type: application/json',
      (lista.headers.get('content-type') ?? '').includes('application/json'), lista.headers.get('content-type'));
    ellenoriz('GET /filmek -> JSON tomb', Array.isArray(lista.json), lista.szoveg);
    const tomb = Array.isArray(lista.json) ? lista.json : [];
    const rosszElem = tomb.find(f => !filmE(f));
    ellenoriz('minden elem pontosan a 7 mezot tartalmazza, helyes tipussal', rosszElem === undefined, rosszElem);
    ellenoriz('a lista id szerint novekvo sorrendben', tomb.every((f, i) => i === 0 || tomb[i - 1].id < f.id),
      tomb.map(f => f.id));
    const matrix = tomb.find(f => f.id === 1);
    ellenoriz('az 1-es film ekezetes cime epen jon at (UTF-8)', !matrix || matrix.cim === 'Mátrix', matrix?.cim);

    const scifi = await kuld(alap, 'GET', '/filmek?mufaj=sci-fi');
    ellenoriz('GET /filmek?mufaj=sci-fi -> csak sci-fi filmek',
      scifi.status === 200 && Array.isArray(scifi.json) && scifi.json.every(f => f.mufaj === 'sci-fi'), scifi.szoveg);

    // 2. Letrehozas
    const uj = { id: 12345, cim: '  Árvíztűrő teszt  ', ev: 2001, perc: 90, mufaj: egyedi, ertekeles: 3, kedvenc: true, extra: 'x' };
    const post = await kuld(alap, 'POST', '/filmek', { body: uj });
    ellenoriz('POST /filmek -> 201', post.status === 201, `${post.status} ${post.szoveg}`);
    ellenoriz('POST valasz: film objektum a 7 mezovel', filmE(post.json), post.json);
    ujId = post.json?.id ?? null;
    const vart = { id: ujId, cim: 'Árvíztűrő teszt', ev: 2001, perc: 90, mufaj: egyedi, ertekeles: 3, kedvenc: true };
    ellenoriz('POST: a cim szelen levo szokozok levagva, az ekezetek epek', post.json?.cim === 'Árvíztűrő teszt', post.json?.cim);
    ellenoriz('POST: a torzsben kuldott id-t figyelmen kivul hagyja', Number.isInteger(ujId) && ujId !== 12345, ujId);
    ellenoriz('POST: a valasz a kuldott adatokat tartalmazza', egyezik(post.json, vart), post.json);

    if (Number.isInteger(ujId)) {
      // 3. Lekeres es szures
      const egy = await kuld(alap, 'GET', `/filmek/${ujId}`);
      ellenoriz('GET /filmek/{id} -> 200 es a letrehozott film', egy.status === 200 && egyezik(egy.json, vart), egy.szoveg);
      const szurt = await kuld(alap, 'GET', `/filmek?mufaj=${encodeURIComponent(egyedi)}`);
      ellenoriz('GET /filmek?mufaj=<uj mufaj> -> pontosan az uj film',
        szurt.status === 200 && Array.isArray(szurt.json) && szurt.json.length === 1 && egyezik(szurt.json[0], vart), szurt.szoveg);

      // 4. Modositas
      const mod = { cim: 'Modositott teszt', ev: 2002, perc: 95, mufaj: egyedi, ertekeles: 5, kedvenc: false };
      const put = await kuld(alap, 'PUT', `/filmek/${ujId}`, { body: mod });
      ellenoriz('PUT /filmek/{id} -> 200 es a modositott film', put.status === 200 && egyezik(put.json, { id: ujId, ...mod }),
        `${put.status} ${put.szoveg}`);
      const put2 = await kuld(alap, 'PUT', `/filmek/${ujId}`, { body: mod });
      ellenoriz('PUT valtozatlan adatokkal is 200 (nem 404)', put2.status === 200, `${put2.status} ${put2.szoveg}`);
      const egy2 = await kuld(alap, 'GET', `/filmek/${ujId}`);
      ellenoriz('GET a PUT utan a modositott adatot adja', egyezik(egy2.json, { id: ujId, ...mod }), egy2.szoveg);
      hibaValasz('PUT hibas torzzsel (ev szovegkent) -> 400', await kuld(alap, 'PUT', `/filmek/${ujId}`, { body: { ...mod, ev: '2002' } }), 400, UZENET.ev);
    }

    // 5. Validacio (POST)
    const jo = { cim: 'Validacios teszt', ev: 2000, perc: 100, mufaj: egyedi, ertekeles: 2, kedvenc: false };
    const nelkule = mezo => Object.fromEntries(Object.entries(jo).filter(([k]) => k !== mezo));
    const esetek = [
      ['hianyzo cim', nelkule('cim'), 'cim'],
      ['csak szokozbol allo cim', { ...jo, cim: '   ' }, 'cim'],
      ['101 karakteres cim', { ...jo, cim: 'x'.repeat(101) }, 'cim'],
      ['cim szam', { ...jo, cim: 123 }, 'cim'],
      ['hianyzo ev', nelkule('ev'), 'ev'],
      ['ev szovegkent ("1999")', { ...jo, ev: '1999' }, 'ev'],
      ['ev 1899', { ...jo, ev: 1899 }, 'ev'],
      ['perc 0', { ...jo, perc: 0 }, 'perc'],
      ['perc 601', { ...jo, perc: 601 }, 'perc'],
      ['ures mufaj', { ...jo, mufaj: '' }, 'mufaj'],
      ['31 karakteres mufaj', { ...jo, mufaj: 'm'.repeat(31) }, 'mufaj'],
      ['ertekeles 6', { ...jo, ertekeles: 6 }, 'ertekeles'],
      ['ertekeles -1', { ...jo, ertekeles: -1 }, 'ertekeles'],
      ['ertekeles true (logikai, nem szam)', { ...jo, ertekeles: true }, 'ertekeles'],
      ['hianyzo kedvenc', nelkule('kedvenc'), 'kedvenc'],
      ['kedvenc 1 (szam, nem logikai)', { ...jo, kedvenc: 1 }, 'kedvenc'],
      ['kedvenc "true" (szoveg)', { ...jo, kedvenc: 'true' }, 'kedvenc'],
      ['tobb hibas mezo -> az elso (ev) uzenete', { ...jo, ev: 'x', perc: -5, kedvenc: 'x' }, 'ev'],
    ];
    for (const [nev, torzs, mezo] of esetek) {
      hibaValasz(`POST ${nev} -> 400`, await kuld(alap, 'POST', '/filmek', { body: torzs }), 400, UZENET[mezo]);
    }
    hibaValasz('POST hibas JSON -> 400', await kuld(alap, 'POST', '/filmek', { nyers: '{"cim": "x",' }), 400, UZENET.json);
    hibaValasz('POST JSON tomb -> 400', await kuld(alap, 'POST', '/filmek', { nyers: '[1, 2]' }), 400, UZENET.json);
    hibaValasz('POST torzs nelkul -> 400', await kuld(alap, 'POST', '/filmek'), 400, UZENET.json);
    hibaValasz('POST ervenyes JSON, de Content-Type: text/plain -> 400',
      await kuld(alap, 'POST', '/filmek', { nyers: JSON.stringify(jo), fejlecek: { 'Content-Type': 'text/plain' } }), 400, UZENET.json);

    // 6. Nem letezo erroforrasok
    hibaValasz('GET /filmek/<nem letezo id> -> 404', await kuld(alap, 'GET', `/filmek/${NEM_LETEZO_ID}`), 404, UZENET.nincs);
    hibaValasz('GET /filmek/abc -> 404', await kuld(alap, 'GET', '/filmek/abc'), 404, UZENET.nincs);
    hibaValasz('GET /filmek/1.5 -> 404', await kuld(alap, 'GET', '/filmek/1.5'), 404, UZENET.nincs);
    hibaValasz('GET ismeretlen utvonal -> 404', await kuld(alap, 'GET', '/nincs-ilyen-utvonal'), 404, UZENET.nincs);
    hibaValasz('PUT /filmek/<nem letezo id> ervenyes torzzsel -> 404',
      await kuld(alap, 'PUT', `/filmek/${NEM_LETEZO_ID}`, { body: jo }), 404, UZENET.nincs);
    hibaValasz('PUT /filmek/<nem letezo id> hibas torzzsel -> 400 (a 400 megelozi a 404-et)',
      await kuld(alap, 'PUT', `/filmek/${NEM_LETEZO_ID}`, { body: { ...jo, perc: 0 } }), 400, UZENET.perc);
    hibaValasz('DELETE /filmek/<nem letezo id> -> 404', await kuld(alap, 'DELETE', `/filmek/${NEM_LETEZO_ID}`), 404, UZENET.nincs);
    hibaValasz('DELETE /filmek/abc -> 404', await kuld(alap, 'DELETE', '/filmek/abc'), 404, UZENET.nincs);

    // 7. CORS
    const origin = 'http://127.0.0.1:5500';
    const cors = await kuld(alap, 'GET', '/filmek', { fejlecek: { Origin: origin } });
    const aao = cors.headers.get('access-control-allow-origin');
    ellenoriz('CORS: GET valaszban Access-Control-Allow-Origin', aao === '*' || aao === origin, aao);
    const pre = await kuld(alap, 'OPTIONS', '/filmek/1', {
      fejlecek: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
    });
    const preOrigin = pre.headers.get('access-control-allow-origin');
    const preMetodus = (pre.headers.get('access-control-allow-methods') ?? '').toUpperCase();
    const preFejlec = (pre.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    ellenoriz('CORS preflight (OPTIONS, PUT, content-type) -> 2xx, engedi a PUT-ot es a Content-Type-ot',
      pre.status >= 200 && pre.status < 300 && (preOrigin === '*' || preOrigin === origin)
      && (preMetodus.includes('PUT') || preMetodus === '*') && (preFejlec.includes('content-type') || preFejlec === '*'),
      `${pre.status} origin=${preOrigin} methods=${preMetodus} headers=${preFejlec}`);

    // 8. Torles
    if (Number.isInteger(ujId)) {
      const del = await kuld(alap, 'DELETE', `/filmek/${ujId}`);
      ellenoriz('DELETE /filmek/{id} -> 204, ures torzs', del.status === 204 && del.szoveg === '', `${del.status} ${del.szoveg}`);
      torolve = del.status === 204;
      hibaValasz('DELETE ugyanarra az id-ra meg egyszer -> 404', await kuld(alap, 'DELETE', `/filmek/${ujId}`), 404, UZENET.nincs);
      hibaValasz('GET a torolt filmre -> 404', await kuld(alap, 'GET', `/filmek/${ujId}`), 404, UZENET.nincs);
    }
  } catch (hiba) {
    ellenoriz('a teszt varatlan hiba nelkul lefutott', false, hiba.stack ?? hiba.message);
  } finally {
    // takaritas: ha a teszt kozben elakadt, a sajat filmet toroljuk
    if (Number.isInteger(ujId) && !torolve) {
      try { await kuld(alap, 'DELETE', `/filmek/${ujId}`); } catch { /* a backend mar nem valaszol */ }
    }
  }
  return { elerheto: true, eredmeny };
}

// ---------- futtatas ----------

let voltHiba = false;
const osszesito = [];

for (const [nev, alap] of celok) {
  console.log(`\n=== ${nev} (${alap}) ===`);
  const r = await tesztel(alap);
  if (!r.elerheto) {
    console.log(`  NEM ERHETO EL (${r.hiba}) - fut a backend?`);
    osszesito.push(`${nev}: nem erheto el`);
    if (cimek.length > 0) voltHiba = true; // kifejezetten megadott cim nem futhat "csendben"
    continue;
  }
  for (const e of r.eredmeny) {
    console.log(`  ${e.ok ? 'OK  ' : 'HIBA'} ${e.nev}${e.ok ? '' : `\n         kapott: ${e.reszlet}`}`);
  }
  const jo = r.eredmeny.filter(e => e.ok).length;
  if (jo !== r.eredmeny.length) voltHiba = true;
  osszesito.push(`${nev}: ${jo}/${r.eredmeny.length} OK`);
}

console.log(`\n--- Osszesites${LAZA ? ' (laza mod: a hibauzenetek szoveget nem nezi)' : ''} ---`);
for (const sor of osszesito) console.log('  ' + sor);
process.exit(voltHiba ? 1 : 0);
