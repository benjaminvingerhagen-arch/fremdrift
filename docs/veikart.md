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
   etterfølgende oppgaver når en oppgave flyttes i planen.
6. **Tilleggsarbeid som kunden godkjenner** – beskrivelse og pris, kunden godkjenner på
   kundesiden. Bygger på beslutningene som finnes i dag.
7. **Utskrift/PDF av fremdriftsplanen** – egen utskriftsstil for planen og kundesiden.
8. **Leverandørsiden som app på telefonen** – manifest og ikon så siden kan legges på
   hjemskjermen, og enkel visning uten nett.

## Krever avklaring med Benjamin

- **Varsler på e-post eller SMS** (ny oppgave, sendt tilbake, kunden har svart). Krever en
  e-post-/SMS-tjeneste med egen nøkkel og eventuelt kostnad.

## Teknisk gjeld

- `npm audit` melder sårbarhet i `zod` via `@vercel/blob` → `@vercel/oidc`. Bare
  `npm audit fix --force` (bryter bakoverkompatibilitet) retter det i dag. Følg med på ny
  versjon av `@vercel/blob`.

## Gjort

- (ingenting ennå)
