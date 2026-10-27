import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required } from '../http.js';
import { clientIp, sha256 } from '../auth.js';
import { sendEpost } from '../epost.js';
import { firmanavn } from './grunn.js';
import { NAVN } from '../../../shared/merke.js';

// Henvendelser til den som drifter systemet:
// - «Be om demo» fra forsiden (åpent for alle, med grense per avsender)
// - «Meld feil» fra appen (for alle som er logget inn)
// Alt lagres og vises under Innstillinger → Henvendelser. Er e-post satt opp (RESEND og
// MAIL_FROM), sendes det også til KONTAKT_EPOST / FEILMELDING_EPOST. Adressene står
// bare i miljøvariablene, ikke i koden, siden repoet er offentlig.

const MAKS_DEMO_PER_TIME = 5;
const MAKS_FEIL_PER_DOGN = 20;

const kontaktEpost = () => (process.env.KONTAKT_EPOST || '').trim();
const feilEpost = () => (process.env.FEILMELDING_EPOST || process.env.KONTAKT_EPOST || '').trim();

route(
  'POST',
  '/demo',
  async ({ req, body }) => {
    // Feltet «nettside» er skjult for mennesker. Er det fylt ut, er det en robot:
    // svar som om alt gikk bra, men lagre ingenting.
    if (String(body.nettside || '').trim()) return { ok: true };
    const navn = required(f.line(100), 'Navn')(body.navn);
    const firma = required(f.line(120), 'Firma')(body.firma);
    const epost = required(f.email, 'E-post')(body.epost);
    const telefon = f.line(30)(body.telefon);
    const tekst = f.str(2000)(body.tekst);
    const ipHash = sha256(`demo:${clientIp(req)}`);
    const siste = await one(
      `SELECT COUNT(*)::int AS n FROM henvendelser WHERE type = 'demo' AND ip_hash = $1 AND opprettet > now() - interval '1 hour'`,
      [ipHash],
    );
    if (siste.n >= MAKS_DEMO_PER_TIME) fail(429, 'Vi har fått flere forespørsler fra deg nå. Prøv igjen om en time.');
    const rad = await one(
      `INSERT INTO henvendelser (type, navn, firma, epost, telefon, tekst, ip_hash) VALUES ('demo', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [navn, firma, epost, telefon, tekst, ipHash],
    );
    const sendt = await sendEpost(
      kontaktEpost(),
      `Ønsker demo av ${NAVN}: ${firma} (#${rad.id})`,
      `${navn} i ${firma} ønsker en demo.\n\nE-post: ${epost}\nTelefon: ${telefon || 'ikke oppgitt'}\n\n${tekst || '(ingen melding)'}`,
      { svarTil: epost },
    ).catch(() => false);
    if (sendt) await q('UPDATE henvendelser SET sendt = true WHERE id = $1', [rad.id]);
    return { ok: true };
  },
  { public: true },
);

route(
  'POST',
  '/feilmelding',
  async ({ req, user, body }) => {
    const tekst = required(f.str(4000), 'Beskrivelse')(body.tekst);
    if (tekst.length < 5) fail(400, 'Skriv litt om hva som skjedde.');
    // Bare stien i appen («#/p/12/plan»), ikke en vilkårlig adresse.
    const side = /^#\/[\w\-/?=&.%]*$/.test(String(body.side || '')) ? String(body.side).slice(0, 200) : null;
    const nettleser = f.line(300)(body.nettleser);
    const iDogn = await one(
      `SELECT COUNT(*)::int AS n FROM henvendelser WHERE type = 'feil' AND bruker_id = $1 AND opprettet > now() - interval '1 day'`,
      [user.id],
    );
    if (iDogn.n >= MAKS_FEIL_PER_DOGN) fail(429, 'Du har sendt mange meldinger i dag. Prøv igjen i morgen.');
    const rad = await one(
      `INSERT INTO henvendelser (type, navn, firma, epost, telefon, tekst, side, nettleser, bruker_id)
       VALUES ('feil', $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [user.navn, user.firma, user.epost, user.telefon, tekst, side, nettleser, user.id],
    );
    const firma = await firmanavn();
    const rolle = { leder: 'Prosjektleder', ansatt: 'Ansatt', leverandor: 'Leverandør' }[user.rolle] || user.rolle;
    const sendt = await sendEpost(
      feilEpost(),
      `Feilmelding i ${NAVN}${firma ? ` hos ${firma}` : ''} (#${rad.id})`,
      `${tekst}\n\n` +
        `Fra: ${user.navn}${user.epost ? ` <${user.epost}>` : ''}${user.firma ? ` (${user.firma})` : ''}\n` +
        `Rolle: ${rolle}${user.fag ? ` · ${user.fag}` : ''}\n` +
        `Side: ${side || 'ikke oppgitt'}\n` +
        `Nettleser: ${nettleser || 'ikke oppgitt'}\n` +
        `Melding nr. ${rad.id}`,
      { svarTil: user.epost || null },
    ).catch(() => false);
    if (sendt) await q('UPDATE henvendelser SET sendt = true WHERE id = $1', [rad.id]);
    return { ok: true, id: rad.id };
  },
  { alle: true },
);

// Prosjektlederen ser henvendelsene under Innstillinger.
route('GET', '/henvendelser', async () => {
  const rader = await q(
    `SELECT id, type, navn, firma, epost, telefon, tekst, side, nettleser, sendt, behandlet, opprettet
       FROM henvendelser ORDER BY behandlet IS NOT NULL, opprettet DESC LIMIT 300`,
  );
  return { rader, epost: { kontakt: Boolean(kontaktEpost()), feil: Boolean(feilEpost()) } };
});

route('POST', '/henvendelser/:id/behandlet', async ({ params, body }) => {
  const ja = body.behandlet === undefined ? true : f.bool(body.behandlet);
  const rad = await one(`UPDATE henvendelser SET behandlet = ${ja ? 'now()' : 'NULL'} WHERE id = $1 RETURNING id, behandlet`, [f.id(params.id)]);
  if (!rad) fail(404, 'Fant ikke henvendelsen.');
  return rad;
});
