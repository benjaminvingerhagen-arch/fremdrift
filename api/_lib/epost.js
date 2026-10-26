import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';

// Utgående e-post via Resend. Uten RESEND og MAIL_FROM sendes ingenting i drift –
// varslene i appen virker uansett. Lokalt legges meldingene i .dev-db/epost.json,
// så både utvikling og tester kan se hva som ville gått ut.

const lokalFil = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.dev-db', 'epost.json');
const iDrift = () => Boolean(process.env.VERCEL);
const resendKlar = () => Boolean((process.env.RESEND || '').trim() && (process.env.MAIL_FROM || '').trim());

export const epostSattOpp = () => resendKlar();

async function lagreLokalt(melding) {
  try {
    await mkdir(dirname(lokalFil), { recursive: true });
    const far = await readFile(lokalFil, 'utf8').then(JSON.parse).catch(() => []);
    far.push({ ...melding, tid: new Date().toISOString() });
    await writeFile(lokalFil, JSON.stringify(far.slice(-200), null, 2));
  } catch (err) {
    console.error('Fikk ikke lagret e-posten lokalt', err);
  }
}

async function send(to, subject, text) {
  if (!to) return false;
  if (!resendKlar()) {
    if (!iDrift()) await lagreLokalt({ to, subject, text });
    return false;
  }
  // Et varsel skal aldri få en handling til å feile eller henge: kort tidsavbrudd, feil logges.
  const svar = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${(process.env.RESEND || '').trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => {
    console.error('E-post kunne ikke sendes', err);
    return null;
  });
  if (svar && !svar.ok) console.error('E-post ble avvist', svar.status);
  return Boolean(svar?.ok);
}

// Adressen lenker i e-post peker til. Leses fra miljøet, aldri fra Host-headeren,
// som kan settes av den som spør.
export function nettsted(req) {
  const satt = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (satt) return satt;
  const prod = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (prod) return `https://${prod}`;
  return `http://${req?.headers?.host || 'localhost:3000'}`;
}

const signatur = (firma) => `\n\n–\nSendt fra Fremdrift${firma ? ` for ${firma}` : ''}. Du får denne e-posten fordi du er med i prosjektet.`;

async function firma() {
  const r = await q(`SELECT verdi FROM innstillinger WHERE nokkel = 'firmanavn'`).catch(() => []);
  return r[0]?.verdi || '';
}

// Alle prosjektledere som vil ha varsler, unntatt den som selv gjorde handlingen.
export async function varsleLedere(req, { unntatt = null, emne, tekst, sti = '/' }) {
  const ledere = await q(
    `SELECT epost FROM brukere WHERE rolle = 'leder' AND aktiv AND epostvarsel AND epost IS NOT NULL AND id IS DISTINCT FROM $1`,
    [unntatt],
  );
  const f = await firma();
  await Promise.all(ledere.map((l) => send(l.epost, emne, `${tekst}\n\nÅpne: ${nettsted(req)}${sti}${signatur(f)}`)));
}

// Den eller de som utfører oppgaven: ansvarlig, ellers alle aktive i faget.
export async function varsleUtforende(req, oppgave, { unntatt = null, emne, tekst }) {
  const folk = await q(
    `SELECT epost FROM brukere
      WHERE aktiv AND epostvarsel AND epost IS NOT NULL AND rolle <> 'leder' AND id IS DISTINCT FROM $3
        AND (id = $1 OR ($1::int IS NULL AND $2::text IS NOT NULL AND lower(fag) = lower($2::text)))`,
    [oppgave.ansvarlig_id, oppgave.fag, unntatt],
  );
  const f = await firma();
  await Promise.all(
    folk.map((p) => send(p.epost, emne, `${tekst}\n\nÅpne oppgavelisten med lenken du har fått fra prosjektlederen.${signatur(f)}`)),
  );
}

export async function varsleKunde(req, prosjekt, { emne, tekst }) {
  if (!prosjekt.kunde_epost || !prosjekt.kunde_aktiv) return false;
  const f = await firma();
  return send(prosjekt.kunde_epost, emne, `${tekst}\n\nSe prosjektsiden: ${nettsted(req)}/k/${prosjekt.kunde_token}${signatur(f)}`);
}
