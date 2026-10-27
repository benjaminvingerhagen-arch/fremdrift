import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bilder og dokumenter ligger i Vercel Blob med privat tilgang: filene hentes bare
// gjennom API-et, som sjekker hvem som spør. Lokalt, uten Blob, i .dev-db/filer.

export const MAKS_BYTE = 4 * 1024 * 1024; // Vercel tar imot 4,5 MB per forespørsel

export const TILLATTE_TYPER = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  // Word og Excel (dokumenthotellet): FDV, kontrakter, mengdelister.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

// Filer nettleseren ikke kan vise selv, lastes ned i stedet for å åpnes.
export const LASTES_NED = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const lokalMappe = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.dev-db', 'filer');
const iDrift = () => Boolean(process.env.VERCEL);
const token = () => (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
const harBlob = () => Boolean(token() || (process.env.BLOB_STORE_ID || '').trim());
const blobValg = () => (token() ? { token: token() } : {});

export async function lagreFil({ prosjektId, type, data }) {
  const sti = `prosjekt-${prosjektId || 'felles'}/${randomUUID()}.${TILLATTE_TYPER[type] || 'bin'}`;
  if (harBlob()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(sti, data, { access: 'private', contentType: type, addRandomSuffix: false, ...blobValg() });
    return blob.url;
  }
  if (iDrift()) {
    const err = new Error('Blob mangler');
    err.status = 503;
    err.expose = 'Bildeopplasting er ikke satt opp. Opprett en Blob-butikk i Vercel (Storage → Blob) og kjør en ny deploy.';
    throw err;
  }
  const navn = sti.replace(/\//g, '_');
  await mkdir(lokalMappe, { recursive: true });
  await writeFile(join(lokalMappe, navn), data);
  return `lokal:${navn}`;
}

export async function hentFil(nokkel) {
  if (nokkel.startsWith('lokal:')) return readFile(join(lokalMappe, nokkel.slice(6)));
  const { get } = await import('@vercel/blob');
  const svar = await get(nokkel, { access: 'private', ...blobValg() });
  if (!svar || svar.statusCode !== 200) {
    const err = new Error(`Blob svarte ${svar?.statusCode ?? 'ingenting'}`);
    err.status = 502;
    err.expose = 'Fikk ikke hentet filen. Prøv igjen.';
    throw err;
  }
  return Buffer.from(await new Response(svar.stream).arrayBuffer());
}

export async function slettFil(nokkel) {
  if (nokkel.startsWith('lokal:')) {
    await unlink(join(lokalMappe, nokkel.slice(6))).catch(() => {});
    return;
  }
  const { del } = await import('@vercel/blob');
  await del(nokkel, blobValg());
}

// De første bytene avslører hva filen faktisk er; Content-Type fra avsenderen beviser ingenting.
export function erRiktigType(data, type) {
  const start = (...bytes) => bytes.every((b, i) => data[i] === b);
  switch (type) {
    case 'image/jpeg':
      return start(0xff, 0xd8, 0xff);
    case 'image/png':
      return start(0x89, 0x50, 0x4e, 0x47);
    case 'image/webp':
      return data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'application/pdf':
      return data.subarray(0, 1024).includes('%PDF-');
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      // Word- og Excel-filer er zip-arkiver; innholdet må vise hvilken av dem det er.
      return start(0x50, 0x4b, 0x03, 0x04) && data.includes(type.includes('word') ? 'word/' : 'xl/');
    default:
      return false;
  }
}
