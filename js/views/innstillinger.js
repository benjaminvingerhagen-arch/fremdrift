import { api } from '../api.js';
import { html, icon, $, $$, attempt, formData, toast } from '../ui.js';
import { store } from '../store.js';
import { tegnMeny } from '../app.js';
import { NAVN } from '/shared/merke.js';

export { meldFeil } from '../meldfeil.js';

// Innstillinger: det som gjelder kontoen og firmaet, ikke ett bestemt prosjekt.
// Prosjektets egne innstillinger ligger fortsatt på prosjektet.

const FANER = [
  ['profil', 'Min profil', 'users'],
  ['firma', 'Firma', 'home'],
  ['henvendelser', 'Henvendelser', 'inbox'],
];

export async function innstillingerView(el, fane = 'profil', erAktuell = () => true) {
  fane ||= 'profil';
  document.title = `Innstillinger · ${NAVN}`;
  el.innerHTML = html`
    <div class="topp"><div class="tittel"><div class="over">${store.firma || NAVN}</div><h1>Innstillinger</h1></div></div>
    <nav class="faner">${FANER.map(
      ([k, navn, ik]) => html`<a href="#/innstillinger${k === 'profil' ? '' : `/${k}`}" class="${fane === k ? 'aktiv' : ''}">${icon(ik)} ${navn}</a>`,
    )}</nav>
    <section id="fane"><p class="muted">Laster …</p></section>`.toString();
  const f = $('#fane', el);
  if (fane === 'firma') return firmaFane(f);
  if (fane === 'henvendelser') return henvendelserFane(f, erAktuell);
  return profilFane(f, erAktuell);
}

async function profilFane(el, erAktuell) {
  const folk = await api.get('/personer');
  if (!erAktuell()) return;
  const meg = folk.find((p) => p.id === store.me.id) || store.me;
  el.innerHTML = html`<form class="kort innst-kort skjema" id="profil">
    <h2>Min profil</h2>
    <div class="rad2">
      <label class="felt"><span>Navn</span><input type="text" name="navn" value="${meg.navn || ''}" required autocomplete="name"></label>
      <label class="felt"><span>Telefon</span><input type="tel" name="telefon" value="${meg.telefon || ''}" autocomplete="tel"></label>
    </div>
    <label class="felt"><span>E-post</span><input type="email" name="epost" value="${meg.epost || ''}" required autocomplete="username"><small>Du logger inn med denne adressen.</small></label>
    <label class="avkrysning"><input type="checkbox" name="epostvarsel" ${meg.epostvarsel !== false ? 'checked' : ''}>
      <span>Varsle meg på e-post<small>Når noe meldes ferdig, fagene skriver eller kunden svarer.${store.epost ? '' : ' E-post er ikke satt opp ennå, så foreløpig kommer varslene bare i appen.'}</small></span></label>
    <label class="felt"><span>Nytt passord <small class="muted">(valgfritt)</small></span><input type="password" name="passord" minlength="10" autocomplete="new-password"><small>Minst 10 tegn. La feltet stå tomt for å beholde passordet.</small></label>
    <div class="knapperad"><span class="spacer"></span><button class="knapp primar">Lagre</button></div>
  </form>`.toString();
  $('#profil', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (!d.passord) delete d.passord;
    if (await attempt(() => api.put(`/personer/${meg.id}`, d), d.passord ? 'Lagret – passordet er byttet' : 'Lagret')) {
      Object.assign(store.me, { navn: d.navn, epost: d.epost, telefon: d.telefon });
      e.target.elements.passord.value = '';
      tegnMeny();
    }
  });
}

function firmaFane(el) {
  el.innerHTML = html`<form class="kort innst-kort skjema" id="firma">
    <h2>Firma</h2>
    <label class="felt"><span>Firmanavn</span><input type="text" name="firmanavn" value="${store.firma || ''}" maxlength="100">
      <small>Vises i menyen, på sidene til fagene, på kundesiden og i e-post.</small></label>
    <div class="knapperad"><span class="spacer"></span><button class="knapp primar">Lagre</button></div>
  </form>
  <div class="kort innst-kort">
    <h2>E-post</h2>
    <p class="small">${store.epost
      ? html`${icon('checkCircle')} E-post er satt opp. Varsler sendes til dem som har slått det på.`
      : html`E-post er ikke satt opp ennå. Varslene kommer i appen, men ikke på e-post. Legg inn <span class="mono">RESEND</span> og <span class="mono">MAIL_FROM</span> i Vercel for å slå det på.`}</p>
  </div>`.toString();
  $('#firma', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await attempt(() => api.put('/innstillinger', formData(e.target)), 'Lagret');
    if (r) {
      store.firma = r.firma;
      tegnMeny();
    }
  });
}

async function henvendelserFane(el, erAktuell) {
  const { rader, epost } = await api.get('/henvendelser');
  if (!erAktuell()) return;
  const tid = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
  const apne = rader.filter((r) => !r.behandlet).length;
  const rad = (r) => html`<li class="henv ${r.behandlet ? 'behandlet' : ''}">
    <div class="henv-topp">
      <span class="chip ${r.type === 'demo' ? 'aktiv' : 'varsel'}">${r.type === 'demo' ? 'Ønsker demo' : 'Feilmelding'}</span>
      <strong>${r.navn || 'Ukjent'}${r.firma ? html` <span class="muted">· ${r.firma}</span>` : ''}</strong>
      <span class="muted small">${tid.format(new Date(r.opprettet))}</span>
    </div>
    ${r.tekst ? html`<p class="pre">${r.tekst}</p>` : ''}
    <div class="meta small muted">
      ${r.epost ? html`<a href="mailto:${r.epost}">${icon('message')} ${r.epost}</a>` : ''}
      ${r.telefon ? html`<a href="tel:${r.telefon}">${icon('phone')} ${r.telefon}</a>` : ''}
      ${r.side ? html`<span class="mono">${r.side}</span>` : ''}
      ${r.nettleser ? html`<span title="${r.nettleser}">${kortNettleser(r.nettleser)}</span>` : ''}
      ${r.sendt ? html`<span>${icon('check')} Sendt på e-post</span>` : ''}
    </div>
    <button class="knapp liten ${r.behandlet ? 'lys' : ''}" data-behandlet="${r.id}" data-verdi="${r.behandlet ? '0' : '1'}">
      ${r.behandlet ? html`${icon('undo')} Åpne igjen` : html`${icon('check')} Ferdig behandlet`}</button>
  </li>`;
  el.innerHTML = html`
    <p class="muted small innst-hjelp">Forespørsler om demo fra forsiden og feil som er meldt fra appen. ${
      epost.kontakt && epost.feil && store.epost
        ? 'De sendes også på e-post.'
        : html`De sendes ikke på e-post ennå: legg inn <span class="mono">KONTAKT_EPOST</span> og <span class="mono">FEILMELDING_EPOST</span> i Vercel${store.epost ? '' : html`, og slå på e-post med <span class="mono">RESEND</span> og <span class="mono">MAIL_FROM</span>`}.`
    }</p>
    ${rader.length
      ? html`<div class="gruppe-tittel">${icon('inbox')} Ikke behandlet <span class="mono">${apne}</span></div>
          <ul class="kort henvliste">${rader.map(rad)}</ul>`
      : html`<div class="kort tom">${icon('inbox')} Ingen henvendelser ennå.</div>`}`.toString();
  $$('[data-behandlet]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      if (await attempt(() => api.post(`/henvendelser/${b.dataset.behandlet}/behandlet`, { behandlet: b.dataset.verdi === '1' }))) henvendelserFane(el, erAktuell);
    }),
  );
}

function kortNettleser(ua) {
  const s = String(ua);
  const enhet = /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Mac OS X/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : '';
  const leser = /Edg\//.test(s) ? 'Edge' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /FxiOS|Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : '';
  return [leser, enhet].filter(Boolean).join(' på ') || 'Nettleser';
}
