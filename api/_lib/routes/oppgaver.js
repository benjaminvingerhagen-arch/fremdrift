import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required, readFields, insertSql, updateSql, logg } from '../http.js';
import { PRIORITETER } from '../../../shared/plan.js';
import { prosjektFinnes } from './prosjekter.js';
import { varsleLedere, varsleUtforende } from '../epost.js';

const SPEC = {
  nr: f.line(20),
  fag: f.line(60),
  tittel: required(f.line(200), 'Oppgave'),
  beskrivelse: f.str(2000),
  merknad: f.str(500),
  fra: required(f.date, 'Fra-dato'),
  til: required(f.date, 'Til-dato'),
  prioritet: f.oneOf(PRIORITETER, 'normal'),
  ansvarlig_id: f.id,
  kunde_styrt: f.bool,
  synlig_for_kunde: (x) => (x === undefined ? true : f.bool(x)),
};

// En oppgave er «din» når du står som ansvarlig, eller når ingen står som ansvarlig
// og den er i ditt fag. Da kan en leverandør legges inn én gang og få alle
// oppgavene for faget sitt i alle prosjekter.
export const MINE = `(o.ansvarlig_id = $1 OR (o.ansvarlig_id IS NULL AND $2::text IS NOT NULL AND lower(o.fag) = lower($2::text)))`;

async function hentOppgave(id) {
  const o = await one('SELECT * FROM oppgaver WHERE id = $1', [id]);
  if (!o) fail(404, 'Fant ikke oppgaven.');
  return o;
}

function erMin(user, o) {
  if (user.rolle === 'leder') return true;
  if (o.ansvarlig_id) return o.ansvarlig_id === user.id;
  return Boolean(user.fag && o.fag && user.fag.toLowerCase() === o.fag.toLowerCase());
}

async function tilgang(user, id) {
  const o = await hentOppgave(id);
  if (!erMin(user, o)) fail(403, 'Dette er ikke din oppgave.');
  const p = await one('SELECT arkivert FROM prosjekter WHERE id = $1', [o.prosjekt_id]);
  if (p?.arkivert && user.rolle !== 'leder') fail(403, 'Prosjektet er avsluttet.');
  return o;
}

route('POST', '/prosjekter/:id/oppgaver', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const v = readFields(body, SPEC);
  const neste = await one('SELECT COALESCE(MAX(sortering), 0) + 1 AS n FROM oppgaver WHERE prosjekt_id = $1', [id]);
  const [sql, p] = insertSql('oppgaver', SPEC, v, { prosjekt_id: id, sortering: neste.n });
  const rad = await one(sql, p);
  await logg(id, user, `La til oppgave «${rad.tittel}»`);
  return rad;
});

route('PUT', '/oppgaver/:id', async ({ params, body, user }) => {
  const id = f.id(params.id);
  const for_ = await hentOppgave(id);
  const v = readFields(body, SPEC, { partial: true });
  const [sql, p] = updateSql('oppgaver', SPEC, id, v, { touch: true });
  const rad = await one(sql, p);
  if ((v.fra && v.fra !== for_.fra) || (v.til && v.til !== for_.til)) {
    await logg(rad.prosjekt_id, user, `Flyttet «${rad.tittel}»`, { fra: [for_.fra, rad.fra], til: [for_.til, rad.til] });
  }
  return rad;
});

route('DELETE', '/oppgaver/:id', async ({ params, user }) => {
  const o = await hentOppgave(f.id(params.id));
  await q('DELETE FROM oppgaver WHERE id = $1', [o.id]);
  await logg(o.prosjekt_id, user, `Slettet oppgave «${o.tittel}»`);
  return { ok: true };
});

// Prosjektleder godkjenner (eller tar tilbake godkjenningen).
route('POST', '/oppgaver/:id/godkjenn', async ({ params, body, user }) => {
  const o = await hentOppgave(f.id(params.id));
  const ja = body.godkjent === undefined ? true : f.bool(body.godkjent);
  const rad = await one(
    ja
      ? `UPDATE oppgaver SET godkjent = now(), ferdig_meldt = COALESCE(ferdig_meldt, now()),
                             meldt_av = COALESCE(meldt_av, $2), endret = now() WHERE id = $1 RETURNING *`
      : `UPDATE oppgaver SET godkjent = NULL, endret = now() WHERE id = $1 RETURNING *`,
    ja ? [o.id, user.navn] : [o.id],
  );
  await logg(o.prosjekt_id, user, `${ja ? 'Godkjente' : 'Tok tilbake godkjenning av'} «${o.tittel}»`);
  return rad;
});

// Prosjektlederen sender en oppgave tilbake: «meldt ferdig» nullstilles og grunnen blir en kommentar.
route('POST', '/oppgaver/:id/avvis', async ({ req, params, body, user }) => {
  const o = await hentOppgave(f.id(params.id));
  const grunn = required(f.str(1000), 'Hva som mangler')(body.grunn);
  await q('UPDATE oppgaver SET ferdig_meldt = NULL, meldt_av = NULL, godkjent = NULL, endret = now() WHERE id = $1', [o.id]);
  await q('INSERT INTO kommentarer (oppgave_id, bruker_id, tekst) VALUES ($1, $2, $3)', [o.id, user.id, `Ikke godkjent: ${grunn}`]);
  await logg(o.prosjekt_id, user, `Sendte «${o.tittel}» tilbake`, { grunn }, { oppgaveId: o.id });
  await varsleUtforende(req, o, {
    emne: `Ikke godkjent: ${o.tittel}`,
    tekst: `${user.navn} har sett på «${o.tittel}» og sendt den tilbake:\n\n«${grunn}»\n\nMeld ferdig igjen når det er rettet.`,
  });
  return { ok: true };
});

// Den som utfører, melder ferdig. Etter godkjenning kan bare prosjektlederen endre.
route(
  'POST',
  '/oppgaver/:id/meld',
  async ({ req, params, body, user }) => {
    const o = await tilgang(user, f.id(params.id));
    const ferdig = body.ferdig === undefined ? true : f.bool(body.ferdig);
    if (o.godkjent && user.rolle !== 'leder') fail(400, 'Oppgaven er allerede godkjent av prosjektleder.');
    const rad = await one(
      ferdig
        ? 'UPDATE oppgaver SET ferdig_meldt = now(), meldt_av = $2, endret = now() WHERE id = $1 RETURNING *'
        : 'UPDATE oppgaver SET ferdig_meldt = NULL, meldt_av = NULL, endret = now() WHERE id = $1 RETURNING *',
      ferdig ? [o.id, user.navn] : [o.id],
    );
    await logg(o.prosjekt_id, user, `${ferdig ? 'Meldte ferdig' : 'Angret ferdigmelding'}: «${o.tittel}»`, null, {
      type: ferdig && user.rolle !== 'leder' ? 'meldt' : null,
      oppgaveId: o.id,
    });
    if (ferdig && user.rolle !== 'leder') {
      const p = await one('SELECT navn FROM prosjekter WHERE id = $1', [o.prosjekt_id]);
      await varsleLedere(req, {
        unntatt: user.id,
        emne: `Meldt ferdig: ${o.tittel} (${p.navn})`,
        tekst: `${user.navn}${user.firma ? ` (${user.firma})` : ''} har meldt «${o.tittel}» ferdig i ${p.navn}.\nKontroller arbeidet og godkjenn, eller send oppgaven tilbake.`,
        sti: `/#/p/${o.prosjekt_id}`,
      });
    }
    return rad;
  },
  { alle: true },
);

route(
  'GET',
  '/oppgaver/:id/kommentarer',
  async ({ params, user }) => {
    const o = await tilgang(user, f.id(params.id));
    await q(
      `INSERT INTO oppgave_lest (bruker_id, oppgave_id, tid) VALUES ($1, $2, now())
       ON CONFLICT (bruker_id, oppgave_id) DO UPDATE SET tid = now()`,
      [user.id, o.id],
    );
    return q(
      `SELECT k.id, k.tekst, k.vedlegg_id, k.fra_kunde, k.opprettet, b.navn AS av, v.type AS vedlegg_type
         FROM kommentarer k LEFT JOIN brukere b ON b.id = k.bruker_id LEFT JOIN vedlegg v ON v.id = k.vedlegg_id
        WHERE k.oppgave_id = $1 ORDER BY k.opprettet`,
      [o.id],
    );
  },
  { alle: true },
);

route(
  'POST',
  '/oppgaver/:id/kommentarer',
  async ({ req, params, body, user }) => {
    const o = await tilgang(user, f.id(params.id));
    const tekst = f.str(2000)(body.tekst);
    const vedleggId = f.id(body.vedlegg_id);
    if (!tekst && !vedleggId) fail(400, 'Skriv en kommentar eller legg ved et bilde.');
    if (vedleggId) {
      const v = await one('SELECT prosjekt_id, opplastet_av FROM vedlegg WHERE id = $1', [vedleggId]);
      if (!v || v.prosjekt_id !== o.prosjekt_id || (user.rolle !== 'leder' && v.opplastet_av !== user.id)) fail(400, 'Ugyldig vedlegg.');
    }
    const rad = await one('INSERT INTO kommentarer (oppgave_id, bruker_id, tekst, vedlegg_id) VALUES ($1, $2, $3, $4) RETURNING *', [
      o.id,
      user.id,
      tekst,
      vedleggId,
    ]);
    // Den som skriver, har selvsagt lest sin egen melding.
    await q(
      `INSERT INTO oppgave_lest (bruker_id, oppgave_id, tid) VALUES ($1, $2, now())
       ON CONFLICT (bruker_id, oppgave_id) DO UPDATE SET tid = now()`,
      [user.id, o.id],
    );
    const utdrag = tekst ? `«${tekst.length > 300 ? `${tekst.slice(0, 300)} …` : tekst}»` : '(bilde)';
    if (user.rolle === 'leder') {
      await varsleUtforende(req, o, { unntatt: user.id, emne: `Ny melding: ${o.tittel}`, tekst: `${user.navn} skrev om «${o.tittel}»:\n\n${utdrag}` });
    } else {
      await logg(o.prosjekt_id, user, `Skrev om «${o.tittel}»`, { utdrag: tekst ? tekst.slice(0, 160) : null, bilde: Boolean(vedleggId) }, { type: 'kommentar', oppgaveId: o.id });
      await varsleLedere(req, {
        unntatt: user.id,
        emne: `Ny melding fra ${user.navn}: ${o.tittel}`,
        tekst: `${user.navn} skrev om «${o.tittel}»:\n\n${utdrag}`,
        sti: `/#/p/${o.prosjekt_id}`,
      });
    }
    return rad;
  },
  { alle: true },
);

// «Mine oppgaver» for ansatte og leverandører, på tvers av prosjekter.
route(
  'GET',
  '/mine',
  async ({ user }) => {
    const oppgaver = await q(
      `SELECT o.id, o.prosjekt_id, o.nr, o.fag, o.tittel, o.beskrivelse, o.merknad, o.fra, o.til, o.prioritet,
              o.ferdig_meldt, o.godkjent, p.navn AS prosjekt, p.adresse,
              (SELECT COUNT(*)::int FROM kommentarer k WHERE k.oppgave_id = o.id) AS kommentarer,
              (SELECT COUNT(*)::int FROM kommentarer k WHERE k.oppgave_id = o.id
                 AND k.bruker_id IS DISTINCT FROM $1
                 AND k.opprettet > COALESCE((SELECT l.tid FROM oppgave_lest l WHERE l.bruker_id = $1 AND l.oppgave_id = o.id), '-infinity')) AS uleste
         FROM oppgaver o JOIN prosjekter p ON p.id = o.prosjekt_id
        WHERE NOT p.arkivert AND ${MINE}
        ORDER BY o.godkjent IS NOT NULL, o.til, o.fra, o.id`,
      [user.id, user.fag],
    );
    const prosjektIder = [...new Set(oppgaver.map((o) => o.prosjekt_id))];
    const prosjekter = prosjektIder.length
      ? await q(
          `SELECT p.id, p.navn, p.adresse, p.innflytting,
                  COALESCE((SELECT json_agg(json_build_object('dato', m.dato, 'navn', m.navn, 'type', m.type) ORDER BY m.dato)
                     FROM milepaeler m WHERE m.prosjekt_id = p.id AND m.dato >= CURRENT_DATE - 1), '[]') AS milepaeler
             FROM prosjekter p WHERE p.id = ANY($1::int[])`,
          [prosjektIder],
        )
      : [];
    return { oppgaver, prosjekter };
  },
  { alle: true },
);
