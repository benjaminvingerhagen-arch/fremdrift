import { api, setUnauthorizedHandler } from './api.js';
import { html, icon, LOGO, $, $$, avatar, bar, attempt, toast } from './ui.js';
import { store, lastProsjekter } from './store.js';
import { prosjekterView } from './views/prosjekter.js';
import { prosjektView } from './views/prosjekt.js';
import { personerView } from './views/personer.js';
import { mineApp } from './views/mine.js';
import { fagplanView } from './views/fagplan.js';
import { varslerView } from './views/varsler.js';
import { innstillingerView, meldFeil } from './views/innstillinger.js';
import { NAVN, SLAGORD } from '/shared/merke.js';

const root = document.getElementById('app');

const ROUTES = [
  [/^\/$/, prosjekterView],
  [/^\/p\/(\d+)(?:\/(plan|sjekkpunkter|mangler|dagbok|dokumenter|dokumenter\/uke|okonomi|kunde|logg|innstillinger))?$/, prosjektView],
  [/^\/personer$/, personerView],
  [/^\/varsler$/, varslerView],
  [/^\/innstillinger(?:\/(profil|firma|henvendelser))?$/, innstillingerView],
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
  store.epost = me.epost;
  if (sti() === '/ugyldig-lenke' && !me.user) return renderUgyldig();
  if (!me.user) return renderLogin(me.registrering);
  store.me = me.user;
  if (me.user.rolle !== 'leder') {
    // Ansatte og leverandører: egne oppgaver, og hele planen for prosjektene de er med i.
    const visFag = () => {
      const plan = sti().match(/^\/mine\/plan\/(\d+)$/);
      window.scrollTo(0, 0);
      return plan ? fagplanView(root, plan[1]) : mineApp(root);
    };
    if (sti() !== '/mine' && !/^\/mine\/plan\/\d+$/.test(sti())) history.replaceState(null, '', '#/mine');
    window.addEventListener('hashchange', visFag);
    return visFag();
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
        <strong>${NAVN}</strong>
      </div>
      <main class="hoved" id="hoved"></main>
    </div>
    <nav class="bunnmeny" aria-label="Snarveier"></nav>
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
    <a class="merkevare" href="#/">${LOGO}<div><strong>${NAVN}</strong><small>${store.firma || SLAGORD}</small></div></a>
    <a class="meny-lenke ${s === '/' ? 'aktiv' : ''}" href="#/">${icon('grid')} Alle prosjekter</a>
    <a class="meny-lenke ${s === '/varsler' ? 'aktiv' : ''}" href="#/varsler">${icon('bell')} Varsler ${store.uleste ? html`<span class="meny-teller">${store.uleste}</span>` : ''}</a>
    <a class="meny-lenke ${s === '/personer' ? 'aktiv' : ''}" href="#/personer">${icon('users')} Folk og leverandører</a>
    ${aktive.length ? html`<div class="meny-overskrift">Pågående prosjekter</div>` : ''}
    ${aktive.map((p) => {
      const pst = p.total ? Math.round((p.ferdig / p.total) * 100) : 0;
      return html`<a class="meny-lenke meny-prosjekt ${s.startsWith(`/p/${p.id}`) ? 'aktiv' : ''}" href="#/p/${p.id}">
        <span class="navn">${p.navn}</span><span class="pst">${pst}%</span>${bar(pst)}
      </a>`;
    })}
    <div class="meny-bunn">
      <a class="meg ${s === '/innstillinger/profil' ? 'aktiv' : ''}" href="#/innstillinger/profil" title="Min profil">
        ${avatar(store.me.navn)}
        <span class="hvem"><strong>${store.me.navn}</strong><small>Prosjektleder</small></span>
      </a>
      <nav class="meny-konto" aria-label="Konto">
        <button type="button" class="meny-lenke" data-meld-feil>${icon('melding')}<span>Meld feil</span></button>
        <a class="meny-lenke ${s === '/innstillinger' || s === '/innstillinger/firma' || s === '/innstillinger/henvendelser' ? 'aktiv' : ''}" href="#/innstillinger">${icon('settings')}<span>Innstillinger</span></a>
        <button type="button" class="meny-lenke" data-loggut>${icon('logout')}<span>Logg ut</span></button>
      </nav>
    </div>`.toString();
  const bunn = $('.bunnmeny');
  if (bunn) {
    const iProsjekt = s.match(/^\/p\/(\d+)/)?.[1];
    bunn.innerHTML = html`
      <a href="#/" class="${s === '/' ? 'aktiv' : ''}">${icon('grid')}<span>Prosjekter</span></a>
      ${iProsjekt ? html`<a href="#/p/${iProsjekt}/plan" class="${s.endsWith('/plan') ? 'aktiv' : ''}">${icon('gantt')}<span>Plan</span></a>` : ''}
      <a href="#/varsler" class="${s === '/varsler' ? 'aktiv' : ''}">${icon('bell')}<span>Varsler</span>${store.uleste ? html`<b>${store.uleste}</b>` : ''}</a>
      <a href="#/personer" class="${s === '/personer' ? 'aktiv' : ''}">${icon('users')}<span>Folk</span></a>`.toString();
  }
  $('[data-meld-feil]', el).addEventListener('click', () => meldFeil());
  $('[data-loggut]', el).addEventListener('click', async () => {
    await attempt(() => api.post('/loggut'));
    location.href = '/app';
  });
}

let teller = 0;
export async function oppdaterVarsler() {
  const r = await api.get('/varsler/antall').catch(() => null);
  if (r && r.uleste !== store.uleste) {
    store.uleste = r.uleste;
    tegnMeny();
  }
}

async function route() {
  document.body.classList.remove('meny-apen');
  oppdaterVarsler();
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
      <div class="merkevare">${LOGO}<div><strong>${NAVN}</strong><small>${store.firma || SLAGORD}</small></div></div>
      <h1>Hele prosjektet. <em>Én plan</em> alle følger.</h1>
      <p>Fremdriftsplan, oppgaver til fagene og en egen prosjektside for kunden – oppdatert i det øyeblikket noe blir ferdig.</p>
      ${demoGantt()}
    </section>
    <section class="hoyre">
      ${
        registrering
          ? html`<form id="skjema" class="skjema" autocomplete="on">
              <div><h2>Sett opp ${NAVN}</h2><p class="muted" style="margin-top:6px">Du blir prosjektleder. Ansatte og leverandører legger du inn etterpå.</p></div>
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
      <div class="merkevare">${LOGO}<div><strong>${NAVN}</strong><small>${store.firma || ''}</small></div></div>
      <h1>Lenken virker <em>ikke lenger</em>.</h1>
      <p>Lenken kan ha blitt byttet ut. Be prosjektlederen sende deg en ny.</p>
    </section>
    <section class="hoyre"><a class="knapp" href="/app">Til innlogging</a></section>
  </div>`.toString();
}

export function oppfrisk() {
  return lastProsjekter().then(tegnMeny);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.me?.rolle === 'leder') oppdaterVarsler();
});
window.addEventListener('error', (e) => toast(e.message || 'Noe gikk galt', 'feil'));
boot();
