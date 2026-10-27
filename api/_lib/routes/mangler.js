import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required, readFields, insertSql, updateSql, logg } from '../http.js';
import { varsleLedere, varsleUtforende } from '../epost.js';
import { prosjektFinnes } from './prosjekter.js';

// Mangelliste: feil og rester som må utbedres før eller etter overtakelse.
// Prosjektlederen registrerer, faget melder utbedret, prosjektlederen godkjenner
// eller sender tilbake – akkurat som med oppgavene. Kunden ser bare om en mangel
// er registrert eller utbedret, aldri hvem som har ansvaret eller fristen.

const SPEC = {
  tittel: required(f.line(200), 'Mangel'),
  beskrivelse: f.str(2000),
  rom: f.line(80),
  fag: f.line(60),
  ansvarlig_id: f.id,
  oppgave_id: f.id,
  frist: f.date,
  bilde_id: f.id,
  synlig_for_kunde: (x) => (x === undefined ? true : f.bool(x)),
};

// Samme regel som for oppgaver: din når du er ansvarlig, eller når ingen er det og faget er ditt.
const MINE = `(m.ansvarlig_id = $1 OR (m.ansvarlig_id IS NULL AND $2::text IS NOT NULL AND lower(m.fag) = lower($2::text)))`;

function erMin(user, m) {
  if (user.rolle === 'leder') return true;
  if (m.ansvarlig_id) return m.ansvarlig_id === user.id;
  return Boolean(user.fag && m.fag && user.fag.toLowerCase() === m.fag.toLowerCase());
}

async function hentMangel(id) {
  const m = await one('SELECT * FROM mangler WHERE id = $1', [id]);
  if (!m) fail(404, 'Fant ikke mangelen.');
  return m;
}

// Koblinger til oppgave og bilde må høre til samme prosjekt.
async function sjekkKoblinger(prosjektId, v) {
  if (v.oppgave_id) {
    const o = await one('SELECT fag FROM oppgaver WHERE id = $1 AND prosjekt_id = $2', [v.oppgave_id, prosjektId]);
    if (!o) fail(400, 'Oppgaven hører ikke til prosjektet.');
    if (!v.fag && o.fag) v.fag = o.fag;
  }
  if (v.bilde_id && !(await one('SELECT 1 FROM vedlegg WHERE id = $1 AND prosjekt_id = $2', [v.bilde_id, prosjektId]))) {
    fail(400, 'Ugyldig bilde.');
  }
  if (v.ansvarlig_id && !(await one(`SELECT 1 FROM brukere WHERE id = $1 AND rolle <> 'leder'`, [v.ansvarlig_id]))) {
    fail(400, 'Ugyldig ansvarlig.');
  }
}

route('GET', '/prosjekter/:id/mangler', async ({ params }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  return q(
    `SELECT m.*, b.navn AS ansvarlig_navn, o.tittel AS oppgave_tittel
       FROM mangler m LEFT JOIN brukere b ON b.id = m.ansvarlig_id LEFT JOIN oppgaver o ON o.id = m.oppgave_id
      WHERE m.prosjekt_id = $1 ORDER BY m.godkjent IS NOT NULL, m.frist NULLS LAST, m.id`,
    [id],
  );
});

route('POST', '/prosjekter/:id/mangler', async ({ req, params, body, user }) => {
  const id = f.id(params.id);
  const p = await one('SELECT navn FROM prosjekter WHERE id = $1', [id]);
  if (!p) fail(404, 'Fant ikke prosjektet.');
  const v = readFields(body, SPEC);
  await sjekkKoblinger(id, v);
  const [sql, params_] = insertSql('mangler', SPEC, v, { prosjekt_id: id });
  const m = await one(sql, params_);
  await logg(id, user, `Registrerte mangel «${m.tittel}»`);
  if (m.fag || m.ansvarlig_id) {
    await varsleUtforende(req, m, {
      emne: `Ny mangel: ${m.tittel} (${p.navn})`,
      tekst: `${user.navn} har registrert en mangel i ${p.navn}:\n\n${m.tittel}${m.rom ? ` – ${m.rom}` : ''}${m.frist ? `\nFrist: ${m.frist}` : ''}${m.beskrivelse ? `\n\n${m.beskrivelse}` : ''}`,
    });
  }
  return m;
});

route('PUT', '/mangler/:id', async ({ params, body, user }) => {
  const for_ = await hentMangel(f.id(params.id));
  const v = readFields(body, SPEC, { partial: true });
  await sjekkKoblinger(for_.prosjekt_id, v);
  const [sql, p] = updateSql('mangler', SPEC, for_.id, v, { touch: true });
  const m = await one(sql, p);
  await logg(m.prosjekt_id, user, `Endret mangel «${m.tittel}»`);
  return m;
});

route('DELETE', '/mangler/:id', async ({ params, user }) => {
  const m = await hentMangel(f.id(params.id));
  await q('DELETE FROM mangler WHERE id = $1', [m.id]);
  await logg(m.prosjekt_id, user, `Slettet mangel «${m.tittel}»`);
  return { ok: true };
});

route('POST', '/mangler/:id/godkjenn', async ({ params, body, user }) => {
  const m = await hentMangel(f.id(params.id));
  const ja = body.godkjent === undefined ? true : f.bool(body.godkjent);
  const rad = await one(
    ja
      ? `UPDATE mangler SET godkjent = now(), utbedret = COALESCE(utbedret, now()), utbedret_av = COALESCE(utbedret_av, $2),
                            avvist_grunn = NULL, endret = now() WHERE id = $1 RETURNING *`
      : 'UPDATE mangler SET godkjent = NULL, endret = now() WHERE id = $1 RETURNING *',
    ja ? [m.id, user.navn] : [m.id],
  );
  await logg(m.prosjekt_id, user, `${ja ? 'Godkjente utbedring av' : 'Tok tilbake godkjenning av'} mangel «${m.tittel}»`);
  return rad;
});

// Utbedringen holder ikke: tilbake til åpen, med beskjed om hva som mangler.
route('POST', '/mangler/:id/avvis', async ({ req, params, body, user }) => {
  const m = await hentMangel(f.id(params.id));
  const grunn = required(f.str(1000), 'Hva som mangler')(body.grunn);
  const rad = await one(
    `UPDATE mangler SET utbedret = NULL, utbedret_av = NULL, godkjent = NULL, avvist_grunn = $2, endret = now()
      WHERE id = $1 RETURNING *`,
    [m.id, grunn],
  );
  await logg(m.prosjekt_id, user, `Sendte mangel «${m.tittel}» tilbake`, { grunn });
  const p = await one('SELECT navn FROM prosjekter WHERE id = $1', [m.prosjekt_id]);
  await varsleUtforende(req, m, {
    unntatt: user.id,
    emne: `Mangel sendt tilbake: ${m.tittel} (${p.navn})`,
    tekst: `${user.navn} har sendt mangelen «${m.tittel}» i ${p.navn} tilbake:\n\n${grunn}`,
  });
  return rad;
});

// ---------- For ansatte og leverandører ----------

route(
  'GET',
  '/mine/mangler',
  async ({ user }) =>
    q(
      `SELECT m.id, m.prosjekt_id, m.tittel, m.beskrivelse, m.rom, m.fag, m.frist, m.bilde_id, m.utbedret,
              m.utbedret_kommentar, m.utbedret_bilde_id, m.avvist_grunn, m.godkjent, p.navn AS prosjekt, p.adresse
         FROM mangler m JOIN prosjekter p ON p.id = m.prosjekt_id
        WHERE NOT p.arkivert AND ${MINE} AND (m.godkjent IS NULL OR m.godkjent > now() - interval '14 days')
        ORDER BY m.godkjent IS NOT NULL, m.utbedret IS NOT NULL, m.frist NULLS LAST, m.id`,
      [user.id, user.fag],
    ),
  { alle: true },
);

route(
  'POST',
  '/mangler/:id/utbedret',
  async ({ req, params, body, user }) => {
    const m = await hentMangel(f.id(params.id));
    if (!erMin(user, m)) fail(403, 'Dette er ikke din mangel.');
    const p = await one('SELECT navn, arkivert FROM prosjekter WHERE id = $1', [m.prosjekt_id]);
    if (p.arkivert && user.rolle !== 'leder') fail(403, 'Prosjektet er avsluttet.');
    if (m.godkjent && user.rolle !== 'leder') fail(400, 'Utbedringen er allerede godkjent av prosjektleder.');
    const ja = body.utbedret === undefined ? true : f.bool(body.utbedret);
    if (!ja) {
      return one(
        'UPDATE mangler SET utbedret = NULL, utbedret_av = NULL, utbedret_kommentar = NULL, utbedret_bilde_id = NULL, endret = now() WHERE id = $1 RETURNING *',
        [m.id],
      );
    }
    const kommentar = f.str(1000)(body.kommentar);
    const bildeId = f.id(body.bilde_id);
    if (bildeId) {
      const v = await one('SELECT prosjekt_id, opplastet_av FROM vedlegg WHERE id = $1', [bildeId]);
      if (!v || v.prosjekt_id !== m.prosjekt_id || (user.rolle !== 'leder' && v.opplastet_av !== user.id)) fail(400, 'Ugyldig bilde.');
    }
    const rad = await one(
      `UPDATE mangler SET utbedret = now(), utbedret_av = $2, utbedret_kommentar = $3, utbedret_bilde_id = $4,
                          avvist_grunn = NULL, endret = now() WHERE id = $1 RETURNING *`,
      [m.id, user.navn, kommentar, bildeId],
    );
    if (user.rolle !== 'leder') {
      await logg(m.prosjekt_id, user, `Meldte mangel utbedret: «${m.tittel}»`, kommentar ? { utdrag: kommentar.slice(0, 160) } : null, {
        type: 'mangel',
      });
      await varsleLedere(req, {
        unntatt: user.id,
        emne: `Mangel utbedret: ${m.tittel} (${p.navn})`,
        tekst: `${user.navn}${user.firma ? ` (${user.firma})` : ''} har meldt mangelen «${m.tittel}» utbedret i ${p.navn}.${kommentar ? `\n\n«${kommentar}»` : ''}\nKontroller og godkjenn, eller send den tilbake.`,
        sti: `/app#/p/${m.prosjekt_id}/mangler`,
      });
    }
    return rad;
  },
  { alle: true },
);
