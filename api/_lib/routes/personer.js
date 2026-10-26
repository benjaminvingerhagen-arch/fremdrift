import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required, readFields, insertSql, updateSql } from '../http.js';
import { checkPasswordStrength, endSessionsFor, hashPassword, nyNokkel, sha256 } from '../auth.js';

const SPEC = {
  navn: required(f.line(100), 'Navn'),
  epost: f.email,
  telefon: f.line(30),
  firma: f.line(100),
  fag: f.line(60),
  rolle: f.oneOf(['leder', 'ansatt', 'leverandor'], 'leverandor'),
  epostvarsel: (x) => (x === undefined ? true : f.bool(x)),
};

const KOLONNER = `id, navn, epost, telefon, firma, fag, rolle, aktiv, epostvarsel, sist_innom, opprettet, (lenke_hash IS NOT NULL) AS har_lenke`;

export async function personer() {
  return q(`SELECT ${KOLONNER} FROM brukere ORDER BY aktiv DESC, rolle = 'leder' DESC, navn`);
}

route('GET', '/personer', async () => personer());

route('POST', '/personer', async ({ body }) => {
  const v = readFields(body, SPEC);
  const nokkel = v.rolle === 'leder' ? null : nyNokkel();
  let hash = null;
  if (v.rolle === 'leder') {
    if (!v.epost) fail(400, 'En prosjektleder må ha e-post for å logge inn.');
    checkPasswordStrength(body.passord);
    hash = await hashPassword(body.passord);
  }
  const [sql, params] = insertSql('brukere', SPEC, v, { passord_hash: hash, lenke_hash: nokkel ? sha256(nokkel) : null });
  const rad = await one(sql, params);
  return { id: rad.id, nokkel };
});

route('PUT', '/personer/:id', async ({ params, body, user }) => {
  const id = f.id(params.id);
  const v = readFields(body, SPEC, { partial: true });
  if (id === user.id && v.rolle && v.rolle !== 'leder') fail(400, 'Du kan ikke ta bort din egen rolle som prosjektleder.');
  const [sql, p] = updateSql('brukere', SPEC, id, v);
  const rad = await one(sql, p);
  if (!rad) fail(404, 'Fant ikke personen.');
  if (body.passord) {
    checkPasswordStrength(body.passord);
    await q('UPDATE brukere SET passord_hash = $1 WHERE id = $2', [await hashPassword(body.passord), id]);
  }
  return { ok: true };
});

// Ny lenke: den gamle slutter å virke, alle åpne økter for personen avsluttes, og
// kalenderabonnementet stopper (personen lager et nytt fra sin egen side).
route('POST', '/personer/:id/lenke', async ({ params }) => {
  const id = f.id(params.id);
  const nokkel = nyNokkel();
  const rad = await one(`UPDATE brukere SET lenke_hash = $1, app_nokkel = NULL, kalender_hash = NULL WHERE id = $2 AND rolle <> 'leder' RETURNING id`, [sha256(nokkel), id]);
  if (!rad) fail(404, 'Fant ikke personen, eller personen logger inn med passord.');
  await endSessionsFor(id);
  return { nokkel };
});

route('POST', '/personer/:id/aktiv', async ({ params, body, user }) => {
  const id = f.id(params.id);
  if (id === user.id) fail(400, 'Du kan ikke deaktivere deg selv.');
  const aktiv = f.bool(body.aktiv);
  await q('UPDATE brukere SET aktiv = $1 WHERE id = $2', [aktiv, id]);
  if (!aktiv) await endSessionsFor(id);
  return { ok: true };
});
