import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required } from '../http.js';
import { checkPasswordStrength, createSession, destroySession, hashPassword, login, loginMedLenke } from '../auth.js';

export async function firmanavn() {
  const rad = await one(`SELECT verdi FROM innstillinger WHERE nokkel = 'firmanavn'`);
  return rad?.verdi || '';
}

route(
  'GET',
  '/me',
  async ({ user }) => {
    const harLeder = await one(`SELECT 1 FROM brukere WHERE rolle = 'leder' LIMIT 1`);
    return { user, firma: await firmanavn(), registrering: !harLeder };
  },
  { public: true },
);

// Første gang: den som setter opp systemet blir prosjektleder. Senere er registreringen
// stengt, og nye prosjektledere legges inn under Personer.
route(
  'POST',
  '/registrer',
  async ({ req, res, body }) => {
    if (await one(`SELECT 1 FROM brukere WHERE rolle = 'leder' LIMIT 1`)) fail(403, 'Systemet er allerede satt opp. Logg inn.');
    const kode = (process.env.REGISTRERINGSKODE || '').trim();
    if (!kode || String(body.kode || '') !== kode) fail(403, 'Feil registreringskode.');
    const navn = required(f.line(100), 'Navn')(body.navn);
    const epost = required(f.email, 'E-post')(body.epost);
    checkPasswordStrength(body.passord);
    const firma = f.line(100)(body.firmanavn);
    const bruker = await one(
      `INSERT INTO brukere (navn, epost, rolle, passord_hash, firma) VALUES ($1, $2, 'leder', $3, $4) RETURNING id`,
      [navn, epost, await hashPassword(body.passord), firma],
    );
    if (firma) {
      await q(
        `INSERT INTO innstillinger (nokkel, verdi) VALUES ('firmanavn', $1::jsonb)
         ON CONFLICT (nokkel) DO UPDATE SET verdi = EXCLUDED.verdi`,
        [JSON.stringify(firma)],
      );
    }
    await createSession(req, res, bruker.id);
    return { ok: true };
  },
  { public: true },
);

route('POST', '/logginn', async ({ req, res, body }) => login(req, res, body.epost, body.passord), { public: true });

route(
  'POST',
  '/loggut',
  async ({ req, res }) => {
    await destroySession(req, res);
    return { ok: true };
  },
  { public: true },
);

// Den personlige lenken. Svarer med en omdirigering, ikke JSON, fordi den åpnes rett i nettleseren.
route(
  'GET',
  '/inn/:nokkel',
  async ({ req, res, params }) => {
    const user = await loginMedLenke(req, res, params.nokkel);
    res.statusCode = 302;
    res.setHeader('Location', user ? '/#/mine' : '/#/ugyldig-lenke');
    res.end();
  },
  { public: true },
);

route('PUT', '/innstillinger', async ({ body }) => {
  const navn = f.line(100)(body.firmanavn) || '';
  await q(
    `INSERT INTO innstillinger (nokkel, verdi) VALUES ('firmanavn', $1::jsonb)
     ON CONFLICT (nokkel) DO UPDATE SET verdi = EXCLUDED.verdi`,
    [JSON.stringify(navn)],
  );
  return { firma: navn };
});
