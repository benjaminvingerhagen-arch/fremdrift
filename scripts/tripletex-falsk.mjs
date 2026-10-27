// En liten etterligning av Tripletex sitt API, til lokal utvikling og tester.
// Dev-serveren bruker den automatisk når ingen ekte Tripletex-nøkler er satt.
// Dekker bare det vi bruker: øktnøkkel, /project, /ledger/posting, /timesheet/entry
// og /supplierInvoice/forApproval – med samme parametre, felter og sider som Tripletex.
// Alle navn og tall er oppdiktet.

const OKTNOKKEL = 'falsk-okt-0000-1111';

const dag = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const PROSJEKTER = [
  { id: 101, number: '1001', name: 'Eksempelveien 12', isClosed: false, customer: { name: 'Familien Hansen' } },
  { id: 102, number: '1002', name: 'Rekkehus Solsiden', isClosed: false, customer: { name: 'Solsiden Borettslag' } },
  { id: 90, number: '0990', name: 'Gammelt lager', isClosed: true, customer: { name: 'Lager AS' } },
];

const KONTO = {
  4300: 'Innkjøp av varer for videresalg',
  4500: 'Fremmedytelser og underentreprise',
  5000: 'Lønn til ansatte',
  6540: 'Inventar og småutstyr',
  6800: 'Kontorrekvisita',
  7100: 'Bilgodtgjørelse',
};

function lagPoster() {
  const rader = [
    [-52, 4300, 18450, 'Byggevarehuset Nord', 'Gipsplater og stendere'],
    [-49, 4500, 32000, 'Rivetjenester AS', 'Riving bad og kjøkken'],
    [-41, 4300, 9870.5, 'Byggevarehuset Nord', 'Isolasjon'],
    [-35, 5000, 41200, null, 'Lønn tømrere'],
    [-30, 4500, 27500, 'Elektro Sør AS', 'Elektro 1. avdrag'],
    [-24, 4300, 14320, 'Flis og Bad AS', 'Fliser og membran'],
    [-20, 6540, 2390, 'Verktøyhuset', 'Kappsag-blader'],
    [-14, 5000, 38750, null, 'Lønn tømrere'],
    [-9, 4500, 19800, 'Rør og Varme AS', 'Rørlegger bad'],
    [-6, 7100, 1845, null, 'Kjøring'],
    [-3, 4300, -1200, 'Byggevarehuset Nord', 'Retur gipsplater'],
  ];
  return rader.map(([d, konto, belop, lev, tekst], i) => ({
    id: 5000 + i,
    date: dag(d),
    description: tekst,
    amount: belop,
    account: { id: konto, number: konto, name: KONTO[konto] },
    supplier: lev ? { id: 300 + i, name: lev } : null,
    voucher: { id: 7000 + i, number: 120 + i, year: Number(dag(d).slice(0, 4)) },
    project: { id: 101 },
  }));
}

function lagTimer() {
  const folk = [
    { firstName: 'Kari', lastName: 'Tømrer' },
    { firstName: 'Per', lastName: 'Snekker' },
    { firstName: 'Ali', lastName: 'Lærling' },
  ];
  const ut = [];
  let id = 9000;
  for (let d = -45; d <= 0; d++) {
    const dato = dag(d);
    const ukedag = new Date(`${dato}T00:00:00Z`).getUTCDay();
    if (ukedag === 0 || ukedag === 6) continue;
    folk.forEach((ansatt, i) => {
      if ((d + i) % 4 === 0) return; // ikke alle hver dag
      ut.push({
        id: id++,
        date: dato,
        hours: i === 2 ? 6 : 7.5,
        chargeableHours: i === 2 ? 0 : 7.5,
        hourlyCost: i === 2 ? 290 : 420,
        comment: d > -10 ? 'Innvendig kledning' : 'Reisverk',
        employee: { id: 40 + i, ...ansatt },
        activity: { id: 1, name: d > -10 ? 'Innvendig arbeid' : 'Reisverk' },
        project: { id: 101 },
      });
    });
  }
  return ut;
}

function lagTilGodkjenning(poster) {
  return [
    // Ikke bokført ennå, på prosjektet
    { id: 1, invoiceNumber: 'F-8812', invoiceDate: dag(-2), amountExcludingVat: 12400, supplier: { name: 'Maler Mestern AS' },
      voucher: { id: 8801, postings: [{ amount: 12400, project: { id: 101 }, account: { number: 4500 } }, { amount: -15500, project: null, account: { number: 2400 } }] },
      approvalListElements: [{ status: 0, project: { id: 101 } }] },
    // Allerede bokført (samme bilag som i hovedboken) – skal ikke telles to ganger
    { id: 2, invoiceNumber: 'F-4410', invoiceDate: poster[8].date, amountExcludingVat: 19800, supplier: { name: 'Rør og Varme AS' },
      voucher: { id: poster[8].voucher.id, postings: [{ amount: 19800, project: { id: 101 }, account: { number: 4500 } }] },
      approvalListElements: [{ status: 1, project: { id: 101 } }] },
    // Et annet prosjekt
    { id: 3, invoiceNumber: 'F-9001', invoiceDate: dag(-1), amountExcludingVat: 5000, supplier: { name: 'Gulvmannen' },
      voucher: { id: 8803, postings: [{ amount: 5000, project: { id: 102 }, account: { number: 4500 } }] },
      approvalListElements: [{ status: 0, project: { id: 102 } }] },
  ];
}

// Plukker ut feltene i «fields», f.eks. "id,amount,account(number,name)". «*» gir alt.
function velgFelter(obj, fields) {
  if (!fields || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((o) => velgFelter(o, fields));
  const deler = [];
  let dybde = 0;
  let start = 0;
  for (let i = 0; i <= fields.length; i++) {
    const c = fields[i];
    if (c === '(') dybde++;
    if (c === ')') dybde--;
    if ((c === ',' && dybde === 0) || i === fields.length) {
      deler.push(fields.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (deler.includes('*')) return obj;
  const ut = {};
  for (const d of deler) {
    const m = d.match(/^(\w+)(?:\((.*)\))?$/);
    if (!m || !(m[1] in obj)) continue;
    ut[m[1]] = m[2] ? velgFelter(obj[m[1]], m[2]) : obj[m[1]];
  }
  return ut;
}

function liste(res, alle, url, ekstra = {}) {
  const from = Number(url.searchParams.get('from') || 0);
  const count = Number(url.searchParams.get('count') || 1000);
  const side = alle.slice(from, from + count);
  send(res, 200, { fullResultSize: alle.length, from, count: side.length, ...ekstra, values: velgFelter(side, url.searchParams.get('fields')) });
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export const FALSK_API_NOKKEL = 'falsk-api-nokkel';

// sti er det som kommer etter /v2, f.eks. «/ledger/posting».
export async function tripletexFalsk(req, res, sti, url, body) {
  if (sti === '/token/session/:createFromRefreshToken' && req.method === 'POST') {
    if (body?.refreshToken !== FALSK_API_NOKKEL) return send(res, 401, { status: 401, message: 'Ugyldig nøkkel' });
    return send(res, 200, { token: OKTNOKKEL });
  }
  const auth = String(req.headers.authorization || '');
  const passord = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString().split(':')[1] : '';
  if (passord !== OKTNOKKEL) return send(res, 401, { status: 401, message: 'Ikke innlogget' });
  if (req.method !== 'GET') return send(res, 405, { status: 405 });

  const p = url.searchParams;
  const poster = lagPoster();
  if (sti === '/project') {
    const navn = (p.get('name') || '').toLowerCase();
    const nummer = p.get('number');
    const lukket = p.get('isClosed');
    const treff = PROSJEKTER.filter((x) => (!navn || x.name.toLowerCase().includes(navn)) && (!nummer || x.number === nummer) && (lukket === null || String(x.isClosed) === lukket));
    return liste(res, treff, url);
  }
  const prosjekt = sti.match(/^\/project\/(\d+)$/);
  if (prosjekt) {
    const x = PROSJEKTER.find((y) => y.id === Number(prosjekt[1]));
    return x ? send(res, 200, { value: velgFelter(x, p.get('fields')) }) : send(res, 404, { status: 404 });
  }
  const iPeriode = (dato) => (!p.get('dateFrom') || dato >= p.get('dateFrom')) && (!p.get('dateTo') || dato < p.get('dateTo'));
  if (sti === '/ledger/posting') {
    if (!p.get('dateFrom') || !p.get('dateTo')) return send(res, 422, { status: 422, message: 'dateFrom og dateTo må være med' });
    const fra = Number(p.get('accountNumberFrom') || 0);
    const til = Number(p.get('accountNumberTo') || 99999);
    const treff = poster.filter((x) => String(x.project?.id) === p.get('projectId') && x.account.number >= fra && x.account.number <= til && iPeriode(x.date));
    return liste(res, treff, url);
  }
  if (sti === '/timesheet/entry') {
    if (!p.get('dateFrom') || !p.get('dateTo')) return send(res, 422, { status: 422, message: 'dateFrom og dateTo må være med' });
    const treff = lagTimer().filter((x) => String(x.project.id) === p.get('projectId') && iPeriode(x.date));
    return liste(res, treff, url, { sumAllHours: treff.reduce((s, x) => s + x.hours, 0) });
  }
  if (sti === '/supplierInvoice/forApproval') return liste(res, lagTilGodkjenning(poster), url);
  return send(res, 404, { status: 404, message: `Ikke etterlignet: ${sti}` });
}
