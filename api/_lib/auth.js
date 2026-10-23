import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { q, one } from './db.js';
import { fail } from './http.js';

// To måter inn:
// - Prosjektlederen logger inn med e-post og passord.
// - Ansatte og leverandører får en personlig lenke (/api/inn/<nøkkel>) som de kan
//   ha som bokmerke på telefonen. Lenken kan byttes ut, og da slutter den gamle å virke.
// Kunden trenger ingen konto: prosjektets kundelenke (/k/<nøkkel>) gir lesetilgang
// til kundesiden og lar kunden svare på beslutninger og oppdatere egne leveranser.

const COOKIE = 'fd_okt';
const OKT_DAGER = 30;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;
const WINDOW_MINUTES = 15;

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Brukes når e-posten ikke finnes, så svartiden ikke avslører hvilke kontoer som eksisterer.
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export function checkPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) fail(400, 'Passordet må ha minst 10 tegn.');
  if (password.length > 200) fail(400, 'Passordet er for langt.');
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const nyNokkel = () => randomBytes(24).toString('base64url');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Ugyldig koding i en fremmed informasjonskapsel: hopp over den.
    }
  }
  return out;
}

function isLocal(req) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
}

// Lax, ikke Strict: lenken fra en SMS eller e-post er en navigasjon fra et annet
// nettsted, og da må informasjonskapselen følge med videre inn i appen. Endringer
// er uansett beskyttet av egen header og opprinnelsessjekk (se api/index.js).
function setCookie(req, res, value, maxAgeSeconds) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (!isLocal(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .slice(0, 64);
}

export async function createSession(req, res, userId) {
  const token = randomBytes(32).toString('base64url');
  await q(`INSERT INTO okter (token_hash, bruker_id, utloper) VALUES ($1, $2, now() + interval '${OKT_DAGER} days')`, [
    sha256(token),
    userId,
  ]);
  await q('UPDATE brukere SET sist_innom = now() WHERE id = $1', [userId]);
  setCookie(req, res, token, OKT_DAGER * 86400);
}

export async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await q('DELETE FROM okter WHERE token_hash = $1', [sha256(token)]);
  setCookie(req, res, '', 0);
}

export async function currentUser(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token || token.length > 100) return null;
  const hash = sha256(token);
  const row = await one(
    `SELECT b.id, b.navn, b.epost, b.telefon, b.firma, b.fag, b.rolle, o.utloper
       FROM okter o JOIN brukere b ON b.id = o.bruker_id
      WHERE o.token_hash = $1 AND o.utloper > now() AND b.aktiv`,
    [hash],
  );
  if (!row) return null;
  // Glidende utløp: forleng økten når den er brukt, men høyst én gang i døgnet.
  if (new Date(row.utloper).getTime() - Date.now() < (OKT_DAGER - 1) * 86400_000) {
    await q(`UPDATE okter SET utloper = now() + interval '${OKT_DAGER} days' WHERE token_hash = $1`, [hash]);
    await q('UPDATE brukere SET sist_innom = now() WHERE id = $1', [row.id]);
    setCookie(req, res, token, OKT_DAGER * 86400);
  }
  delete row.utloper;
  return row;
}

export async function login(req, res, epost, passord) {
  const email = String(epost || '').trim().toLowerCase().slice(0, 160);
  const ip = clientIp(req);
  // Forsøket skrives ned før det telles, så samtidige forespørsler ikke slipper forbi.
  const forsok = await one('INSERT INTO innloggingsforsok (epost, ip, vellykket) VALUES ($1, $2, false) RETURNING id', [email, ip]);
  const recent = await one(
    `SELECT COUNT(*) FILTER (WHERE epost = $1 AND ip = $2)::int AS epost_ip,
            COUNT(*) FILTER (WHERE ip = $2)::int AS ip
       FROM innloggingsforsok
      WHERE NOT vellykket AND id <> $3 AND tidspunkt > now() - interval '${WINDOW_MINUTES} minutes'`,
    [email, ip, forsok.id],
  );
  if (recent.epost_ip >= MAX_FAILS_PER_EMAIL || recent.ip >= MAX_FAILS_PER_IP) {
    await q('DELETE FROM innloggingsforsok WHERE id = $1', [forsok.id]);
    fail(429, `For mange mislykkede forsøk. Vent ${WINDOW_MINUTES} minutter og prøv igjen.`);
  }
  const user = await one('SELECT id, passord_hash, aktiv FROM brukere WHERE epost = $1', [email]);
  const ok = await verifyPassword(String(passord || ''), user?.passord_hash ?? DUMMY_HASH);
  const success = Boolean(user && user.aktiv && user.passord_hash && ok);
  if (success) await q('UPDATE innloggingsforsok SET vellykket = true WHERE id = $1', [forsok.id]);
  await q(`DELETE FROM innloggingsforsok WHERE tidspunkt < now() - interval '30 days'`);
  await q('DELETE FROM okter WHERE utloper < now()');
  if (!success) fail(401, 'Feil e-post eller passord.');
  await createSession(req, res, user.id);
  return { id: user.id };
}

// Personlig lenke → økt. Gal nøkkel teller som et mislykket forsøk fra IP-en.
export async function loginMedLenke(req, res, nokkel) {
  const ip = clientIp(req);
  const feil = await one(
    `SELECT COUNT(*)::int AS n FROM innloggingsforsok
      WHERE NOT vellykket AND ip = $1 AND epost = 'lenke' AND tidspunkt > now() - interval '${WINDOW_MINUTES} minutes'`,
    [ip],
  );
  if (feil.n >= MAX_FAILS_PER_IP) return null;
  const s = String(nokkel || '');
  const user = s.length >= 20 && s.length <= 100 ? await one('SELECT id FROM brukere WHERE lenke_hash = $1 AND aktiv', [sha256(s)]) : null;
  if (!user) {
    await q(`INSERT INTO innloggingsforsok (epost, ip, vellykket) VALUES ('lenke', $1, false)`, [ip]);
    return null;
  }
  await createSession(req, res, user.id);
  return user;
}

export async function endSessionsFor(userId) {
  await q('DELETE FROM okter WHERE bruker_id = $1', [userId]);
}
