import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required, logg } from '../http.js';
import { varsleKunde } from '../epost.js';
import { VAER, datoMedDag } from '../../../shared/plan.js';
import { prosjektFinnes } from './prosjekter.js';

// Dagbok: én side per prosjekt og dag med bemanning, vær, hva som ble gjort, avvik og
// bilder. Dokumentasjon for prosjektlederen ved uenighet om fremdrift eller tillegg.
// Den er intern; vil prosjektlederen vise en dag til kunden, blir den en vanlig
// oppdatering på kundesiden – uten bemanning og avvik.

function bemanning(x) {
  if (!Array.isArray(x)) return '[]';
  const rader = x
    .slice(0, 30)
    .map((r) => ({ fag: f.line(60)(r?.fag), antall: Number(r?.antall) }))
    .filter((r) => r.fag && Number.isInteger(r.antall) && r.antall > 0 && r.antall <= 200);
  return JSON.stringify(rader);
}

function temperatur(x) {
  if (x === undefined || x === null || String(x).trim() === '') return null;
  const n = Number(x);
  if (!Number.isInteger(n) || n < -50 || n > 50) fail(400, 'Temperaturen må være et helt tall mellom −50 og 50.');
  return n;
}

async function sjekkBilder(prosjektId, json) {
  const ider = JSON.parse(json);
  if (!ider.length) return;
  const r = await one('SELECT COUNT(*)::int AS n FROM vedlegg WHERE prosjekt_id = $1 AND id = ANY($2::int[])', [prosjektId, ider]);
  if (r.n !== ider.length) fail(400, 'Ett eller flere bilder hører ikke til prosjektet.');
}

route('GET', '/prosjekter/:id/dagbok', async ({ params }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  return q(
    `SELECT dato, bemanning, vaer, temperatur, notat, avvik, bilder, oppdatering_id, skrevet_av, endret
       FROM dagbok WHERE prosjekt_id = $1 ORDER BY dato DESC LIMIT 400`,
    [id],
  );
});

route('PUT', '/prosjekter/:id/dagbok/:dato', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const dato = required(f.date, 'Dato')(params.dato);
  const bilder = f.ids(body.bilder);
  await sjekkBilder(id, bilder);
  const vaer = f.oneOf(Object.keys(VAER))(body.vaer);
  const notat = f.str(4000)(body.notat);
  const avvik = f.str(2000)(body.avvik);
  const folk = bemanning(body.bemanning);
  const tom = !notat && !avvik && !vaer && folk === '[]' && bilder === '[]';
  if (tom) fail(400, 'Skriv noe i dagboken før du lagrer.');
  const ny = !(await one('SELECT 1 FROM dagbok WHERE prosjekt_id = $1 AND dato = $2', [id, dato]));
  const rad = await one(
    `INSERT INTO dagbok (prosjekt_id, dato, bemanning, vaer, temperatur, notat, avvik, bilder, skrevet_av)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9)
     ON CONFLICT (prosjekt_id, dato) DO UPDATE SET bemanning = EXCLUDED.bemanning, vaer = EXCLUDED.vaer,
       temperatur = EXCLUDED.temperatur, notat = EXCLUDED.notat, avvik = EXCLUDED.avvik, bilder = EXCLUDED.bilder,
       skrevet_av = EXCLUDED.skrevet_av, endret = now()
     RETURNING dato, bemanning, vaer, temperatur, notat, avvik, bilder, oppdatering_id, skrevet_av, endret`,
    [id, dato, folk, vaer, temperatur(body.temperatur), notat, avvik, bilder, user.navn],
  );
  if (ny) await logg(id, user, `Skrev i dagboken for ${dato}`);
  return rad;
});

route('DELETE', '/prosjekter/:id/dagbok/:dato', async ({ params, user }) => {
  const id = f.id(params.id);
  const dato = required(f.date, 'Dato')(params.dato);
  const rad = await one('DELETE FROM dagbok WHERE prosjekt_id = $1 AND dato = $2 RETURNING dato', [id, dato]);
  if (!rad) fail(404, 'Fant ikke dagboksiden.');
  await logg(id, user, `Slettet dagboken for ${dato}`);
  return { ok: true };
});

// Del en dag med kunden: blir en oppdatering på kundesiden. Avvik og bemanning blir igjen i dagboken.
route('POST', '/prosjekter/:id/dagbok/:dato/del', async ({ req, params, body, user }) => {
  const id = f.id(params.id);
  const dato = required(f.date, 'Dato')(params.dato);
  const d = await one('SELECT * FROM dagbok WHERE prosjekt_id = $1 AND dato = $2', [id, dato]);
  if (!d) fail(404, 'Fant ikke dagboksiden.');
  if (d.oppdatering_id && (await one('SELECT 1 FROM oppdateringer WHERE id = $1', [d.oppdatering_id]))) {
    fail(400, 'Denne dagen er allerede delt med kunden.');
  }
  const tittel = f.line(160)(body.tittel) || `Fra byggeplassen ${datoMedDag(dato)}`;
  const tekst = body.tekst === undefined ? d.notat : f.str(5000)(body.tekst);
  // Bare bilder som faktisk står i denne dagboksiden kan deles herfra.
  const egne = new Set(d.bilder || []);
  const bilder = body.bilder === undefined ? [...egne] : JSON.parse(f.ids(body.bilder)).filter((b) => egne.has(b));
  const o = await one(
    `INSERT INTO oppdateringer (prosjekt_id, tittel, tekst, bilder, forfatter_id) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,
    [id, tittel, tekst, JSON.stringify(bilder), user.id],
  );
  await q('UPDATE dagbok SET oppdatering_id = $1 WHERE prosjekt_id = $2 AND dato = $3', [o.id, id, dato]);
  await logg(id, user, `Delte dagboken for ${dato} med kunden`);
  if (f.bool(body.varsle_kunde)) {
    const p = await one('SELECT * FROM prosjekter WHERE id = $1', [id]);
    o.kunde_varslet = await varsleKunde(req, p, {
      emne: `${p.navn}: ${tittel}`,
      tekst: `${tittel}\n\n${tekst || ''}${bilder.length ? '\n\nDet ligger bilder på prosjektsiden.' : ''}`,
    });
  }
  return o;
});
