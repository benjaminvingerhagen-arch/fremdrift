import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, required, logg } from '../http.js';
import { hentFil } from '../lagring.js';
import { sendFil } from './vedlegg.js';
import { varsleLedere } from '../epost.js';
import { firmanavn } from './grunn.js';
import { iDag, leggTilDager, ukedag, oppgaveStatus } from '../../../shared/plan.js';

// Kundesiden: alt her slipper inn med prosjektets kundelenke, uten innlogging.
// Kunden ser fremdriften slik prosjektlederen vil vise den – ikke interne merknader,
// ikke hvem som er ansvarlig, og ikke oppgaver som er skjult for kunden.

async function prosjektFor(token) {
  const s = String(token || '');
  if (s.length < 20 || s.length > 100) fail(404, 'Lenken er ikke gyldig.');
  const p = await one('SELECT * FROM prosjekter WHERE kunde_token = $1 AND kunde_aktiv', [s]);
  if (!p) fail(404, 'Lenken er ikke gyldig lenger. Be prosjektlederen om en ny.');
  return p;
}

// Overfor kunden er en oppgave ferdig, i gang eller planlagt. Et internt «forsinket»
// eller «meldt ferdig» er prosjektlederens sak til det er avklart.
function kundestatus(o, dag) {
  if (o.godkjent) return 'ferdig';
  const s = oppgaveStatus(o, dag);
  return s === 'planlagt' || s === 'snart' ? 'planlagt' : 'pagar';
}

route(
  'GET',
  '/k/:token',
  async ({ params }) => {
    const p = await prosjektFor(params.token);
    const dag = iDag();
    const mandag = leggTilDager(dag, -ukedag(dag));
    const sondag = leggTilDager(mandag, 6);
    const [oppgaver, milepaeler, oppdateringer, beslutninger, mangler, dokumenter] = await Promise.all([
      q(
        `SELECT id, fag, tittel, fra, til, ferdig_meldt, godkjent, kunde_styrt, beskrivelse
           FROM oppgaver WHERE prosjekt_id = $1 AND (synlig_for_kunde OR kunde_styrt) ORDER BY fra, sortering, id`,
        [p.id],
      ),
      q('SELECT id, dato, navn, type, naadd FROM milepaeler WHERE prosjekt_id = $1 AND synlig_for_kunde ORDER BY dato', [p.id]),
      q('SELECT id, tittel, tekst, bilder, publisert FROM oppdateringer WHERE prosjekt_id = $1 ORDER BY publisert DESC', [p.id]),
      q(
        `SELECT id, sporsmal, beskrivelse, alternativer, frist, svar, svar_kommentar, besvart
           FROM beslutninger WHERE prosjekt_id = $1 ORDER BY besvart IS NOT NULL, frist NULLS LAST, id`,
        [p.id],
      ),
      // Kunden ser bare om en mangel er registrert eller utbedret – ikke frist, ansvarlig eller «meldt utbedret».
      q(
        `SELECT id, tittel, rom, (godkjent IS NOT NULL) AS utbedret, godkjent::date AS utbedret_dato
           FROM mangler WHERE prosjekt_id = $1 AND synlig_for_kunde ORDER BY godkjent IS NOT NULL, opprettet, id`,
        [p.id],
      ),
      // Dokumentene prosjektlederen har delt – uten hvem som la dem inn.
      q(
        `SELECT d.vedlegg_id AS id, d.tittel, d.kategori, d.beskrivelse, d.opprettet::date AS dato, v.type, v.navn AS filnavn
           FROM dokumenter d JOIN vedlegg v ON v.id = d.vedlegg_id
          WHERE d.prosjekt_id = $1 AND d.synlig_for_kunde ORDER BY d.kategori, d.opprettet DESC`,
        [p.id],
      ),
    ]);
    const total = oppgaver.length;
    const ferdig = oppgaver.filter((o) => o.godkjent).length;
    const forInnflytting = p.innflytting ? oppgaver.filter((o) => o.til <= p.innflytting) : [];

    // Én linje per fag til tidslinjen på kundesiden.
    const perFag = new Map();
    for (const o of oppgaver) {
      if (o.kunde_styrt) continue;
      const fag = o.fag || 'Annet';
      const r = perFag.get(fag) || { fag, fra: o.fra, til: o.til, total: 0, ferdig: 0 };
      r.fra = o.fra < r.fra ? o.fra : r.fra;
      r.til = o.til > r.til ? o.til : r.til;
      r.total++;
      if (o.godkjent) r.ferdig++;
      perFag.set(fag, r);
    }

    const leder = await one(`SELECT navn, telefon, epost FROM brukere WHERE rolle = 'leder' AND aktiv ORDER BY id LIMIT 1`);
    return {
      firma: await firmanavn(),
      kontakt: leder,
      i_dag: dag,
      prosjekt: {
        navn: p.navn,
        adresse: p.adresse,
        beskrivelse: p.beskrivelse,
        kunde_navn: p.kunde_navn,
        start: p.start,
        innflytting: p.innflytting,
        sluttfrist: p.sluttfrist,
        forsidebilde_id: p.forsidebilde_id,
      },
      fremdrift: {
        total,
        ferdig,
        prosent: total ? Math.round((ferdig / total) * 100) : 0,
        for_innflytting: forInnflytting.length
          ? Math.round((forInnflytting.filter((o) => o.godkjent).length / forInnflytting.length) * 100)
          : null,
      },
      milepaeler,
      fag: [...perFag.values()].sort((a, b) => a.fra.localeCompare(b.fra)),
      denne_uken: oppgaver
        .filter((o) => !o.kunde_styrt && o.fra <= sondag && o.til >= mandag)
        .map((o) => ({ fag: o.fag, tittel: o.tittel, fra: o.fra, til: o.til, status: kundestatus(o, dag) })),
      neste_uke: oppgaver
        .filter((o) => !o.kunde_styrt && o.fra > sondag && o.fra <= leggTilDager(sondag, 7))
        .map((o) => ({ fag: o.fag, tittel: o.tittel, fra: o.fra, til: o.til })),
      egne: oppgaver
        .filter((o) => o.kunde_styrt)
        .map((o) => ({ id: o.id, fag: o.fag, tittel: o.tittel, beskrivelse: o.beskrivelse, fra: o.fra, til: o.til, levert: Boolean(o.ferdig_meldt), godkjent: Boolean(o.godkjent) })),
      oppdateringer,
      beslutninger,
      mangler,
      dokumenter,
    };
  },
  { public: true },
);

route(
  'POST',
  '/k/:token/beslutninger/:id',
  async ({ req, params, body }) => {
    const p = await prosjektFor(params.token);
    const b = await one('SELECT * FROM beslutninger WHERE id = $1 AND prosjekt_id = $2', [f.id(params.id), p.id]);
    if (!b) fail(404, 'Fant ikke spørsmålet.');
    if (b.besvart) fail(400, 'Spørsmålet er allerede besvart. Ta kontakt med prosjektlederen for å endre svaret.');
    const svar = required(f.line(200), 'Svar')(body.svar);
    const alternativer = Array.isArray(b.alternativer) ? b.alternativer : [];
    if (alternativer.length && !alternativer.includes(svar)) fail(400, 'Velg et av alternativene.');
    const rad = await one(
      'UPDATE beslutninger SET svar = $1, svar_kommentar = $2, besvart = now() WHERE id = $3 RETURNING *',
      [svar, f.str(1000)(body.kommentar), b.id],
    );
    await logg(p.id, 'Kunden', `Svarte på «${b.sporsmal}»: ${svar}`, { kommentar: rad.svar_kommentar }, { type: 'kundesvar' });
    await varsleLedere(req, {
      emne: `Kunden har svart: ${b.sporsmal} (${p.navn})`,
      tekst: `${p.kunde_navn || 'Kunden'} har svart på «${b.sporsmal}»:\n\n${svar}${rad.svar_kommentar ? `\n«${rad.svar_kommentar}»` : ''}`,
      sti: `/app#/p/${p.id}/kunde`,
    });
    return rad;
  },
  { public: true },
);

// Leveranser kunden selv styrer (f.eks. kjøkken- eller garderobeleverandør): kunden
// kan flytte datoene og melde at det er levert. Prosjektlederen godkjenner som vanlig.
route(
  'PUT',
  '/k/:token/oppgaver/:id',
  async ({ req, params, body }) => {
    const p = await prosjektFor(params.token);
    const o = await one('SELECT * FROM oppgaver WHERE id = $1 AND prosjekt_id = $2 AND kunde_styrt', [f.id(params.id), p.id]);
    if (!o) fail(404, 'Fant ikke leveransen.');
    if (o.godkjent) fail(400, 'Leveransen er godkjent og kan ikke endres.');
    const fra = f.date(body.fra) || o.fra;
    const til = f.date(body.til) || o.til;
    if (til < fra) fail(400, 'Sluttdato kan ikke være før startdato.');
    const levert = body.levert === undefined ? Boolean(o.ferdig_meldt) : f.bool(body.levert);
    const rad = await one(
      `UPDATE oppgaver SET fra = $1, til = $2,
              ferdig_meldt = CASE WHEN $3 THEN COALESCE(ferdig_meldt, now()) ELSE NULL END,
              meldt_av = CASE WHEN $3 THEN 'Kunden' ELSE NULL END, endret = now()
        WHERE id = $4 RETURNING id, fra, til, ferdig_meldt`,
      [fra, til, levert, o.id],
    );
    const endringer = [];
    if (fra !== o.fra || til !== o.til) {
      await logg(p.id, 'Kunden', `Flyttet «${o.tittel}»`, { fra: [o.fra, fra], til: [o.til, til] }, { type: 'kunde', oppgaveId: o.id });
      endringer.push(`Ny periode: ${fra.split('-').reverse().join('.')} – ${til.split('-').reverse().join('.')} (var ${o.fra.split('-').reverse().join('.')} – ${o.til.split('-').reverse().join('.')})`);
    }
    if (levert !== Boolean(o.ferdig_meldt)) {
      await logg(p.id, 'Kunden', `${levert ? 'Meldte levert' : 'Angret levert'}: «${o.tittel}»`, null, { type: 'kunde', oppgaveId: o.id });
      endringer.push(levert ? 'Meldt som levert – kontroller og godkjenn.' : 'Ikke levert likevel.');
    }
    if (endringer.length) {
      await varsleLedere(req, {
        emne: `Kunden har oppdatert ${o.tittel} (${p.navn})`,
        tekst: `${p.kunde_navn || 'Kunden'} har oppdatert «${o.tittel}»:\n\n${endringer.join('\n')}`,
        sti: `/app#/p/${p.id}/plan`,
      });
    }
    return { id: rad.id, fra: rad.fra, til: rad.til, levert: Boolean(rad.ferdig_meldt) };
  },
  { public: true },
);

route(
  'GET',
  '/k/:token/fil/:id',
  async ({ res, params }) => {
    const p = await prosjektFor(params.token);
    const id = f.id(params.id);
    const v = await one('SELECT * FROM vedlegg WHERE id = $1 AND prosjekt_id = $2', [id, p.id]);
    // Kunden får bare filer som er publisert til kunden: forsidebildet, bildene i oppdateringene
    // og dokumentene som er delt med kunden.
    const publisert =
      v &&
      (p.forsidebilde_id === id ||
        (await one(
          `SELECT 1 FROM oppdateringer WHERE prosjekt_id = $1 AND bilder @> $2::jsonb
           UNION ALL SELECT 1 FROM dokumenter WHERE prosjekt_id = $1 AND vedlegg_id = $3 AND synlig_for_kunde LIMIT 1`,
          [p.id, JSON.stringify([id]), id],
        )));
    if (!publisert) fail(404, 'Fant ikke filen.');
    sendFil(res, await hentFil(v.nokkel), v.type, v.navn);
  },
  { public: true },
);
