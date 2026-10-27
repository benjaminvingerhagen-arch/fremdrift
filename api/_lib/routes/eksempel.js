import { route } from '../router.js';
import { one, transaction } from '../db.js';
import { logg } from '../http.js';
import { nyNokkel } from '../auth.js';
import { iDag, leggTilDager, erHelg, sjekkpunkter } from '../../../shared/plan.js';
import { lagreFil } from '../lagring.js';
import { enkelPdf, EKSEMPEL_DOKUMENTER } from '../eksempeldata.js';

// Eksempelprosjekt til demonstrasjon: en ferdig utfylt enebolig med plan, fag i alle
// statuser, milepæler, sjekkpunkter, mangler, dagbok, et spørsmål til kunden og en
// oppdatering – og økonomi med oppdiktede tall (vises uten Tripletex). Datoene legges rundt
// dagens dato, så prosjektet alltid ser «midt i» ut. Merket som eksempel, og kan slettes
// som et vanlig prosjekt.

// Hverdag n arbeidsdager fra i dag (negativt = bakover).
function hverdag(n) {
  let d = iDag();
  while (erHelg(d)) d = leggTilDager(d, 1);
  const steg = n < 0 ? -1 : 1;
  for (let igjen = Math.abs(n); igjen > 0; ) {
    d = leggTilDager(d, steg);
    if (!erHelg(d)) igjen--;
  }
  return d;
}

// [nr, fag, tittel, fra, til, status, prioritet, ekstra]
// status: 'ok' = godkjent, 'meldt' = meldt ferdig, '' = åpen (status følger datoene)
const OPPGAVER = [
  ['A01', 'Riving', 'Rive bad og kjøkken', -30, -27, 'ok', 'normal'],
  ['A02', 'Tømrer', 'Reisverk innvendige vegger', -26, -20, 'ok', 'hoy'],
  ['A03', 'Rørlegger', 'Grovarbeid bad og kjøkken', -22, -18, 'ok', 'hoy'],
  ['A04', 'Elektro', 'Trekke kabler, 1. og 2. etasje', -21, -16, 'ok', 'normal'],
  ['A05', 'Tømrer', 'Isolasjon og plater', -17, -10, 'ok', 'normal'],
  ['A06', 'Flislegger', 'Membran bad', -9, -7, 'meldt', 'kritisk', { merknad: 'Må være godkjent før flislegging' }],
  ['A07', 'Maler', 'Sparkling stue og gang', -6, -1, '', 'normal', { merknad: 'Venter på plater i gangen' }],
  ['A08', 'Flislegger', 'Flislegging bad', -4, 2, '', 'kritisk'],
  ['A09', 'Elektro', 'Montering av stikk og lys', -2, 3, '', 'hoy'],
  ['A10', 'Tømrer', 'Lister og dører', 1, 5, '', 'normal'],
  ['A11', 'Kjøkken', 'Levering og montering av kjøkken', 3, 6, '', 'hoy', { kunde_styrt: true, merknad: 'Kunden bestiller selv' }],
  ['A12', 'Maler', 'Maling stue, gang og soverom', 4, 9, '', 'normal'],
  ['A13', 'Rørlegger', 'Montering av utstyr bad og kjøkken', 7, 9, '', 'hoy'],
  ['A14', 'Gulv', 'Parkett stue og soverom', 8, 11, '', 'normal'],
  ['A15', 'Elektro', 'Sluttkontroll og samsvarserklæring', 11, 12, '', 'kritisk'],
  ['A16', 'Renhold', 'Byggrengjøring', 13, 13, '', 'normal'],
];

route('POST', '/eksempelprosjekt', async ({ user }) => {
  const start = hverdag(-30);
  const innflytting = hverdag(15);
  const sluttfrist = hverdag(20);
  const dag = iDag();
  const id = await transaction(async (tx) => {
    const p = (
      await tx.q(
        `INSERT INTO prosjekter (navn, adresse, beskrivelse, kunde_navn, start, innflytting, sluttfrist, kunde_token, eksempel,
                                 budsjett_kostnad, budsjett_timer)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10) RETURNING id`,
        [
          'Eksempel: Enebolig Eksempelveien 12',
          'Eksempelveien 12, 0000 Eksempelby',
          'Totalrenovering av enebolig fra 1970-tallet: nytt bad, nytt kjøkken, nye overflater og ny elektrisk installasjon. (Dette er et eksempelprosjekt med oppdiktede data.)',
          'Familien Hansen (eksempel)',
          start,
          innflytting,
          sluttfrist,
          nyNokkel(),
          350000,
          650,
        ],
      )
    )[0];
    const ider = {};
    for (const [i, [nr, fag, tittel, fra, til, status, prioritet, ekstra = {}]] of OPPGAVER.entries()) {
      const rad = await tx.q(
        `INSERT INTO oppgaver (prosjekt_id, nr, fag, tittel, merknad, fra, til, prioritet, kunde_styrt, ferdig_meldt, meldt_av, godkjent, sortering)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          p.id, nr, fag, tittel, ekstra.merknad || null, hverdag(fra), hverdag(til), prioritet, Boolean(ekstra.kunde_styrt),
          status ? new Date().toISOString() : null, status ? `${fag} (eksempel)` : null, status === 'ok' ? new Date().toISOString() : null, i + 1,
        ],
      );
      ider[nr] = rad[0].id;
    }
    const milepaeler = [
      [start, 'Oppstart', 'start', true],
      [hverdag(-10), 'Tett hus innvendig – plater ferdig', 'delmal', true],
      [hverdag(6), 'Kjøkken montert', 'fast', false],
      [innflytting, 'Innflytting', 'innflytting', false],
      [sluttfrist, 'Overtakelse og sluttfrist', 'sluttfrist', false],
    ];
    for (const [dato, navn, type, naadd] of milepaeler) {
      await tx.q('INSERT INTO milepaeler (prosjekt_id, dato, navn, type, naadd) VALUES ($1, $2, $3, $4, $5)', [p.id, dato, navn, type, naadd]);
    }
    // Sjekkpunktene som har vært, er utført – bortsett fra forrige fredag, som en påminnelse.
    const sp = sjekkpunkter(start, sluttfrist).filter((s) => s.dato < dag);
    for (const [i, s] of sp.entries()) {
      const sist = i === sp.length - 1;
      await tx.q('INSERT INTO sjekkpunkter (prosjekt_id, dato, utfort, notat) VALUES ($1, $2, $3, $4)', [
        p.id, s.dato, !sist, sist ? null : s.type === 'mandag' ? 'Bemanning bekreftet. Leveranser i rute.' : 'Ferdige oppgaver gjennomgått og godkjent.',
      ]);
    }
    const kommentarer = [
      ['A06', 'Membranen er lagt og har tørket. Klar for kontroll.'],
      ['A07', 'Mangler fortsatt to plater i gangen – kommer fra byggevarehuset i morgen.'],
    ];
    for (const [nr, tekst] of kommentarer) await tx.q('INSERT INTO kommentarer (oppgave_id, tekst) VALUES ($1, $2)', [ider[nr], tekst]);

    const mangler = [
      ['Riper i dørkarm, soverom 2', 'Soverom 2', 'Tømrer', hverdag(4), null, null],
      ['Stikkontakt sitter skjevt', 'Kjøkken', 'Elektro', hverdag(3), 'utbedret', 'Rettet opp og festet.'],
      ['Malingssøl på vindusbrett', 'Stue', 'Maler', hverdag(-1), 'godkjent', null],
    ];
    for (const [tittel, rom, fag, frist, status, kommentar] of mangler) {
      await tx.q(
        `INSERT INTO mangler (prosjekt_id, tittel, rom, fag, frist, utbedret, utbedret_av, utbedret_kommentar, godkjent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [p.id, tittel, rom, fag, frist, status ? new Date().toISOString() : null, status ? `${fag} (eksempel)` : null, kommentar, status === 'godkjent' ? new Date().toISOString() : null],
      );
    }
    const dagbok = [
      [-3, 'skyet', 8, [{ fag: 'Tømrer', antall: 2 }, { fag: 'Flislegger', antall: 1 }], 'Flislegger startet på bad. Tømrerne monterte plater i gangen.', null],
      [-2, 'regn', 6, [{ fag: 'Tømrer', antall: 2 }, { fag: 'Elektro', antall: 1 }], 'Elektriker startet montering i 1. etasje.', 'Plater til gangen kom ikke som avtalt – ny levering i morgen.'],
      [-1, 'sol', 9, [{ fag: 'Tømrer', antall: 2 }, { fag: 'Elektro', antall: 2 }, { fag: 'Maler', antall: 1 }], 'Maler sparklet stue. Platene til gangen er levert og montert.', null],
    ];
    for (const [d, vaer, temp, folk, notat, avvik] of dagbok) {
      await tx.q(
        `INSERT INTO dagbok (prosjekt_id, dato, bemanning, vaer, temperatur, notat, avvik, skrevet_av) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`,
        [p.id, hverdag(d), JSON.stringify(folk), vaer, temp, notat, avvik, user.navn],
      );
    }
    await tx.q(
      `INSERT INTO beslutninger (prosjekt_id, sporsmal, beskrivelse, alternativer, frist) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [p.id, 'Farge på fuger på badet', 'Flisleggeren trenger svar før fugingen starter.', JSON.stringify(['Lys grå', 'Mørk grå', 'Hvit']), hverdag(2)],
    );
    await tx.q('INSERT INTO oppdateringer (prosjekt_id, tittel, tekst, forfatter_id) VALUES ($1, $2, $3, $4)', [
      p.id,
      'Status: bad og elektro',
      'Membranen på badet er lagt, og flisleggingen er i gang. Elektrikeren monterer stikk og lys denne uken, og maleren har startet sparklingen. Vi er i rute mot innflytting.',
      user.id,
    ]);
    return p.id;
  });
  // Eksempeldokumenter i dokumenthotellet. Mangler fillagring, blir prosjektet laget uten dem.
  try {
    for (const d of EKSEMPEL_DOKUMENTER) {
      const data = enkelPdf(d.tittel, d.linjer);
      const nokkel = await lagreFil({ prosjektId: id, type: 'application/pdf', data });
      const v = await one(
        'INSERT INTO vedlegg (prosjekt_id, nokkel, type, navn, storrelse, opplastet_av) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [id, nokkel, 'application/pdf', `${d.tittel}.pdf`, data.length, user.id],
      );
      await one(
        `INSERT INTO dokumenter (prosjekt_id, vedlegg_id, tittel, kategori, synlig_for_kunde, synlig_for_fag, lagt_til_av)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [id, v.id, d.tittel, d.kategori, d.kunde, d.fag, user.id],
      );
    }
  } catch (err) {
    console.warn('Eksempeldokumentene ble ikke laget:', err.message);
  }
  await logg(id, user, 'Lagde eksempelprosjektet');
  return one('SELECT id, navn FROM prosjekter WHERE id = $1', [id]);
});
