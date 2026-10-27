// ---------- Trygg HTML ----------
// html`...` escaper alle innsatte verdier, med mindre de er laget med html`` eller raw().

class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const raw = (s) => new Safe(String(s ?? ''));

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new Safe(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Ikoner (egen strektegning, 24×24) ----------
const P = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M4 7.5h3l1.8-2.5h6.4L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5z"/><circle cx="12" cy="13.3" r="3.6"/>',
  chat: '<path d="M4 5.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 3.5V6.5a1 1 0 0 1 1-1z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3.5h16V16"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
  list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  gantt: '<path d="M3.5 5.5h7M7 12h10M12 18.5h8.5"/>',
  message: '<path d="M3.5 6l8.5 6 8.5-6"/><rect x="3.5" y="5" width="17" height="14" rx="2"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2M20 20v-4.5h-4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4h5v3"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  file: '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5V8h4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12v8.5h14V12"/>',
  shift: '<path d="M3.5 12h14M13.5 7.5l4.5 4.5-4.5 4.5"/><path d="M20.5 5v14"/>',
  hammer: '<path d="M14.5 6.5l3 3M4 20l9.5-9.5M12 5l3-2.5 6 6-2.5 3-2-2-2 2-3-3 2-2z"/>',
  melding: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v3M12 13.5v.01"/>',
  inbox: '<path d="M3.5 13.5l2.5-8h12l2.5 8V19a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5"/>',
};

export function icon(name, cls = '') {
  return raw(
    `<svg class="ikon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`,
  );
}

export const LOGO = raw(`<svg class="logo-merke" viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="currentColor"/>
  <path d="M8 22.5h16" stroke="var(--logo-fg)" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M8 16.5h9" stroke="var(--logo-fg)" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>
  <path d="M8 10.5h4.5" stroke="var(--logo-fg)" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>
  <circle cx="22.5" cy="10.5" r="2.6" fill="var(--logo-accent)"/>
</svg>`);

// ---------- Små byggeklosser ----------

export function progressRing(prosent, { size = 112, stroke = 10, label = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fylt = Math.max(0, Math.min(100, prosent)) / 100;
  return raw(`<div class="ring" style="--size:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring-bg)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring-fg)" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - fylt)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-tekst"><strong>${Math.round(prosent)}<small>%</small></strong>${label ? `<span>${esc(label)}</span>` : ''}</div>
  </div>`);
}

export function bar(prosent, tone = '') {
  return html`<div class="bar ${tone}"><span style="width:${Math.max(0, Math.min(100, prosent))}%"></span></div>`;
}

export function initialer(navn) {
  const deler = String(navn || '?').trim().split(/\s+/);
  return ((deler[0]?.[0] || '') + (deler.length > 1 ? deler[deler.length - 1][0] : '')).toUpperCase();
}

export function avatar(navn, cls = '') {
  let h = 0;
  for (const ch of String(navn || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return html`<span class="avatar ${cls}" style="--hue:${h}" aria-hidden="true">${initialer(navn)}</span>`;
}

// ---------- Tilbakemeldinger ----------

export function toast(melding, type = 'ok') {
  let stack = $('#toasts');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toasts';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = melding;
  stack.append(el);
  setTimeout(() => el.classList.add('ut'), 3200);
  setTimeout(() => el.remove(), 3600);
}

// Kjører en handling og viser feilen som melding i stedet for å kaste den videre.
export async function attempt(fn, okMelding) {
  try {
    const r = await fn();
    if (okMelding) toast(okMelding);
    return r;
  } catch (err) {
    toast(err.message || String(err), 'feil');
    return undefined;
  }
}

// ---------- Dialog ----------
// modal({ tittel, innhold, knapper, bred, onMount }) – resolver med verdien knappen gir.

export function modal({ tittel, undertittel = '', innhold, bred = false, panel = false, onMount }) {
  return new Promise((resolve) => {
    const forrigeFokus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = `modal-bakgrunn ${panel ? 'som-panel' : ''}`;
    wrap.innerHTML = html`<div class="modal ${bred ? 'bred' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-tittel">
      <header class="modal-topp">
        <div><h2 id="modal-tittel">${tittel}</h2>${undertittel ? html`<p class="muted small">${undertittel}</p>` : ''}</div>
        <button class="ikon-knapp" data-lukk aria-label="Lukk">${icon('x')}</button>
      </header>
      <div class="modal-innhold">${innhold}</div>
    </div>`.toString();
    document.body.append(wrap);
    document.body.classList.add('har-modal');
    // Navigering (tilbake-knappen, bunnmenyen, en lenke) lukker dialogen.
    const vedNavigering = () => lukk(undefined);
    window.addEventListener('hashchange', vedNavigering);
    let lukket = false;
    const lukk = (verdi) => {
      if (lukket) return;
      lukket = true;
      window.removeEventListener('hashchange', vedNavigering);
      wrap.classList.add('ut');
      document.removeEventListener('keydown', tast);
      setTimeout(() => {
        wrap.remove();
        if (!$('.modal-bakgrunn')) document.body.classList.remove('har-modal');
        forrigeFokus?.focus?.();
      }, 160);
      resolve(verdi);
    };
    const tast = (e) => {
      if (e.key === 'Escape') lukk(undefined);
    };
    document.addEventListener('keydown', tast);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) lukk(undefined);
    });
    $$('[data-lukk]', wrap).forEach((b) => b.addEventListener('click', () => lukk(undefined)));
    const forste = $('input:not([type=hidden]),select,textarea', wrap);
    setTimeout(() => (forste || $('.modal', wrap)).focus?.(), 30);
    onMount?.(wrap, lukk);
  });
}

export async function bekreft(tittel, tekst, { ok = 'OK', fare = false } = {}) {
  return modal({
    tittel,
    innhold: html`<p>${tekst}</p>
      <div class="knapperad"><span class="spacer"></span>
        <button class="knapp" data-lukk>Avbryt</button>
        <button class="knapp ${fare ? 'fare' : 'primar'}" data-ok>${ok}</button></div>`,
    onMount: (el, lukk) => $('[data-ok]', el).addEventListener('click', () => lukk(true)),
  });
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

export async function kopier(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    toast('Kopiert');
  } catch {
    prompt('Kopier lenken:', tekst);
  }
}

// Fra-dato i et skjema: når fra flyttes forbi til, flytt til med.
export function kobleDatoer(form) {
  const fra = form.elements.fra;
  const til = form.elements.til;
  if (!fra || !til) return;
  fra.addEventListener('change', () => {
    if (fra.value && (!til.value || til.value < fra.value)) til.value = fra.value;
    til.min = fra.value;
  });
}
