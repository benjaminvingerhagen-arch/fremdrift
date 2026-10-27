import { api } from '../api.js';
import { html, icon, $, $$, modal, attempt, formData, avatar, bekreft, kopier, toast } from '../ui.js';
import { store, fagHue } from '../store.js';
import { NAVN } from '/shared/merke.js';

const ROLLE = { leder: 'Prosjektleder', ansatt: 'Ansatt', leverandor: 'Leverandør' };

export async function personerView(el) {
  document.title = `Folk og leverandører · ${NAVN}`;
  const folk = await api.get('/personer');
  const grupper = [
    ['Leverandører og underentreprenører', folk.filter((p) => p.rolle === 'leverandor')],
    ['Egne ansatte', folk.filter((p) => p.rolle === 'ansatt')],
    ['Prosjektledere', folk.filter((p) => p.rolle === 'leder')],
  ];
  el.innerHTML = html`
    <div class="topp">
      <div class="tittel"><div class="over">${store.firma || NAVN}</div><h1>Folk og leverandører</h1>
        <div class="under"><span>Hver person får en personlig lenke til sine oppgaver – ingen passord å huske.</span></div></div>
      <button class="knapp primar" data-ny>${icon('plus')} Legg til person</button>
    </div>
    <div class="kort" style="padding:16px 20px;margin-bottom:18px;display:flex;gap:14px;align-items:flex-start;background:var(--brand-soft);border-color:#cfdeee">
      ${icon('help')}
      <p class="small" style="color:var(--brand)"><strong>Slik fordeles arbeidet:</strong> Gi personen et fag (f.eks. «Elektro»). Alle oppgaver i det faget – i alle prosjekter – havner da automatisk på personens liste,
        med mindre du har satt en annen ansvarlig på oppgaven. Leverandøren krysser av når noe er ferdig, og du godkjenner.</p>
    </div>
    ${!store.epost ? html`<div class="kort" style="padding:14px 20px;margin-bottom:18px;display:flex;gap:12px;align-items:flex-start">
      ${icon('message')}<p class="small muted"><strong style="color:var(--fg)">E-postvarsler er ikke slått på.</strong> Varslene i appen virker uansett.
        For e-post: legg inn <span class="mono">RESEND</span> (API-nøkkel fra resend.com) og <span class="mono">MAIL_FROM</span> under Environment Variables i Vercel, og deploy på nytt.</p></div>` : ''}
    <div class="rutenett">
      ${grupper.filter(([, l]) => l.length).map(([tittel, liste]) => html`<div class="kort">
        <div class="kort-topp"><h2>${tittel}</h2><span class="antall">${liste.length}</span></div>
        <ul class="personliste">${liste.map((p) => html`<li class="person ${p.aktiv ? '' : 'inaktiv'}">
          ${avatar(p.navn, 'stor')}
          <div class="hvem"><strong>${p.navn}${p.aktiv ? '' : ' (deaktivert)'}</strong>
            <small>${p.fag ? html`<span class="fagmerke" style="--hue:${fagHue(p.fag)}"><i></i>${p.fag}</span>` : ''}${p.firma ? html`<span>${p.firma}</span>` : ''}
              ${p.telefon ? html`<span>${p.telefon}</span>` : ''}${p.epost ? html`<span>${p.epost}</span>` : ''}
              <span>${p.sist_innom ? `Sist innom ${new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' }).format(new Date(p.sist_innom))}` : p.rolle === 'leder' ? '' : 'Har ikke åpnet lenken ennå'}</span></small></div>
          <div style="display:flex;gap:6px">
            ${p.rolle !== 'leder' && p.aktiv ? html`<button class="knapp liten" data-lenke="${p.id}">${icon('link')} Ny lenke</button>` : ''}
            <button class="knapp liten lys" data-endre="${p.id}">Endre</button>
          </div>
        </li>`)}</ul>
      </div>`)}
    </div>`.toString();

  $('[data-ny]', el).addEventListener('click', () => skjema(null, el));
  $$('[data-endre]', el).forEach((b) => b.addEventListener('click', () => skjema(folk.find((p) => p.id === Number(b.dataset.endre)), el)));
  $$('[data-lenke]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      const p = folk.find((x) => x.id === Number(b.dataset.lenke));
      if (p.har_lenke && !(await bekreft('Lage ny lenke?', `Lenken ${p.navn} har nå, slutter å virke, og hen blir logget ut på telefonen.`, { ok: 'Lag ny lenke' }))) return;
      const r = await attempt(() => api.post(`/personer/${p.id}/lenke`));
      if (r) visLenke(p, r.nokkel);
    }),
  );
}

export function visLenke(p, nokkel) {
  const lenke = `${location.origin}/api/inn/${nokkel}`;
  const tekst = `Hei ${p.navn.split(' ')[0]}! Her er dine oppgaver hos ${store.firma || 'oss'}. Legg lenken til som bokmerke på telefonen: ${lenke}`;
  return modal({
    tittel: `Lenke til ${p.navn}`,
    undertittel: 'Lenken vises bare nå. Trenger du den igjen, lager du en ny.',
    innhold: html`<div class="skjema">
      <div class="lenkeboks"><code>${lenke}</code><button class="knapp liten" data-kopier>${icon('copy')} Kopier</button></div>
      <p class="small muted">Personen åpner lenken på telefonen og ser sine oppgaver med en gang. Del den bare med denne personen.</p>
      <div class="knapperad" style="margin-top:4px">
        ${p.telefon ? html`<a class="knapp" href="sms:${p.telefon}?&body=${encodeURIComponent(tekst)}">${icon('phone')} Send på SMS</a>` : ''}
        ${p.epost ? html`<a class="knapp" href="mailto:${p.epost}?subject=${encodeURIComponent('Dine oppgaver')}&body=${encodeURIComponent(tekst)}">${icon('message')} Send på e-post</a>` : ''}
        <span class="spacer"></span><button class="knapp primar" data-lukk>Ferdig</button>
      </div></div>`,
    onMount: (el) => $('[data-kopier]', el).addEventListener('click', () => kopier(lenke)),
  });
}

function skjema(p, sideEl) {
  const ny = !p;
  return modal({
    tittel: ny ? 'Legg til person' : p.navn,
    innhold: html`<form class="skjema" id="pers">
      <div class="felt"><span>Rolle</span><div class="segment" style="justify-self:start">
        ${Object.entries(ROLLE).map(([k, t]) => html`<button type="button" data-rolle="${k}" class="${(p?.rolle || 'leverandor') === k ? 'aktiv' : ''}">${t}</button>`)}
      </div><input type="hidden" name="rolle" value="${p?.rolle || 'leverandor'}"></div>
      <div class="rad2"><label class="felt"><span>Navn</span><input type="text" name="navn" value="${p?.navn || ''}" required autocomplete="off"></label>
        <label class="felt" data-for="ikke-leder"><span>Firma</span><input type="text" name="firma" value="${p?.firma || ''}" placeholder="F.eks. Elfirma AS"></label></div>
      <label class="felt" data-for="ikke-leder"><span>Fag</span><input type="text" name="fag" value="${p?.fag || ''}" placeholder="F.eks. Elektro – samme skrivemåte som i planen">
        <small>Alle oppgaver i dette faget går automatisk til denne personen.</small></label>
      <div class="rad2"><label class="felt"><span>Telefon</span><input type="tel" name="telefon" value="${p?.telefon || ''}"></label>
        <label class="felt"><span>E-post</span><input type="email" name="epost" value="${p?.epost || ''}"></label></div>
      <label class="avkrysning"><input type="checkbox" name="epostvarsel" ${p?.epostvarsel !== false ? 'checked' : ''}>
        <span>Varsle på e-post<small data-for="ikke-leder">Når oppgaven sendes tilbake eller prosjektlederen skriver en melding. Krever e-postadresse.</small>
          <small data-for="leder">Når noe meldes ferdig, fagene skriver eller kunden svarer.</small></span></label>
      <label class="felt" data-for="leder"><span>${ny ? 'Passord' : 'Nytt passord (valgfritt)'}</span><input type="password" name="passord" minlength="10" autocomplete="new-password"><small>Prosjektledere logger inn med e-post og passord. Minst 10 tegn.</small></label>
      <div class="knapperad">
        ${!ny && p.id !== store.me.id ? html`<button type="button" class="knapp lys" data-aktiv>${p.aktiv ? 'Deaktiver' : 'Aktiver igjen'}</button>` : ''}
        <span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">${ny ? 'Legg til' : 'Lagre'}</button></div>
    </form>`,
    onMount: (el, lukk) => {
      const form = $('#pers', el);
      const visRolle = (r) => {
        form.elements.rolle.value = r;
        $$('[data-rolle]', el).forEach((b) => b.classList.toggle('aktiv', b.dataset.rolle === r));
        $$('[data-for="leder"]', el).forEach((x) => (x.hidden = r !== 'leder'));
        $$('[data-for="ikke-leder"]', el).forEach((x) => (x.hidden = r === 'leder'));
        form.elements.passord.required = r === 'leder' && ny;
      };
      visRolle(form.elements.rolle.value);
      $$('[data-rolle]', el).forEach((b) => b.addEventListener('click', () => visRolle(b.dataset.rolle)));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = formData(form);
        if (!d.passord) delete d.passord;
        const r = await attempt(() => (ny ? api.post('/personer', d) : api.put(`/personer/${p.id}`, d)));
        if (!r) return;
        lukk(true);
        await personerView(sideEl);
        if (r.nokkel) visLenke({ ...d, id: r.id }, r.nokkel);
        else toast('Lagret');
      });
      $('[data-aktiv]', el)?.addEventListener('click', async () => {
        if (await attempt(() => api.post(`/personer/${p.id}/aktiv`, { aktiv: !p.aktiv }), p.aktiv ? 'Deaktivert – lenken virker ikke lenger' : 'Aktivert')) {
          lukk(true);
          personerView(sideEl);
        }
      });
    },
  });
}
