// Klient for Tripletex sitt API (v2). Bare lesing: prosjekter, bokførte posteringer,
// timeføringer og leverandørfakturaer til godkjenning.
//
// Innlogging, ett av to:
//   TRIPLETEX_API_TOKEN                          – API-nøkkel fra Selskap → API-tokens
//                                                  (intern integrasjon for eget firma)
//   TRIPLETEX_CONSUMER_TOKEN + TRIPLETEX_EMPLOYEE_TOKEN – vanlig integrasjon
// TRIPLETEX_URL er adressen til API-et, standard https://tripletex.no/v2.
// Testmiljøet er https://api-test.tripletex.tech/v2. Nøklene står bare i miljøvariablene.

const STANDARD_URL = 'https://tripletex.no/v2';
const TIDSAVBRUDD_MS = 8000;

export class TripletexFeil extends Error {
  constructor(melding, status = 502) {
    super(melding);
    this.status = status;
  }
}

const basis = () => (process.env.TRIPLETEX_URL || STANDARD_URL).trim().replace(/\/+$/, '');
const apiNokkel = () => (process.env.TRIPLETEX_API_TOKEN || '').trim();
const consumer = () => (process.env.TRIPLETEX_CONSUMER_TOKEN || '').trim();
const employee = () => (process.env.TRIPLETEX_EMPLOYEE_TOKEN || '').trim();

export function tripletexSattOpp() {
  return Boolean(apiNokkel() || (consumer() && employee()));
}

export function tripletexMiljo() {
  const u = basis();
  if (u.includes('__falsk-tripletex')) return 'falsk';
  if (u.includes('api-test.tripletex')) return 'test';
  return 'produksjon';
}

// Øktnøkkelen gjenbrukes så lenge serverinstansen lever, til litt før den går ut.
let okt = null;

function iMorgen() {
  const d = new Date(Date.now() + 36 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function hent(url, init = {}) {
  let svar;
  try {
    svar = await fetch(url, { ...init, signal: AbortSignal.timeout(TIDSAVBRUDD_MS) });
  } catch (err) {
    throw new TripletexFeil(err?.name === 'TimeoutError' ? 'Tripletex svarte ikke i tide. Prøv igjen om litt.' : 'Fikk ikke kontakt med Tripletex.');
  }
  const data = await svar.json().catch(() => null);
  return { svar, data };
}

async function nyOkt() {
  if (apiNokkel()) {
    const { svar, data } = await hent(`${basis()}/token/session/:createFromRefreshToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: apiNokkel(), ttlSeconds: 6 * 3600 }),
    });
    const token = data?.value?.token || data?.token;
    if (!svar.ok || !token) throw new TripletexFeil('Tripletex godtok ikke API-nøkkelen. Sjekk TRIPLETEX_API_TOKEN i Vercel.', 502);
    return { token, utloper: Date.now() + 5.5 * 3600 * 1000 };
  }
  const q = new URLSearchParams({ consumerToken: consumer(), employeeToken: employee(), expirationDate: iMorgen() });
  const { svar, data } = await hent(`${basis()}/token/session/:create?${q}`, { method: 'PUT' });
  const token = data?.value?.token;
  if (!svar.ok || !token) throw new TripletexFeil('Tripletex godtok ikke nøklene. Sjekk TRIPLETEX_CONSUMER_TOKEN og TRIPLETEX_EMPLOYEE_TOKEN i Vercel.', 502);
  return { token, utloper: Date.now() + 20 * 3600 * 1000 };
}

async function oktNokkel(fornye = false) {
  if (!tripletexSattOpp()) throw new TripletexFeil('Tripletex er ikke satt opp.', 409);
  if (fornye || !okt || okt.utloper < Date.now()) okt = await nyOkt();
  return okt.token;
}

// GET mot API-et. Prøver én gang til med ny øktnøkkel hvis den gamle er utløpt.
export async function tripletexGet(sti, parametre = {}) {
  const q = new URLSearchParams(Object.entries(parametre).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  for (const forsok of [0, 1]) {
    const token = await oktNokkel(forsok === 1);
    const { svar, data } = await hent(`${basis()}${sti}?${q}`, {
      headers: { Authorization: `Basic ${Buffer.from(`0:${token}`).toString('base64')}`, Accept: 'application/json' },
    });
    if (svar.status === 401 && forsok === 0) continue;
    if (svar.status === 403) throw new TripletexFeil('Brukeren bak Tripletex-nøkkelen har ikke tilgang til dette.', 403);
    if (svar.status === 404) throw new TripletexFeil('Fant ikke dette i Tripletex.', 404);
    if (svar.status === 429) throw new TripletexFeil('Tripletex ber oss vente litt. Prøv igjen om et minutt.', 429);
    if (!svar.ok) throw new TripletexFeil(`Tripletex svarte med feil (${svar.status}).`, 502);
    return data;
  }
  throw new TripletexFeil('Tripletex godtok ikke innloggingen.', 502);
}

// Henter alle sider av en liste. Stopper ved maks for ikke å henge på store prosjekter.
export async function tripletexAlle(sti, parametre = {}, { side = 1000, maks = 10000 } = {}) {
  const verdier = [];
  let ekstra = {};
  for (let fra = 0; fra < maks; fra += side) {
    const data = await tripletexGet(sti, { ...parametre, from: fra, count: side });
    const rad = data?.values || [];
    verdier.push(...rad);
    if (fra === 0) ekstra = Object.fromEntries(Object.entries(data || {}).filter(([k]) => !['values', 'from', 'count'].includes(k)));
    if (rad.length < side) return { verdier, ekstra, avkortet: false };
  }
  return { verdier, ekstra, avkortet: true };
}
