import { route } from '../router.js';
import { q, one } from '../db.js';
import { fail } from '../http.js';
import { clientIp, nyNokkel, sha256 } from '../auth.js';
import { nettsted } from '../epost.js';
import { lagKalender } from '../ics.js';
import { iDag, leggTilDager, PRIORITET_TEKST } from '../../../shared/plan.js';
import { MINE } from './oppgaver.js';
import { firmanavn } from './grunn.js';

// Kalenderabonnement for ansatte og leverandører: en hemmelig adresse som kalenderen
// på telefonen henter fra av seg selv. Kalenderapper kan ikke logge inn, så nøkkelen
// står i adressen. Den lagres bare som hash, gir bare lesetilgang til egne oppgaver,
// og slutter å virke når personen får ny lenke, blir deaktivert eller slår den av.

const FORSOK_VINDU_MIN = 15;
const MAKS_FEIL_PER_IP = 20;

const adresse = (req, nokkel) => `${nettsted(req)}/api/kalender/${nokkel}.ics`;

function kunForFag(user) {
  if (user.rolle === 'leder') fail(400, 'Kalenderen er for ansatte og leverandører. Prosjektlederen ser alt i planen.');
}

route(
  'GET',
  '/mine/kalender',
  async ({ user }) => {
    kunForFag(user);
    const rad = await one('SELECT kalender_hash IS NOT NULL AS aktiv FROM brukere WHERE id = $1', [user.id]);
    return { aktiv: Boolean(rad?.aktiv) };
  },
  { alle: true },
);

// Lager ny adresse. En eventuell gammel adresse slutter å virke.
route(
  'POST',
  '/mine/kalender',
  async ({ req, user }) => {
    kunForFag(user);
    const nokkel = nyNokkel();
    await q('UPDATE brukere SET kalender_hash = $1 WHERE id = $2', [sha256(nokkel), user.id]);
    return { aktiv: true, adresse: adresse(req, nokkel) };
  },
  { alle: true },
);

route(
  'DELETE',
  '/mine/kalender',
  async ({ user }) => {
    kunForFag(user);
    await q('UPDATE brukere SET kalender_hash = NULL WHERE id = $1', [user.id]);
    return { aktiv: false };
  },
  { alle: true },
);

async function brukerForNokkel(req, nokkel) {
  const ip = clientIp(req);
  const feil = await one(
    `SELECT COUNT(*)::int AS n FROM innloggingsforsok
      WHERE NOT vellykket AND ip = $1 AND epost = 'kalender' AND tidspunkt > now() - interval '${FORSOK_VINDU_MIN} minutes'`,
    [ip],
  );
  if (feil.n >= MAKS_FEIL_PER_IP) fail(429, 'For mange forsøk. Prøv igjen senere.');
  const s = String(nokkel || '').replace(/\.ics$/i, '');
  const user =
    s.length >= 20 && s.length <= 100
      ? await one(`SELECT id, navn, fag FROM brukere WHERE kalender_hash = $1 AND aktiv AND rolle <> 'leder'`, [sha256(s)])
      : null;
  if (!user) {
    await q(`INSERT INTO innloggingsforsok (epost, ip, vellykket) VALUES ('kalender', $1, false)`, [ip]);
    fail(404, 'Kalenderen finnes ikke. Lag en ny kalenderlenke på siden med oppgavene dine.');
  }
  return user;
}

function oppgaveHendelse(o, app) {
  const linjer = [
    o.godkjent ? 'Ferdig – godkjent av prosjektleder' : o.ferdig_meldt ? 'Meldt ferdig – venter på godkjenning' : null,
    `Prosjekt: ${o.prosjekt}`,
    o.adresse && `Adresse: ${o.adresse}`,
    [o.nr, o.fag].filter(Boolean).join(' · ') || null,
    ['kritisk', 'hoy'].includes(o.prioritet) && `Prioritet: ${PRIORITET_TEKST[o.prioritet]}`,
    o.merknad && `Merknad: ${o.merknad}`,
    o.beskrivelse && `\n${o.beskrivelse}`,
    `\nMeld ferdig og send bilder: ${app}`,
  ];
  return {
    uid: `oppgave-${o.id}@fremdrift`,
    fra: o.fra,
    til: o.til,
    tittel: `${o.godkjent ? '✔ ' : ''}${o.tittel} – ${o.prosjekt}`,
    beskrivelse: linjer.filter(Boolean).join('\n'),
    sted: o.adresse || o.prosjekt,
    endret: o.endret,
  };
}

route(
  'GET',
  '/kalender/:nokkel',
  async ({ req, res, params }) => {
    const user = await brukerForNokkel(req, params.nokkel);
    // Ferdige oppgaver langt tilbake i tid er bare støy i kalenderen.
    const fraDato = leggTilDager(iDag(), -60);
    const oppgaver = await q(
      `SELECT o.id, o.nr, o.fag, o.tittel, o.beskrivelse, o.merknad, o.fra, o.til, o.prioritet,
              o.ferdig_meldt, o.godkjent, o.endret, o.prosjekt_id, p.navn AS prosjekt, p.adresse
         FROM oppgaver o JOIN prosjekter p ON p.id = o.prosjekt_id
        WHERE NOT p.arkivert AND ${MINE} AND (o.til >= $3 OR o.godkjent IS NULL)
        ORDER BY o.fra, o.id`,
      [user.id, user.fag, fraDato],
    );
    const prosjektIder = [...new Set(oppgaver.map((o) => o.prosjekt_id))];
    const milepaeler = prosjektIder.length
      ? await q(
          `SELECT m.id, m.dato, m.navn, m.type, p.navn AS prosjekt, p.adresse
             FROM milepaeler m JOIN prosjekter p ON p.id = m.prosjekt_id
            WHERE m.prosjekt_id = ANY($1::int[]) AND m.type IN ('fast', 'innflytting', 'sluttfrist') AND m.dato >= $2
            ORDER BY m.dato`,
          [prosjektIder, fraDato],
        )
      : [];
    const app = `${nettsted(req)}/#/mine`;
    const firma = await firmanavn();
    const ics = lagKalender({
      navn: firma ? `Oppgaver hos ${firma}` : 'Mine oppgaver – Fremdrift',
      hendelser: [
        ...oppgaver.map((o) => oppgaveHendelse(o, app)),
        ...milepaeler.map((m) => ({
          uid: `milepael-${m.id}@fremdrift`,
          fra: m.dato,
          til: m.dato,
          tittel: `⚑ ${m.navn} – ${m.prosjekt}`,
          beskrivelse: `Viktig dato i prosjektet ${m.prosjekt}.`,
          sted: m.adresse || m.prosjekt,
        })),
      ],
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="fremdrift.ics"');
    res.end(ics);
  },
  { public: true },
);
