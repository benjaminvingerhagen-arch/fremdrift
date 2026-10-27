// Tester API-et og tilgangsreglene. Krever at dev-serveren kjører på en tom database:
//   rm -rf .dev-db && npm run dev   (i ett vindu)
//   npm test                        (i et annet)
const BASE = process.env.BASE || 'http://localhost:3000';
const KODE = process.env.REGISTRERINGSKODE || 'lokal';

let feil = 0;
let ok = 0;
const sjekk = (tittel, bestatt, detalj = '') => {
  if (bestatt) {
    ok++;
    console.log(`  ✓ ${tittel}`);
  } else {
    feil++;
    console.log(`  ✗ ${tittel} ${detalj}`);
  }
};

function klient() {
  let cookie = '';
  const kall = async (method, sti, body, ekstra = {}) => {
    const res = await fetch(BASE + '/api' + sti, {
      method,
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-FD': '1', ...(cookie ? { cookie } : {}), ...ekstra },
      body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
    });
    const satt = res.headers.getSetCookie?.() || [];
    if (satt.length) cookie = satt[0].split(';')[0];
    return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
  };
  return kall;
}

const leder = klient();
console.log('Oppsett:');
sjekk('feil registreringskode avvises', (await leder('POST', '/registrer', { kode: 'feil', navn: 'X', epost: 'x@x.no', passord: 'langt-passord-1' })).status === 403);
const reg = await leder('POST', '/registrer', { kode: KODE, navn: 'Prosjektleder', epost: 'pl@test.no', passord: 'test-passord-1234', firmanavn: 'Testbygg AS' });
sjekk('prosjektleder registreres', reg.status === 200, JSON.stringify(reg.data));
sjekk('ny registrering er stengt', (await klient()('POST', '/registrer', { kode: KODE, navn: 'Y', epost: 'y@y.no', passord: 'langt-passord-1' })).status === 403);
sjekk('CSRF: uten egen header avvises', (await leder('POST', '/prosjekter', { navn: 'x' }, { 'X-FD': '0' })).status === 403);

const p = (await leder('POST', '/prosjekter', { navn: 'Eksempelveien 12', start: '2026-10-26', innflytting: '2026-11-13', sluttfrist: '2026-11-27', kunde_navn: 'Familien Test' })).data;
const annet = (await leder('POST', '/prosjekter', { navn: 'Annet prosjekt', start: '2026-10-01' })).data;
sjekk('prosjekt opprettes med kundelenke', p.id && p.kunde_token?.length > 20);

const el = (await leder('POST', '/personer', { navn: 'Elektrikeren', firma: 'Elfirma AS', fag: 'Elektro', rolle: 'leverandor' })).data;
sjekk('leverandør får personlig lenke', el.nokkel?.length > 20);

const imp = await leder('POST', `/prosjekter/${p.id}/import`, {
  oppgaver: [
    { nr: 'V001', fag: 'Elektro', tittel: 'Montering oppe', fra: '2026-11-02', til: '2026-11-06', prioritet: 'hoy' },
    { nr: 'V002', fag: 'Maler', tittel: 'Tak TV-stue', fra: '2026-11-10', til: '2026-11-12', prioritet: 'kritisk' },
    { nr: 'V003', fag: 'Bico', tittel: 'Fase 1', fra: '2026-11-02', til: '2026-11-06', prioritet: 'tentativ', kunde_styrt: true },
    { nr: 'V004', fag: 'Malco', tittel: 'Belegg', fra: '2026-10-23', til: '2026-10-23', ferdig: true },
  ],
  milepaeler: [{ dato: '2026-11-13', navn: 'Innflytting', type: 'innflytting' }],
});
sjekk('import av plan', imp.data?.oppgaver === 4 && imp.data?.milepaeler === 1, JSON.stringify(imp.data));
await leder('POST', `/prosjekter/${annet.id}/oppgaver`, { fag: 'Elektro', tittel: 'Annet elarbeid', fra: '2026-10-05', til: '2026-10-07' });
const full = (await leder('GET', `/prosjekter/${p.id}`)).data;
const [oEl, oMal, oBico, oMalco] = full.oppgaver;
sjekk('importert elektro-oppgave får elektrikeren som ansvarlig', oEl.ansvarlig_id === el.id);
sjekk('ferdig fra Excel blir godkjent', Boolean(oMalco.godkjent));
sjekk('til-dato før fra-dato avvises', (await leder('PUT', `/oppgaver/${oEl.id}`, { fra: '2026-11-10', til: '2026-11-01' })).status === 400);

console.log('Leverandør:');
const lev = klient();
const inn = await lev('GET', `/inn/${el.nokkel}`);
sjekk('lenken logger inn og sender til «mine»', inn.status === 302 && inn.headers.get('location') === '/app#/mine');
const mine = (await lev('GET', '/mine')).data;
sjekk('ser egne oppgaver i begge prosjekter', mine.oppgaver.length === 2 && mine.oppgaver.every((o) => o.fag === 'Elektro'), JSON.stringify(mine.oppgaver.map((o) => o.tittel)));
sjekk('ser ikke prosjektlederens prosjektliste', (await lev('GET', '/prosjekter')).status === 403);
sjekk('kan ikke hente hele prosjektet', (await lev('GET', `/prosjekter/${p.id}`)).status === 403);
sjekk('kan ikke godkjenne', (await lev('POST', `/oppgaver/${oEl.id}/godkjenn`, {})).status === 403);
sjekk('kan ikke melde ferdig på annet fag', (await lev('POST', `/oppgaver/${oMal.id}/meld`, {})).status === 403);
sjekk('kan melde ferdig på egen oppgave', (await lev('POST', `/oppgaver/${oEl.id}/meld`, {})).data?.ferdig_meldt);
sjekk('kan kommentere egen oppgave', (await lev('POST', `/oppgaver/${oEl.id}/kommentarer`, { tekst: 'Ferdig, se bilde' })).status === 200);
sjekk('kan ikke lese kommentarer på annet fag', (await lev('GET', `/oppgaver/${oMal.id}/kommentarer`)).status === 403);
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const bilde = await lev('POST', '/vedlegg', png, { 'Content-Type': 'image/png', 'X-Prosjekt': String(p.id) });
sjekk('kan laste opp bilde i eget prosjekt', bilde.status === 200, JSON.stringify(bilde.data));
const falsk = await lev('POST', '/vedlegg', new TextEncoder().encode('<script>'), { 'Content-Type': 'image/png', 'X-Prosjekt': String(p.id) });
sjekk('falsk bildefil avvises', falsk.status === 400);

console.log('Prosjektleder godkjenner:');
const etter = (await leder('GET', `/prosjekter/${p.id}`)).data.oppgaver.find((o) => o.id === oEl.id);
sjekk('prosjektleder ser «meldt ferdig»', Boolean(etter.ferdig_meldt) && !etter.godkjent);
sjekk('avvisning krever begrunnelse', (await leder('POST', `/oppgaver/${oEl.id}/avvis`, {})).status === 400);
await leder('POST', `/oppgaver/${oEl.id}/avvis`, { grunn: 'Mangler deksel på stikk i gang' });
const komm = (await lev('GET', `/oppgaver/${oEl.id}/kommentarer`)).data;
sjekk('leverandøren ser hvorfor oppgaven ble sendt tilbake', komm.some((k) => k.tekst.includes('Mangler deksel')));
await lev('POST', `/oppgaver/${oEl.id}/meld`, {});
sjekk('godkjenning', Boolean((await leder('POST', `/oppgaver/${oEl.id}/godkjenn`, {})).data?.godkjent));
sjekk('leverandør kan ikke angre etter godkjenning', (await lev('POST', `/oppgaver/${oEl.id}/meld`, { ferdig: false })).status === 400);

console.log('Kundeside:');
const kunde = klient();
await leder('POST', `/prosjekter/${p.id}/beslutninger`, { sporsmal: 'Farge på epoksyfuger', alternativer: ['Grå', 'Sort'] });
const oppd = await leder('POST', `/prosjekter/${p.id}/oppdateringer`, { tittel: 'Uke 45', tekst: 'Flisene er lagt.', bilder: [bilde.data.id] });
sjekk('oppdatering med bilde', oppd.status === 200);
const side = (await kunde('GET', `/k/${p.kunde_token}`)).data;
sjekk('kundesiden viser fremdrift', side?.fremdrift?.total === 4 && side.fremdrift.ferdig === 2, JSON.stringify(side?.fremdrift));
sjekk('kundesiden viser ikke interne felt', !JSON.stringify(side).includes('ansvarlig') && !JSON.stringify(side).includes('kunde_token'));
sjekk('kunden har egne leveranser', side.egne.length === 1 && side.egne[0].tittel === 'Fase 1');
sjekk('ugyldig kundelenke', (await kunde('GET', '/k/finnes-ikke-xxxxxxxxxxxxxxxxxxxx')).status === 404);
const b = side.beslutninger[0];
sjekk('svar utenfor alternativene avvises', (await kunde('POST', `/k/${p.kunde_token}/beslutninger/${b.id}`, { svar: 'Rosa' })).status === 400);
sjekk('kunden svarer', (await kunde('POST', `/k/${p.kunde_token}/beslutninger/${b.id}`, { svar: 'Grå', kommentar: 'Lys grå' })).status === 200);
sjekk('kan ikke svare to ganger', (await kunde('POST', `/k/${p.kunde_token}/beslutninger/${b.id}`, { svar: 'Sort' })).status === 400);
sjekk('kunden flytter egen leveranse', (await kunde('PUT', `/k/${p.kunde_token}/oppgaver/${oBico.id}`, { fra: '2026-11-03', til: '2026-11-07', levert: true })).data?.levert === true);
sjekk('kunden kan ikke endre andres oppgaver', (await kunde('PUT', `/k/${p.kunde_token}/oppgaver/${oMal.id}`, { til: '2026-12-01' })).status === 404);
sjekk('kunden henter publisert bilde', (await fetch(`${BASE}/api/k/${p.kunde_token}/fil/${bilde.data.id}`)).status === 200);
const annetBilde = await leder('POST', '/vedlegg', png, { 'Content-Type': 'image/png', 'X-Prosjekt': String(p.id) });
sjekk('kunden får ikke upubliserte bilder', (await fetch(`${BASE}/api/k/${p.kunde_token}/fil/${annetBilde.data.id}`)).status === 404);
sjekk('kunden kommer ikke inn i API-et ellers', (await kunde('GET', `/prosjekter/${p.id}`)).status === 401);
const nyLenke = (await leder('POST', `/prosjekter/${p.id}/kundelenke`)).data;
sjekk('gammel kundelenke slutter å virke', (await kunde('GET', `/k/${p.kunde_token}`)).status === 404 && nyLenke.kunde_token !== p.kunde_token);

console.log('Personer:');
const nyLev = (await leder('POST', `/personer/${el.id}/lenke`)).data;
sjekk('ny lenke logger ut den gamle økten', (await lev('GET', '/mine')).status === 401);
sjekk('gammel lenke virker ikke', (await klient()('GET', `/inn/${el.nokkel}`)).headers.get('location') === '/app#/ugyldig-lenke');
const lev2 = klient();
sjekk('ny lenke virker', (await lev2('GET', `/inn/${nyLev.nokkel}`)).headers.get('location') === '/app#/mine');

console.log('Varsler og uleste meldinger:');
const v1 = (await leder('GET', '/varsler')).data;
sjekk('prosjektleder får varsel om meldt ferdig', v1.some((v) => v.type === 'meldt' && v.oppgave_id === oEl.id), JSON.stringify(v1.map((v) => v.type)));
sjekk('prosjektleder får varsel om melding fra leverandør', v1.some((v) => v.type === 'kommentar'));
sjekk('prosjektleder får varsel om kundesvar', v1.some((v) => v.type === 'kundesvar'));
sjekk('prosjektleder får varsel når kunden flytter leveranse', v1.some((v) => v.type === 'kunde'));
sjekk('egne handlinger gir ikke varsel', !v1.some((v) => v.hvem === 'Prosjektleder'));
sjekk('teller viser uleste', (await leder('GET', '/varsler/antall')).data.uleste > 0);
await leder('POST', '/varsler/sett');
sjekk('teller nullstilles når listen er sett', (await leder('GET', '/varsler/antall')).data.uleste === 0);
sjekk('leverandør får ikke se varsler', (await lev2('GET', '/varsler')).status === 403);
await leder('POST', `/oppgaver/${oEl.id}/kommentarer`, { tekst: 'Fint arbeid!' });
const mine2 = (await lev2('GET', '/mine')).data.oppgaver.find((o) => o.id === oEl.id);
sjekk('leverandøren ser ulest melding', mine2.uleste === 1, JSON.stringify(mine2));
await lev2('GET', `/oppgaver/${oEl.id}/kommentarer`);
sjekk('meldingen er lest etter at tråden er åpnet', (await lev2('GET', '/mine')).data.oppgaver.find((o) => o.id === oEl.id).uleste === 0);

console.log('Forskyv planen:');
const forFlytt = (await leder('GET', `/prosjekter/${p.id}`)).data.oppgaver;
const mal = forFlytt.find((o) => o.nr === 'V002');
const r1 = await leder('POST', `/prosjekter/${p.id}/forskyv`, { fag: 'Maler', fra: '2026-11-01', dager: 2 });
sjekk('forskyver bare valgt fag', r1.data?.flyttet === 1, JSON.stringify(r1.data));
const etterFlytt = (await leder('GET', `/prosjekter/${p.id}`)).data.oppgaver.find((o) => o.id === mal.id);
sjekk('tirsdag–torsdag + 2 arbeidsdager = torsdag–mandag', etterFlytt.fra === '2026-11-12' && etterFlytt.til === '2026-11-16', `${etterFlytt.fra} ${etterFlytt.til}`);
const godkjent = forFlytt.find((o) => o.id === oEl.id);
await leder('POST', `/prosjekter/${p.id}/forskyv`, { fra: '2026-10-01', dager: 3 });
sjekk('godkjente oppgaver flyttes ikke', (await leder('GET', `/prosjekter/${p.id}`)).data.oppgaver.find((o) => o.id === oEl.id).fra === godkjent.fra);
sjekk('0 dager avvises', (await leder('POST', `/prosjekter/${p.id}/forskyv`, { fra: '2026-10-01', dager: 0 })).status === 400);
sjekk('leverandør kan ikke forskyve', (await lev2('POST', `/prosjekter/${p.id}/forskyv`, { fra: '2026-10-01', dager: 1 })).status === 403);

console.log('Kalenderabonnement:');
const hentIcs = (adr) => fetch(adr.replace(/^https?:\/\/[^/]+/, BASE)).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), tekst: await r.text() }));
sjekk('kalenderen er av fra start', (await lev2('GET', '/mine/kalender')).data?.aktiv === false);
sjekk('uten innlogging kan ingen lage kalender', (await klient()('POST', '/mine/kalender')).status === 401);
sjekk('prosjektleder bruker planen, ikke kalenderen', (await leder('POST', '/mine/kalender')).status === 400);
const kal = (await lev2('POST', '/mine/kalender')).data;
sjekk('leverandør får kalenderadresse', /\/api\/kalender\/[\w-]{20,}\.ics$/.test(kal?.adresse || ''), JSON.stringify(kal));
sjekk('status viser at kalenderen er på', (await lev2('GET', '/mine/kalender')).data?.aktiv === true);
const ics = await hentIcs(kal.adresse);
sjekk('kalenderen hentes uten innlogging', ics.status === 200 && ics.type.startsWith('text/calendar'), `${ics.status} ${ics.type}`);
sjekk('gyldig kalenderfil med CRLF', ics.tekst.startsWith('BEGIN:VCALENDAR\r\n') && ics.tekst.trimEnd().endsWith('END:VCALENDAR'));
sjekk('egne oppgaver i begge prosjekter er med', ics.tekst.includes('Montering oppe') && ics.tekst.includes('Annet elarbeid'));
sjekk('heldagshendelse med riktig sluttdag', ics.tekst.includes('DTSTART;VALUE=DATE:20261102') && ics.tekst.includes('DTEND;VALUE=DATE:20261107'));
sjekk('andres oppgaver er ikke med', !ics.tekst.includes('Tak TV-stue') && !ics.tekst.includes('Fase 1'));
sjekk('viktige datoer er med', ics.tekst.includes('Innflytting'));
sjekk('ingen linje over 75 byte', ics.tekst.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
sjekk('ugyldig kalenderadresse', (await fetch(`${BASE}/api/kalender/finnes-ikke-xxxxxxxxxxxxxxxxxxxx.ics`)).status === 404);
const kal2 = (await lev2('POST', '/mine/kalender')).data;
sjekk('ny kalenderadresse stenger den gamle', (await hentIcs(kal.adresse)).status === 404 && (await hentIcs(kal2.adresse)).status === 200);
await lev2('DELETE', '/mine/kalender');
sjekk('kalenderen kan slås av', (await hentIcs(kal2.adresse)).status === 404);
const kal3 = (await lev2('POST', '/mine/kalender')).data;

console.log('Mangelliste:');
const m1 = await leder('POST', `/prosjekter/${p.id}/mangler`, { tittel: 'Stikk uten deksel', rom: 'Gang', fag: 'Elektro', frist: '2026-11-20' });
sjekk('prosjektleder registrerer mangel', m1.status === 200 && m1.data.fag === 'Elektro', JSON.stringify(m1.data));
const m2 = (await leder('POST', `/prosjekter/${p.id}/mangler`, { tittel: 'Malingsflekk på list', oppgave_id: oMal.id, synlig_for_kunde: false })).data;
sjekk('mangel koblet til oppgave arver faget', m2.fag === 'Maler');
const fremmed = await leder('POST', `/prosjekter/${annet.id}/mangler`, { tittel: 'Feil', oppgave_id: oMal.id });
sjekk('oppgave fra annet prosjekt avvises', fremmed.status === 400);
sjekk('mangel uten tittel avvises', (await leder('POST', `/prosjekter/${p.id}/mangler`, { rom: 'Bad' })).status === 400);
sjekk('prosjektet viser manglene', (await leder('GET', `/prosjekter/${p.id}`)).data.mangler?.length === 2);
sjekk('leverandør kan ikke registrere mangel', (await lev2('POST', `/prosjekter/${p.id}/mangler`, { tittel: 'x', fag: 'Elektro' })).status === 403);
const mineM = (await lev2('GET', '/mine/mangler')).data;
sjekk('leverandør ser bare mangler i eget fag', mineM.length === 1 && mineM[0].id === m1.data.id, JSON.stringify(mineM));
sjekk('leverandør kan ikke melde annet fags mangel', (await lev2('POST', `/mangler/${m2.id}/utbedret`, {})).status === 403);
sjekk('leverandør kan ikke godkjenne mangel', (await lev2('POST', `/mangler/${m1.data.id}/godkjenn`, {})).status === 403);
const utb = await lev2('POST', `/mangler/${m1.data.id}/utbedret`, { kommentar: 'Deksel satt på' });
sjekk('leverandør melder utbedret', Boolean(utb.data?.utbedret), JSON.stringify(utb.data));
sjekk('prosjektleder får varsel om utbedret mangel', (await leder('GET', '/varsler')).data.some((v) => v.type === 'mangel'));
sjekk('tilbakesending krever begrunnelse', (await leder('POST', `/mangler/${m1.data.id}/avvis`, {})).status === 400);
await leder('POST', `/mangler/${m1.data.id}/avvis`, { grunn: 'Feil farge på deksel' });
const etterAvvis = (await lev2('GET', '/mine/mangler')).data[0];
sjekk('leverandøren ser hvorfor mangelen kom tilbake', !etterAvvis.utbedret && etterAvvis.avvist_grunn === 'Feil farge på deksel');
await lev2('POST', `/mangler/${m1.data.id}/utbedret`, {});
sjekk('prosjektleder godkjenner utbedring', Boolean((await leder('POST', `/mangler/${m1.data.id}/godkjenn`, {})).data?.godkjent));
sjekk('leverandør kan ikke angre godkjent utbedring', (await lev2('POST', `/mangler/${m1.data.id}/utbedret`, { utbedret: false })).status === 400);
const kundeM = (await kunde('GET', `/k/${nyLenke.kunde_token}`)).data.mangler;
sjekk('kunden ser synlige mangler med status', kundeM.length === 1 && kundeM[0].utbedret === true && kundeM[0].rom === 'Gang', JSON.stringify(kundeM));
sjekk('kunden ser ikke frist eller ansvarlig på mangler', !JSON.stringify(kundeM).includes('frist') && !JSON.stringify(kundeM).includes('ansvarlig'));
sjekk('mangel kan slettes', (await leder('DELETE', `/mangler/${m2.id}`)).status === 200 && (await leder('GET', `/prosjekter/${p.id}`)).data.mangler.length === 1);

console.log('Dagbok:');
const dbBilde = (await leder('POST', '/vedlegg', png, { 'Content-Type': 'image/png', 'X-Prosjekt': String(p.id) })).data;
const fremmedBilde = (await leder('POST', '/vedlegg', png, { 'Content-Type': 'image/png', 'X-Prosjekt': String(annet.id) })).data;
sjekk('tom dagbokside avvises', (await leder('PUT', `/prosjekter/${p.id}/dagbok/2026-11-03`, {})).status === 400);
const db1 = await leder('PUT', `/prosjekter/${p.id}/dagbok/2026-11-03`, {
  vaer: 'regn', temperatur: 4, notat: 'Elektro trakk kabler i 2. etg.', avvik: 'Leveranse av sparkel forsinket',
  bemanning: [{ fag: 'Elektro', antall: 2 }, { fag: 'Maler', antall: 0 }, { fag: '', antall: 3 }], bilder: [dbBilde.id],
});
sjekk('prosjektleder skriver i dagboken', db1.status === 200 && db1.data.vaer === 'regn' && db1.data.temperatur === 4, JSON.stringify(db1.data));
sjekk('bemanning uten fag eller antall tas ikke med', db1.data.bemanning.length === 1 && db1.data.bemanning[0].antall === 2);
sjekk('ugyldig vær avvises', (await leder('PUT', `/prosjekter/${p.id}/dagbok/2026-11-03`, { vaer: 'tornado', notat: 'x' })).status === 400);
sjekk('urimelig temperatur avvises', (await leder('PUT', `/prosjekter/${p.id}/dagbok/2026-11-03`, { temperatur: 90, notat: 'x' })).status === 400);
sjekk('bilde fra annet prosjekt avvises', (await leder('PUT', `/prosjekter/${p.id}/dagbok/2026-11-03`, { notat: 'x', bilder: [fremmedBilde.id] })).status === 400);
const db2 = await leder('PUT', `/prosjekter/${p.id}/dagbok/2026-11-03`, { ...db1.data, notat: 'Elektro trakk kabler i 2. etg. og monterte bokser.' });
sjekk('samme dag oppdateres i stedet for å dobles', db2.status === 200 && (await leder('GET', `/prosjekter/${p.id}/dagbok`)).data.length === 1);
sjekk('leverandør ser ikke dagboken', (await lev2('GET', `/prosjekter/${p.id}/dagbok`)).status === 403);
sjekk('leverandør kan ikke skrive i dagboken', (await lev2('PUT', `/prosjekter/${p.id}/dagbok/2026-11-04`, { notat: 'x' })).status === 403);
const kundeFor = (await kunde('GET', `/k/${nyLenke.kunde_token}`)).data;
sjekk('dagboken er ikke på kundesiden', !JSON.stringify(kundeFor).includes('sparkel') && !JSON.stringify(kundeFor).includes('monterte bokser'));
const delt = await leder('POST', `/prosjekter/${p.id}/dagbok/2026-11-03/del`, { tittel: 'Tirsdag i 2. etasje' });
sjekk('dagen deles som oppdatering', delt.status === 200 && delt.data.tekst.includes('monterte bokser') && delt.data.bilder.includes(dbBilde.id), JSON.stringify(delt.data));
const kundeEtter = (await kunde('GET', `/k/${nyLenke.kunde_token}`)).data;
sjekk('kunden ser den delte dagen uten avvik', JSON.stringify(kundeEtter.oppdateringer).includes('Tirsdag i 2. etasje') && !JSON.stringify(kundeEtter).includes('sparkel'));
sjekk('kunden får bildet fra den delte dagen', (await fetch(`${BASE}/api/k/${nyLenke.kunde_token}/fil/${dbBilde.id}`)).status === 200);
sjekk('samme dag kan ikke deles to ganger', (await leder('POST', `/prosjekter/${p.id}/dagbok/2026-11-03/del`, {})).status === 400);
sjekk('dagboksiden kan slettes', (await leder('DELETE', `/prosjekter/${p.id}/dagbok/2026-11-03`)).status === 200 && (await leder('GET', `/prosjekter/${p.id}/dagbok`)).data.length === 0);

console.log('Forside og app:');
const forside = await fetch(`${BASE}/`).then(async (r) => ({ status: r.status, tekst: await r.text() }));
sjekk('forsiden ligger på /', forside.status === 200 && forside.tekst.includes('id="demo-skjema"'));
const appSide = await fetch(`${BASE}/app`).then(async (r) => ({ status: r.status, tekst: await r.text() }));
sjekk('appen ligger på /app', appSide.status === 200 && appSide.tekst.includes('/js/app.js'));
sjekk('forsiden sender gamle #/-lenker videre til appen', (await fetch(`${BASE}/forside.js`).then((r) => r.text())).includes('location.replace(`/app${location.hash}`)'));

console.log('Be om demo:');
const besok = klient();
sjekk('demo uten e-post avvises', (await besok('POST', '/demo', { navn: 'Kari', firma: 'Bygg AS' })).status === 400);
sjekk('demo uten egen header avvises', (await besok('POST', '/demo', { navn: 'Kari', firma: 'Bygg AS', epost: 'kari@bygg.no' }, { 'X-FD': '0' })).status === 403);
sjekk('demo lagres', (await besok('POST', '/demo', { navn: 'Kari Nordmann', firma: 'Bygg AS', epost: 'kari@bygg.no', tekst: 'Vi har 6 prosjekter.' })).data?.ok === true);
await besok('POST', '/demo', { navn: 'Robot', firma: 'Spam', epost: 'spam@spam.no', nettside: 'http://spam' });
for (let i = 0; i < 4; i++) await besok('POST', '/demo', { navn: `Test ${i}`, firma: 'Bygg AS', epost: 'kari@bygg.no' });
sjekk('for mange demoforespørsler fra samme avsender stoppes', (await besok('POST', '/demo', { navn: 'Igjen', firma: 'Bygg AS', epost: 'kari@bygg.no' })).status === 429);

console.log('Meld feil:');
sjekk('uten innlogging kan man ikke melde feil', (await klient()('POST', '/feilmelding', { tekst: 'Det virker ikke' })).status === 401);
sjekk('for kort feilmelding avvises', (await leder('POST', '/feilmelding', { tekst: 'hm' })).status === 400);
sjekk('prosjektleder melder feil', (await leder('POST', '/feilmelding', { tekst: 'Gantt hopper når jeg drar', side: '#/p/1/plan', nettleser: 'Test' })).data?.ok === true);
sjekk('leverandør melder feil', (await lev2('POST', '/feilmelding', { tekst: 'Bildet lastet ikke opp', side: 'https://ondsinnet.no' })).data?.ok === true);
const henv = (await leder('GET', '/henvendelser')).data;
sjekk('prosjektleder ser henvendelsene', henv.rader.filter((r) => r.type === 'demo').length === 5 && henv.rader.filter((r) => r.type === 'feil').length === 2, JSON.stringify(henv.rader.map((r) => r.type)));
sjekk('roboten ble ikke lagret', !henv.rader.some((r) => r.navn === 'Robot'));
sjekk('feilmeldingen har med hvem og hvor', henv.rader.some((r) => r.type === 'feil' && r.navn === 'Prosjektleder' && r.side === '#/p/1/plan'));
sjekk('fremmed adresse lagres ikke som side', henv.rader.some((r) => r.tekst === 'Bildet lastet ikke opp' && r.side === null));
sjekk('IP-adressen sendes ikke til nettleseren', !JSON.stringify(henv).includes('ip_hash'));
sjekk('leverandør ser ikke henvendelsene', (await lev2('GET', '/henvendelser')).status === 403);
const forste = henv.rader[0];
sjekk('henvendelse merkes som behandlet', Boolean((await leder('POST', `/henvendelser/${forste.id}/behandlet`, {})).data?.behandlet));

console.log('Hele planen for fagene:');
const lev3 = lev2;
await leder('PUT', `/oppgaver/${oMal.id}`, { merknad: 'Intern: maler er dyr, pass på timene' });
const fp = await lev3('GET', `/mine/prosjekter/${p.id}/plan`);
sjekk('leverandør ser hele planen i eget prosjekt', fp.status === 200 && fp.data.oppgaver.some((o) => o.fag === 'Maler') && fp.data.oppgaver.some((o) => o.min), JSON.stringify(fp.data?.oppgaver?.map((o) => o.fag)));
sjekk('egne oppgaver er merket', fp.data.oppgaver.filter((o) => o.min).every((o) => o.fag === 'Elektro'));
sjekk('andres merknad vises ikke', !JSON.stringify(fp.data).includes('maler er dyr'));
sjekk('ansvarlig og beskrivelse er ikke med', fp.data.oppgaver.every((o) => !('ansvarlig_id' in o) && !('beskrivelse' in o)));
sjekk('milepælene er med', fp.data.milepaeler.some((m) => m.navn === 'Innflytting'));
sjekk('kundelenken er ikke med', !JSON.stringify(fp.data).includes('kunde_token') && !('kunde_navn' in fp.data.prosjekt));
const utenfor = (await leder('POST', '/prosjekter', { navn: 'Prosjekt uten elektro', start: '2026-10-01' })).data;
await leder('POST', `/prosjekter/${utenfor.id}/oppgaver`, { fag: 'Maler', tittel: 'Male', fra: '2026-10-05', til: '2026-10-07' });
sjekk('leverandør ser ikke planen i prosjekter hen ikke er med i', (await lev3('GET', `/mine/prosjekter/${utenfor.id}/plan`)).status === 404);
sjekk('/mine sier at planen er delt', (await lev3('GET', '/mine')).data.prosjekter.find((x) => x.id === p.id)?.plan_for_fag === true);
await leder('PUT', `/prosjekter/${p.id}`, { plan_for_fag: false });
sjekk('prosjektleder kan slå av delingen', (await lev3('GET', `/mine/prosjekter/${p.id}/plan`)).status === 403);
await leder('PUT', `/prosjekter/${p.id}`, { plan_for_fag: true });
sjekk('leverandør kan fortsatt ikke hente hele prosjektet', (await lev3('GET', `/prosjekter/${p.id}`)).status === 403);
sjekk('uten innlogging får man ikke planen', (await klient()('GET', `/mine/prosjekter/${p.id}/plan`)).status === 401);

console.log('App på hjemskjermen:');
const man = await fetch(`${BASE}/api/manifest`).then((r) => r.json());
sjekk('manifest uten innlogging starter i appen', man.start_url === '/app');
const levMan = (await lev2('GET', '/manifest')).data;
sjekk('leverandør får egen startadresse', /^\/api\/inn\//.test(levMan.start_url), levMan.start_url);
sjekk('samme startadresse ved neste henting', (await lev2('GET', '/manifest')).data.start_url === levMan.start_url);
const app = await klient()('GET', levMan.start_url.replace('/api', ''));
sjekk('startadressen logger inn', app.headers.get('location') === '/app#/mine');
await leder('POST', `/personer/${el.id}/lenke`);
sjekk('ny lenke stenger også appens startadresse', (await klient()('GET', levMan.start_url.replace('/api', ''))).headers.get('location') === '/app#/ugyldig-lenke');
sjekk('ny lenke stopper også kalenderen', (await hentIcs(kal3.adresse)).status === 404);

console.log(`\n${ok} bestått, ${feil} feilet`);
process.exit(feil ? 1 : 0);
