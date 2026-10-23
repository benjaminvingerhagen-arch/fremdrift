import { q } from './db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = message;
  }
}

export const fail = (status, message) => {
  throw new HttpError(status, message);
};

// ---------- Feltkonvertering ----------
// Hver konverterer tar rå verdi fra klienten og returnerer verdien som lagres,
// eller kaster HttpError med en melding som kan vises til brukeren.

const blank = (x) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '');

export const f = {
  str: (max = 200) => (x) => (blank(x) ? null : String(x).trim().slice(0, max)),
  line: (max = 200) => (x) => (blank(x) ? null : String(x).replace(/[\r\n]+/g, ' ').trim().slice(0, max)),
  id: (x) => {
    if (blank(x)) return null;
    const n = Number(x);
    if (!Number.isInteger(n) || n <= 0) fail(400, 'Ugyldig referanse.');
    return n;
  },
  date: (x) => {
    if (blank(x)) return null;
    const s = String(x).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) fail(400, `«${x}» er ikke en gyldig dato.`);
    return s;
  },
  bool: (x) => x === true || x === 'true' || x === 1 || x === '1' || x === 'on',
  oneOf: (list, def = null) => (x) => {
    if (blank(x)) return def;
    if (!list.includes(x)) fail(400, `Ugyldig verdi: ${x}`);
    return x;
  },
  email: (x) => {
    if (blank(x)) return null;
    const s = String(x).trim().toLowerCase().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(400, `«${s}» er ikke en gyldig e-postadresse.`);
    return s;
  },
  ids: (x) => {
    if (!Array.isArray(x)) return JSON.stringify([]);
    return JSON.stringify(x.slice(0, 30).map((v) => f.id(v)).filter(Boolean));
  },
  liste: (x) => {
    if (!Array.isArray(x)) return JSON.stringify([]);
    return JSON.stringify(x.map((v) => String(v ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 12));
  },
};
f.ids.isJson = true;
f.liste.isJson = true;

export function required(conv, label) {
  const wrapped = (x) => {
    const v = conv(x);
    if (v === null || v === undefined) fail(400, `${label} må fylles ut.`);
    return v;
  };
  wrapped.isJson = conv.isJson;
  return wrapped;
}

// Konverterer alle felt i spec (til INSERT) eller bare de som finnes i body (til UPDATE).
export function readFields(body, spec, { partial = false } = {}) {
  const out = {};
  for (const [key, conv] of Object.entries(spec)) {
    if (partial && !(key in body)) continue;
    out[key] = conv(body[key]);
  }
  return out;
}

export function insertSql(table, spec, values, extra = {}) {
  const all = { ...values, ...extra };
  const cols = Object.keys(all);
  const params = cols.map((c) => all[c]);
  const ph = cols.map((c, i) => (spec[c]?.isJson ? `$${i + 1}::jsonb` : `$${i + 1}`));
  return [`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`, params];
}

export function updateSql(table, spec, id, values, { touch = false } = {}) {
  const cols = Object.keys(values);
  const params = cols.map((c) => values[c]);
  const sets = cols.map((c, i) => `${c} = ${spec[c]?.isJson ? `$${i + 1}::jsonb` : `$${i + 1}`}`);
  if (touch) sets.push('endret = now()');
  if (!sets.length) sets.push('id = id');
  params.push(id);
  return [`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params];
}

// hvem: brukeren som gjorde det, eller 'kunde' når det kom fra kundesiden.
export async function logg(prosjektId, hvem, handling, detaljer = null) {
  try {
    const bruker = hvem && typeof hvem === 'object' ? hvem : null;
    await q('INSERT INTO logg (prosjekt_id, bruker_id, hvem, handling, detaljer) VALUES ($1, $2, $3, $4, $5::jsonb)', [
      prosjektId ?? null,
      bruker?.id ?? null,
      bruker ? bruker.navn : String(hvem || ''),
      handling,
      detaljer ? JSON.stringify(detaljer) : null,
    ]);
  } catch (err) {
    console.error('Kunne ikke skrive til logg', err);
  }
}
