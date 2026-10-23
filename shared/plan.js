// Regler for fremdriften som både serveren og nettleseren bruker: status på en
// oppgave, sjekkpunkter og prosent ferdig. Alle datoer er tekst på formen ÅÅÅÅ-MM-DD.

const parse = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);

export function iDag() {
  // Bare for lokal utvikling og skjermbilder: lar en «late som» det er en annen dag.
  if (globalThis.__FREMDRIFT_DATO) return globalThis.__FREMDRIFT_DATO;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
}

export function leggTilDager(iso, n) {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dagerMellom(fra, til) {
  return Math.round((parse(til) - parse(fra)) / 86400000);
}

export const ukedag = (iso) => (parse(iso).getUTCDay() + 6) % 7; // 0 = mandag
export const erHelg = (iso) => ukedag(iso) >= 5;

// Arbeidsdager fra og med fra til og med til (helg telles ikke).
export function arbeidsdager(fra, til) {
  if (!fra || !til || til < fra) return 0;
  let n = 0;
  for (let d = fra; d <= til; d = leggTilDager(d, 1)) if (!erHelg(d)) n++;
  return n;
}

// Datoen n arbeidsdager etter iso.
export function arbeidsdagEtter(iso, n) {
  let d = iso;
  let igjen = n;
  while (igjen > 0) {
    d = leggTilDager(d, 1);
    if (!erHelg(d)) igjen--;
  }
  return d;
}

export function isoUke(iso) {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() - ukedag(iso) + 3);
  const forsteTorsdag = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - forsteTorsdag) / 86400000 - 3 + ((forsteTorsdag.getUTCDay() + 6) % 7)) / 7);
}

export const DAGNAVN = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const MND = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];

export function datoKort(iso) {
  if (!iso) return '';
  const d = parse(iso);
  return `${d.getUTCDate()}. ${MND[d.getUTCMonth()]}`;
}
export function datoMedDag(iso) {
  if (!iso) return '';
  return `${DAGNAVN[ukedag(iso)]} ${datoKort(iso)}`;
}
export function ddmm(iso) {
  if (!iso) return '';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

// ---------- Status på en oppgave ----------
// Ferdig = godkjent av prosjektleder. «Meldt ferdig» = leverandøren har krysset av,
// men prosjektlederen har ikke kontrollert ennå. Resten følger av datoene.

export const STATUS = {
  ferdig: { tekst: 'Ferdig', tone: 'ok', ikon: '✔' },
  meldt: { tekst: 'Meldt ferdig', tone: 'info', ikon: '◐' },
  forsinket: { tekst: 'Forsinket', tone: 'fare', ikon: '!' },
  idag: { tekst: 'Frist i dag', tone: 'varsel', ikon: '●' },
  pagar: { tekst: 'Pågår', tone: 'aktiv', ikon: '▶' },
  snart: { tekst: 'Starter snart', tone: 'snart', ikon: '○' },
  planlagt: { tekst: 'Planlagt', tone: 'noytral', ikon: '·' },
};

export function oppgaveStatus(o, dato = iDag()) {
  if (o.godkjent) return 'ferdig';
  if (o.ferdig_meldt) return 'meldt';
  if (o.til < dato) return 'forsinket';
  if (o.til === dato) return 'idag';
  if (o.fra <= dato) return 'pagar';
  if (o.fra <= arbeidsdagEtter(dato, 3)) return 'snart';
  return 'planlagt';
}

export function fremdrift(oppgaver, { tilOgMed } = {}) {
  const utvalg = tilOgMed ? oppgaver.filter((o) => o.til <= tilOgMed) : oppgaver;
  const total = utvalg.length;
  const ferdig = utvalg.filter((o) => o.godkjent).length;
  const meldt = utvalg.filter((o) => !o.godkjent && o.ferdig_meldt).length;
  return { total, ferdig, meldt, prosent: total ? Math.round((ferdig / total) * 100) : 0 };
}

// Sjekkpunkt hver mandag og fredag fra prosjektstart til sluttfrist.
export function sjekkpunkter(start, slutt) {
  const ut = [];
  if (!start || !slutt) return ut;
  for (let d = start; d <= slutt; d = leggTilDager(d, 1)) {
    const u = ukedag(d);
    if (u === 0) ut.push({ dato: d, type: 'mandag', fokus: 'Oppstart: bemanning, leveranser og forutsetninger for uken' });
    if (u === 4) ut.push({ dato: d, type: 'fredag', fokus: 'Ferdigkontroll: godkjenn ferdige oppgaver, noter avvik og tiltak' });
  }
  return ut;
}

export const PRIORITETER = ['kritisk', 'hoy', 'normal', 'tentativ'];
export const PRIORITET_TEKST = { kritisk: 'Kritisk', hoy: 'Høy', normal: 'Normal', tentativ: 'Tentativ' };
export const MILEPAEL_TYPER = { start: 'Start', delmal: 'Delmål', fast: 'Fast', innflytting: 'Innflytting', sluttfrist: 'Sluttfrist' };
