import { route } from '../router.js';
import { q, one } from '../db.js';
import { f, fail, logg } from '../http.js';
import { tripletexGet, tripletexAlle, tripletexSattOpp, tripletexMiljo, TripletexFeil } from '../tripletex.js';
import { iDag, leggTilDager, isoUke, ukedag, fremdrift } from '../../../shared/plan.js';
import { prosjektFinnes } from './prosjekter.js';
import { eksempelOkonomi, EKSEMPEL_TRIPLETEX_ID } from '../eksempeldata.js';

// Økonomi i prosjektet, hentet fra Tripletex: kostnader som er bokført på prosjektet,
// leverandørfakturaer som venter på godkjenning, og timer som er ført. Bare lesing,
// og bare for prosjektlederen. Svarene mellomlagres et par minutter, så dashbordet
// kan oppdatere seg selv uten å belaste Tripletex.

const BUFFER_SEKUNDER = 120;
const MIN_SEKUNDER_MELLOM_OPPDATERINGER = 20;
// Kostnadskontoer i norsk standard kontoplan: varekost, lønn, avskrivninger og andre driftskostnader.
const KOSTNAD_FRA = 4000;
const KOSTNAD_TIL = 7999;
const KONTOKLASSE = { 4: 'Varer og underentreprise', 5: 'Lønn og personal', 6: 'Andre driftskostnader', 7: 'Andre driftskostnader' };

const avrund = (n) => Math.round(Number(n || 0) * 100) / 100;
const navnPaa = (e) => [e?.firstName, e?.lastName].filter(Boolean).join(' ') || e?.displayName || 'Ukjent';

function prosjektVisning(p) {
  return { id: p.id, nummer: p.number || '', navn: p.name || p.displayName || '', kunde: p.customer?.name || '', avsluttet: Boolean(p.isClosed) };
}

function feilSvar(err) {
  if (err instanceof TripletexFeil) fail(err.status >= 500 ? 502 : err.status, err.message);
  throw err;
}

route('GET', '/tripletex/status', async () => ({ satt_opp: tripletexSattOpp(), miljo: tripletexSattOpp() ? tripletexMiljo() : null }));

route('GET', '/tripletex/prosjekter', async ({ query }) => {
  if (!tripletexSattOpp()) fail(409, 'Tripletex er ikke satt opp.');
  const sok = f.line(80)(query.sok) || '';
  const felt = 'id,number,name,displayName,isClosed,customer(name)';
  try {
    const [navn, nummer] = await Promise.all([
      tripletexGet('/project', { name: sok, isClosed: query.avsluttede === '1' ? undefined : false, count: 30, fields: felt, sorting: '-number' }),
      /^\w[\w-]*$/.test(sok) ? tripletexGet('/project', { number: sok, count: 5, fields: felt }) : Promise.resolve({ values: [] }),
    ]);
    const sett = new Map();
    for (const p of [...(nummer.values || []), ...(navn.values || [])]) sett.set(p.id, prosjektVisning(p));
    return [...sett.values()];
  } catch (err) {
    return feilSvar(err);
  }
});

// Koble (eller koble fra) prosjektet til et prosjekt i Tripletex.
route('PUT', '/prosjekter/:id/tripletex', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const tid = f.id(body.tripletex_id);
  if (!tid) {
    await q('UPDATE prosjekter SET tripletex_id = NULL, tripletex_navn = NULL WHERE id = $1', [id]);
    await q('DELETE FROM tripletex_buffer WHERE prosjekt_id = $1', [id]);
    await logg(id, user, 'Koblet prosjektet fra Tripletex');
    return { tripletex_id: null };
  }
  if (!tripletexSattOpp()) fail(409, 'Tripletex er ikke satt opp.');
  let p;
  try {
    p = (await tripletexGet(`/project/${tid}`, { fields: 'id,number,name,displayName,isClosed,customer(name)' }))?.value;
  } catch (err) {
    return feilSvar(err);
  }
  if (!p) fail(404, 'Fant ikke prosjektet i Tripletex.');
  const vis = prosjektVisning(p);
  const navn = [vis.nummer, vis.navn].filter(Boolean).join(' ');
  await q('UPDATE prosjekter SET tripletex_id = $1, tripletex_navn = $2 WHERE id = $3', [tid, navn, id]);
  await q('DELETE FROM tripletex_buffer WHERE prosjekt_id = $1', [id]);
  await logg(id, user, `Koblet prosjektet til Tripletex-prosjekt ${navn}`);
  return { tripletex_id: tid, tripletex_navn: navn };
});

route('PUT', '/prosjekter/:id/budsjett', async ({ params, body, user }) => {
  const id = f.id(params.id);
  await prosjektFinnes(id);
  const tall = (x, maks) => {
    if (x === undefined || x === null || String(x).trim() === '') return null;
    const n = Number(String(x).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > maks) fail(400, 'Budsjettet må være et positivt tall.');
    return Math.round(n * 100) / 100;
  };
  const kostnad = tall(body.budsjett_kostnad, 1e11);
  const timer = tall(body.budsjett_timer, 1e7);
  const rad = await one('UPDATE prosjekter SET budsjett_kostnad = $1, budsjett_timer = $2 WHERE id = $3 RETURNING budsjett_kostnad, budsjett_timer', [kostnad, timer, id]);
  await logg(id, user, 'Endret budsjettet');
  return rad;
});

async function hentFraTripletex(tid) {
  const dateFrom = '2000-01-01';
  const dateTo = leggTilDager(iDag(), 2); // til og ikke med
  const merknader = [];
  const [poster, timer, tilGodkjenning] = await Promise.all([
    tripletexAlle('/ledger/posting', {
      projectId: tid,
      dateFrom,
      dateTo,
      accountNumberFrom: KOSTNAD_FRA,
      accountNumberTo: KOSTNAD_TIL,
      fields: 'id,date,description,amount,account(number,name),supplier(name),voucher(id,number,year)',
    }),
    tripletexAlle('/timesheet/entry', {
      projectId: tid,
      dateFrom,
      dateTo,
      fields: 'id,date,hours,chargeableHours,hourlyCost,comment,employee(firstName,lastName),activity(name)',
    }),
    // Krever at brukeren bak nøkkelen kan se godkjenningskøen. Mangler tilgangen, vises resten likevel.
    tripletexAlle('/supplierInvoice/forApproval', {
      showAll: true,
      fields: 'id,invoiceNumber,invoiceDate,amountExcludingVat,supplier(name),voucher(id,postings(amount,project(id),account(number))),approvalListElements(status,project(id))',
    }, { side: 500, maks: 2000 }).catch((err) => {
      merknader.push(err instanceof TripletexFeil && err.status === 403 ? 'Får ikke lese fakturaer til godkjenning med denne Tripletex-brukeren.' : 'Fikk ikke hentet fakturaer til godkjenning.');
      return { verdier: [] };
    }),
  ]);
  if (poster.avkortet) merknader.push('Prosjektet har svært mange bilag – bare de første 10 000 posteringene er med.');
  if (timer.avkortet) merknader.push('Prosjektet har svært mange timeføringer – bare de første 10 000 er med.');
  return { poster: poster.verdier, timer: timer.verdier, tilGodkjenning: tilGodkjenning.verdier, merknader };
}

function maaned(iso) {
  return String(iso).slice(0, 7);
}
function ukeNokkel(iso) {
  const mandag = leggTilDager(iso, -ukedag(iso));
  return mandag;
}

export function sammenstill(r, tid) {
  // Kostnader
  const bilagIder = new Set();
  const perKlasse = new Map();
  const perKonto = new Map();
  const perLev = new Map();
  const perMnd = new Map();
  let bokfort = 0;
  for (const p of r.poster) {
    const belop = Number(p.amount || 0);
    bokfort += belop;
    if (p.voucher?.id) bilagIder.add(p.voucher.id);
    const nr = Number(p.account?.number || 0);
    const klasse = KONTOKLASSE[Math.floor(nr / 1000)] || 'Annet';
    perKlasse.set(klasse, (perKlasse.get(klasse) || 0) + belop);
    const kontoNavn = `${nr} ${p.account?.name || ''}`.trim();
    perKonto.set(kontoNavn, (perKonto.get(kontoNavn) || 0) + belop);
    const lev = p.supplier?.name || (nr >= 5000 && nr < 6000 ? 'Lønn' : 'Uten leverandør');
    perLev.set(lev, (perLev.get(lev) || 0) + belop);
    perMnd.set(maaned(p.date), (perMnd.get(maaned(p.date)) || 0) + belop);
  }
  const sisteBilag = [...r.poster]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id || 0) - (a.id || 0))
    .slice(0, 12)
    .map((p) => ({
      dato: p.date,
      bilag: p.voucher?.number ? `${p.voucher.number}${p.voucher.year ? `-${p.voucher.year}` : ''}` : '',
      tekst: p.description || p.account?.name || '',
      leverandor: p.supplier?.name || '',
      konto: p.account?.number || null,
      belop: avrund(p.amount),
    }));

  // Til godkjenning: bare fakturaer på dette prosjektet som ikke allerede er bokført.
  const venter = [];
  for (const fa of r.tilGodkjenning) {
    if (fa.voucher?.id && bilagIder.has(fa.voucher.id)) continue;
    const poster = (fa.voucher?.postings || []).filter((p) => p.project?.id === tid);
    const paaProsjekt = poster.length || (fa.approvalListElements || []).some((e) => e.project?.id === tid);
    if (!paaProsjekt) continue;
    const kostPoster = poster.filter((p) => Number(p.account?.number) >= KOSTNAD_FRA && Number(p.account?.number) <= KOSTNAD_TIL);
    const belop = kostPoster.length ? kostPoster.reduce((s, p) => s + Number(p.amount || 0), 0) : Number(fa.amountExcludingVat || 0);
    venter.push({ dato: fa.invoiceDate, fakturanr: fa.invoiceNumber || '', leverandor: fa.supplier?.name || '', belop: avrund(belop) });
  }
  venter.sort((a, b) => String(b.dato).localeCompare(String(a.dato)));
  const tilGodkjenning = venter.reduce((s, v) => s + v.belop, 0);

  // Timer
  let sumTimer = 0;
  let fakturerbare = 0;
  let timekost = 0;
  const perAnsatt = new Map();
  const perAktivitet = new Map();
  const perUke = new Map();
  for (const t of r.timer) {
    const h = Number(t.hours || 0);
    sumTimer += h;
    fakturerbare += Number(t.chargeableHours || 0);
    timekost += h * Number(t.hourlyCost || 0);
    const navn = navnPaa(t.employee);
    perAnsatt.set(navn, (perAnsatt.get(navn) || 0) + h);
    const akt = t.activity?.name || 'Uten aktivitet';
    perAktivitet.set(akt, (perAktivitet.get(akt) || 0) + h);
    const uke = ukeNokkel(t.date);
    perUke.set(uke, (perUke.get(uke) || 0) + h);
  }
  const sisteTimer = [...r.timer]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id || 0) - (a.id || 0))
    .slice(0, 12)
    .map((t) => ({ dato: t.date, ansatt: navnPaa(t.employee), aktivitet: t.activity?.name || '', timer: avrund(t.hours), kommentar: t.comment || '' }));

  const sortert = (m, n = 8) => [...m.entries()].map(([navn, verdi]) => ({ navn, verdi: avrund(verdi) })).sort((a, b) => b.verdi - a.verdi).slice(0, n);
  const tidsrekke = (m) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periode, verdi]) => ({ periode, verdi: avrund(verdi) }));

  return {
    kostnader: {
      bokfort: avrund(bokfort),
      til_godkjenning: avrund(tilGodkjenning),
      antall_bilag: bilagIder.size,
      per_klasse: sortert(perKlasse, 6),
      per_konto: sortert(perKonto, 8),
      per_leverandor: sortert(perLev, 8),
      per_maaned: tidsrekke(perMnd).map((x) => ({ ...x, etikett: x.periode })),
      siste: sisteBilag,
      venter: venter.slice(0, 20),
    },
    timer: {
      sum: avrund(sumTimer),
      fakturerbare: avrund(fakturerbare),
      timekost: avrund(timekost),
      antall: r.timer.length,
      per_ansatt: sortert(perAnsatt, 10),
      per_aktivitet: sortert(perAktivitet, 8),
      per_uke: tidsrekke(perUke).map((x) => ({ ...x, etikett: `Uke ${isoUke(x.periode)}` })),
      siste: sisteTimer,
    },
    merknader: r.merknader,
  };
}

route('GET', '/prosjekter/:id/okonomi', async ({ params, query }) => {
  const id = f.id(params.id);
  const p = await one('SELECT id, tripletex_id, tripletex_navn, budsjett_kostnad, budsjett_timer, eksempel FROM prosjekter WHERE id = $1', [id]);
  if (!p) fail(404, 'Fant ikke prosjektet.');
  const oppgaver = await q('SELECT godkjent, ferdig_meldt FROM oppgaver WHERE prosjekt_id = $1', [id]);
  const grunn = {
    satt_opp: tripletexSattOpp(),
    miljo: tripletexSattOpp() ? tripletexMiljo() : null,
    tripletex_id: p.tripletex_id,
    tripletex_navn: p.tripletex_navn,
    budsjett: { kostnad: p.budsjett_kostnad === null ? null : Number(p.budsjett_kostnad), timer: p.budsjett_timer === null ? null : Number(p.budsjett_timer) },
    fremdrift: fremdrift(oppgaver).prosent,
  };
  // Eksempelprosjektet viser oppdiktede tall, også når Tripletex ikke er satt opp.
  if (p.eksempel) {
    return {
      ...grunn,
      satt_opp: true,
      miljo: 'eksempel',
      tripletex_id: EKSEMPEL_TRIPLETEX_ID,
      tripletex_navn: '1001 Eksempelveien 12 (eksempeltall)',
      ...sammenstill(eksempelOkonomi(), EKSEMPEL_TRIPLETEX_ID),
      hentet: new Date().toISOString(),
    };
  }
  if (!grunn.satt_opp || !p.tripletex_id) return grunn;

  const buffer = await one('SELECT data, hentet, EXTRACT(EPOCH FROM now() - hentet)::int AS alder FROM tripletex_buffer WHERE prosjekt_id = $1 AND tripletex_id = $2', [id, p.tripletex_id]);
  const tvungen = query.oppdater === '1' && (!buffer || buffer.alder >= MIN_SEKUNDER_MELLOM_OPPDATERINGER);
  if (buffer && buffer.alder < BUFFER_SEKUNDER && !tvungen) return { ...grunn, ...buffer.data, hentet: buffer.hentet };
  try {
    const data = sammenstill(await hentFraTripletex(p.tripletex_id), p.tripletex_id);
    const rad = await one(
      `INSERT INTO tripletex_buffer (prosjekt_id, tripletex_id, data, hentet) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (prosjekt_id) DO UPDATE SET tripletex_id = EXCLUDED.tripletex_id, data = EXCLUDED.data, hentet = EXCLUDED.hentet
       RETURNING hentet`,
      [id, p.tripletex_id, JSON.stringify(data)],
    );
    return { ...grunn, ...data, hentet: rad.hentet };
  } catch (err) {
    // Tripletex er nede eller nøkkelen er feil: vis det vi sist hentet, med beskjed.
    if (buffer && err instanceof TripletexFeil) return { ...grunn, ...buffer.data, hentet: buffer.hentet, feil: err.message };
    return feilSvar(err);
  }
});
