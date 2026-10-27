# Veikart

Prioritert liste over forbedringer. Den ukentlige agenten tar fra toppen av «Neste»,
med mindre en feil haster mer. Benjamin kan flytte, stryke eller legge til punkter
når som helst – rekkefølgen her er det som gjelder.

Ideene er hentet fra hvordan lignende verktøy løser det samme (Fieldwire, Buildertrend,
Bygglet m.fl.), tilpasset små byggefirma og håndverkere.

## Neste

1. **Utkast til ukesoppdatering for kunden** – fredag lages et forslag til oppdatering ut
   fra ukens godkjente oppgaver og bilder, som prosjektlederen retter og publiserer.
2. **Avhengigheter mellom oppgaver** – «starter når X er ferdig», og tilbud om å flytte
   bare de etterfølgende oppgavene når én oppgave flyttes (i dag kan planen forskyves for
   ett fag eller alle fag fra en valgt dato).
3. **Tilleggsarbeid som kunden godkjenner** – beskrivelse og pris, kunden godkjenner på
   kundesiden. Bygger på beslutningene som finnes i dag.
4. **Utskrift/PDF av fremdriftsplanen** – det finnes en enkel `@media print` i `stil.css`
   (skjuler meny og knapper), men Gantt-planen deles ikke pent over sider og kundesiden har
   ingen egen utskriftsstil. Liggende A3/A4 med fag og uker på hver side.
5. **Leverandørsiden uten nett** – vis sist hentede oppgaver når dekningen er dårlig
   på byggeplassen, og send ferdigmeldinger når nettet er tilbake.
6. **Kalender for prosjektlederen** – samme abonnement med milepæler, sjekkpunkter
   (mandag/fredag) og frister i alle prosjekter, og vis på kalenderkortet om kalenderen er på.
7. **Mangelliste ved overtakelse, del 2** – utskrift/PDF av mangellisten til
   overtakelsesprotokollen, og at kunden kan melde inn mangler selv fra kundesiden
   (som prosjektlederen godkjenner før de går til faget).
8. **Dagbok, del 2** – hent været automatisk fra MET (api.met.no, gratis, ingen nøkkel) ut
   fra prosjektadressen, og utskrift/PDF av dagboken for en periode (dokumentasjon ved tvist).

## Krever avklaring med Benjamin

- **SMS-varsler** i tillegg til e-post. Krever en SMS-tjeneste med egen nøkkel og kostnad.
- **Slå på e-post**: koden er klar, men `RESEND` og `MAIL_FROM` er ikke satt i Vercel. Krever
  Resend-konto og et godkjent avsenderdomene.
- **Nytt navn og domene**: navnet står i `shared/merke.js` og noen HTML-filer (se «Bytte navn» i
  README). Når det er bestemt: gjør forsiden søkbar (canonical, robots.txt, sitemap).
- **Priser**: forsiden har forslag (490 kr for én prosjektleder, 390 kr per prosjektleder for
  2–5, ellers etter avtale). Benjamin bestemmer tallene.
- **E-post for henvendelser**: «Be om demo» og «Meld feil» lagres og vises under Innstillinger,
  men sendes på e-post først når `KONTAKT_EPOST` / `FEILMELDING_EPOST` og Resend er satt.
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
- 2026-10: Kalenderabonnement for ansatte og leverandører: personlig .ics-adresse fra
  «mine» med egne oppgaver og viktige datoer, knapper for iPhone, Google og Outlook.
- 2026-10: Mangelliste: prosjektlederen registrerer mangler med rom, fag, frist og bilde,
  faget melder utbedret (med kommentar og bilde) fra oppgavesiden, prosjektlederen
  godkjenner eller sender tilbake. Kunden ser åpne og utbedrede mangler.
- 2026-10: Dagbok på prosjektet: én side per dag med vær, temperatur, bemanning per fag
  (forslag fra oppgavene som pågår), hva som ble gjort, interne avvik og bilder. En dag kan
  deles med kunden som oppdatering, uten avvik og bemanning.
- 2026-10: Forside på `/` med funksjoner, sikkerhet, priser og «Be om demo»; appen flyttet til
  `/app` (gamle `#/`-lenker sendes videre). Bunnen av menyen samler Min profil, Meld feil,
  Innstillinger og Logg ut, og ny side Innstillinger (profil, firma, henvendelser).
  Produktnavnet samlet i `shared/merke.js`.
- 2026-10: Ansatte og leverandører ser hele planen (alle fag, liste og Gantt) i prosjektene de er
  med i, bare til lesing. Egne oppgaver er uthevet. Kan slås av per prosjekt («Fagene ser hele planen»).
