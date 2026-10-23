# Fremdrift

Prosjektstyring for byggeprosjekter: fremdriftsplan med Gantt, oppgaver som fordeles
til egne ansatte og leverandører, sjekkpunkter hver mandag og fredag, og en egen
prosjektside kunden kan følge med på.

## Hvem ser hva

| Hvem | Kommer inn med | Ser og gjør |
| --- | --- | --- |
| Prosjektleder | E-post og passord | Alt: prosjekter, plan, godkjenning, personer, kundesiden |
| Ansatt / leverandør | Personlig lenke (`/api/inn/<nøkkel>`) | Egne oppgaver i alle prosjekter. Melder ferdig, skriver meldinger og sender bilder |
| Kunden | Prosjektets kundelenke (`/k/<nøkkel>`) | Fremdrift, milepæler, ukens arbeid, oppdateringer med bilder. Svarer på beslutninger og oppdaterer leveranser kunden styrer selv |

Oppgaver fordeles etter **fag**: en leverandør med faget «Elektro» får alle
elektro-oppgaver i alle prosjekter, med mindre en annen er satt som ansvarlig.

En oppgave er ferdig først når prosjektlederen har **godkjent** den. Leverandøren
melder ferdig; prosjektlederen godkjenner eller sender tilbake med beskjed om hva
som mangler. Prosenten på forsiden og kundesiden teller bare godkjente oppgaver.

Kunden ser oppgaver som «Ferdig», «Pågår» eller «Kommer» – aldri «forsinket»,
interne merknader eller hvem som er ansvarlig.

## Excel-import

«Nytt prosjekt» og «Importer Excel» i planen leser fremdriftsplanen i Excel:
arket **Fremdriftsplan** (ID, Fag, Oppgave, Fra, Til, Prio, Ferdig, merknad – og
kommentarene på oppgavenavnet som beskrivelse) og arket **Oversikt** (milepæler,
innflytting og sluttfrist).

## Oppsett på Vercel

1. Importer repoet som nytt prosjekt i Vercel.
2. **Storage → Create → Postgres** (Neon) og koble den til prosjektet. Det gir `DATABASE_URL`.
3. **Storage → Create → Blob** og koble den til prosjektet (for bilder).
4. **Settings → Environment Variables**: legg inn `REGISTRERINGSKODE` med en hemmelig kode.
5. Deploy, åpne siden og registrer deg med koden. Du blir prosjektleder.
   Registreringen stenges automatisk etter første prosjektleder.

Tabellene opprettes av seg selv første gang.

## Lokalt

```bash
npm install
npm run dev          # http://localhost:3000 – innebygd database i .dev-db, registreringskode «lokal»
npm test             # tilgangstester mot dev-serveren (start på tom database: rm -rf .dev-db)
```

`DATO=2026-11-04 npm run dev` lar serveren late som det er en annen dag (bare lokalt).

## Oppbygging

- `api/index.js` – én serverless-funksjon for hele API-et, med tilgangskontroll per rute
- `api/_lib/routes/` – prosjekter, oppgaver, personer, kundesiden og bilder
- `shared/plan.js` – regler for status, sjekkpunkter og fremdrift, brukt av både server og nettleser
- `js/` – appen for prosjektleder (`app.js`, `views/`), leverandørsiden (`views/mine.js`) og kundesiden (`kunde.js`)
- `stil.css` – alt av utseende, med fargene som tokens øverst
