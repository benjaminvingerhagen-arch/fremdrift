# Fremdrift – instruksjoner for Claude

Prosjektstyring for byggeprosjekter: Gantt-plan, oppgaver til egne ansatte og
leverandører, sjekkpunkter mandag og fredag, og en egen side kunden følger med på.
Se README.md for hvem som ser hva.

Denne filen leses av Claude, også av den ukentlige forbedringsagenten. Den
prioriterte idélisten ligger i `docs/veikart.md`.

## Kjøre og teste

```bash
npm install
rm -rf .dev-db && npm run dev   # http://localhost:3000, registreringskode «lokal»
npm test                        # i et annet vindu, mot dev-serveren på tom database
```

- Testene må være grønne før en endring foreslås. Start alltid på tom database (`rm -rf .dev-db`).
- `DATO=2026-11-04 npm run dev` lar serveren late som det er en annen dag. Nettleseren følger
  ikke med: der må `globalThis.__FREMDRIFT_DATO = '2026-11-04'` settes før appen lastes
  (f.eks. med Playwrights `addInitScript`), ellers regner siden status ut fra dagens dato.
- Det er ingen byggesteg: nettleseren laster `js/` og `shared/` direkte som ES-moduler.

## Slik er koden bygget

- `api/index.js` er én serverless-funksjon for hele API-et. Ruter registreres med
  `route(metode, sti, handler, opts)` i `api/_lib/routes/`.
- Tilgang per rute: `{ public: true }` = alle, `{ alle: true }` = alle innloggede,
  ingenting = bare prosjektleder. Kundesiden bruker egne ruter i
  `api/_lib/routes/kunde.js` med kundelenken som nøkkel. Nye ruter skal ha minst mulig tilgang.
- Endringer (ikke GET) krever headeren `X-FD: 1` og samme opprinnelse (CSRF-vern).
- Felter fra klienten leses med `readFields(body, SPEC)` og konverterne i `f` (`api/_lib/http.js`).
- Databaseskjemaet ligger i `api/_lib/schema.js`. Ved endring: øk `VERSJON` og legg
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / nye `CREATE TABLE IF NOT EXISTS` nederst i
  `SCHEMA` (aldri endre eksisterende `CREATE TABLE`, da får ikke gamle databaser kolonnen).
- Varsler i appen lages via `logg` med `type` (se `api/_lib/routes/varsler.js`). E-post går
  gjennom `api/_lib/epost.js` (Resend) og er valgfritt: alt skal virke uten `RESEND`.
- `shared/plan.js` har reglene for status, sjekkpunkter og fremdrift. Brukes av både server og nettleser.
- HTML lages med `html`-malen i `js/ui.js`, som escaper verdier. Ikke bruk `innerHTML` med rå tekst.
- Utseende ligger i `stil.css`, med fargene som tokens øverst. Gjenbruk klassene som finnes
  (`kort`, `knapp`, `chip`, `modal` osv.) før du lager nye.
- Content-Security-Policy i `vercel.json` tillater bare egne filer: ingen CDN-er,
  ingen inline-skript, ingen eksterne fonter eller bilder.

## Regler som ikke skal brytes

- Kunden skal aldri se interne felt: «forsinket», merknader, ansvarlig, nøkler eller logg.
- En leverandør ser bare egne oppgaver (ansvarlig, eller eget fag når ingen er ansvarlig).
- En oppgave er ferdig først når prosjektlederen har godkjent den.
- Hemmelige nøkler lagres som SHA-256-hash når det går: personlige lenker (`lenke_hash`) og
  økter (`token_hash`). Kundelenken (`kunde_token`) og app-nøkkelen (`app_nokkel`) ligger i
  klartekst fordi prosjektlederen skal kunne kopiere kundelenken igjen og appen trenger
  startadressen. Nye nøkler skal hashes med mindre de må vises på nytt.
- Hver ny rute eller tilgangsregel får tester i `scripts/test.mjs`, inkludert at uvedkommende avvises.
- Alt brukeren ser er på norsk bokmål. Variabel- og funksjonsnavn følger samme stil (norske navn).
- Repoet er offentlig: aldri legg inn nøkler, personopplysninger, kundenavn eller interne detaljer.
- Ingen nye avhengigheter som krever betalte tjenester eller nye API-nøkler uten at Benjamin har sagt ja.

## Arbeidsflyt for forbedringer

1. Velg fra toppen av `docs/veikart.md`, eller rett en feil du finner underveis.
2. Lag en gren `claude/forbedring-ÅÅÅÅ-MM-DD`, små og avgrensede endringer.
3. Kjør testene, og sjekk siden i nettleseren (også mobilbredde) når du endrer utseende.
4. Oppdater `docs/veikart.md`: flytt det som er gjort til «Gjort», og legg til nye ideer du fant.
5. Åpne en pull request mot `main` med forklaring på enkelt norsk: hva, hvorfor, og hva som
   bør sjekkes i Vercel-forhåndsvisningen. Ikke slå sammen selv; Benjamin godkjenner.
