import { api } from '../api.js';
import { html, icon, $, $$, bar, modal, attempt, formData, toast } from '../ui.js';
import { store, lastProsjekter, fagHue } from '../store.js';
import { lesFremdriftsplan } from '../regneark.js';
import { iDag, dagerMellom, datoMedDag, ddmm } from '/shared/plan.js';
import { tegnMeny } from '../app.js';
import { NAVN } from '/shared/merke.js';

export async function prosjekterView(el) {
  await lastProsjekter();
  tegnMeny();
  document.title = `Prosjekter · ${NAVN}`;
  const dag = iDag();
  const aktive = store.prosjekter.filter((p) => !p.arkivert);
  const arkiv = store.prosjekter.filter((p) => p.arkivert);
  const venter = aktive.reduce((s, p) => s + p.meldt, 0);
  const forsinket = aktive.reduce((s, p) => s + p.forsinket, 0);

  el.innerHTML = html`
    <div class="topp">
      <div class="tittel">
        <div class="over">${store.firma || NAVN}</div>
        <h1>God ${hilsen()}, ${store.me.navn.split(' ')[0]}</h1>
        <div class="under">
          <span>${icon('calendar')} ${datoMedDag(dag)}</span>
          <span>${aktive.length} pågående ${aktive.length === 1 ? 'prosjekt' : 'prosjekter'}</span>
        </div>
      </div>
      <button class="knapp primar" data-nytt>${icon('plus')} Nytt prosjekt</button>
    </div>
    ${venter || forsinket
      ? html`<div class="banner ${forsinket ? 'fare' : 'signal'}">${icon(forsinket ? 'alert' : 'checkCircle')}
          ${[venter ? `${venter} ${venter === 1 ? 'oppgave venter' : 'oppgaver venter'} på godkjenning` : '', forsinket ? `${forsinket} forsinket` : '']
            .filter(Boolean)
            .join(' · ')} – åpne prosjektet for å følge opp</div>`
      : ''}
    <div class="prosjektnett">
      ${aktive.map((p) => prosjektkort(p, dag))}
      <button class="nytt-kort" data-nytt>${icon('plus')}<span>Nytt prosjekt</span><small class="muted">Start tomt eller importer Excel-planen</small></button>
    </div>
    ${arkiv.length
      ? html`<h2 style="margin:36px 0 14px">Avsluttede prosjekter</h2><div class="prosjektnett">${arkiv.map((p) => prosjektkort(p, dag))}</div>`
      : ''}`.toString();
  $$('[data-nytt]', el).forEach((b) => b.addEventListener('click', nyttProsjekt));
}

function hilsen() {
  const t = Number(new Intl.DateTimeFormat('nb-NO', { hour: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date()));
  return t < 10 ? 'morgen' : t < 17 ? 'dag' : 'kveld';
}

function prosjektkort(p, dag) {
  const pst = p.total ? Math.round((p.ferdig / p.total) * 100) : 0;
  const igjen = p.innflytting ? dagerMellom(dag, p.innflytting) : null;
  return html`<a class="kort pkort" href="#/p/${p.id}">
    <div class="bilde ${p.forsidebilde_id ? '' : 'tom-bilde'}">
      ${p.forsidebilde_id ? html`<img src="${api.filUrl(p.forsidebilde_id)}" alt="" loading="lazy">` : ''}
      ${igjen !== null && !p.arkivert
        ? html`<span class="stempel">${igjen > 0 ? `${igjen} dager til innflytting` : igjen === 0 ? 'Innflytting i dag' : 'Innflyttet'}</span>`
        : ''}
    </div>
    <div class="innhold">
      <div><h2>${p.navn}</h2><div class="adresse">${[p.adresse, p.kunde_navn].filter(Boolean).join(' · ') || 'Ingen adresse'}</div></div>
      <div>
        <div class="linje"><span>Fremdrift</span><strong>${pst}%</strong></div>
        <div style="margin-top:7px">${bar(pst)}</div>
        <div class="linje" style="margin-top:7px"><span>${p.ferdig} av ${p.total} oppgaver godkjent</span><span>${p.aktive} pågår nå</span></div>
      </div>
      ${p.neste_milepael
        ? html`<div class="linje"><span>${icon('flag')} ${p.neste_milepael.navn}</span><span>${ddmm(p.neste_milepael.dato)}</span></div>`
        : ''}
      <div class="varsler">
        ${p.forsinket ? html`<span class="chip fare">${p.forsinket} forsinket</span>` : ''}
        ${p.meldt ? html`<span class="chip info">${p.meldt} venter på godkjenning</span>` : ''}
        ${p.nye_svar ? html`<span class="chip ok">${p.nye_svar} ${p.nye_svar === 1 ? "nytt svar" : "nye svar"} fra kunden</span>` : ''}
        ${!p.forsinket && !p.meldt && p.total ? html`<span class="chip ok">I rute</span>` : ''}
        ${!p.total ? html`<span class="chip">Ingen plan ennå</span>` : ''}
      </div>
    </div>
  </a>`;
}

export async function nyttProsjekt() {
  let importert = null;
  await modal({
    tittel: 'Nytt prosjekt',
    undertittel: 'Har du fremdriftsplanen i Excel, kan du hente den inn med en gang.',
    bred: true,
    innhold: html`<form class="skjema" id="nytt">
      <label class="kort" style="display:flex;gap:14px;align-items:center;padding:16px;cursor:pointer;border-style:dashed">
        <span class="avatar stor" style="--hue:210">${icon('upload')}</span>
        <span style="flex:1"><strong style="display:block">Importer fremdriftsplan fra Excel</strong>
          <small class="muted" data-filtekst>Oppgaver, datoer, beskrivelser og milepæler hentes inn. Valgfritt.</small></span>
        <input type="file" accept=".xlsx" name="fil" class="sr">
        <span class="knapp liten">Velg fil</span>
      </label>
      <div data-kundefag hidden></div>
      <div class="rad2">
        <label class="felt"><span>Prosjektnavn</span><input type="text" name="navn" required placeholder="F.eks. Vavikbakken 24"></label>
        <label class="felt"><span>Adresse</span><input type="text" name="adresse"></label>
      </div>
      <div class="rad3">
        <label class="felt"><span>Oppstart</span><input type="date" name="start"></label>
        <label class="felt"><span>Innflytting</span><input type="date" name="innflytting"></label>
        <label class="felt"><span>Sluttfrist</span><input type="date" name="sluttfrist"></label>
      </div>
      <div class="rad3">
        <label class="felt"><span>Kunde</span><input type="text" name="kunde_navn" placeholder="Navn"></label>
        <label class="felt"><span>Kundens e-post</span><input type="email" name="kunde_epost"></label>
        <label class="felt"><span>Kundens telefon</span><input type="tel" name="kunde_telefon"></label>
      </div>
      <label class="felt"><span>Kort om prosjektet</span><textarea name="beskrivelse" placeholder="Vises øverst på kundesiden."></textarea></label>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Opprett prosjekt</button></div>
    </form>`,
    onMount: (el, lukk) => {
      const form = $('#nytt', el);
      form.elements.fil.addEventListener('change', async (e) => {
        const fil = e.target.files[0];
        if (!fil) return;
        const plan = await attempt(() => lesFremdriftsplan(fil));
        if (!plan) return;
        importert = plan;
        $('[data-filtekst]', el).innerHTML = html`<strong class="text-ok">${fil.name}</strong> – ${plan.oppgaver.length} oppgaver og ${plan.milepaeler.length} milepæler funnet.`.toString();
        if (!form.elements.navn.value) form.elements.navn.value = fil.name.replace(/_?(gantt|fremdriftsplan).*$/i, '').replace(/[_-]+/g, ' ').replace(/\.xlsx$/i, '').trim();
        if (plan.start && !form.elements.start.value) form.elements.start.value = plan.start;
        if (plan.innflytting) form.elements.innflytting.value = plan.innflytting;
        if (plan.sluttfrist) form.elements.sluttfrist.value = plan.sluttfrist;
        const fag = [...new Set(plan.oppgaver.map((o) => o.fag).filter(Boolean))];
        const boks = $('[data-kundefag]', el);
        boks.hidden = false;
        boks.innerHTML = html`<div class="felt"><span>Fag kunden styrer selv</span>
          <small>Kunden kan da flytte datoene og melde levert på kundesiden. Kan endres senere.</small>
          <div class="alternativer" style="margin-top:4px">${fag.map(
            (f) => html`<label class="avkrysning" style="border:1px solid var(--line);border-radius:999px;padding:4px 12px 4px 8px">
              <input type="checkbox" name="kundefag" value="${f}" ${/bico/i.test(f) ? 'checked' : ''}><span class="fagmerke" style="--hue:${fagHue(f)}"><i></i>${f}</span></label>`,
          )}</div></div>`.toString();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = formData(form);
        delete data.fil;
        delete data.kundefag;
        const kundefag = $$('[name=kundefag]:checked', form).map((c) => c.value);
        const knapp = $('button.primar', form);
        knapp.disabled = true;
        const p = await attempt(() => api.post('/prosjekter', data));
        if (p && importert) {
          await attempt(() =>
            api.post(`/prosjekter/${p.id}/import`, {
              oppgaver: importert.oppgaver.map((o) => ({ ...o, kunde_styrt: kundefag.includes(o.fag) })),
              milepaeler: importert.milepaeler,
            }),
          );
        }
        knapp.disabled = false;
        if (p) {
          lukk(p);
          toast('Prosjektet er opprettet');
          location.hash = `#/p/${p.id}`;
        }
      });
    },
  });
}
