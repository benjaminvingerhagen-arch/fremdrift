import { api, setUnauthorizedHandler } from './api.js';
import { html, icon, LOGO, $, $$, avatar, bar, attempt, toast } from './ui.js';
import { store, lastProsjekter } from './store.js';
import { prosjekterView } from './views/prosjekter.js';
import { prosjektView } from './views/prosjekt.js';
import { personerView } from './views/personer.js';
import { mineApp } from './views/mine.js';

const root = document.getElementById('app');

const ROUTES = [
  [/^\/$/, prosjekterView],
  [/^\/p\/(\d+)(?:\/(plan|sjekkpunkter|kunde|logg|innstillinger))?$/, prosjektView],
  [/^\/personer$/, personerView],
];

function sti() {
  return location.hash.replace(/^#/, '').split('?')[0] || '/';
}

async function boot() {
  let me;
  try {
    me = await api.get('/me');
  } catch (err) {
    root.innerHTML = html`<div class="loading">${err.message}</div>`.toString();
    return;
  }
  store.firma = me.firma;
  if (sti() === '/ugyldig-lenke' && !me.user) return renderUgyldig();
  if (!me.user) return renderLogin(me.registrering);
  store.me = me.user;
  if (me.user.rolle !== 'leder') {
    if (sti() !== '/mine') history.replaceState(null, '', '#/mine');
    return mineApp(root);
  }
  if (sti() === '/mine' || sti() === '/ugyldig-lenke') history.replaceState(null, '', '#/');
  await lastProsjekter();
  renderSkall();
  window.addEventListener('hashchange', route);
  route();
}

setUnauthorizedHandler(() => location.reload());

// ---------- Skall med sidemeny ----------

function renderSkall() {
  root.innerHTML = html`<div class="skall">
    <aside class="sidemeny" aria-label="Hovedmeny"></aside>
    <div>
      <div class="mobil-topp">
        <button class="ikon-knapp" data-meny aria-label="Meny">${icon('menu')}</button>
        <strong>Fremdrift</strong>
      </div>
      <main class="hoved" id="hoved"></main>
    </div>
  </div>`.toString();
  $('[data-meny]').addEventListener('click', () => document.body.classList.toggle('meny-apen'));
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('meny-apen') && !e.target.closest('.sidemeny, [data-meny]')) document.body.classList.remove('meny-apen');
  });
  tegnMeny();
}

export function tegnMeny() {
  const s = sti();
  const aktive = store.prosjekter.filter((p) => !p.arkivert);
  const el = $('.sidemeny');
  if (!el) return;
  el.innerHTML = html`
    <a class="merkevare" href="#/">${LOGO}<div><strong>Fremdrift</strong><small>${store.firma || 'Prosjektstyring'}</small></div></a>
    <a class="meny-lenke ${s === '/' ? 'aktiv' : ''}" href="#/">${icon('grid')} Alle prosjekter</a>
    <a class="meny-lenke ${s === '/personer' ? 'aktiv' : ''}" href="#/personer">${icon('users')} Folk og leverandører</a>
    ${aktive.length ? html`<div class="meny-overskrift">Pågående prosjekter</div>` : ''}
    ${aktive.map((p) => {
      const pst = p.total ? Math.round((p.ferdig / p.total) * 100) : 0;
      return html`<a class="meny-lenke meny-prosjekt ${s.startsWith(`/p/${p.id}`) ? 'aktiv' : ''}" href="#/p/${p.id}">
        <span class="navn">${p.navn}</span><span class="pst">${pst}%</span>${bar(pst)}
      </a>`;
    })}
    <div class="meny-bunn">
      ${avatar(store.me.navn)}
      <div class="hvem"><strong>${store.me.navn}</strong><small>Prosjektleder</small></div>
      <button class="ikon-knapp" data-loggut title="Logg ut" aria-label="Logg ut">${icon('logout')}</button>
    </div>`.toString();
  $('[data-loggut]', el).addEventListener('click', async () => {
    await attempt(() => api.post('/loggut'));
    location.href = '/';
  });
}

let teller = 0;
async function route() {
  document.body.classList.remove('meny-apen');
  const s = sti();
  const hoved = $('#hoved');
  const min = ++teller;
  for (const [re, view] of ROUTES) {
    const m = s.match(re);
    if (!m) continue;
    tegnMeny();
    try {
      await view(hoved, ...m.slice(1), () => min === teller);
    } catch (err) {
      if (min === teller) hoved.innerHTML = html`<div class="kort tom">${icon('alert')} ${err.message}</div>`.toString();
    }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}

// ---------- Innlogging ----------

function demoGantt() {
  const rader = [
    [0, 38, '#2a6aa3'], [18, 30, '#8fb7da'], [28, 46, '#1b2b3c'], [40, 30, '#4c9a6a'], [56, 34, '#2a6aa3'], [70, 30, '#f08a4b'],
  ];
  return html`<div class="demo-gantt" aria-hidden="true">${rader.map(
    ([fra, bredde, farge]) => html`<div style="margin-left:${fra}%;width:${bredde}%;background:${farge}"></div>`,
  )}</div>`;
}

function renderLogin(registrering) {
  root.innerHTML = html`<div class="innlogging">
    <section class="venstre">
      <div class="merkevare">${LOGO}<div><strong>Fremdrift</strong><small>${store.firma || 'Prosjektstyring for bygg'}</small></div></div>
      <h1>Hele prosjektet. <em>Én plan</em> alle følger.</h1>
      <p>Fremdriftsplan, oppgaver til fagene og en egen prosjektside for kunden – oppdatert i det øyeblikket noe blir ferdig.</p>
      ${demoGantt()}
    </section>
    <section class="hoyre">
      ${
        registrering
          ? html`<form id="skjema" class="skjema" autocomplete="on">
              <div><h2>Sett opp Fremdrift</h2><p class="muted" style="margin-top:6px">Du blir prosjektleder. Ansatte og leverandører legger du inn etterpå.</p></div>
              <label class="felt"><span>Firmanavn</span><input type="text" name="firmanavn" required></label>
              <label class="felt"><span>Ditt navn</span><input type="text" name="navn" required autocomplete="name"></label>
              <label class="felt"><span>E-post</span><input type="email" name="epost" required autocomplete="username"></label>
              <label class="felt"><span>Passord</span><input type="password" name="passord" required minlength="10" autocomplete="new-password"><small>Minst 10 tegn.</small></label>
              <label class="felt"><span>Registreringskode</span><input type="text" name="kode" required><small>Står i miljøvariabelen REGISTRERINGSKODE i Vercel.</small></label>
              <button class="knapp primar stor">Opprett og logg inn</button>
            </form>`
          : html`<form id="skjema" class="skjema" autocomplete="on">
              <div><h2>Logg inn</h2><p class="muted" style="margin-top:6px">For prosjektledere. Leverandører bruker lenken de har fått tilsendt.</p></div>
              <label class="felt"><span>E-post</span><input type="email" name="epost" required autocomplete="username"></label>
              <label class="felt"><span>Passord</span><input type="password" name="passord" required autocomplete="current-password"></label>
              <button class="knapp primar stor">Logg inn</button>
            </form>`
      }
    </section>
  </div>`.toString();
  $('#skjema').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const knapp = $('button', e.target);
    knapp.disabled = true;
    const ok = await attempt(() => api.post(registrering ? '/registrer' : '/logginn', data));
    knapp.disabled = false;
    if (ok) location.reload();
  });
}

function renderUgyldig() {
  root.innerHTML = html`<div class="innlogging">
    <section class="venstre">
      <div class="merkevare">${LOGO}<div><strong>Fremdrift</strong><small>${store.firma || ''}</small></div></div>
      <h1>Lenken virker <em>ikke lenger</em>.</h1>
      <p>Lenken kan ha blitt byttet ut. Be prosjektlederen sende deg en ny.</p>
    </section>
    <section class="hoyre"><a class="knapp" href="/">Til innlogging</a></section>
  </div>`.toString();
}

export function oppfrisk() {
  return lastProsjekter().then(tegnMeny);
}

window.addEventListener('error', (e) => toast(e.message || 'Noe gikk galt', 'feil'));
boot();
