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

const p = (await leder('POST', '/prosjekter', { navn: 'Vavikbakken 24', start: '2026-10-26', innflytting: '2026-11-13', sluttfrist: '2026-11-27', kunde_navn: 'Familien Test' })).data;
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
sjekk('lenken logger inn og sender til «mine»', inn.status === 302 && inn.headers.get('location') === '/#/mine');
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
sjekk('gammel lenke virker ikke', (await klient()('GET', `/inn/${el.nokkel}`)).headers.get('location') === '/#/ugyldig-lenke');
sjekk('ny lenke virker', (await klient()('GET', `/inn/${nyLev.nokkel}`)).headers.get('location') === '/#/mine');

console.log(`\n${ok} bestått, ${feil} feilet`);
process.exit(feil ? 1 : 0);
