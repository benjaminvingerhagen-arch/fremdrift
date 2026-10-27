import { route } from '../router.js';
import { q, one, transaction } from '../db.js';
import { f, fail, required, readFields, insertSql, updateSql, logg } from '../http.js';
import { nyNokkel } from '../auth.js';
import { iDag, PRIORITETER, MILEPAEL_TYPER, flyttArbeidsdager } from '../../../shared/plan.js';
import { personer } from './personer.js';
import { varsleKunde } from '../epost.js';

const SPEC = {
  navn: required(f.line(120), 'Prosjektnavn'),
  adresse: f.line(160),
  beskrivelse: f.str(2000),
  kunde_navn: f.line(120),
  kunde_epost: f.email,
  kunde_telefon: f.line(30),
  start: f.date,
  innflytting: f.date,
  sluttfrist: f.date,
  kunde_aktiv: (x) => (x === undefined ? true : f.bool(x)),
  plan_for_fag: (x) => (x === undefined ? true : f.bool(x)),
  forsidebilde_id: f.id,
  arkivert: f.bool,
};

const MILEPAEL = {
  dato: required(f.date, 'Dato'),
  navn: required(f.line(160), 'Navn'),
  kort: f.line(40),
  type: f.oneOf(Object.keys(MILEPAEL_TYPER), 'delmal'),
  naadd: f.bool,
  synlig_for_kunde: (x) => (x === undefined ? true : f.bool(x)),
};

const OPPDATERING = {
  tittel: required(f.line(160), 'Tittel'),
  tekst: f.str(5000),
  bilder: f.ids,
};

const BESLUTNING = {
  sporsmal: required(f.line(200), 'Spørsmål'),
  beskrivelse: f.str(2000),
  alternativer: f.liste,
  frist: f.date,
};

export async function prosjektFinnes(id) {
  const p = await one('SELECT id FROM prosjekter WHERE id = $1', [id]);
  if (!p) fail(404, 'Fant ikke prosjektet.');
  return p;
}

route('GET', '/prosjekter', async () => {
  const dag = iDag();
  return q(
    `SELECT p.id, p.navn, p.adresse, p.kunde_navn, p.start, p.innflytting, p.sluttfrist, p.arkivert, p.forsidebilde_id,
            COUNT(o.id)::int AS total,
            COUNT(o.id) FILTER (WHERE o.godkjent IS NOT NULL)::int AS ferdig,
            COUNT(o.id) FILTER (WHERE o.godkjent IS NULL AND o.ferdig_meldt IS NOT NULL)::int AS meldt,
            COUNT(o.id) FILTER (WHERE o.godkjent IS NULL AND o.ferdig_meldt IS NULL AND o.til < $1)::int AS forsinket,
            COUNT(o.id) FILTER (WHERE o.godkjent IS NULL AND o.fra <= $1 AND o.til >= $1)::int AS aktive,
            (SELECT COUNT(*)::int FROM beslutninger b WHERE b.prosjekt_id = p.id AND b.besvart IS NOT NULL
               AND b.besvart > now() - interval '14 days') AS nye_svar,
            (SELECT json_build_object('dato', m.dato, 'navn', m.navn) FROM milepaeler m
              WHERE m.prosjekt_id = p.id AND m.dato >= $1 ORDER BY m.dato LIMIT 1) AS neste_milepael
       FROM prosjekter p LEFT JOIN oppgaver o ON o.prosjekt_id = p.id
      GROUP BY p.id ORDER BY p.arkivert, p.innflytting NULLS LAST, p.id DESC`,
    [dag],
  );
});

route('POST', '/prosjekter', async ({ body, user }) => {
  const v = readFields(body, SPEC);
  const [sql, params] = insertSql('prosjekter', SPEC, v, { kunde_token: nyNokkel() });
  const p = await one(sql, params);
  await logg(p.id, user, 'Opprettet prosjektet');
  return p;
});

route('GET', '/prosjekter/:id', async ({ params, user }) => {
  const id = f.id(params.id);
  const prosjekt = await one('SELECT * FROM prosjekter WHERE id = $1', [id]);
  if (!prosjekt) fail(404, 'Fant ikke prosjektet.');
  const [oppgaver, milepaeler, sjekk, oppdateringer, beslutninger, folk, mangler] = await Promise.all([
    q(
      `SELECT o.*, b.navn AS ansvarlig_navn,
              (SELECT COUNT(*)::int FROM kommentarer k WHERE k.oppgave_id = o.id) AS kommentarer,
              (SELECT COUNT(*)::int FROM kommentarer k WHERE k.oppgave_id = o.id
                 AND k.bruker_id IS DISTINCT FROM $2
                 AND k.opprettet > COALESCE((SELECT l.tid FROM oppgave_lest l WHERE l.bruker_id = $2 AND l.oppgave_id = o.id), '-infinity')) AS uleste
         FROM oppgaver o LEFT JOIN brukere b ON b.id = o.ansvarlig_id
        WHERE o.prosjekt_id = $1 ORDER BY o.sortering, o.fra, o.id`,
      [id, user.id],
    ),
    q('SELECT * FROM milepaeler WHERE prosjekt_id = $1 ORDER BY dato, id', [id]),
    q('SELECT dato, utfort, notat FROM sjekkpunkter WHERE prosjekt_id = $1', [id]),
    q('SELECT * FROM oppdateringer WHERE prosjekt_id = $1 ORDER BY publisert DESC', [id]),
    q('SELECT * FROM beslutninger WHERE prosjekt_id = $1 ORDER BY besvart IS NOT NULL, frist NULLS LAST, id', [id]),
    personer(),
    q(
      `SELECT m.*, b.navn AS ansvarlig_navn, o.tittel AS oppgave_tittel
         FROM mangler m LEFT JOIN brukere b ON b.id = m.ansvarlig_id LEFT JOIN oppgaver o ON o.id = m.oppgave_id
        WHERE m.prosjekt_id = $1 ORDER BY m.godkjent IS NOT NULL, m.frist NULLS LAST, m.id`,
      [id],
    ),
  ]);
  return { prosjekt, oppgaver, milepaeler, sjekkpunkter: sjekk, oppdateringer, beslutninger, personer: folk, mangler };
});

route('PUT', '/prosjekter/:id', async ({ params, body, user }) => {
  const id = f.id(params.id);
  const v = readFields(body, SPEC, { partial: true });
  const [sql, p] = updateSql('prosjekter', SPEC, id, v, { touch: true });
  const rad = await one(sql, p);
  if (!rad) fail(404, 'Fant ikke prosjektet.');
  await logg(id, user, 'Endret prosjektet', { felt: Object.keys(v) });
  return rad;
});

route('DELETE', '/prosjekter/:id', async ({ params, body }) => {
  const id = f.id(params.id);
  const p = await one('SELECT navn FROM prosjekter WHERE id = $1', [id]);
  if (!p) fail(404, 'Fant ikke prosjektet.');
  if (String(body.bekreft || '').trim() !== p.navn) fail(400, 'Skriv prosjektnavnet for å bekrefte slettingen.');
  await q('DELETE FROM prosjekter WHERE id = $1', [id]);
  return { ok: true };
});

route('POST', '/prosjekter/:id/kundelenke', async ({ params, user }) => {
  const id = f.id(params.id);
  const rad = await one('UPDATE prosjekter SET kunde_token = $1 WHERE id = $2 RETURNING kunde_token', [nyNokkel(), id]);
  if (!rad) fail(404, 'Fant ikke prosjektet.');
  await logg(id, user, 'Laget ny kundelenke (den gamle virker ikke lenger)');
  return rad;
});

// Import fra Excel-planen. Nettleseren leser filen og sender radene hit.
route('POST', '/prosjekter/:id/import', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const oppgaver = Array.isArray(body.oppgaver) ? body.oppgaver.slice(0, 500) : [];
  const milepaeler = Array.isArray(body.milepaeler) ? body.milepaeler.slice(0, 60) : [];
  const folk = await q(`SELECT id, fag FROM brukere WHERE aktiv AND fag IS NOT NULL AND rolle <> 'leder'`);
  const forFag = (fag) => folk.find((b) => b.fag && fag && b.fag.toLowerCase() === String(fag).toLowerCase())?.id ?? null;
  const resultat = await transaction(async (tx) => {
    if (body.erstatt) {
      await tx.q('DELETE FROM oppgaver WHERE prosjekt_id = $1', [id]);
      await tx.q('DELETE FROM milepaeler WHERE prosjekt_id = $1', [id]);
    }
    let n = 0;
    for (const [i, o] of oppgaver.entries()) {
      const fra = f.date(o.fra);
      const til = f.date(o.til) || fra;
      const tittel = f.line(200)(o.tittel);
      if (!fra || !tittel) continue;
      const prioritet = PRIORITETER.includes(o.prioritet) ? o.prioritet : 'normal';
      const ferdig = f.bool(o.ferdig) ? new Date().toISOString() : null;
      await tx.q(
        `INSERT INTO oppgaver (prosjekt_id, nr, fag, tittel, beskrivelse, merknad, fra, til, prioritet, ansvarlig_id,
                               kunde_styrt, ferdig_meldt, godkjent, sortering)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13)`,
        [
          id,
          f.line(20)(o.nr),
          f.line(60)(o.fag),
          tittel,
          f.str(2000)(o.beskrivelse),
          f.str(500)(o.merknad),
          fra,
          til < fra ? fra : til,
          prioritet,
          forFag(o.fag),
          f.bool(o.kunde_styrt),
          ferdig,
          i,
        ],
      );
      n++;
    }
    let m = 0;
    for (const raa of milepaeler) {
      const v = readFields(raa, MILEPAEL);
      const [sql, p] = insertSql('milepaeler', MILEPAEL, v, { prosjekt_id: id });
      await tx.q(sql, p);
      m++;
    }
    return { oppgaver: n, milepaeler: m };
  });
  await logg(id, user, 'Importerte fremdriftsplan', resultat);
  return resultat;
});

// Forskyv mange oppgaver på én gang, f.eks. når et fag er forsinket og alt etter må flyttes.
// Teller arbeidsdager, så en oppgave aldri havner med start eller slutt i en helg.
// Godkjente oppgaver blir liggende – de er historikk.
route('POST', '/prosjekter/:id/forskyv', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const dager = Number(body.dager);
  if (!Number.isInteger(dager) || dager === 0 || Math.abs(dager) > 120) fail(400, 'Antall arbeidsdager må være et heltall mellom -120 og 120, og ikke 0.');
  const fraDato = required(f.date, 'Fra dato')(body.fra);
  const fag = f.line(60)(body.fag);
  const ider = Array.isArray(body.oppgaver) ? body.oppgaver.map((x) => f.id(x)).filter(Boolean) : null;
  const kandidater = await q(
    `SELECT id, fra, til FROM oppgaver
      WHERE prosjekt_id = $1 AND godkjent IS NULL AND fra >= $2
        AND ($3::text IS NULL OR lower(fag) = lower($3::text))
        AND ($4::int[] IS NULL OR id = ANY($4::int[]))`,
    [id, fraDato, fag, ider],
  );
  await transaction(async (tx) => {
    for (const o of kandidater) {
      await tx.q('UPDATE oppgaver SET fra = $1, til = $2, endret = now() WHERE id = $3', [flyttArbeidsdager(o.fra, dager), flyttArbeidsdager(o.til, dager), o.id]);
    }
  });
  await logg(id, user, `Forskjøv ${kandidater.length} oppgaver ${dager > 0 ? `${dager} arbeidsdager frem` : `${-dager} arbeidsdager tilbake`}`, {
    fag: fag || 'alle fag',
    fra: fraDato,
  });
  return { flyttet: kandidater.length };
});

// ---------- Milepæler ----------
route('POST', '/prosjekter/:id/milepaeler', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const v = readFields(body, MILEPAEL);
  const [sql, p] = insertSql('milepaeler', MILEPAEL, v, { prosjekt_id: id });
  const rad = await one(sql, p);
  await logg(id, user, `La til milepæl «${rad.navn}»`);
  return rad;
});
route('PUT', '/milepaeler/:id', async ({ params, body, user }) => {
  const v = readFields(body, MILEPAEL, { partial: true });
  const [sql, p] = updateSql('milepaeler', MILEPAEL, f.id(params.id), v);
  const rad = await one(sql, p);
  if (!rad) fail(404, 'Fant ikke milepælen.');
  if ('naadd' in v) await logg(rad.prosjekt_id, user, `${v.naadd ? 'Nådd' : 'Ikke nådd'}: milepæl «${rad.navn}»`);
  return rad;
});
route('DELETE', '/milepaeler/:id', async ({ params }) => {
  await q('DELETE FROM milepaeler WHERE id = $1', [f.id(params.id)]);
  return { ok: true };
});

// ---------- Sjekkpunkter (mandag og fredag) ----------
route('PUT', '/prosjekter/:id/sjekkpunkter/:dato', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const dato = required(f.date, 'Dato')(params.dato);
  const rad = await one(
    `INSERT INTO sjekkpunkter (prosjekt_id, dato, utfort, notat) VALUES ($1, $2, $3, $4)
     ON CONFLICT (prosjekt_id, dato) DO UPDATE SET utfort = EXCLUDED.utfort, notat = EXCLUDED.notat, endret = now()
     RETURNING dato, utfort, notat`,
    [id, dato, f.bool(body.utfort), f.str(2000)(body.notat)],
  );
  if (body.utfort !== undefined) await logg(id, user, `${rad.utfort ? 'Utførte' : 'Åpnet igjen'} sjekkpunkt ${dato}`);
  return rad;
});

// ---------- Oppdateringer til kunden ----------
route('POST', '/prosjekter/:id/oppdateringer', async ({ req, params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const v = readFields(body, OPPDATERING);
  const [sql, p] = insertSql('oppdateringer', OPPDATERING, v, { prosjekt_id: id, forfatter_id: user.id });
  const rad = await one(sql, p);
  await logg(id, user, `Publiserte oppdatering «${rad.tittel}»`);
  if (f.bool(body.varsle_kunde)) {
    const p = await one('SELECT * FROM prosjekter WHERE id = $1', [id]);
    rad.kunde_varslet = await varsleKunde(req, p, {
      emne: `${p.navn}: ${rad.tittel}`,
      tekst: `${rad.tittel}\n\n${rad.tekst || ''}${rad.bilder?.length ? '\n\nDet ligger bilder på prosjektsiden.' : ''}`,
    });
  }
  return rad;
});
route('PUT', '/oppdateringer/:id', async ({ params, body }) => {
  const v = readFields(body, OPPDATERING, { partial: true });
  const [sql, p] = updateSql('oppdateringer', OPPDATERING, f.id(params.id), v);
  const rad = await one(sql, p);
  if (!rad) fail(404, 'Fant ikke oppdateringen.');
  return rad;
});
route('DELETE', '/oppdateringer/:id', async ({ params }) => {
  await q('DELETE FROM oppdateringer WHERE id = $1', [f.id(params.id)]);
  return { ok: true };
});

// ---------- Beslutninger kunden skal ta ----------
route('POST', '/prosjekter/:id/beslutninger', async ({ req, params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const v = readFields(body, BESLUTNING);
  const [sql, p] = insertSql('beslutninger', BESLUTNING, v, { prosjekt_id: id });
  const rad = await one(sql, p);
  await logg(id, user, `Ba kunden ta stilling til «${rad.sporsmal}»`);
  if (f.bool(body.varsle_kunde)) {
    const p = await one('SELECT * FROM prosjekter WHERE id = $1', [id]);
    rad.kunde_varslet = await varsleKunde(req, p, {
      emne: `Vi trenger svar fra deg: ${rad.sporsmal}`,
      tekst: `Hei!\n\nVi trenger svar på «${rad.sporsmal}»${rad.frist ? ` innen ${rad.frist.split('-').reverse().join('.')}` : ''}.${rad.beskrivelse ? `\n\n${rad.beskrivelse}` : ''}\n\nDu svarer direkte på prosjektsiden.`,
    });
  }
  return rad;
});
route('PUT', '/beslutninger/:id', async ({ params, body }) => {
  const v = readFields(body, BESLUTNING, { partial: true });
  const [sql, p] = updateSql('beslutninger', BESLUTNING, f.id(params.id), v);
  const rad = await one(sql, p);
  if (!rad) fail(404, 'Fant ikke beslutningen.');
  if (body.nullstill) await q('UPDATE beslutninger SET svar = NULL, svar_kommentar = NULL, besvart = NULL WHERE id = $1', [rad.id]);
  return rad;
});
route('DELETE', '/beslutninger/:id', async ({ params }) => {
  await q('DELETE FROM beslutninger WHERE id = $1', [f.id(params.id)]);
  return { ok: true };
});

route('GET', '/prosjekter/:id/logg', async ({ params }) =>
  q('SELECT hvem, handling, detaljer, tidspunkt FROM logg WHERE prosjekt_id = $1 ORDER BY tidspunkt DESC LIMIT 200', [f.id(params.id)]),
);
