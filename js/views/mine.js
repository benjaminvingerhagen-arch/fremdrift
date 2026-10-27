import { api } from '../api.js';
import { html, icon, LOGO, $, $$, modal, attempt, toast, avatar, kopier, bekreft } from '../ui.js';
import { store } from '../store.js';
import { skrivFelt, lastTraad } from './oppgave.js';
import { mineManglerHtml, kobleMineMangler } from './mangler.js';
import { meldFeil } from '../meldfeil.js';
import { iDag, oppgaveStatus, STATUS, dagerMellom, datoMedDag, datoKort, ddmm, isoUke } from '/shared/plan.js';
import { NAVN } from '/shared/merke.js';

// Ansatte og leverandører: én side med egne oppgaver på tvers av prosjekter.
// Laget for telefonen – store knapper og det viktigste øverst.

export async function mineApp(root) {
  document.title = `Mine oppgaver · ${NAVN}`;
  const [data, mangler] = await Promise.all([api.get('/mine'), api.get('/mine/mangler').catch(() => [])]);
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
      <div class="merkevare" style="display:flex">${LOGO}<div><strong>${NAVN}</strong><small>${store.firma || ''}</small></div>
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
      ${!data.oppgaver.length && !mangler.length ? html`<div class="kort tom">${icon('checkCircle')} Du har ingen oppgaver akkurat nå.</div>` : ''}
      ${seksjon('Haster – frist i dag eller passert', grupper.handling, 'alert')}
      ${mineManglerHtml(mangler, dag, flereProsjekter)}
      ${seksjon('Pågår nå', grupper.pagar, 'hammer')}
      ${seksjon('Starter de neste dagene', grupper.snart, 'clock')}
      ${seksjon('Senere', grupper.senere, 'calendar')}
      ${seksjon('Meldt ferdig', grupper.meldt, 'checkCircle')}
      ${grupper.ferdig.length ? html`<details><summary class="gruppe-tittel" style="cursor:pointer;list-style:none">${icon('check')} Godkjent <span class="mono">${grupper.ferdig.length}</span> <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">– vis</span></summary>
        <div style="display:grid;gap:16px;margin-top:14px">${grupper.ferdig.map(kort)}</div></details>` : ''}
      <div class="kort kalender-kort">
        <span class="kalender-ikon">${icon('calendar')}</span>
        <div><strong>Oppgavene i kalenderen din</strong><p class="small muted">Få oppgavene og viktige datoer rett i kalenderen på telefonen. Den oppdateres av seg selv når planen endres.</p></div>
        <button class="knapp" data-kalender>${icon('calendar')} Legg i kalenderen</button>
      </div>
      <p class="muted xs mine-bunn">Denne siden er bare for deg. Ikke del lenken med andre.<br><button type="button" class="lenkeknapp" data-meld-feil>${icon('melding')}<span>Noe som ikke virker? Meld feil</span></button></p>
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
  $('[data-kalender]', root)?.addEventListener('click', () => kalenderDialog());
  $('[data-meld-feil]', root)?.addEventListener('click', () => meldFeil());
  kobleMineMangler(root, mangler, () => mineApp(root));
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

// ---------- Kalenderabonnement ----------
// Adressen vises bare når den lages (serveren lagrer bare en hash). Trenger man den
// igjen, lager man en ny, og da slutter den gamle å virke.

function kalenderValg(adresse) {
  const webcal = adresse.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(adresse)}&name=${encodeURIComponent(NAVN)}`;
  return html`<div class="skjema">
    <p class="small">Velg kalenderen du bruker. Oppgavene kommer inn som heldagshendelser og oppdateres av seg selv.</p>
    <div class="kalender-valg">
      <a class="knapp primar" href="${webcal}">${icon('calendar')} iPhone, iPad og Mac</a>
      <a class="knapp" href="${google}" target="_blank" rel="noopener">${icon('calendar')} Google Kalender (Android)</a>
      <a class="knapp" href="${outlook}" target="_blank" rel="noopener">${icon('calendar')} Outlook</a>
    </div>
    <p class="small muted">Annen kalender? Kopier adressen og velg «Legg til kalender fra URL» eller «Abonner».</p>
    <div class="lenkeboks"><code>${adresse}</code><button class="knapp liten" data-kopier type="button">${icon('copy')} Kopier</button></div>
    <p class="xs muted">Adressen er bare for deg og vises bare nå. Den gir ikke tilgang til å endre noe.</p>
    <div class="knapperad"><span class="spacer"></span><button class="knapp" data-lukk type="button">Ferdig</button></div>
  </div>`;
}

async function kalenderDialog() {
  const status = await attempt(() => api.get('/mine/kalender'));
  if (!status) return;
  await modal({
    tittel: 'Oppgavene i kalenderen',
    undertittel: 'Fungerer med kalenderen på iPhone, Android og PC',
    innhold: html`<div id="kalender-innhold">${status.aktiv
      ? html`<div class="skjema">
          <p class="small">${icon('checkCircle')} Kalenderen din er koblet til. Endringer i planen kommer inn av seg selv, vanligvis innen et par timer.</p>
          <p class="small muted">Vil du legge den til på en ny telefon, lager du en ny adresse. Den gamle slutter da å virke, og du må fjerne den fra den gamle kalenderen.</p>
          <div class="knapperad">
            <button class="knapp lys" data-av type="button">${icon('x')} Slå av</button>
            <span class="spacer"></span>
            <button class="knapp primar" data-ny type="button">${icon('refresh')} Lag ny adresse</button>
          </div></div>`
      : html`<div class="skjema">
          <p class="small">Du får en personlig kalenderadresse som du legger til i kalenderen på telefonen. Der ser du dine oppgaver i alle prosjekter, og datoer som innflytting og sluttfrist.</p>
          <p class="small muted">For å melde ferdig og sende bilder bruker du fortsatt denne siden.</p>
          <div class="knapperad"><span class="spacer"></span><button class="knapp primar" data-ny type="button">${icon('calendar')} Lag kalenderadresse</button></div>
        </div>`}</div>`,
    onMount: (el, lukk) => {
      const boks = $('#kalender-innhold', el);
      $('[data-ny]', el)?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        const ny = await attempt(() => api.post('/mine/kalender'));
        if (!ny) {
          e.currentTarget.disabled = false;
          return;
        }
        boks.innerHTML = kalenderValg(ny.adresse).toString();
        $('[data-kopier]', boks).addEventListener('click', () => kopier(ny.adresse));
        $('[data-lukk]', boks).addEventListener('click', () => lukk());
      });
      $('[data-av]', el)?.addEventListener('click', async () => {
        if (!(await bekreft('Slå av kalenderen?', 'Oppgavene forsvinner fra kalenderen neste gang den oppdateres. Du kan slå den på igjen senere.', { ok: 'Slå av', fare: true }))) return;
        if (await attempt(() => api.del('/mine/kalender'), 'Kalenderen er slått av')) lukk();
      });
    },
  });
}
