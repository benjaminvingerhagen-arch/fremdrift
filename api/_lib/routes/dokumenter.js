import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required, readFields, insertSql, updateSql, logg } from '../http.js';
import { slettFil } from '../lagring.js';
import { DOKUMENT_KATEGORIER, iDag, leggTilDager, ukeStart, isoUke } from '../../../shared/plan.js';
import { prosjektFinnes } from './prosjekter.js';
import { MINE } from './oppgaver.js';

// Dokumenthotell: tegninger, kontrakter, FDV, samsvarserklæringer og annet som hører til
// prosjektet, samlet på ett sted. Prosjektlederen velger per dokument om kunden og fagene
// skal se det. Fagene kan selv levere dokumenter (f.eks. samsvarserklæring og FDV) til
// prosjekter de jobber i; de er bare synlige for prosjektlederen til hen deler dem.
// I tillegg vises bildene og filene som allerede ligger i prosjektet (meldinger, mangler,
// dagbok, oppdateringer), så alt kan finnes fra ett sted.

const DOKUMENT = {
  tittel: required(f.line(150), 'Tittel'),
  kategori: f.oneOf(Object.keys(DOKUMENT_KATEGORIER)),
  beskrivelse: f.str(1000),
  synlig_for_kunde: f.bool,
  synlig_for_fag: f.bool,
};

const FELTER = `d.id, d.prosjekt_id, d.vedlegg_id, d.tittel, d.kategori, d.beskrivelse, d.synlig_for_kunde, d.synlig_for_fag,
                d.lagt_til_av, d.opprettet, v.type, v.navn AS filnavn, v.storrelse, b.navn AS lagt_til_navn, b.rolle AS lagt_til_rolle`;
const FRA = 'dokumenter d JOIN vedlegg v ON v.id = d.vedlegg_id LEFT JOIN brukere b ON b.id = d.lagt_til_av';

// Filer i prosjektet som allerede er i bruk et annet sted. De slettes ikke sammen med dokumentet.
async function iBrukAndreSteder(vedleggId) {
  const ider = JSON.stringify([vedleggId]);
  return Boolean(
    await one(
      `SELECT 1 FROM kommentarer WHERE vedlegg_id = $1
       UNION ALL SELECT 1 FROM mangler WHERE bilde_id = $1 OR utbedret_bilde_id = $1
       UNION ALL SELECT 1 FROM prosjekter WHERE forsidebilde_id = $1
       UNION ALL SELECT 1 FROM dagbok WHERE bilder @> $2::jsonb
       UNION ALL SELECT 1 FROM oppdateringer WHERE bilder @> $2::jsonb LIMIT 1`,
      [vedleggId, ider],
    ),
  );
}

async function slettDokument(d, user) {
  await q('DELETE FROM dokumenter WHERE id = $1', [d.id]);
  if (!(await iBrukAndreSteder(d.vedlegg_id))) {
    const v = await one('DELETE FROM vedlegg WHERE id = $1 RETURNING nokkel', [d.vedlegg_id]);
    if (v) await slettFil(v.nokkel).catch(() => {});
  }
  await logg(d.prosjekt_id, user, `Slettet dokumentet «${d.tittel}»`);
}

async function sjekkVedlegg(prosjektId, vedleggId, { eier } = {}) {
  const v = await one('SELECT id, opplastet_av FROM vedlegg WHERE id = $1 AND prosjekt_id = $2', [vedleggId, prosjektId]);
  if (!v) fail(400, 'Filen hører ikke til prosjektet.');
  if (eier && v.opplastet_av !== eier) fail(403, 'Du kan bare legge til filer du har lastet opp selv.');
  if (await one('SELECT 1 FROM dokumenter WHERE vedlegg_id = $1', [vedleggId])) fail(409, 'Filen ligger allerede i dokumentene.');
}

// ---------- Prosjektleder ----------

route('GET', '/prosjekter/:id/dokumenter', async ({ params }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const [dokumenter, samlet] = await Promise.all([
    q(`SELECT ${FELTER} FROM ${FRA} WHERE d.prosjekt_id = $1 ORDER BY d.opprettet DESC, d.id DESC`, [id]),
    // Det som allerede ligger i prosjektet, med hvor det brukes. Én rad per fil.
    q(
      `SELECT v.id AS vedlegg_id, v.type, v.navn AS filnavn, v.storrelse, v.opprettet,
              json_agg(json_build_object('kilde', k.kilde, 'tekst', k.tekst, 'oppgave_id', k.oppgave_id, 'dato', k.dato) ORDER BY k.rekke) AS kilder
         FROM (
           SELECT k.vedlegg_id AS vid, 1 AS rekke, 'oppgave' AS kilde, concat_ws(' ', o.nr, o.tittel) AS tekst, o.id AS oppgave_id, NULL::date AS dato
             FROM kommentarer k JOIN oppgaver o ON o.id = k.oppgave_id WHERE o.prosjekt_id = $1 AND k.vedlegg_id IS NOT NULL
           UNION ALL
           SELECT m.bilde_id, 2, 'mangel', m.tittel, NULL, NULL FROM mangler m WHERE m.prosjekt_id = $1 AND m.bilde_id IS NOT NULL
           UNION ALL
           SELECT m.utbedret_bilde_id, 2, 'mangel', concat(m.tittel, ' (utbedret)'), NULL, NULL FROM mangler m WHERE m.prosjekt_id = $1 AND m.utbedret_bilde_id IS NOT NULL
           UNION ALL
           SELECT b.vid::int, 3, 'dagbok', NULL, NULL, d.dato FROM dagbok d, jsonb_array_elements_text(d.bilder) AS b(vid) WHERE d.prosjekt_id = $1
           UNION ALL
           SELECT b.vid::int, 4, 'oppdatering', u.tittel, NULL, NULL FROM oppdateringer u, jsonb_array_elements_text(u.bilder) AS b(vid) WHERE u.prosjekt_id = $1
           UNION ALL
           SELECT p.forsidebilde_id, 5, 'forside', NULL, NULL, NULL FROM prosjekter p WHERE p.id = $1 AND p.forsidebilde_id IS NOT NULL
         ) k JOIN vedlegg v ON v.id = k.vid AND v.prosjekt_id = $1
        WHERE NOT EXISTS (SELECT 1 FROM dokumenter d WHERE d.vedlegg_id = v.id)
        GROUP BY v.id
        ORDER BY v.opprettet DESC, v.id DESC
        LIMIT 500`,
      [id],
    ),
  ]);
  return { dokumenter, samlet };
});

route('POST', '/prosjekter/:id/dokumenter', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const vedleggId = required(f.id, 'Fil')(body.vedlegg_id);
  await sjekkVedlegg(id, vedleggId);
  const v = readFields(body, DOKUMENT);
  v.kategori ||= 'annet';
  const [sql, p] = insertSql('dokumenter', DOKUMENT, v, { prosjekt_id: id, vedlegg_id: vedleggId, lagt_til_av: user.id });
  const rad = await one(sql, p);
  await logg(id, user, `La til dokumentet «${rad.tittel}»`);
  return one(`SELECT ${FELTER} FROM ${FRA} WHERE d.id = $1`, [rad.id]);
});

route('PUT', '/dokumenter/:id', async ({ params, body }) => {
  const v = readFields(body, DOKUMENT, { partial: true });
  if ('kategori' in v && !v.kategori) v.kategori = 'annet';
  const [sql, p] = updateSql('dokumenter', DOKUMENT, f.id(params.id), v);
  const rad = await one(sql, p);
  if (!rad) fail(404, 'Fant ikke dokumentet.');
  return one(`SELECT ${FELTER} FROM ${FRA} WHERE d.id = $1`, [rad.id]);
});

route('DELETE', '/dokumenter/:id', async ({ params, user }) => {
  const d = await one('SELECT * FROM dokumenter WHERE id = $1', [f.id(params.id)]);
  if (!d) fail(404, 'Fant ikke dokumentet.');
  await slettDokument(d, user);
  return { ok: true };
});

// ---------- Ansatte og leverandører ----------
// Dokumentene som er delt med fagene i prosjektene de jobber i, og det de har levert selv.

route(
  'GET',
  '/mine/dokumenter',
  async ({ user }) => {
    const prosjekter = await q(
      `SELECT DISTINCT p.id, p.navn FROM oppgaver o JOIN prosjekter p ON p.id = o.prosjekt_id
        WHERE NOT p.arkivert AND ${MINE} ORDER BY p.navn`,
      [user.id, user.fag],
    );
    const ider = prosjekter.map((p) => p.id);
    const dokumenter = ider.length
      ? await q(
          `SELECT d.id, d.prosjekt_id, d.vedlegg_id, d.tittel, d.kategori, d.beskrivelse, d.opprettet, v.type, v.navn AS filnavn, v.storrelse,
                  (d.lagt_til_av = $2) AS eget, d.synlig_for_fag
             FROM dokumenter d JOIN vedlegg v ON v.id = d.vedlegg_id
            WHERE d.prosjekt_id = ANY($1::int[]) AND (d.synlig_for_fag OR d.lagt_til_av = $2)
            ORDER BY d.opprettet DESC, d.id DESC`,
          [ider, user.id],
        )
      : [];
    return { prosjekter, dokumenter };
  },
  { alle: true },
);

route(
  'POST',
  '/mine/prosjekter/:id/dokumenter',
  async ({ params, body, user }) => {
    const id = f.id(params.id);
    const med = await one(`SELECT 1 FROM oppgaver o WHERE o.prosjekt_id = $3 AND ${MINE} LIMIT 1`, [user.id, user.fag, id]);
    if (!med && user.rolle !== 'leder') fail(403, 'Du har ingen oppgaver i dette prosjektet.');
    const vedleggId = required(f.id, 'Fil')(body.vedlegg_id);
    await sjekkVedlegg(id, vedleggId, { eier: user.id });
    const v = readFields(body, { tittel: DOKUMENT.tittel, kategori: DOKUMENT.kategori, beskrivelse: DOKUMENT.beskrivelse });
    v.kategori ||= 'annet';
    // Det faget leverer, er bare for prosjektlederen til hen velger å dele det.
    const rad = await one(
      `INSERT INTO dokumenter (prosjekt_id, vedlegg_id, tittel, kategori, beskrivelse, lagt_til_av) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, tittel`,
      [id, vedleggId, v.tittel, v.kategori, v.beskrivelse, user.id],
    );
    await logg(id, user, `Leverte dokumentet «${rad.tittel}»`, { kategori: DOKUMENT_KATEGORIER[v.kategori] }, { type: 'dokument' });
    return rad;
  },
  { alle: true },
);

route(
  'DELETE',
  '/mine/dokumenter/:id',
  async ({ params, user }) => {
    const d = await one('SELECT * FROM dokumenter WHERE id = $1 AND lagt_til_av = $2', [f.id(params.id), user.id]);
    if (!d) fail(404, 'Fant ikke dokumentet.');
    await slettDokument(d, user);
    return { ok: true };
  },
  { alle: true },
);

// ---------- Ukesoppsummering ----------
// Alt som skjedde i prosjektet én uke (mandag–søndag), regnet ut når den åpnes. Intern for
// prosjektlederen; et utkast til kundeoppdatering lages fra den i nettleseren, bare med
// oppgaver kunden kan se.

const OSLO = (kol) => `(${kol} AT TIME ZONE 'Europe/Oslo')::date`;

route('GET', '/prosjekter/:id/ukerapport', async ({ params, query }) => {
  const id = f.id(params.id);
  const p = await one('SELECT id, navn, start, innflytting, sluttfrist FROM prosjekter WHERE id = $1', [id]);
  if (!p) fail(404, 'Fant ikke prosjektet.');
  const dag = iDag();
  const valgt = f.date(query.uke) || dag;
  const mandag = ukeStart(valgt > dag ? dag : valgt);
  const sondag = leggTilDager(mandag, 6);
  const nesteMandag = leggTilDager(mandag, 7);
  const uke = [id, mandag, sondag];

  const [oppgaver, nyeMangler, utbedrede, apneMangler, dagbok, beslutninger, oppdateringer, dokumenter, bilder, sjekk] = await Promise.all([
    q(
      `SELECT id, nr, fag, tittel, fra, til, synlig_for_kunde, kunde_styrt, ${OSLO('godkjent')} AS godkjent_dato, ${OSLO('ferdig_meldt')} AS meldt_dato
         FROM oppgaver WHERE prosjekt_id = $1 ORDER BY fra, sortering, id`,
      [id],
    ),
    q(`SELECT id, tittel, rom, fag FROM mangler WHERE prosjekt_id = $1 AND ${OSLO('opprettet')} BETWEEN $2 AND $3 ORDER BY id`, uke),
    q(`SELECT id, tittel, rom, fag FROM mangler WHERE prosjekt_id = $1 AND ${OSLO('godkjent')} BETWEEN $2 AND $3 ORDER BY id`, uke),
    one(
      `SELECT COUNT(*)::int AS n FROM mangler WHERE prosjekt_id = $1 AND ${OSLO('opprettet')} <= $2
          AND (godkjent IS NULL OR ${OSLO('godkjent')} > $2)`,
      [id, sondag],
    ),
    q(`SELECT dato, vaer, temperatur, bemanning, notat, avvik, bilder FROM dagbok WHERE prosjekt_id = $1 AND dato BETWEEN $2 AND $3 ORDER BY dato`, uke),
    q(
      `SELECT id, sporsmal, svar, frist, ${OSLO('besvart')} AS besvart_dato FROM beslutninger
        WHERE prosjekt_id = $1 AND ((besvart IS NOT NULL AND ${OSLO('besvart')} BETWEEN $2 AND $3) OR (besvart IS NULL AND ${OSLO('opprettet')} <= $3))
        ORDER BY besvart NULLS LAST, frist NULLS LAST, id`,
      uke,
    ),
    q(`SELECT id, tittel, ${OSLO('publisert')} AS dato FROM oppdateringer WHERE prosjekt_id = $1 AND ${OSLO('publisert')} BETWEEN $2 AND $3 ORDER BY publisert`, uke),
    q(
      `SELECT d.id, d.tittel, d.kategori, d.vedlegg_id, v.type, b.navn AS lagt_til_navn FROM dokumenter d JOIN vedlegg v ON v.id = d.vedlegg_id
         LEFT JOIN brukere b ON b.id = d.lagt_til_av WHERE d.prosjekt_id = $1 AND ${OSLO('d.opprettet')} BETWEEN $2 AND $3 ORDER BY d.id`,
      uke,
    ),
    q(
      `SELECT id FROM vedlegg WHERE prosjekt_id = $1 AND type LIKE 'image/%' AND ${OSLO('opprettet')} BETWEEN $2 AND $3 ORDER BY id DESC LIMIT 40`,
      uke,
    ),
    q('SELECT dato, utfort, notat FROM sjekkpunkter WHERE prosjekt_id = $1 AND dato BETWEEN $2 AND $3 ORDER BY dato', uke),
  ]);

  const kort = (o) => ({ id: o.id, nr: o.nr, fag: o.fag, tittel: o.tittel, fra: o.fra, til: o.til, synlig_for_kunde: o.synlig_for_kunde || o.kunde_styrt });
  const ferdigFor = (o, dato) => o.godkjent_dato && o.godkjent_dato <= dato;
  const prosent = (dato) => (oppgaver.length ? Math.round((oppgaver.filter((o) => ferdigFor(o, dato)).length / oppgaver.length) * 100) : 0);
  // Til og med i dag for uken som pågår, ellers ukens søndag.
  const sluttdato = sondag < dag ? sondag : dag;

  const folkPerFag = new Map();
  for (const d of dagbok) for (const r of d.bemanning || []) folkPerFag.set(r.fag, (folkPerFag.get(r.fag) || 0) + r.antall);

  return {
    prosjekt: { id: p.id, navn: p.navn, innflytting: p.innflytting, sluttfrist: p.sluttfrist },
    i_dag: dag,
    uke: isoUke(mandag),
    mandag,
    sondag,
    pagar: sondag >= dag,
    forrige: leggTilDager(mandag, -7),
    neste: nesteMandag <= dag ? nesteMandag : null,
    fremdrift: { na: prosent(sluttdato), uken_for: prosent(leggTilDager(mandag, -1)), total: oppgaver.length },
    godkjent: oppgaver.filter((o) => o.godkjent_dato >= mandag && o.godkjent_dato <= sondag).map(kort),
    meldt: oppgaver.filter((o) => o.meldt_dato >= mandag && o.meldt_dato <= sondag && !ferdigFor(o, sondag)).map(kort),
    // Fristen er passert ved ukens slutt, og faget har verken meldt ferdig eller fått godkjent.
    ikke_ferdig: oppgaver
      .filter((o) => !o.kunde_styrt && o.til < sluttdato && !ferdigFor(o, sluttdato) && !(o.meldt_dato && o.meldt_dato <= sluttdato))
      .map(kort),
    neste_uke: oppgaver.filter((o) => o.fra >= nesteMandag && o.fra <= leggTilDager(nesteMandag, 6) && !o.godkjent_dato).map(kort),
    mangler: { nye: nyeMangler, utbedret: utbedrede, apne: apneMangler.n },
    dagbok: dagbok.map((d) => ({ ...d, folk: (d.bemanning || []).reduce((s, r) => s + r.antall, 0) })),
    dagsverk: [...folkPerFag].map(([fag, antall]) => ({ fag, antall })).sort((a, b) => b.antall - a.antall),
    beslutninger: {
      besvart: beslutninger.filter((b) => b.besvart_dato),
      apne: beslutninger.filter((b) => !b.besvart_dato),
    },
    oppdateringer,
    dokumenter,
    bilder: bilder.map((b) => b.id),
    sjekkpunkter: sjekk,
  };
});
