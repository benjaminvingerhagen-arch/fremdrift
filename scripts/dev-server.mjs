// Lokal utviklingsserver: serverer appen og /api med en innebygd Postgres
// (PGlite) lagret i mappen .dev-db. Start med: npm run dev
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { useDevDatabase } from '../api/_lib/db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 3000;
process.env.REGISTRERINGSKODE ||= 'lokal';
if (process.env.DATO) globalThis.__FREMDRIFT_DATO = process.env.DATO;

const db = new PGlite(join(root, '.dev-db'), {
  parsers: { 20: Number, 1700: Number, 1082: (v) => v },
});
useDevDatabase(db);
const { default: apiHandler } = await import('../api/index.js');

const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
// Samme oppførsel som hos Vercel: alle blokkene som treffer stien brukes, i den
// rekkefølgen de står, slik at en spesifikk regel til slutt overstyrer den generelle.
// Kildene i vercel.json er stier som slutter på «(.*)», så det holder å se på starten.
const headereFor = (sti) =>
  (vercel.headers || [])
    .filter((blokk) => sti.startsWith(blokk.source.replace('(.*)', '')))
    .flatMap((blokk) => blokk.headers);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function vercelResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) return undefined;
  // Vedlegg kommer som rå bytes og må ikke tolkes som tekst.
  if (!(req.headers['content-type'] || '').includes('application/json')) return buffer;
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return undefined;
  }
}

async function serveStatic(pathname, res) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.startsWith('..') || rel.startsWith('api') || rel.startsWith('.')) rel = '__404__';
  // Filer med endelse må finnes; stier uten endelse faller tilbake til appen.
  const kandidater = extname(rel) ? [rel] : [rel, `${rel}.html`, join(rel, 'index.html'), 'index.html'];
  for (const kandidat of kandidater) {
    const file = join(root, kandidat || 'index.html');
    try {
      if (!(await stat(file)).isFile()) continue;
      res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
      for (const h of headereFor(pathname)) res.setHeader(h.key, h.value);
      res.end(await readFile(file));
      return;
    } catch {
      /* prøv neste */
    }
  }
  res.statusCode = 404;
  res.end('Ikke funnet');
}

createServer(async (req, res) => {
  vercelResponse(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      req.query = Object.fromEntries(url.searchParams);
      if (url.pathname.startsWith('/api/')) req.query.rute = url.pathname.slice(5);
      req.body = await readBody(req);
      await apiHandler(req, res);
    } else if ((vercel.redirects || []).some((r) => r.source === url.pathname)) {
      const r = vercel.redirects.find((x) => x.source === url.pathname);
      res.statusCode = r.permanent ? 308 : 307;
      res.setHeader('Location', r.destination);
      res.end();
    } else if (/^\/k\/[^/]+$/.test(url.pathname)) {
      await serveStatic('/kunde.html', res);
    } else {
      await serveStatic(url.pathname, res);
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
}).listen(port, () => {
  console.log(`Fremdrift:          http://localhost:${port}/`);
  console.log(`Registreringskode:  ${process.env.REGISTRERINGSKODE}`);
});
