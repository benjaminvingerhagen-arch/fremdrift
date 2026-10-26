import { api } from '../api.js';
import { html, icon, LOGO, $, $$, modal, attempt, toast, avatar } from '../ui.js';
import { store } from '../store.js';
import { skrivFelt, lastTraad } from './oppgave.js';
import { iDag, oppgaveStatus, STATUS, dagerMellom, datoMedDag, datoKort, ddmm, isoUke } from '/shared/plan.js';

// Ansatte og leverandører: én side med egne oppgaver på tvers av prosjekter.
// Laget for telefonen – store knapper og det viktigste øverst.

export async function mineApp(root) {
  document.title = 'Mine oppgaver · Fremdrift';
  const data = await api.get('/mine');
  const dag = iDag();
  const me = store.me;
  const grupper = { handling: [], pagar: [], snart: [], senere: [], meldt: [], ferdig: [] };
  for (const o of data.oppgaver) {
    const s = oppgaveStatus(o, dag);
    if (s === 'forsinket' || s === 'idag') grupper.handling.push(o);
    else if (s === 'pagar') grupper.pagar.push(o);
    else if (s === 'snart') grupper.snart.push(o);
    else if (s === 'planlagt') grupper.senere.push(o);
    else if (s === 'meldt') grupper.meldt.push(o);
    else grupper.ferdig.push(o);
  }
  const viktige = data.prosjekter
    .flatMap((p) => p.milepaeler.map((m) => ({ ...m, prosjekt: p.navn })))
    .filter((m) => ['fast', 'innflytting', 'sluttfrist'].includes(m.type) && dagerMellom(dag, m.dato) >= 0 && dagerMellom(dag, m.dato) <= 14)
    .sort((a, b) => a.dato.localeCompare(b.dato));
  const flereProsjekter = data.prosjekter.length > 1;

  const kort = (o) => {
    const s = oppgaveStatus(o, dag);
    const st = STATUS[s];
    const n = dagerMellom(dag, o.til);
    return html`<div class="kort mkort ${s === 'ferdig' ? 'ferdig' : ''}" data-id="${o.id}">
      <div class="rad">
        <div class="hva"><strong>${o.tittel}</strong><small>${o.adresse && o.adresse.startsWith(o.prosjekt) ? o.adresse : [o.prosjekt, o.adresse].filter(Boolean).join(' · ')}</small></div>
        <span class="chip ${st.tone === 'noytral' ? '' : st.tone}">${st.tekst}</span>
      </div>
      <div class="meta">
        <span class="datoer">${ddmm(o.fra)} – ${ddmm(o.til)}</span>
        ${s !== 'ferdig' && s !== 'meldt' ? html`<span class="${n < 0 ? 'text-fare strong' : ''}">${n < 0 ? `${-n} dager over fristen` : n === 0 ? 'Frist i dag' : `Frist ${datoMedDag(o.til)}`}</span>` : ''}
        ${o.prioritet === 'kritisk' ? html`<span class="prio kritisk">Kritisk</span>` : ''}
        ${o.uleste ? html`<span class="ulest-merke">${icon('chat')} ${o.uleste === 1 ? 'Ny melding' : `${o.uleste} nye meldinger`}</span>` : o.kommentarer ? html`<span>${icon('chat')} ${o.kommentarer}</span>` : ''}
      </div>
      ${o.merknad ? html`<p class="small" style="color:var(--fg-2)">↳ ${o.merknad}</p>` : ''}
      ${o.beskrivelse ? html`<details><summary class="small muted" style="cursor:pointer">Beskrivelse</summary><p class="small pre" style="margin-top:6px">${o.beskrivelse}</p></details>` : ''}
      <div class="handlinger">
        ${s === 'ferdig' ? html`<span class="small text-ok">${icon('checkCircle')} Godkjent av prosjektleder</span>`
          : s === 'meldt' ? html`<span class="small" style="color:var(--info-fg);flex:1">Meldt ferdig – venter på godkjenning</span><button class="knapp liten lys" data-angre="${o.id}">${icon('undo')} Angre</button>`
          : html`<button class="knapp ok stor" style="flex:1" data-meld="${o.id}">${icon('check')} Meld ferdig</button>`}
        <button class="knapp ${s === 'ferdig' || s === 'meldt' ? 'liten' : 'stor'}" data-traad="${o.id}" aria-label="Meldinger og bilder">${icon('camera')}${s === 'ferdig' || s === 'meldt' ? '' : ' Melding'}</button>
      </div>
    </div>`;
  };

  const seksjon = (tittel, liste, ikon) => (liste.length ? html`<div class="gruppe-tittel">${ikon ? icon(ikon) : ''}${tittel} <span class="mono">${liste.length}</span></div>${liste.map(kort)}` : '');

  root.innerHTML = html`<div>
    <header class="mine-topp"><div class="indre">
      <div class="merkevare" style="display:flex">${LOGO}<div><strong>Fremdrift</strong><small>${store.firma || ''}</small></div>
        <span class="spacer"></span>${avatar(me.navn)}</div>
      <h1>Hei, ${me.navn.split(' ')[0]}</h1>
      <p>${datoMedDag(dag)} · uke ${isoUke(dag)}${me.fag ? ` · ${me.fag}` : ''}</p>
    </div></header>
    <main class="mine-innhold">
      <div class="mine-statistikk">
        <div class="tall ${grupper.handling.length ? 'fare' : ''}"><span class="etikett">Haster</span><span class="verdi">${grupper.handling.length}</span></div>
        <div class="tall"><span class="etikett">Pågår</span><span class="verdi">${grupper.pagar.length}</span></div>
        <div class="tall"><span class="etikett">Ferdig</span><span class="verdi">${grupper.ferdig.length + grupper.meldt.length}<small>/${data.oppgaver.length}</small></span></div>
      </div>
      ${viktige.map((m) => html`<div class="viktig-dato">${icon('flag')}<span><strong>${datoMedDag(m.dato)}:</strong> ${m.navn}${flereProsjekter ? ` (${m.prosjekt})` : ''}</span></div>`)}
      ${!data.oppgaver.length ? html`<div class="kort tom">${icon('checkCircle')} Du har ingen oppgaver akkurat nå.</div>` : ''}
      ${seksjon('Haster – frist i dag eller passert', grupper.handling, 'alert')}
      ${seksjon('Pågår nå', grupper.pagar, 'hammer')}
      ${seksjon('Starter de neste dagene', grupper.snart, 'clock')}
      ${seksjon('Senere', grupper.senere, 'calendar')}
      ${seksjon('Meldt ferdig', grupper.meldt, 'checkCircle')}
      ${grupper.ferdig.length ? html`<details><summary class="gruppe-tittel" style="cursor:pointer;list-style:none">${icon('check')} Godkjent <span class="mono">${grupper.ferdig.length}</span> <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">– vis</span></summary>
        <div style="display:grid;gap:16px;margin-top:14px">${grupper.ferdig.map(kort)}</div></details>` : ''}
      <p class="muted xs" style="text-align:center;margin-top:14px">Denne siden er bare for deg. Ikke del lenken med andre.</p>
    </main>
  </div>`.toString();

  const finn = (id) => data.oppgaver.find((o) => o.id === Number(id));
  $$('[data-meld]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      const o = finn(b.dataset.meld);
      b.disabled = true;
      if (await attempt(() => api.post(`/oppgaver/${o.id}/meld`, { ferdig: true }))) {
        toast('Meldt ferdig – prosjektleder får beskjed');
        mineApp(root);
      } else b.disabled = false;
    }),
  );
  $$('[data-angre]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      if (await attempt(() => api.post(`/oppgaver/${b.dataset.angre}/meld`, { ferdig: false }), 'Ferdigmeldingen er trukket tilbake')) mineApp(root);
    }),
  );
  $$('[data-traad]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      const o = finn(b.dataset.traad);
      await modal({
        tittel: o.tittel,
        undertittel: `${o.prosjekt} · ${datoKort(o.fra)} – ${datoKort(o.til)}`,
        innhold: html`<p class="small muted" style="margin-bottom:14px">Skriv til prosjektlederen eller send bilde av arbeidet.</p>
          <div class="traad" id="traad"></div>${skrivFelt()}`,
        onMount: (el) => lastTraad(el, o, o.prosjekt_id),
      });
      mineApp(root);
    }),
  );
}
