// Oppdiktede tall for økonomi: bilag, timer og leverandørfakturaer til godkjenning.
// Brukes av eksempelprosjektet (vises uten Tripletex) og av den lokale etterligningen av
// Tripletex (scripts/tripletex-falsk.mjs). Formen er den samme som Tripletex sitt API gir.
// Alle navn, beløp og personer er oppdiktet.

export const EKSEMPEL_TRIPLETEX_ID = 101;

const dag = (n, fra = new Date()) => {
  const d = new Date(fra);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const KONTO = {
  4300: 'Innkjøp av varer for videresalg',
  4500: 'Fremmedytelser og underentreprise',
  5000: 'Lønn til ansatte',
  6540: 'Inventar og småutstyr',
  6800: 'Kontorrekvisita',
  7100: 'Bilgodtgjørelse',
};

export function eksempelPoster(prosjektId = EKSEMPEL_TRIPLETEX_ID) {
  const rader = [
    [-52, 4300, 18450, 'Byggevarehuset Nord', 'Gipsplater og stendere'],
    [-49, 4500, 32000, 'Rivetjenester AS', 'Riving bad og kjøkken'],
    [-41, 4300, 9870.5, 'Byggevarehuset Nord', 'Isolasjon'],
    [-35, 5000, 41200, null, 'Lønn tømrere'],
    [-30, 4500, 27500, 'Elektro Sør AS', 'Elektro 1. avdrag'],
    [-24, 4300, 14320, 'Flis og Bad AS', 'Fliser og membran'],
    [-20, 6540, 2390, 'Verktøyhuset', 'Kappsag-blader'],
    [-14, 5000, 38750, null, 'Lønn tømrere'],
    [-9, 4500, 19800, 'Rør og Varme AS', 'Rørlegger bad'],
    [-6, 7100, 1845, null, 'Kjøring'],
    [-3, 4300, -1200, 'Byggevarehuset Nord', 'Retur gipsplater'],
  ];
  return rader.map(([d, konto, belop, lev, tekst], i) => ({
    id: 5000 + i,
    date: dag(d),
    description: tekst,
    amount: belop,
    account: { id: konto, number: konto, name: KONTO[konto] },
    supplier: lev ? { id: 300 + i, name: lev } : null,
    voucher: { id: 7000 + i, number: 120 + i, year: Number(dag(d).slice(0, 4)) },
    project: { id: prosjektId },
  }));
}

export function eksempelTimer(prosjektId = EKSEMPEL_TRIPLETEX_ID) {
  const folk = [
    { firstName: 'Kari', lastName: 'Tømrer' },
    { firstName: 'Per', lastName: 'Snekker' },
    { firstName: 'Ali', lastName: 'Lærling' },
  ];
  const ut = [];
  let id = 9000;
  for (let d = -45; d <= 0; d++) {
    const dato = dag(d);
    const ukedag = new Date(`${dato}T00:00:00Z`).getUTCDay();
    if (ukedag === 0 || ukedag === 6) continue;
    folk.forEach((ansatt, i) => {
      if ((d + i) % 4 === 0) return; // ikke alle hver dag
      ut.push({
        id: id++,
        date: dato,
        hours: i === 2 ? 6 : 7.5,
        chargeableHours: i === 2 ? 0 : 7.5,
        hourlyCost: i === 2 ? 290 : 420,
        comment: d > -10 ? 'Innvendig kledning' : 'Reisverk',
        employee: { id: 40 + i, ...ansatt },
        activity: { id: 1, name: d > -10 ? 'Innvendig arbeid' : 'Reisverk' },
        project: { id: prosjektId },
      });
    });
  }
  return ut;
}

export function eksempelTilGodkjenning(poster, prosjektId = EKSEMPEL_TRIPLETEX_ID) {
  return [
    // Ikke bokført ennå, på prosjektet
    { id: 1, invoiceNumber: 'F-8812', invoiceDate: dag(-2), amountExcludingVat: 12400, supplier: { name: 'Maler Mestern AS' },
      voucher: { id: 8801, postings: [{ amount: 12400, project: { id: prosjektId }, account: { number: 4500 } }, { amount: -15500, project: null, account: { number: 2400 } }] },
      approvalListElements: [{ status: 0, project: { id: prosjektId } }] },
    // Allerede bokført (samme bilag som i hovedboken) – skal ikke telles to ganger
    { id: 2, invoiceNumber: 'F-4410', invoiceDate: poster[8].date, amountExcludingVat: 19800, supplier: { name: 'Rør og Varme AS' },
      voucher: { id: poster[8].voucher.id, postings: [{ amount: 19800, project: { id: prosjektId }, account: { number: 4500 } }] },
      approvalListElements: [{ status: 1, project: { id: prosjektId } }] },
    // Et annet prosjekt
    { id: 3, invoiceNumber: 'F-9001', invoiceDate: dag(-1), amountExcludingVat: 5000, supplier: { name: 'Gulvmannen' },
      voucher: { id: 8803, postings: [{ amount: 5000, project: { id: 102 }, account: { number: 4500 } }] },
      approvalListElements: [{ status: 0, project: { id: 102 } }] },
  ];
}

// Hele «Tripletex-svaret» for eksempelprosjektet, klart for sammenstill() i routes/okonomi.js.
export function eksempelOkonomi() {
  const poster = eksempelPoster();
  return { poster, timer: eksempelTimer(), tilGodkjenning: eksempelTilGodkjenning(poster), merknader: [] };
}
