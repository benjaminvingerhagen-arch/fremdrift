import { api } from '../api.js';
import { html, raw, icon, $, $$, bar, progressRing, modal, attempt, formData, bekreft, kopier, toast, avatar, kobleDatoer } from '../ui.js';
import { manglerFane } from './mangler.js';
import { dagbokFane } from './dagbok.js';
import { fagHue, store } from '../store.js';
import { oppfrisk } from '../app.js';
import { lesFremdriftsplan } from '../regneark.js';
import { aapneOppgave, statusChip, fagMerke, sendTilbake } from './oppgave.js';
import { NAVN } from '/shared/merke.js';
import {
  iDag, leggTilDager, dagerMellom, ukedag, erHelg, isoUke, arbeidsdager, arbeidsdagEtter,
  oppgaveStatus, fremdrift, sjekkpunkter, datoKort, datoMedDag, ddmm, DAGNAVN, PRIORITET_TEKST, MILEPAEL_TYPER, flyttArbeidsdager,
} from '/shared/plan.js';

const FANER = [
  ['', 'Oversikt', 'home'],
  ['plan', 'Fremdriftsplan', 'gantt'],
  ['sjekkpunkter', 'Sjekkpunkter', 'checkCircle'],
  ['mangler', 'Mangler', 'alert'],
  ['dagbok', 'Dagbok', 'file'],
  ['kunde', 'Kundeside', 'eye'],
  ['logg', 'Logg', 'clock'],
  ['innstillinger', 'Innstillinger', 'settings'],
];

// Valg i planen huskes mens appen er åpen.
// På telefon starter planen som liste; Gantt er fortsatt ett trykk unna.
const planValg = { sok: '', fag: '', vis: 'alle', modus: matchMedia('(max-width: 860px)').matches ? 'liste' : 'gantt' };

export async function prosjektView(el, id, fane = '', erAktuell = () => true) {
  const data = await api.get(`/prosjekter/${id}`);
  if (!erAktuell()) return;
  const { prosjekt: p, oppgaver } = data;
  document.title = `${p.navn} · ${NAVN}`;
  const dag = iDag();
  const fr = fremdrift(oppgaver);
  const venter = oppgaver.filter((o) => !o.godkjent && o.ferdig_meldt);
  const manglerTilKontroll = (data.mangler || []).filter((m) => m.utbedret && !m.godkjent).length;
  const nyeSvar = data.beslutninger.filter((b) => b.besvart && dagerMellom(b.besvart.slice(0, 10), dag) <= 7).length;
  const ctx = { ...data, dag, onEndret: () => prosjektView(el, id, fane, erAktuell).then(oppfrisk) };

  el.innerHTML = html`
    <div class="topp">
      <div class="tittel">
        <div class="over"><a href="#/">Prosjekter</a> ${icon('chevronRight')} <span>${p.kunde_navn || 'Prosjekt'}</span></div>
        <h1>${p.navn}${p.arkivert ? html` <span class="chip">Avsluttet</span>` : ''}</h1>
        <div class="under">
          ${p.adresse ? html`<span>${icon('home')} ${p.adresse}</span>` : ''}
          ${p.innflytting ? html`<span>${icon('flag')} Innflytting ${datoMedDag(p.innflytting)}</span>` : ''}
          ${p.sluttfrist ? html`<span>${icon('calendar')} Sluttfrist ${datoKort(p.sluttfrist)}</span>` : ''}
        </div>
      </div>
      <a class="knapp" href="/k/${p.kunde_token}" target="_blank" rel="noopener">${icon('eye')} Se kundesiden</a>
      <button class="knapp primar" data-ny-oppgave>${icon('plus')} Ny oppgave</button>
    </div>
    <nav class="faner">${FANER.map(
      ([k, navn, ik]) => html`<a href="#/p/${p.id}${k ? `/${k}` : ''}" class="${(fane || '') === k ? 'aktiv' : ''}">${icon(ik)} ${navn}
        ${k === '' && venter.length ? html`<span class="teller lilla">${venter.length}</span>` : ''}
        ${k === 'kunde' && nyeSvar ? html`<span class="teller">${nyeSvar}</span>` : ''}
        ${k === 'mangler' && manglerTilKontroll ? html`<span class="teller lilla">${manglerTilKontroll}</span>` : ''}</a>`,
    )}</nav>
    <section id="fane"></section>`.toString();
  $('[data-ny-oppgave]', el).addEventListener('click', () => aapneOppgave(null, ctx));
  // Den valgte fanen skal synes, også når fanene må rulles sidelengs på mobil.
  $('.faner a.aktiv', el)?.scrollIntoView({ block: 'nearest', inline: 'center' });

  const f = $('#fane', el);
  // Kommer vi fra et varsel, åpnes oppgaven det gjelder.
  const aapne = sessionStorage.getItem('aapneOppgave');
  if (aapne) {
    sessionStorage.removeItem('aapneOppgave');
    const o = oppgaver.find((x) => x.id === Number(aapne));
    if (o) setTimeout(() => aapneOppgave(o, ctx), 60);
  }
  if (!fane) return oversikt(f, ctx, fr, venter);
  if (fane === 'plan') return plan(f, ctx);
  if (fane === 'sjekkpunkter') return sjekkFane(f, ctx);
  if (fane === 'mangler') return manglerFane(f, ctx);
  if (fane === 'dagbok') return dagbokFane(f, ctx);
  if (fane === 'kunde') return kundeFane(f, ctx);
  if (fane === 'logg') return loggFane(f, ctx);
  if (fane === 'innstillinger') return innstillinger(f, ctx);
}

// ---------- Oversikt («I dag») ----------

function dagerTekst(o, dag) {
  const n = dagerMellom(dag, o.til);
  if (n < 0) return html`<span class="dager fare">${-n} d over</span>`;
  if (n === 0) return html`<span class="dager">i dag</span>`;
  return html`<span class="dager">${n} d igjen</span>`;
}

function oppgaveRad(o, ctx, { visForutsetning = false, handlinger = false } = {}) {
  const hvem = ctx.personer.find((x) => x.id === o.ansvarlig_id)?.navn;
  return html`<li class="orad" data-oppgave="${o.id}">
    <span class="nr">${o.nr || ''}</span>
    <div class="hva"><strong>${o.tittel}</strong>
      <small>${fagMerke(o.fag)}<span class="mono">${ddmm(o.fra)}–${ddmm(o.til)}</span>${hvem ? html`<span>${hvem}</span>` : ''}
        ${visForutsetning && o.merknad ? html`<span>↳ ${o.merknad}</span>` : ''}${o.uleste ? html`<span class="ulest-merke">${icon('chat')} ${o.uleste} ny</span>` : o.kommentarer ? html`<span>${icon('chat')} ${o.kommentarer}</span>` : ''}</small></div>
    <div class="hoyre">
      ${handlinger
        ? html`<button class="knapp liten" data-avvis="${o.id}">Send tilbake</button><button class="knapp liten ok" data-godkjenn="${o.id}">${icon('check')} Godkjenn</button>`
        : html`${statusChip(o, ctx.dag)}${dagerTekst(o, ctx.dag)}`}
    </div>
  </li>`;
}

function liste(tittel, ikon, rader, ctx, opts = {}) {
  return html`<div class="kort ${opts.fremhevet ? 'fremhevet' : ''}">
    <div class="kort-topp"><h2>${icon(ikon)} ${tittel}</h2><span class="antall">${rader.length}</span>${opts.tillegg || ''}</div>
    ${rader.length
      ? html`<ul class="oliste">${rader.slice(0, opts.maks || 12).map((o) => oppgaveRad(o, ctx, opts))}</ul>
          ${rader.length > (opts.maks || 12) ? html`<p class="muted small" style="padding:10px 20px 14px">+ ${rader.length - (opts.maks || 12)} flere i fremdriftsplanen</p>` : ''}`
      : html`<div class="tom">${icon('checkCircle')} ${opts.tom || 'Ingenting her.'}</div>`}
  </div>`;
}

function koblOppgaver(root, ctx) {
  $$('[data-oppgave]', root).forEach((r) =>
    r.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      aapneOppgave(ctx.oppgaver.find((o) => o.id === Number(r.dataset.oppgave)), ctx);
    }),
  );
  $$('[data-godkjenn]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      if (await attempt(() => api.post(`/oppgaver/${b.dataset.godkjenn}/godkjenn`, { godkjent: true }), 'Godkjent')) ctx.onEndret();
    }),
  );
  $$('[data-avvis]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      if (await sendTilbake(ctx.oppgaver.find((o) => o.id === Number(b.dataset.avvis)))) ctx.onEndret();
    }),
  );
}

function oversikt(el, ctx, fr, venter) {
  const { prosjekt: p, oppgaver, dag } = ctx;
  const apne = oppgaver.filter((o) => !o.godkjent && !o.ferdig_meldt);
  const forsinket = apne.filter((o) => o.til < dag).sort((a, b) => a.til.localeCompare(b.til));
  const pagar = apne.filter((o) => o.fra <= dag && o.til >= dag).sort((a, b) => a.til.localeCompare(b.til));
  const grense = arbeidsdagEtter(dag, 3);
  const snart = apne.filter((o) => o.fra > dag && o.fra <= grense).sort((a, b) => a.fra.localeCompare(b.fra));
  const frister = apne.filter((o) => o.til > dag && o.til <= leggTilDager(dag, 7)).sort((a, b) => a.til.localeCompare(b.til));
  const igjen = p.innflytting ? dagerMellom(dag, p.innflytting) : null;
  const forInnfl = p.innflytting ? fremdrift(oppgaver, { tilOgMed: p.innflytting }) : null;
  const sp = sjekkpunkter(p.start || oppgaver[0]?.fra, p.sluttfrist || oppgaver.reduce((m, o) => (o.til > m ? o.til : m), ''));
  const nesteSp = sp.find((s) => s.dato >= dag);
  const spIDag = nesteSp?.dato === dag;
  const milepaelIDag = ctx.milepaeler.find((m) => m.dato === dag);

  el.innerHTML = html`
    <div class="tall-rad">
      <div class="tall" style="flex-direction:row;align-items:center;gap:16px">
        ${progressRing(fr.prosent, { size: 84, stroke: 9 })}
        <div style="display:grid;gap:2px"><span class="etikett">Ferdig totalt</span><strong style="font-size:18px">${fr.ferdig} av ${fr.total}</strong>
          ${forInnfl ? html`<span class="hint">${forInnfl.prosent}% av det som skal være klart til innflytting</span>` : ''}</div>
      </div>
      <div class="tall signal"><span class="etikett">${icon('flag')} Til innflytting</span>
        <span class="verdi">${igjen === null ? '–' : igjen < 0 ? 'Passert' : igjen}${igjen > 0 ? html`<small>dager</small>` : ''}</span>
        <span class="hint">${igjen > 0 ? `${arbeidsdager(leggTilDager(dag, 1), p.innflytting)} arbeidsdager · ${datoMedDag(p.innflytting)}` : igjen === 0 ? 'Innflytting i dag!' : 'Sett dato under Innstillinger'}</span></div>
      <div class="tall lilla"><span class="etikett">${icon('checkCircle')} Venter på godkjenning</span>
        <span class="verdi">${venter.length}</span><span class="hint">Meldt ferdig av fagene</span></div>
      <div class="tall ${forsinket.length ? 'fare' : ''}"><span class="etikett">${icon('alert')} Forsinket</span>
        <span class="verdi">${forsinket.length}</span><span class="hint">${apne.filter((o) => o.prioritet === 'kritisk').length} kritiske oppgaver åpne</span></div>
    </div>
    ${spIDag ? html`<div class="banner signal">${icon('checkCircle')} Sjekkpunkt i dag – ${nesteSp.fokus.toLowerCase()}<a class="knapp liten" href="#/p/${p.id}/sjekkpunkter">Åpne sjekkpunktet</a></div>` : ''}
    ${milepaelIDag ? html`<div class="banner fare">${icon('flag')} Milepæl i dag: ${milepaelIDag.navn}</div>` : ''}
    ${!oppgaver.length
      ? html`<div class="kort" style="padding:36px;text-align:center;display:grid;gap:14px;justify-items:center">
          <span class="avatar stor" style="--hue:210">${icon('gantt')}</span>
          <h2>Prosjektet har ingen plan ennå</h2>
          <p class="muted">Importer Excel-planen eller legg inn oppgavene én og én.</p>
          <div style="display:flex;gap:8px"><button class="knapp" data-import>${icon('upload')} Importer Excel</button><button class="knapp primar" data-ny>${icon('plus')} Ny oppgave</button></div>
        </div>`
      : html`<div class="to-kol">
      <div class="kol">
        ${venter.length ? liste('Venter på din godkjenning', 'checkCircle', venter, ctx, { handlinger: true, fremhevet: true }) : ''}
        ${forsinket.length ? liste('Forsinket', 'alert', forsinket, ctx) : ''}
        ${liste('Pågår nå', 'hammer', pagar, ctx, { tom: 'Ingen oppgaver pågår i dag.' })}
        ${liste('Starter de neste 3 arbeidsdagene', 'clock', snart, ctx, { visForutsetning: true, tom: 'Ingen oppstarter de neste dagene.' })}
        ${liste('Frister neste 7 dager', 'calendar', frister, ctx, { tom: 'Ingen frister den neste uken.' })}
      </div>
      <div class="kol">
        <div class="kort"><div class="kort-topp"><h2>${icon('flag')} Milepæler</h2><span class="spacer"></span><a class="small" href="#/p/${p.id}/innstillinger">Endre</a></div>
          ${milepaelListe(ctx.milepaeler, dag)}</div>
        ${nesteSp ? html`<div class="kort"><div class="kort-topp"><h2>${icon('checkCircle')} ${spIDag ? 'Sjekkpunkt i dag' : 'Neste sjekkpunkt'}</h2></div>
          <div class="kort-innhold" style="display:grid;gap:10px">
            <div style="display:flex;gap:14px;align-items:center">
              <div class="sjekk ${spIDag ? 'idag' : ''}" style="padding:0;display:block"><div class="dag" style="width:64px"><small>${DAGNAVN[ukedag(nesteSp.dato)].slice(0, 3)}</small><b>${Number(nesteSp.dato.slice(8))}</b></div></div>
              <div><strong>${nesteSp.type === 'mandag' ? 'Oppstartsmøte' : 'Ferdigkontroll'}</strong><p class="muted small">${nesteSp.fokus}</p></div>
            </div>
            <a class="knapp liten" href="#/p/${p.id}/sjekkpunkter" style="justify-self:start">Gå til sjekkpunktene</a>
          </div></div>` : ''}
        <div class="kort"><div class="kort-topp"><h2>${icon('users')} Fremdrift per fag</h2></div>${fagListe(oppgaver, dag)}</div>
      </div>
    </div>`}`.toString();
  koblOppgaver(el, ctx);
  $('[data-import]', el)?.addEventListener('click', () => importer(ctx));
  $('[data-ny]', el)?.addEventListener('click', () => aapneOppgave(null, ctx));
}

export function milepaelListe(milepaeler, dag) {
  if (!milepaeler.length) return html`<div class="tom">Ingen milepæler lagt inn.</div>`;
  return html`<ul class="tidslinje">${milepaeler.map((m) => {
    const n = dagerMellom(dag, m.dato);
    return html`<li class="${m.type} ${m.naadd ? 'naadd' : ''} ${n === 0 ? 'idag' : ''}">
      <span class="dato">${ddmm(m.dato)}</span><span class="navn">${m.navn}</span>
      <span class="naar">${m.naadd ? '✔ Nådd' : n === 0 ? 'I dag' : n > 0 ? `om ${n} d` : html`<span class="text-fare">${-n} d siden</span>`}</span>
    </li>`;
  })}</ul>`;
}

function fagListe(oppgaver, dag) {
  const fag = new Map();
  for (const o of oppgaver) {
    const k = o.fag || 'Uten fag';
    const r = fag.get(k) || { total: 0, ferdig: 0, forsinket: 0 };
    r.total++;
    if (o.godkjent) r.ferdig++;
    else if (!o.ferdig_meldt && o.til < dag) r.forsinket++;
    fag.set(k, r);
  }
  return html`<div class="fagliste">${[...fag.entries()].map(([navn, r]) => {
    const pst = Math.round((r.ferdig / r.total) * 100);
    return html`<div class="fagrad">${fagMerke(navn)}<span class="tall-lite">${r.forsinket ? html`<span class="text-fare">${r.forsinket} forsinket · </span>` : ''}${r.ferdig}/${r.total}</span>${bar(pst, pst === 100 ? 'ok' : '')}</div>`;
  })}</div>`;
}

// ---------- Fremdriftsplan med Gantt ----------

const DAG_BREDDE = 30;

function plan(el, ctx) {
  const { prosjekt: p, oppgaver, dag, milepaeler } = ctx;
  const fagValg = [...new Set(oppgaver.map((o) => o.fag || ''))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'));
  el.innerHTML = html`
    <div class="verktoy">
      <div class="sok">${icon('search')}<input type="search" placeholder="Søk i oppgaver" value="${planValg.sok}" data-sok></div>
      <select data-fag><option value="">Alle fag</option>${fagValg.map((f) => html`<option ${planValg.fag === f ? 'selected' : ''}>${f}</option>`)}</select>
      <select data-vis>
        ${[['alle', 'Alle oppgaver'], ['apne', 'Bare åpne'], ['venter', 'Venter på godkjenning'], ['forsinket', 'Forsinket'], ['uke', 'Denne og neste uke']].map(
          ([k, t]) => html`<option value="${k}" ${planValg.vis === k ? 'selected' : ''}>${t}</option>`,
        )}
      </select>
      <span class="spacer"></span>
      <div class="segment" role="group" aria-label="Visning">
        <button data-modus="gantt" class="${planValg.modus === 'gantt' ? 'aktiv' : ''}">${icon('gantt')} Gantt</button>
        <button data-modus="liste" class="${planValg.modus === 'liste' ? 'aktiv' : ''}">${icon('list')} Liste</button>
      </div>
      <button class="knapp" data-forskyv>${icon('shift')} Forskyv</button>
      <button class="knapp" data-import>${icon('upload')} Importer Excel</button>
    </div>
    <div id="plan"></div>`.toString();
  const tegn = () => tegnPlan($('#plan', el), ctx);
  $('[data-sok]', el).addEventListener('input', (e) => {
    planValg.sok = e.target.value;
    tegn();
  });
  $('[data-fag]', el).addEventListener('change', (e) => {
    planValg.fag = e.target.value;
    tegn();
  });
  $('[data-vis]', el).addEventListener('change', (e) => {
    planValg.vis = e.target.value;
    tegn();
  });
  $$('[data-modus]', el).forEach((b) =>
    b.addEventListener('click', () => {
      planValg.modus = b.dataset.modus;
      $$('[data-modus]', el).forEach((x) => x.classList.toggle('aktiv', x === b));
      tegn();
    }),
  );
  $('[data-import]', el).addEventListener('click', () => importer(ctx));
  $('[data-forskyv]', el).addEventListener('click', () => forskyv(ctx));
  tegn();
}

function filtrer(oppgaver, dag) {
  const sok = planValg.sok.trim().toLowerCase();
  const ukeSlutt = leggTilDager(dag, 13 - ukedag(dag));
  const ukeStart = leggTilDager(dag, -ukedag(dag));
  return oppgaver.filter((o) => {
    if (planValg.fag && o.fag !== planValg.fag) return false;
    if (sok && !`${o.nr} ${o.tittel} ${o.fag} ${o.merknad || ''}`.toLowerCase().includes(sok)) return false;
    const s = oppgaveStatus(o, dag);
    if (planValg.vis === 'apne' && s === 'ferdig') return false;
    if (planValg.vis === 'venter' && s !== 'meldt') return false;
    if (planValg.vis === 'forsinket' && s !== 'forsinket') return false;
    if (planValg.vis === 'uke' && (o.til < ukeStart || o.fra > ukeSlutt)) return false;
    return true;
  });
}

function tegnPlan(el, ctx) {
  const { prosjekt: p, dag, milepaeler } = ctx;
  const rader = filtrer(ctx.oppgaver, dag);
  if (!ctx.oppgaver.length) {
    el.innerHTML = html`<div class="kort tom">${icon('gantt')} Ingen oppgaver ennå. Importer Excel-planen eller legg til en oppgave.</div>`.toString();
    return;
  }
  // Tidsaksen: fra mandagen før første aktivitet til søndagen etter siste.
  const alleDatoer = [...ctx.oppgaver.flatMap((o) => [o.fra, o.til]), ...milepaeler.map((m) => m.dato), p.start, p.sluttfrist, dag].filter(Boolean).sort();
  const start = leggTilDager(alleDatoer[0], -ukedag(alleDatoer[0]));
  const sisteDato = alleDatoer[alleDatoer.length - 1];
  const slutt = leggTilDager(sisteDato, 6 - ukedag(sisteDato));
  const antall = dagerMellom(start, slutt) + 1;
  const dager = Array.from({ length: antall }, (_, i) => leggTilDager(start, i));
  const sp = new Set(sjekkpunkter(p.start || start, p.sluttfrist || slutt).map((s) => s.dato));
  const mpPerDag = new Map(milepaeler.map((m) => [m.dato, m]));
  const gantt = planValg.modus === 'gantt';

  const grupper = new Map();
  for (const o of [...rader].sort((a, b) => (a.fag || '~').localeCompare(b.fag || '~', 'nb') || a.sortering - b.sortering || a.fra.localeCompare(b.fra))) {
    const k = o.fag || 'Uten fag';
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k).push(o);
  }

  const uker = [];
  for (let i = 0; i < antall; i += 7) uker.push(dager[i]);
  const bakgrunn = html`<div class="g-bakgrunn">${dager.map(
    (d) => html`<div class="${ukedag(d) === 0 ? 'uke' : ''} ${erHelg(d) ? 'helg' : ''} ${sp.has(d) ? 'spdag' : ''} ${d === dag ? 'idag' : ''}"></div>`,
  )}</div>`;

  const radHtml = (o) => {
    const s = oppgaveStatus(o, dag);
    const hvem = ctx.personer.find((x) => x.id === o.ansvarlig_id)?.navn;
    const venstre = dagerMellom(start, o.fra) * DAG_BREDDE + 2;
    const bredde = (dagerMellom(o.fra, o.til) + 1) * DAG_BREDDE - 4;
    const klasse = s === 'ferdig' ? 'ferdig' : s === 'meldt' ? 'meldt' : s === 'forsinket' ? 'forsinket' : o.prioritet;
    return html`<div class="plan-rad ${s === 'ferdig' ? 'ferdig' : ''}" data-oppgave="${o.id}">
      <div class="pc pv">
        <button class="huk ${o.godkjent ? 'ferdig' : o.ferdig_meldt ? 'meldt' : ''}" data-huk="${o.id}"
          title="${o.godkjent ? 'Godkjent – klikk for å ta tilbake' : o.ferdig_meldt ? 'Meldt ferdig – klikk for å godkjenne' : 'Klikk for å godkjenne som ferdig'}"
          aria-label="Godkjenn ${o.tittel}">${icon('check')}</button>
        <span class="nr">${o.nr || ''}</span>
        <span class="tittelcelle"><strong>${o.uleste ? html`<span class="ulest-prikk" title="${o.uleste} ny melding"></span>` : ''}${o.tittel}</strong><small><span class="vis-mobil">${ddmm(o.fra)}–${ddmm(o.til)} · </span>${[hvem, o.merknad].filter(Boolean).join(' · ') || ' '}</small></span>
        <span class="datoer skjul-kompakt">${ddmm(o.fra)}–${ddmm(o.til)}</span>
        <span class="prio ${o.prioritet} skjul-kompakt">${PRIORITET_TEKST[o.prioritet]}</span>
        ${statusChip(o, dag)}
      </div>
      ${gantt ? html`<div class="pc spor" style="width:${antall * DAG_BREDDE}px">${bakgrunn}
        <div class="g-bar ${klasse} ${bredde < 60 ? 'kort-bar' : ''}" style="left:${venstre}px;width:${bredde}px" title="${o.tittel} · ${ddmm(o.fra)}–${ddmm(o.til)}">${bredde >= 60 ? o.tittel : ''}</div>
      </div>` : ''}
    </div>`;
  };

  el.innerHTML = html`<div class="plan ${gantt ? 'kompakt' : ''}">
    <div class="plan-rull">
      <div class="plan-tabell" style="grid-template-columns:${gantt ? `var(--venstre) ${antall * DAG_BREDDE}px` : 'minmax(760px, 1fr)'};--dag:${DAG_BREDDE}px">
        <div class="plan-hode">
          <div class="pv"><span></span><span>Nr</span><span>Oppgave</span><span class="skjul-kompakt">Periode</span><span class="skjul-kompakt">Prioritet</span><span>Status</span></div>
          ${gantt ? html`<div class="ph">
            <div class="g-uker">${uker.map((u) => html`<div style="width:${7 * DAG_BREDDE}px">Uke ${isoUke(u)}<span>${ddmm(u)}–${ddmm(leggTilDager(u, 6))}</span></div>`)}</div>
            <div class="g-dager">${dager.map(
              (d) => html`<div class="${erHelg(d) ? 'helg' : ''} ${sp.has(d) ? 'spdag' : ''} ${d === dag ? 'idag' : ''}">${'MTOTFLS'[ukedag(d)]}<b>${Number(d.slice(8))}</b></div>`,
            )}</div>
            <div class="g-hendelser">${dager.map((d) => {
              const m = mpPerDag.get(d);
              return html`<div>${m ? html`<span class="ruter ${m.type} ${m.naadd ? 'naadd' : ''}" title="${ddmm(d)}: ${m.navn}"></span>` : sp.has(d) ? html`<span class="sp" title="Sjekkpunkt">✓</span>` : ''}</div>`;
            })}</div>
          </div>` : ''}
        </div>
        ${rader.length
          ? [...grupper.entries()].map(([fag, liste]) => {
              const fr = fremdrift(liste);
              return html`<div class="plan-fag"><div class="fag-innhold"><span class="fagmerke" style="--hue:${fagHue(fag)}"><i></i>${fag}</span>${bar(fr.prosent, fr.prosent === 100 ? 'ok' : '')}<span class="muted">${fr.ferdig}/${fr.total}</span></div></div>
                ${liste.map(radHtml)}`;
            })
          : html`<div class="plan-fag" style="grid-column:1 / -1;text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted)">Ingen oppgaver passer filteret.</div>`}
      </div>
    </div>
    ${gantt ? html`<div class="g-forklaring">
      <span><i style="background:var(--g-kritisk)"></i>Kritisk</span><span><i style="background:var(--g-hoy)"></i>Høy</span>
      <span><i style="background:var(--g-normal)"></i>Normal</span><span><i style="background:repeating-linear-gradient(135deg,#c3cdd6 0 4px,#d4dce3 4px 8px)"></i>Tentativ</span>
      <span><i style="background:var(--g-meldt)"></i>Meldt ferdig</span><span><i style="background:var(--g-ferdig)"></i>Godkjent</span>
      <span><i style="background:var(--g-forsinket)"></i>Forsinket</span><span><i style="background:var(--g-sjekk);border:1px solid #f1d9bf"></i>Sjekkpunkt (man/fre)</span>
      <span><i style="background:var(--signal);width:3px"></i>I dag</span>
    </div>` : ''}
  </div>`.toString();

  // Rull slik at i dag er synlig litt inn fra venstre.
  const rull = $('.plan-rull', el);
  if (gantt) rull.scrollLeft = Math.max(0, dagerMellom(start, dag) * DAG_BREDDE - 3 * DAG_BREDDE);

  $$('[data-oppgave]', el).forEach((r) =>
    r.addEventListener('click', (e) => {
      if (e.target.closest('[data-huk]')) return;
      if (!e.target.closest('.pv') && !e.target.closest('.g-bar')) return;
      aapneOppgave(ctx.oppgaver.find((o) => o.id === Number(r.dataset.oppgave)), ctx);
    }),
  );
  $$('[data-huk]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      const o = ctx.oppgaver.find((x) => x.id === Number(b.dataset.huk));
      if (o.godkjent && !(await bekreft('Ta tilbake godkjenningen?', `«${o.tittel}» teller da ikke lenger som ferdig.`, { ok: 'Ta tilbake' }))) return;
      const r = await attempt(() => api.post(`/oppgaver/${o.id}/godkjenn`, { godkjent: !o.godkjent }));
      if (r) {
        Object.assign(o, r);
        tegnPlan(el, ctx);
        oppfrisk();
        toast(r.godkjent ? `Godkjent: ${o.tittel}` : 'Godkjenningen er tatt tilbake');
      }
    }),
  );
}

// Flytt mange oppgaver på én gang, regnet i arbeidsdager.
async function forskyv(ctx) {
  const { prosjekt: p, oppgaver, dag } = ctx;
  const fagValg = [...new Set(oppgaver.map((o) => o.fag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
  await modal({
    tittel: 'Forskyv planen',
    undertittel: 'Flytt alle åpne oppgaver fra en dato og utover. Godkjente oppgaver blir liggende.',
    innhold: html`<form class="skjema" id="forskyv">
      <div class="rad2">
        <label class="felt"><span>Fag</span><select name="fag"><option value="">Alle fag</option>${fagValg.map((f) => html`<option>${f}</option>`)}</select></label>
        <label class="felt"><span>Oppgaver som starter fra og med</span><input type="date" name="fra" value="${dag}" required></label>
      </div>
      <div class="felt"><span>Flytt</span>
        <div class="stepper">
          <button type="button" class="knapp" data-steg="-5">−5</button><button type="button" class="knapp" data-steg="-1">−1</button>
          <input type="text" inputmode="numeric" name="dager" value="1" aria-label="Antall arbeidsdager">
          <button type="button" class="knapp" data-steg="1">+1</button><button type="button" class="knapp" data-steg="5">+5</button>
        </div>
        <small>Arbeidsdager. Positivt tall flytter frem i tid, negativt tilbake. Helger hoppes over.</small></div>
      <div class="kort forhandsvis" data-forhandsvis></div>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Forskyv</button></div>
    </form>`,
    onMount: (el, lukk) => {
      const form = $('#forskyv', el);
      const valgte = () => {
        const d = formData(form);
        return oppgaver.filter((o) => !o.godkjent && o.fra >= d.fra && (!d.fag || (o.fag || '').toLowerCase() === d.fag.toLowerCase()));
      };
      const vis = () => {
        const n = Number(form.elements.dager.value);
        const liste = valgte();
        const gyldig = Number.isInteger(n) && n !== 0;
        $('[data-forhandsvis]', el).innerHTML = html`<strong>${liste.length} ${liste.length === 1 ? 'oppgave' : 'oppgaver'} flyttes${gyldig ? ` ${Math.abs(n)} ${Math.abs(n) === 1 ? 'arbeidsdag' : 'arbeidsdager'} ${n > 0 ? 'frem' : 'tilbake'}` : ''}</strong>
          ${liste.length ? html`<ul>${liste.slice(0, 6).map((o) => html`<li>${o.tittel} <span class="muted mono">${ddmm(o.fra)}–${ddmm(o.til)}${gyldig ? html` → ${ddmm(flyttArbeidsdager(o.fra, n))}–${ddmm(flyttArbeidsdager(o.til, n))}` : ''}</span></li>`)}
            ${liste.length > 6 ? html`<li class="muted">+ ${liste.length - 6} flere</li>` : ''}</ul>` : ''}`.toString();
      };
      $$('[data-steg]', el).forEach((b) => b.addEventListener('click', () => {
        let n = (Number(form.elements.dager.value) || 0) + Number(b.dataset.steg);
        if (n === 0) n = Number(b.dataset.steg) > 0 ? 1 : -1;
        form.elements.dager.value = n;
        vis();
      }));
      form.addEventListener('input', vis);
      vis();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = formData(form);
        if (!valgte().length) return toast('Ingen oppgaver å flytte', 'feil');
        const r = await attempt(() => api.post(`/prosjekter/${p.id}/forskyv`, { fag: d.fag, fra: d.fra, dager: Number(d.dager) }));
        if (r) {
          toast(`${r.flyttet} oppgaver er flyttet`);
          lukk(true);
          ctx.onEndret();
        }
      });
    },
  });
}

async function importer(ctx) {
  await modal({
    tittel: 'Importer fremdriftsplan',
    undertittel: 'Fra Excel-filen med arkene «Fremdriftsplan» og «Oversikt».',
    innhold: html`<form class="skjema" id="imp">
      <label class="felt"><span>Excel-fil (.xlsx)</span><input type="file" accept=".xlsx" name="fil" required></label>
      <p class="small muted" data-info></p>
      <label class="avkrysning"><input type="checkbox" name="erstatt" ${ctx.oppgaver.length ? '' : 'checked'}>
        <span>Erstatt planen som ligger inne<small>Alle oppgaver og milepæler i prosjektet slettes først, også samtalene på oppgavene.</small></span></label>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Importer</button></div>
    </form>`,
    onMount: (el, lukk) => {
      const form = $('#imp', el);
      let plan = null;
      form.elements.fil.addEventListener('change', async (e) => {
        plan = await attempt(() => lesFremdriftsplan(e.target.files[0]));
        $('[data-info]', el).textContent = plan ? `Fant ${plan.oppgaver.length} oppgaver og ${plan.milepaeler.length} milepæler.` : '';
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!plan) return;
        if (form.elements.erstatt.checked && ctx.oppgaver.length && !(await bekreft('Erstatte planen?', 'Dagens oppgaver, milepæler og samtaler slettes.', { ok: 'Erstatt', fare: true }))) return;
        const r = await attempt(() => api.post(`/prosjekter/${ctx.prosjekt.id}/import`, { ...plan, erstatt: form.elements.erstatt.checked }));
        if (r) {
          toast(`Importerte ${r.oppgaver} oppgaver og ${r.milepaeler} milepæler`);
          lukk(true);
          ctx.onEndret();
        }
      });
    },
  });
}

// ---------- Sjekkpunkter ----------

function sjekkFane(el, ctx) {
  const { prosjekt: p, oppgaver, dag } = ctx;
  const slutt = p.sluttfrist || oppgaver.reduce((m, o) => (o.til > m ? o.til : m), '');
  const liste = sjekkpunkter(p.start || oppgaver.reduce((m, o) => (!m || o.fra < m ? o.fra : m), ''), slutt);
  const lagret = new Map(ctx.sjekkpunkter.map((s) => [s.dato, s]));
  if (!liste.length) {
    el.innerHTML = html`<div class="kort tom">${icon('calendar')} Sett oppstart og sluttfrist under Innstillinger, så kommer sjekkpunktene hver mandag og fredag.</div>`.toString();
    return;
  }
  const kort = liste.map((s, i) => {
    const forrige = liste[i - 1];
    const lag = lagret.get(s.dato) || {};
    // Mandag: frister på mandagen og det som starter denne uken. Fredag: frister tirsdag–søndag.
    const fristFra = s.type === 'mandag' ? (i === 0 ? '0000-00-00' : s.dato) : leggTilDager(s.dato, -3);
    const fristTil = s.type === 'mandag' ? s.dato : leggTilDager(s.dato, 2);
    const frister = oppgaver.filter((o) => o.til >= fristFra && o.til <= fristTil).sort((a, b) => a.til.localeCompare(b.til));
    const oppstart = s.type === 'mandag' ? oppgaver.filter((o) => o.fra >= (i === 0 ? '0000-00-00' : s.dato) && o.fra <= leggTilDager(s.dato, 6)).sort((a, b) => a.fra.localeCompare(b.fra)) : [];
    const milepaeler = ctx.milepaeler.filter((m) => m.dato >= s.dato && m.dato < (liste[i + 1]?.dato || leggTilDager(s.dato, 4)));
    const ferdigAndel = frister.length ? Math.round((frister.filter((o) => o.godkjent).length / frister.length) * 100) : null;
    const punkt = (o) => html`<li class="${o.godkjent ? 'ferdig' : ''}">${o.godkjent ? icon('check') : html`<span class="prikk ${!o.ferdig_meldt && o.til < dag ? 'fare' : ''}"></span>`}
      <span>${o.tittel} <span class="muted xs">· ${o.fag || ''} · ${ddmm(s.type === 'mandag' && oppstart.includes(o) ? o.fra : o.til)}</span></span></li>`;
    return html`<div class="kort sjekk ${s.dato === dag ? 'idag' : ''} ${lag.utfort ? 'utfort' : ''}" id="sp-${s.dato}">
      <div class="dag"><small>${DAGNAVN[ukedag(s.dato)].slice(0, 3)}</small><b>${Number(s.dato.slice(8))}</b><small>${datoKort(s.dato).split(' ')[1]}</small></div>
      <div>
        <h3>${s.type === 'mandag' ? 'Oppstartsmøte' : 'Ferdigkontroll'} <span class="muted small" style="font-weight:500">uke ${isoUke(s.dato)}</span>
          ${lag.utfort ? html`<span class="chip ok">Utført</span>` : s.dato < dag ? html`<span class="chip varsel">Ikke utført</span>` : s.dato === dag ? html`<span class="chip aktiv">I dag</span>` : ''}
          ${ferdigAndel !== null ? html`<span class="chip ${ferdigAndel === 100 ? 'ok' : s.dato <= dag ? 'fare' : ''} ren">${ferdigAndel}% av fristene godkjent</span>` : ''}
          <span class="spacer"></span>
          <label class="avkrysning" style="margin-left:auto"><input type="checkbox" data-utfort="${s.dato}" ${lag.utfort ? 'checked' : ''}> Utført</label></h3>
        <p class="muted small" style="margin-top:2px">${s.fokus}</p>
        <div class="punkter">
          ${milepaeler.length ? html`<div><h4>Milepæler</h4><ul>${milepaeler.map((m) => html`<li><span class="prikk" style="background:var(--signal);border-radius:2px;transform:rotate(45deg)"></span>${ddmm(m.dato)} – ${m.navn}</li>`)}</ul></div>` : ''}
          ${frister.length ? html`<div><h4>Skal være ferdig</h4><ul>${frister.map(punkt)}</ul></div>` : ''}
          ${oppstart.length ? html`<div><h4>Starter denne uken – bekreft bemanning</h4><ul>${oppstart.map(punkt)}</ul></div>` : ''}
        </div>
        <textarea data-notat="${s.dato}" placeholder="Avvik, tiltak og beslutninger fra møtet …">${lag.notat || ''}</textarea>
      </div>
    </div>`;
  });
  el.innerHTML = html`<div class="sjekk-liste">${kort}</div>`.toString();
  const neste = liste.find((s) => s.dato >= dag);
  if (neste) setTimeout(() => $(`#sp-${neste.dato}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  const lagre = async (dato) => {
    const utfort = $(`[data-utfort="${dato}"]`, el).checked;
    const notat = $(`[data-notat="${dato}"]`, el).value;
    const r = await attempt(() => api.put(`/prosjekter/${p.id}/sjekkpunkter/${dato}`, { utfort, notat }));
    if (r) {
      const i = ctx.sjekkpunkter.findIndex((s) => s.dato === dato);
      if (i >= 0) ctx.sjekkpunkter[i] = r;
      else ctx.sjekkpunkter.push(r);
    }
    return r;
  };
  $$('[data-utfort]', el).forEach((c) => c.addEventListener('change', async () => {
    if (await lagre(c.dataset.utfort)) {
      toast(c.checked ? 'Sjekkpunktet er utført' : 'Sjekkpunktet er åpnet igjen');
      sjekkFane(el, ctx);
    }
  }));
  $$('[data-notat]', el).forEach((t) => t.addEventListener('change', async () => {
    if (await lagre(t.dataset.notat)) toast('Notatet er lagret');
  }));
}

// ---------- Kundeside ----------

// Avkrysning for å varsle kunden på e-post. Uten e-postoppsett vises den, men er slått av,
// så prosjektlederen ikke tror kunden har fått beskjed.
export function epostValg(cls = '', hint = '') {
  return store.epost
    ? html`<label class="avkrysning ${cls}"><input type="checkbox" name="varsle_kunde" checked><span>Send e-post til kunden${hint ? html`<small>${hint}</small>` : ''}</span></label>`
    : html`<label class="avkrysning ${cls} muted" title="Legg inn RESEND og MAIL_FROM i Vercel for å sende e-post"><input type="checkbox" disabled><span>Send e-post til kunden<small>E-post er ikke satt opp ennå</small></span></label>`;
}

function kundeFane(el, ctx) {
  const { prosjekt: p } = ctx;
  const lenke = `${location.origin}/k/${p.kunde_token}`;
  const egne = ctx.oppgaver.filter((o) => o.kunde_styrt);
  el.innerHTML = html`<div class="to-kol">
    <div class="kol">
      <div class="kort">
        <div class="kort-topp"><h2>${icon('message')} Oppdateringer til kunden</h2></div>
        <form class="kort-innhold skjema" id="ny-oppd" style="gap:12px">
          <input type="text" name="tittel" placeholder="Overskrift, f.eks. «Flisene på badet er lagt»" required>
          <textarea name="tekst" placeholder="Fortell kort hva som har skjedd og hva som kommer."></textarea>
          <div class="bildestripe" data-bilder></div>
          <div class="skriv-rad">
            <label class="knapp liten">${icon('camera')} Legg til bilder<input type="file" accept="image/*" multiple class="sr" name="bilder"></label>
            ${p.kunde_epost ? epostValg('small') : ''}
            <span class="spacer"></span><button class="knapp primar liten">Publiser</button>
          </div>
        </form>
        ${ctx.oppdateringer.map((u) => html`<div class="oppdatering">
          <div style="display:flex;gap:10px;align-items:baseline"><strong>${u.tittel}</strong><span class="muted xs">${new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium' }).format(new Date(u.publisert))}</span>
            <span class="spacer"></span><button class="ikon-knapp" data-slett-oppd="${u.id}" title="Slett" aria-label="Slett oppdatering">${icon('trash')}</button></div>
          ${u.tekst ? html`<p class="pre small" style="margin-top:4px;color:var(--fg-2)">${u.tekst}</p>` : ''}
          ${u.bilder.length ? html`<div class="bildestripe">${u.bilder.map((b) => html`<img src="${api.filUrl(b)}" alt="" loading="lazy">`)}</div>` : ''}
        </div>`)}
      </div>
    </div>
    <div class="kol">
      <div class="kort"><div class="kort-topp"><h2>${icon('link')} Kundelenke</h2>${p.kunde_aktiv ? html`<span class="chip ok">Aktiv</span>` : html`<span class="chip">Stengt</span>`}</div>
        <div class="kort-innhold" style="display:grid;gap:12px">
          <p class="small muted">Alle som har lenken, ser kundesiden. Kunden trenger ingen innlogging.</p>
          <div class="lenkeboks"><code>${lenke}</code><button class="knapp liten" data-kopier>${icon('copy')} Kopier</button></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="knapp liten" href="/k/${p.kunde_token}" target="_blank" rel="noopener">${icon('eye')} Åpne</a>
            ${p.kunde_epost ? html`<a class="knapp liten" href="mailto:${p.kunde_epost}?subject=${encodeURIComponent(`Prosjektsiden for ${p.navn}`)}&body=${encodeURIComponent(`Hei!\n\nHer kan du følge fremdriften i prosjektet:\n${lenke}\n\nHilsen ${ctx.personer.find((x) => x.rolle === 'leder')?.navn || ''}`)}">${icon('message')} Send på e-post</a>` : ''}
            ${p.kunde_telefon ? html`<a class="knapp liten" href="sms:${p.kunde_telefon}?&body=${encodeURIComponent(`Her kan du følge prosjektet: ${lenke}`)}">${icon('phone')} SMS</a>` : ''}
            <button class="knapp liten lys" data-ny-lenke>${icon('refresh')} Ny lenke</button>
            <button class="knapp liten lys" data-steng>${p.kunde_aktiv ? 'Steng siden' : 'Åpne siden'}</button>
          </div>
          <div style="display:flex;gap:12px;align-items:center;border-top:1px solid var(--line-soft);padding-top:12px">
            ${p.forsidebilde_id ? html`<img src="${api.filUrl(p.forsidebilde_id)}" alt="" style="width:76px;height:52px;object-fit:cover;border-radius:8px">` : html`<span class="avatar stor" style="--hue:210;border-radius:10px">${icon('image')}</span>`}
            <div style="flex:1"><strong class="small">Forsidebilde</strong><p class="muted xs">Vises øverst på kundesiden og på prosjektkortet.</p></div>
            <label class="knapp liten">${icon('upload')} ${p.forsidebilde_id ? 'Bytt' : 'Last opp'}<input type="file" accept="image/*" class="sr" data-forside></label>
          </div>
        </div></div>

      <div class="kort"><div class="kort-topp"><h2>${icon('help')} Beslutninger kunden skal ta</h2><span class="spacer"></span><button class="knapp liten" data-ny-beslutning>${icon('plus')} Nytt spørsmål</button></div>
        ${ctx.beslutninger.length
          ? ctx.beslutninger.map((b) => html`<div class="beslutning">
              <div style="display:flex;gap:10px;align-items:center"><strong style="flex:1">${b.sporsmal}</strong>
                ${b.besvart ? html`<span class="chip ok">Besvart</span>` : b.frist && b.frist < ctx.dag ? html`<span class="chip fare">Frist passert</span>` : html`<span class="chip varsel">Venter på kunden</span>`}
                <button class="ikon-knapp" data-slett-besl="${b.id}" title="Slett" aria-label="Slett spørsmål">${icon('trash')}</button></div>
              ${b.beskrivelse ? html`<p class="small muted">${b.beskrivelse}</p>` : ''}
              ${b.alternativer.length ? html`<div class="alternativer">${b.alternativer.map((a) => html`<span class="${b.svar === a ? 'valgt' : ''}">${a}</span>`)}</div>` : ''}
              ${b.besvart ? html`<p class="small"><strong>Svar:</strong> ${b.svar}${b.svar_kommentar ? html` – «${b.svar_kommentar}»` : ''} <span class="muted xs">(${new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(b.besvart))})</span></p>`
                : b.frist ? html`<p class="xs muted">Svarfrist ${datoMedDag(b.frist)}</p>` : ''}
            </div>`)
          : html`<div class="tom">Ingen spørsmål ennå. Bruk det for valg kunden må ta – farger, fliser, plassering av stikk.</div>`}
      </div>

      <div class="kort"><div class="kort-topp"><h2>${icon('calendar')} Leveranser kunden styrer</h2><span class="antall">${egne.length}</span></div>
        ${egne.length ? html`<ul class="oliste">${egne.map((o) => oppgaveRad(o, ctx))}</ul>`
          : html`<div class="tom">Ingen. Kryss av «Styres av kunden» på en oppgave for at kunden skal kunne flytte datoene selv.</div>`}
      </div>
    </div>
  </div>`.toString();
  koblOppgaver(el, ctx);

  $('[data-kopier]', el).addEventListener('click', () => kopier(lenke));
  $('[data-ny-lenke]', el).addEventListener('click', async () => {
    if (!(await bekreft('Lage ny kundelenke?', 'Den gamle lenken slutter å virke med en gang. Du må sende den nye til kunden.', { ok: 'Lag ny lenke' }))) return;
    if (await attempt(() => api.post(`/prosjekter/${p.id}/kundelenke`), 'Ny lenke er laget')) ctx.onEndret();
  });
  $('[data-steng]', el).addEventListener('click', async () => {
    if (await attempt(() => api.put(`/prosjekter/${p.id}`, { kunde_aktiv: !p.kunde_aktiv }), p.kunde_aktiv ? 'Kundesiden er stengt' : 'Kundesiden er åpnet')) ctx.onEndret();
  });
  $('[data-forside]', el).addEventListener('change', async (e) => {
    const v = await attempt(() => api.lastOpp(e.target.files[0], p.id));
    if (v && (await attempt(() => api.put(`/prosjekter/${p.id}`, { forsidebilde_id: v.id }), 'Forsidebildet er oppdatert'))) ctx.onEndret();
  });

  const form = $('#ny-oppd', el);
  const bilder = [];
  const visBilder = () => {
    $('[data-bilder]', el).innerHTML = html`${bilder.map((b, i) => html`<div class="fjern"><img src="${api.filUrl(b.id)}" alt=""><button type="button" data-fjern="${i}" aria-label="Fjern bilde">${icon('x')}</button></div>`)}`.toString();
    $$('[data-fjern]', el).forEach((x) => x.addEventListener('click', () => {
      bilder.splice(Number(x.dataset.fjern), 1);
      visBilder();
    }));
  };
  form.elements.bilder.addEventListener('change', async (e) => {
    for (const fil of e.target.files) {
      $('[data-bilder]', el).insertAdjacentHTML('beforeend', '<div class="bilde-plass"></div>');
      const v = await attempt(() => api.lastOpp(fil, p.id));
      if (v) bilder.push(v);
      visBilder();
    }
    e.target.value = '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    if (await attempt(() => api.post(`/prosjekter/${p.id}/oppdateringer`, { tittel: d.tittel, tekst: d.tekst, bilder: bilder.map((b) => b.id), varsle_kunde: d.varsle_kunde }), 'Oppdateringen er publisert')) ctx.onEndret();
  });
  $$('[data-slett-oppd]', el).forEach((b) => b.addEventListener('click', async () => {
    if ((await bekreft('Slette oppdateringen?', 'Den forsvinner fra kundesiden.', { ok: 'Slett', fare: true })) && (await attempt(() => api.del(`/oppdateringer/${b.dataset.slettOppd}`)))) ctx.onEndret();
  }));
  $$('[data-slett-besl]', el).forEach((b) => b.addEventListener('click', async () => {
    if ((await bekreft('Slette spørsmålet?', 'Spørsmålet og et eventuelt svar slettes.', { ok: 'Slett', fare: true })) && (await attempt(() => api.del(`/beslutninger/${b.dataset.slettBesl}`)))) ctx.onEndret();
  }));
  $('[data-ny-beslutning]', el).addEventListener('click', () => modal({
    tittel: 'Nytt spørsmål til kunden',
    innhold: html`<form class="skjema" id="besl">
      <label class="felt"><span>Spørsmål</span><input type="text" name="sporsmal" required placeholder="F.eks. «Farge på epoksyfuger i gangen»"></label>
      <label class="felt"><span>Forklaring</span><textarea name="beskrivelse" placeholder="Det kunden trenger å vite for å velge."></textarea></label>
      <label class="felt"><span>Alternativer</span><input type="text" name="alternativer" placeholder="Grå, Sort, Hvit"><small>Skill med komma. La stå tomt for fritt svar.</small></label>
      <label class="felt"><span>Svarfrist</span><input type="date" name="frist"></label>
      ${p.kunde_epost ? epostValg('', `${p.kunde_epost} får beskjed om at det ligger et spørsmål på prosjektsiden.`) : ''}
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Send til kunden</button></div>
    </form>`,
    onMount: (m, lukk) => $('#besl', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      d.alternativer = d.alternativer.split(',').map((s) => s.trim()).filter(Boolean);
      if (await attempt(() => api.post(`/prosjekter/${p.id}/beslutninger`, d), 'Spørsmålet ligger nå på kundesiden')) {
        lukk(true);
        ctx.onEndret();
      }
    }),
  }));
}

// ---------- Logg ----------

async function loggFane(el, ctx) {
  const rader = await api.get(`/prosjekter/${ctx.prosjekt.id}/logg`);
  const fmt = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  el.innerHTML = html`<div class="kort">
    ${rader.length ? html`<ul class="personliste">${rader.map((r) => html`<li class="person">
      ${avatar(r.hvem || '?')}<div class="hvem"><strong style="font-weight:520">${r.handling}</strong><small><span>${r.hvem || 'Systemet'}</span><span>${fmt.format(new Date(r.tidspunkt))}</span>
        ${r.detaljer?.til ? html`<span class="mono">${ddmm(r.detaljer.fra[0])}–${ddmm(r.detaljer.til[0])} → ${ddmm(r.detaljer.fra[1])}–${ddmm(r.detaljer.til[1])}</span>` : ''}
        ${r.detaljer?.grunn ? html`<span>«${r.detaljer.grunn}»</span>` : ''}</small></div><span></span></li>`)}</ul>`
      : html`<div class="tom">Ingenting er logget ennå.</div>`}
  </div>`.toString();
}

// ---------- Innstillinger ----------

function innstillinger(el, ctx) {
  const { prosjekt: p } = ctx;
  el.innerHTML = html`<div class="to-kol">
    <div class="kort"><div class="kort-topp"><h2>Prosjektet</h2></div>
      <form class="kort-innhold skjema" id="pform">
        <div class="rad2"><label class="felt"><span>Prosjektnavn</span><input type="text" name="navn" value="${p.navn}" required></label>
          <label class="felt"><span>Adresse</span><input type="text" name="adresse" value="${p.adresse || ''}"></label></div>
        <div class="rad3"><label class="felt"><span>Oppstart</span><input type="date" name="start" value="${p.start || ''}"></label>
          <label class="felt"><span>Innflytting</span><input type="date" name="innflytting" value="${p.innflytting || ''}"></label>
          <label class="felt"><span>Sluttfrist</span><input type="date" name="sluttfrist" value="${p.sluttfrist || ''}"></label></div>
        <div class="rad3"><label class="felt"><span>Kunde</span><input type="text" name="kunde_navn" value="${p.kunde_navn || ''}"></label>
          <label class="felt"><span>E-post</span><input type="email" name="kunde_epost" value="${p.kunde_epost || ''}"></label>
          <label class="felt"><span>Telefon</span><input type="tel" name="kunde_telefon" value="${p.kunde_telefon || ''}"></label></div>
        <label class="felt"><span>Kort om prosjektet (vises for kunden)</span><textarea name="beskrivelse">${p.beskrivelse || ''}</textarea></label>
        <div class="knapperad" style="margin-top:4px"><button type="button" class="knapp lys" data-arkiver>${p.arkivert ? 'Gjenåpne prosjektet' : 'Avslutt prosjektet'}</button>
          <button type="button" class="knapp lys text-fare" data-slett>Slett …</button><span class="spacer"></span><button class="knapp primar">Lagre</button></div>
      </form>
    </div>
    <div class="kort"><div class="kort-topp"><h2>${icon('flag')} Milepæler</h2><span class="spacer"></span><button class="knapp liten" data-ny-mp>${icon('plus')} Ny milepæl</button></div>
      ${ctx.milepaeler.length ? html`<ul class="personliste">${ctx.milepaeler.map((m) => html`<li class="person" style="grid-template-columns:auto 1fr auto">
        <label class="huk ${m.naadd ? 'ferdig' : ''}" style="position:relative" title="Nådd">${icon('check')}<input type="checkbox" class="sr" data-naadd="${m.id}" ${m.naadd ? 'checked' : ''}></label>
        <div class="hvem"><strong style="font-weight:560">${m.navn}</strong><small><span class="mono">${datoMedDag(m.dato)}</span><span>${MILEPAEL_TYPER[m.type]}</span>${m.synlig_for_kunde ? '' : html`<span>Skjult for kunden</span>`}</small></div>
        <span><button class="ikon-knapp" data-endre-mp="${m.id}" aria-label="Endre">${icon('settings')}</button></span></li>`)}</ul>`
        : html`<div class="tom">Ingen milepæler.</div>`}
    </div>
  </div>`.toString();
  $('#pform', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await attempt(() => api.put(`/prosjekter/${p.id}`, formData(e.target)), 'Lagret')) ctx.onEndret();
  });
  $('[data-arkiver]', el).addEventListener('click', async () => {
    if (await attempt(() => api.put(`/prosjekter/${p.id}`, { arkivert: !p.arkivert }), p.arkivert ? 'Prosjektet er gjenåpnet' : 'Prosjektet er avsluttet')) ctx.onEndret();
  });
  $('[data-slett]', el).addEventListener('click', () => modal({
    tittel: 'Slette prosjektet?',
    innhold: html`<form class="skjema" id="slett"><p>Alt i prosjektet slettes for godt: plan, samtaler, oppdateringer og kundesiden. Vil du bare rydde, bruk «Avslutt prosjektet».</p>
      <label class="felt"><span>Skriv prosjektnavnet for å bekrefte</span><input type="text" name="bekreft" placeholder="${p.navn}" required></label>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp fare">Slett prosjektet</button></div></form>`,
    onMount: (m, lukk) => $('#slett', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await attempt(() => api.del(`/prosjekter/${p.id}`, { bekreft: e.target.elements.bekreft.value }), 'Prosjektet er slettet')) {
        lukk(true);
        await oppfrisk();
        location.hash = '#/';
      }
    }),
  }));
  $$('[data-naadd]', el).forEach((c) => c.addEventListener('change', async () => {
    if (await attempt(() => api.put(`/milepaeler/${c.dataset.naadd}`, { naadd: c.checked }))) ctx.onEndret();
  }));
  const mpSkjema = (m) => modal({
    tittel: m ? 'Endre milepæl' : 'Ny milepæl',
    innhold: html`<form class="skjema" id="mp">
      <label class="felt"><span>Navn</span><input type="text" name="navn" value="${m?.navn || ''}" required></label>
      <div class="rad2"><label class="felt"><span>Dato</span><input type="date" name="dato" value="${m?.dato || ''}" required></label>
        <label class="felt"><span>Type</span><select name="type">${Object.entries(MILEPAEL_TYPER).map(([k, t]) => html`<option value="${k}" ${(m?.type || 'delmal') === k ? 'selected' : ''}>${t}</option>`)}</select></label></div>
      <label class="avkrysning"><input type="checkbox" name="synlig_for_kunde" ${m?.synlig_for_kunde !== false ? 'checked' : ''}><span>Vis på kundesiden</span></label>
      <div class="knapperad">${m ? html`<button type="button" class="knapp lys" data-slett-mp>${icon('trash')} Slett</button>` : ''}<span class="spacer"></span>
        <button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Lagre</button></div></form>`,
    onMount: (mel, lukk) => {
      $('#mp', mel).addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = formData(e.target);
        if (await attempt(() => (m ? api.put(`/milepaeler/${m.id}`, d) : api.post(`/prosjekter/${p.id}/milepaeler`, d)), 'Lagret')) {
          lukk(true);
          ctx.onEndret();
        }
      });
      $('[data-slett-mp]', mel)?.addEventListener('click', async () => {
        if (await attempt(() => api.del(`/milepaeler/${m.id}`))) {
          lukk(true);
          ctx.onEndret();
        }
      });
    },
  });
  $('[data-ny-mp]', el).addEventListener('click', () => mpSkjema(null));
  $$('[data-endre-mp]', el).forEach((b) => b.addEventListener('click', () => mpSkjema(ctx.milepaeler.find((m) => m.id === Number(b.dataset.endreMp)))));
}
