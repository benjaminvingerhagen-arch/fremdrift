import { one, transaction } from './db.js';

// Én installasjon = ett firma (prosjektlederens). Prosjektene, personene og
// kundesidene hører alle til det firmaet.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS innstillinger (
  nokkel TEXT PRIMARY KEY,
  verdi JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS brukere (
  id SERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  epost TEXT UNIQUE,
  telefon TEXT,
  firma TEXT,
  fag TEXT,
  rolle TEXT NOT NULL DEFAULT 'leverandor',
  passord_hash TEXT,
  lenke_hash TEXT UNIQUE,
  aktiv BOOLEAN NOT NULL DEFAULT true,
  sist_innom TIMESTAMPTZ,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS okter (
  token_hash TEXT PRIMARY KEY,
  bruker_id INT NOT NULL REFERENCES brukere(id) ON DELETE CASCADE,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now(),
  utloper TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS innloggingsforsok (
  id SERIAL PRIMARY KEY,
  epost TEXT,
  ip TEXT,
  vellykket BOOLEAN NOT NULL,
  tidspunkt TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vedlegg (
  id SERIAL PRIMARY KEY,
  prosjekt_id INT,
  nokkel TEXT NOT NULL,
  type TEXT NOT NULL,
  navn TEXT,
  storrelse INT,
  opplastet_av INT REFERENCES brukere(id) ON DELETE SET NULL,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prosjekter (
  id SERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  adresse TEXT,
  beskrivelse TEXT,
  kunde_navn TEXT,
  kunde_epost TEXT,
  kunde_telefon TEXT,
  start DATE,
  innflytting DATE,
  sluttfrist DATE,
  kunde_token TEXT UNIQUE,
  kunde_aktiv BOOLEAN NOT NULL DEFAULT true,
  forsidebilde_id INT REFERENCES vedlegg(id) ON DELETE SET NULL,
  arkivert BOOLEAN NOT NULL DEFAULT false,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now(),
  endret TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oppgaver (
  id SERIAL PRIMARY KEY,
  prosjekt_id INT NOT NULL REFERENCES prosjekter(id) ON DELETE CASCADE,
  nr TEXT,
  fag TEXT,
  tittel TEXT NOT NULL,
  beskrivelse TEXT,
  merknad TEXT,
  fra DATE NOT NULL,
  til DATE NOT NULL,
  prioritet TEXT NOT NULL DEFAULT 'normal',
  ansvarlig_id INT REFERENCES brukere(id) ON DELETE SET NULL,
  kunde_styrt BOOLEAN NOT NULL DEFAULT false,
  synlig_for_kunde BOOLEAN NOT NULL DEFAULT true,
  ferdig_meldt TIMESTAMPTZ,
  meldt_av TEXT,
  godkjent TIMESTAMPTZ,
  sortering INT NOT NULL DEFAULT 0,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now(),
  endret TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (til >= fra)
);
CREATE INDEX IF NOT EXISTS oppgaver_prosjekt_idx ON oppgaver (prosjekt_id);
CREATE INDEX IF NOT EXISTS oppgaver_ansvarlig_idx ON oppgaver (ansvarlig_id);

CREATE TABLE IF NOT EXISTS kommentarer (
  id SERIAL PRIMARY KEY,
  oppgave_id INT NOT NULL REFERENCES oppgaver(id) ON DELETE CASCADE,
  bruker_id INT REFERENCES brukere(id) ON DELETE SET NULL,
  fra_kunde BOOLEAN NOT NULL DEFAULT false,
  tekst TEXT,
  vedlegg_id INT REFERENCES vedlegg(id) ON DELETE SET NULL,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kommentarer_oppgave_idx ON kommentarer (oppgave_id);

CREATE TABLE IF NOT EXISTS milepaeler (
  id SERIAL PRIMARY KEY,
  prosjekt_id INT NOT NULL REFERENCES prosjekter(id) ON DELETE CASCADE,
  dato DATE NOT NULL,
  navn TEXT NOT NULL,
  kort TEXT,
  type TEXT NOT NULL DEFAULT 'delmal',
  naadd BOOLEAN NOT NULL DEFAULT false,
  synlig_for_kunde BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS milepaeler_prosjekt_idx ON milepaeler (prosjekt_id);

CREATE TABLE IF NOT EXISTS sjekkpunkter (
  prosjekt_id INT NOT NULL REFERENCES prosjekter(id) ON DELETE CASCADE,
  dato DATE NOT NULL,
  utfort BOOLEAN NOT NULL DEFAULT false,
  notat TEXT,
  endret TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (prosjekt_id, dato)
);

CREATE TABLE IF NOT EXISTS oppdateringer (
  id SERIAL PRIMARY KEY,
  prosjekt_id INT NOT NULL REFERENCES prosjekter(id) ON DELETE CASCADE,
  tittel TEXT NOT NULL,
  tekst TEXT,
  bilder JSONB NOT NULL DEFAULT '[]',
  publisert TIMESTAMPTZ NOT NULL DEFAULT now(),
  forfatter_id INT REFERENCES brukere(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS oppdateringer_prosjekt_idx ON oppdateringer (prosjekt_id);

CREATE TABLE IF NOT EXISTS beslutninger (
  id SERIAL PRIMARY KEY,
  prosjekt_id INT NOT NULL REFERENCES prosjekter(id) ON DELETE CASCADE,
  sporsmal TEXT NOT NULL,
  beskrivelse TEXT,
  alternativer JSONB NOT NULL DEFAULT '[]',
  frist DATE,
  svar TEXT,
  svar_kommentar TEXT,
  besvart TIMESTAMPTZ,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beslutninger_prosjekt_idx ON beslutninger (prosjekt_id);

CREATE TABLE IF NOT EXISTS logg (
  id SERIAL PRIMARY KEY,
  prosjekt_id INT REFERENCES prosjekter(id) ON DELETE CASCADE,
  bruker_id INT REFERENCES brukere(id) ON DELETE SET NULL,
  hvem TEXT,
  handling TEXT NOT NULL,
  detaljer JSONB,
  tidspunkt TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS logg_prosjekt_idx ON logg (prosjekt_id, tidspunkt DESC);

-- Versjon 2: varsler, uleste meldinger og e-postvarsler.
ALTER TABLE brukere ADD COLUMN IF NOT EXISTS varsler_sett TIMESTAMPTZ;
ALTER TABLE brukere ADD COLUMN IF NOT EXISTS epostvarsel BOOLEAN NOT NULL DEFAULT true;
-- Startadressen til appen på hjemskjermen (iPhone deler ikke innlogging med Safari).
ALTER TABLE brukere ADD COLUMN IF NOT EXISTS app_nokkel TEXT UNIQUE;
ALTER TABLE logg ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE logg ADD COLUMN IF NOT EXISTS oppgave_id INT REFERENCES oppgaver(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS logg_type_idx ON logg (type, tidspunkt DESC);
CREATE TABLE IF NOT EXISTS oppgave_lest (
  bruker_id INT NOT NULL REFERENCES brukere(id) ON DELETE CASCADE,
  oppgave_id INT NOT NULL REFERENCES oppgaver(id) ON DELETE CASCADE,
  tid TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bruker_id, oppgave_id)
);

-- Versjon 4: kalenderabonnement. Bare hash av nøkkelen lagres.
ALTER TABLE brukere ADD COLUMN IF NOT EXISTS kalender_hash TEXT UNIQUE;

-- Versjon 5: mangelliste. En mangel følger samme gang som en oppgave: registrert av
-- prosjektleder, meldt utbedret av faget, godkjent eller sendt tilbake av prosjektleder.
CREATE TABLE IF NOT EXISTS mangler (
  id SERIAL PRIMARY KEY,
  prosjekt_id INT NOT NULL REFERENCES prosjekter(id) ON DELETE CASCADE,
  oppgave_id INT REFERENCES oppgaver(id) ON DELETE SET NULL,
  tittel TEXT NOT NULL,
  beskrivelse TEXT,
  rom TEXT,
  fag TEXT,
  ansvarlig_id INT REFERENCES brukere(id) ON DELETE SET NULL,
  frist DATE,
  bilde_id INT REFERENCES vedlegg(id) ON DELETE SET NULL,
  synlig_for_kunde BOOLEAN NOT NULL DEFAULT true,
  utbedret TIMESTAMPTZ,
  utbedret_av TEXT,
  utbedret_kommentar TEXT,
  utbedret_bilde_id INT REFERENCES vedlegg(id) ON DELETE SET NULL,
  avvist_grunn TEXT,
  godkjent TIMESTAMPTZ,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT now(),
  endret TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mangler_prosjekt_idx ON mangler (prosjekt_id);
`;

const VERSJON = 5;
let klar = null;

export function ensureSchema() {
  if (!klar) {
    klar = (async () => {
      const har = await one(`SELECT to_regclass('innstillinger') AS t`).catch(() => null);
      if (har?.t) {
        const v = await one(`SELECT verdi FROM innstillinger WHERE nokkel = 'skjemaversjon'`);
        if (Number(v?.verdi) >= VERSJON) return;
      }
      // Når en ny versjon starter, kommer gjerne flere forespørsler samtidig, hver i sin
      // serverinstans. Uten lås prøver alle å endre tabellene på én gang og låser hverandre
      // (deadlock). Låsen slipper én gjennom; de andre venter og ser at jobben er gjort.
      await transaction(async (tx) => {
        await tx.q('SELECT pg_advisory_xact_lock(482917)');
        const tabell = await tx.q(`SELECT to_regclass('innstillinger') AS t`);
        if (tabell[0]?.t) {
          const v = await tx.q(`SELECT verdi FROM innstillinger WHERE nokkel = 'skjemaversjon'`);
          if (Number(v[0]?.verdi) >= VERSJON) return;
        }
        await tx.exec(SCHEMA);
        await tx.q(
          `INSERT INTO innstillinger (nokkel, verdi) VALUES ('skjemaversjon', $1::jsonb)
           ON CONFLICT (nokkel) DO UPDATE SET verdi = EXCLUDED.verdi`,
          [JSON.stringify(VERSJON)],
        );
      });
    })().catch((err) => {
      klar = null;
      throw err;
    });
  }
  return klar;
}
