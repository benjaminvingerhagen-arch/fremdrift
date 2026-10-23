// Felles inngang for hele API-et (/api/*). Én funksjon holder oss godt innenfor
// Vercels grense for antall serverless-funksjoner.
import { match } from './_lib/router.js';
import { ensureSchema } from './_lib/schema.js';
import { currentUser } from './_lib/auth.js';
import './_lib/routes/grunn.js';
import './_lib/routes/personer.js';
import './_lib/routes/prosjekter.js';
import './_lib/routes/oppgaver.js';
import './_lib/routes/kunde.js';
import './_lib/routes/vedlegg.js';

function routePath(req) {
  // vercel.json skriver /api/<sti> om til /api?rute=<sti>
  const fromQuery = req.query?.rute;
  if (fromQuery) return `/${String(Array.isArray(fromQuery) ? fromQuery.join('/') : fromQuery).replace(/^\/+/, '')}`;
  const url = new URL(req.url, 'http://x');
  return url.pathname.replace(/^\/api/, '') || '/';
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// Rutene merkes med hvem som slipper til:
//   { public: true }  – alle (innlogging, kundesiden som sjekker sin egen nøkkel)
//   { alle: true }    – alle innloggede, også ansatte og leverandører
//   ellers            – bare prosjektleder
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    const method = req.method;
    const found = match(method, routePath(req));
    if (!found) return res.status(404).json({ error: 'Finnes ikke.' });
    if (found.methodNotAllowed) return res.status(405).json({ error: 'Metoden støttes ikke.' });

    // Beskyttelse mot CSRF: endringer må komme fra vår egen side og ha vår egen header.
    if (method !== 'GET' && method !== 'HEAD' && (!sameOrigin(req) || req.headers['x-fd'] !== '1')) {
      return res.status(403).json({ error: 'Forespørselen ble avvist.' });
    }

    await ensureSchema();
    const { route, params } = found;
    const user = await currentUser(req, res);
    if (!route.public && !user) return res.status(401).json({ error: 'Du må logge inn.' });
    if (!route.public && !route.alle && user.rolle !== 'leder') return res.status(403).json({ error: 'Krever prosjektleder.' });

    const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {};
    const query = Object.fromEntries(Object.entries(req.query || {}).filter(([k]) => k !== 'rute'));
    const result = await route.handler({ req, res, user, params, body, query });
    if (res.writableEnded || res.headersSent) return undefined; // ruten har sendt svaret selv
    return res.status(200).json(result ?? null);
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ error: err.expose });
    if (err.code === '23505') return res.status(409).json({ error: 'Dette finnes allerede.' });
    if (err.code === '23514') return res.status(400).json({ error: 'Sluttdato kan ikke være før startdato.' });
    if (err.code === '22008' || err.code === '22007') return res.status(400).json({ error: 'En av datoene er ugyldig.' });
    console.error('API feilet', err);
    return res.status(500).json({ error: 'Noe gikk galt på serveren. Prøv igjen.' });
  }
}
