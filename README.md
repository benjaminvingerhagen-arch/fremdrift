# Fremdrift

Prosjektstyring for byggeprosjekter: fremdriftsplan med Gantt, oppgaver som fordeles
til egne ansatte og leverandører, sjekkpunkter hver mandag og fredag, og en egen
prosjektside kunden kan følge med på.

## Forsiden og appen

`/` er forsiden (`index.html`, `forside.css`, `forside.js`): funksjoner, sikkerhet, priser og
«Be om demo». Selve systemet ligger på `/app` (`app.html`), og `/logg-inn` sender dit.
Kundesiden er uendret på `/k/<nøkkel>`.

Appen lå tidligere på `/`. Forsiden sender alle adresser som begynner med `#/` videre til
`/app` med resten av adressen, så gamle bokmerker og lenker i e-post virker fortsatt. En app
som er lagt på hjemskjermen fra den gamle adressen, åpner også rett i appen.

Forsiden er foreløpig ikke søkbar (`noindex`) – det slås på når navn og domene er bestemt
(se «Bytte navn»). Prisene står bare i `index.html`.

## Henvendelser og «Meld feil»

- **Be om demo** på forsiden lagres i tabellen `henvendelser`. Et skjult felt stopper roboter,
  og hver avsender kan sende fem i timen (IP-adressen lagres bare som hash).
- **Meld feil** ligger nederst i menyen for prosjektleder og nederst på siden til ansatte og
  leverandører. Meldingen får med hvem, hvilken side og nettleser – ikke innholdet på siden.
  20 meldinger per person i døgnet.
- Begge vises under **Innstillinger → Henvendelser**, der de kan krysses av som behandlet.
- På e-post sendes de bare når `RESEND` og `MAIL_FROM` er satt, og i tillegg
  `KONTAKT_EPOST` (demo) og `FEILMELDING_EPOST` (feil, ellers `KONTAKT_EPOST`). Adressene står
  bare i Vercel, ikke i koden, siden repoet er offentlig. Avsenderen blir svaradresse.

## Bytte navn

Navnet «Fremdrift» står her:

- `shared/merke.js` – `NAVN` og `SLAGORD`, brukt i hele appen, i e-post, kalender og app-manifest
- `index.html` (forsiden), `app.html` og `kunde.html` – tittel, beskrivelse og logotekst
- `logo/favicon.svg` – `<title>` og `aria-label`

Når navn og domene er bestemt: bytt på stedene over, sett `APP_URL` i Vercel, og gjør
forsiden søkbar – `index, follow` og `<link rel="canonical">` i `index.html`, `X-Robots-Tag`
bare på `/app`, `/api/*`, `/k/*` og `/kunde` i `vercel.json`, og legg til `robots.txt` og
`sitemap.xml`. Personlige lenker og app-ikoner på hjemskjermen bør lages på nytt etter
domenebytte.

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

## Varsler og e-post

- **Varsler** (bjellen i menyen): det fagene og kunden har gjort som prosjektlederen bør følge opp –
  meldt ferdig, meldinger på oppgaver, svar på spørsmål og leveranser kunden har flyttet.
- **Uleste meldinger** vises med et oransje merke på oppgaven, både for prosjektleder og leverandør.
- **E-post** (valgfritt): legg inn `RESEND` (API-nøkkel fra [Resend](https://resend.com)) og `MAIL_FROM`
  (f.eks. `Fremdrift <varsel@dittfirma.no>`, domenet må være godkjent i Resend). Da får
  - prosjektleder e-post når noe meldes ferdig, når fagene skriver og når kunden svarer eller flytter en leveranse,
  - leverandøren e-post når oppgaven sendes tilbake eller prosjektlederen skriver,
  - kunden e-post ved nye oppdateringer og spørsmål, når prosjektlederen krysser av for det.

  Hver person kan slå av e-post under Folk og leverandører. Uten nøklene virker alt annet som før.
  `APP_URL` kan settes hvis siden får eget domene; ellers brukes Vercel-adressen i lenkene.

## Andre funksjoner

- **Forskyv planen**: flytt alle åpne oppgaver fra en dato – for ett fag eller alle – et antall
  arbeidsdager frem eller tilbake. Helger hoppes over, godkjente oppgaver blir liggende.
- **Del bilde med kunden**: bilder leverandøren sender på en oppgave kan legges rett ut på kundesiden.
- **Mangler** (fanen i prosjektet): registrer feil og rester ved befaring og overtakelse, med
  rom, fag, frist og bilde. Faget ser dem på oppgavesiden og melder utbedret med kommentar og
  bilde; prosjektlederen godkjenner eller sender tilbake. Kunden ser bare om en mangel er åpen
  eller utbedret.
- **Dagbok** (fanen i prosjektet): én side per dag med vær, bemanning per fag, hva som ble gjort,
  avvik og bilder. Dagboken er intern; «Del med kunden» gjør en dag om til en oppdatering på
  kundesiden, uten avvik og bemanning.
- **Kalenderabonnement**: ansatte og leverandører trykker «Legg i kalenderen» på siden med
  oppgavene sine og får en personlig kalenderadresse (.ics) for iPhone, Google Kalender eller
  Outlook. Egne oppgaver og viktige datoer (fast dato, innflytting, sluttfrist) kommer inn som
  heldagshendelser og oppdateres av seg selv. Adressen lagres bare som hash, og slutter å virke
  når personen får ny lenke, blir deaktivert eller slår kalenderen av.
- **App på hjemskjermen**: «Del → Legg til på Hjem-skjerm» (iPhone) eller «Installer app» (Android).
  Leverandører får en egen startadresse, så appen åpner rett på oppgavelisten deres.
  Den byttes ut når du lager ny lenke til personen.

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
5. Deploy, åpne `/app` og registrer deg med koden. Du blir prosjektleder.
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
- `api/_lib/routes/` – prosjekter, oppgaver, personer, kundesiden, bilder, mangler, dagbok, kalender og henvendelser
- `shared/plan.js` – regler for status, sjekkpunkter og fremdrift, brukt av både server og nettleser
- `index.html`, `forside.css`, `forside.js` – forsiden
- `js/` – appen for prosjektleder (`app.js`, `views/`, på `/app`), leverandørsiden (`views/mine.js`) og kundesiden (`kunde.js`)
- `shared/merke.js` – produktnavnet
- `stil.css` – alt av utseende, med fargene som tokens øverst
