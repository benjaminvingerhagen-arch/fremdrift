import { route } from '../router.js';
import { one } from '../db.js';
import { f, fail } from '../http.js';
import { MAKS_BYTE, TILLATTE_TYPER, erRiktigType, hentFil, lagreFil } from '../lagring.js';

// Bilder sendes som rå kropp med metadata i headere – da slipper vi base64, som
// ville gjort filen en tredjedel større og spist av grensen på 4,5 MB hos Vercel.

async function kroppen(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'binary');
  const biter = [];
  let sum = 0;
  for await (const bit of req) {
    sum += bit.length;
    if (sum > MAKS_BYTE + 1024) fail(413, 'Filen er for stor. Grensen er 4 MB.');
    biter.push(bit);
  }
  return Buffer.concat(biter);
}

function filnavnFra(req) {
  try {
    return Buffer.from(String(req.headers['x-filnavn'] || ''), 'base64').toString('utf8').replace(/[\r\n\\/]+/g, ' ').trim().slice(0, 150) || 'bilde';
  } catch {
    return 'bilde';
  }
}

export function sendFil(res, data, type, navn) {
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(navn || 'fil')}"`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(data);
}

route(
  'POST',
  '/vedlegg',
  async ({ req, user }) => {
    const prosjektId = f.id(req.headers['x-prosjekt']);
    if (!prosjektId) fail(400, 'Mangler hvilket prosjekt bildet hører til.');
    if (user.rolle !== 'leder') {
      const har = await one(
        `SELECT 1 FROM oppgaver WHERE prosjekt_id = $1
            AND (ansvarlig_id = $2 OR (ansvarlig_id IS NULL AND $3::text IS NOT NULL AND lower(fag) = lower($3::text))) LIMIT 1`,
        [prosjektId, user.id, user.fag],
      );
      if (!har) fail(403, 'Du har ingen oppgaver i dette prosjektet.');
    }
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!TILLATTE_TYPER[type]) fail(400, 'Bare bilder (JPG, PNG, WEBP) og PDF kan lastes opp.');
    const data = await kroppen(req);
    if (!data.length) fail(400, 'Filen er tom.');
    if (data.length > MAKS_BYTE) fail(413, 'Filen er for stor. Grensen er 4 MB.');
    if (!erRiktigType(data, type)) fail(400, 'Filen er ikke det den gir seg ut for å være.');
    const nokkel = await lagreFil({ prosjektId, type, data });
    const rad = await one(
      'INSERT INTO vedlegg (prosjekt_id, nokkel, type, navn, storrelse, opplastet_av) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, type, navn',
      [prosjektId, nokkel, type, filnavnFra(req), data.length, user.id],
    );
    return rad;
  },
  { alle: true },
);

route(
  'GET',
  '/vedlegg/:id',
  async ({ res, params, user }) => {
    const v = await one('SELECT * FROM vedlegg WHERE id = $1', [f.id(params.id)]);
    if (!v) fail(404, 'Fant ikke filen.');
    if (user.rolle !== 'leder' && v.opplastet_av !== user.id) {
      // Andre ser et bilde når det henger ved en kommentar på en av deres egne oppgaver.
      const ok = await one(
        `SELECT 1 FROM kommentarer k JOIN oppgaver o ON o.id = k.oppgave_id
          WHERE k.vedlegg_id = $1
            AND (o.ansvarlig_id = $2 OR (o.ansvarlig_id IS NULL AND $3::text IS NOT NULL AND lower(o.fag) = lower($3::text))) LIMIT 1`,
        [v.id, user.id, user.fag],
      );
      if (!ok) fail(403, 'Ingen tilgang til filen.');
    }
    sendFil(res, await hentFil(v.nokkel), v.type, v.navn);
  },
  { alle: true },
);
