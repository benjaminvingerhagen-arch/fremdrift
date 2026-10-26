# Veikart

Prioritert liste over forbedringer. Den ukentlige agenten tar fra toppen av «Neste»,
med mindre en feil haster mer. Benjamin kan flytte, stryke eller legge til punkter
når som helst – rekkefølgen her er det som gjelder.

Ideene er hentet fra hvordan lignende verktøy løser det samme (Fieldwire, Buildertrend,
Bygglet m.fl.), tilpasset små byggefirma og håndverkere.

## Neste

1. **Kalenderabonnement for ansatte og leverandører** – en hemmelig kalenderlenke
   (.ics) fra «mine», så egne oppgaver og viktige datoer havner i kalenderen på
   telefonen og oppdateres av seg selv. Lenken lagres som hash, slutter å virke når
   personen får ny lenke eller deaktiveres. Delt kalender er standard hos Fieldwire m.fl.
2. **Mangelliste ved overtakelse** – egne punkter knyttet til et rom eller en oppgave,
   med bilde, ansvarlig fag og frist. Leverandøren ser sine punkter på «mine», kunden ser
   status. Typisk sluttfase-verktøy hos Fieldwire og Buildertrend.
3. **Dagbok på prosjektet** – kort notat per dag med bemanning, vær, avvik og bilder.
   Gir dokumentasjon ved uenighet om fremdrift. Kan velges om skal vises for kunden.
4. **Utkast til ukesoppdatering for kunden** – fredag lages et forslag til oppdatering ut
   fra ukens godkjente oppgaver og bilder, som prosjektlederen retter og publiserer.
5. **Avhengigheter mellom oppgaver** – «starter når X er ferdig», og tilbud om å flytte
   bare de etterfølgende oppgavene når én oppgave flyttes (i dag kan planen forskyves for
   ett fag eller alle fag fra en valgt dato).
6. **Tilleggsarbeid som kunden godkjenner** – beskrivelse og pris, kunden godkjenner på
   kundesiden. Bygger på beslutningene som finnes i dag.
7. **Utskrift/PDF av fremdriftsplanen** – det finnes en enkel `@media print` i `stil.css`
   (skjuler meny og knapper), men Gantt-planen deles ikke pent over sider og kundesiden har
   ingen egen utskriftsstil. Liggende A3/A4 med fag og uker på hver side.
8. **Leverandørsiden uten nett** – vis sist hentede oppgaver når dekningen er dårlig
   på byggeplassen, og send ferdigmeldinger når nettet er tilbake.

## Krever avklaring med Benjamin

- **SMS-varsler** i tillegg til e-post. Krever en SMS-tjeneste med egen nøkkel og kostnad.
- **Slå på e-post**: koden er klar, men `RESEND` og `MAIL_FROM` er ikke satt i Vercel. Krever
  Resend-konto og et godkjent avsenderdomene.
- **Eget domene**: siden kjører på Vercel-adressen. Med eget domene må `APP_URL` settes, og
  personlige lenker og app-ikoner på hjemskjermen bør lages på nytt.

## Teknisk gjeld

- `npm audit` melder 4 høye sårbarheter i `zod` (< 4.6.6) via `@vercel/blob` →
  `@vercel/oidc` → `@vercel/cli-config`. `npm audit fix --force` vil nedgradere
  `@vercel/blob` til 2.4.0 og bryter bakoverkompatibilitet, så ikke gjør det. Zod brukes bare
  i Vercels egne verktøy, ikke på våre inndata. Følg med på ny versjon av `@vercel/blob`.
- Migreringen bruker `pg_advisory_xact_lock` så samtidige kaldstarter ikke låser hverandre
  (deadlock i produksjon 2026-10). Låsen er ikke testet under ekte samtidighet.

## Gjort

- 2026-10: Første versjon: prosjekter, Gantt-plan, sjekkpunkter, oppgaver til fag og
  leverandører, godkjenning, kundeside og Excel-import av fremdriftsplanen.
- 2026-10: Kundelenken (`/k/<nøkkel>`) ga 404 på Vercel – rettet omskrivingen i `vercel.json`.
- 2026-10: Ikoner og datoer rettet inn med teksten over hele siden.
- 2026-10: Varsler for prosjektleder med teller i menyen, merke for uleste meldinger,
  valgfrie e-postvarsler (Resend), forskyv planen for ett fag eller alle fra en dato, del
  leverandørbilder til kundesiden, installerbar app for alle (leverandører får egen
  startadresse rett til oppgavene), mobiltilpasninger med bunnmeny.
- 2026-10: Lås rundt databasemigreringen etter deadlock ved samtidige kaldstarter.
