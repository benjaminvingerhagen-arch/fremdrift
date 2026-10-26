import { api } from '../api.js';
import { html, icon, $, $$, modal, attempt, bekreft, toast } from '../ui.js';
import { VAER, datoMedDag, datoKort, leggTilDager, erHelg } from '/shared/plan.js';

// Dagbok: én side per dag med vær, bemanning, hva som ble gjort, avvik og bilder.
// Intern for prosjektlederen. En dag kan deles med kunden som en oppdatering.

let valgtDato = null;

export async function dagbokFane(el, ctx) {
  const { prosjekt: p, oppgaver, dag } = ctx;
  if (!valgtDato || valgtDato > dag) valgtDato = dag;
  const sider = await api.get(`/prosjekter/${p.id}/dagbok`);
  const lagret = sider.find((s) => s.dato === valgtDato);
  const side = lagret || { bemanning: [], bilder: [] };
  let bilder = [...(side.bilder || [])];

  // Fagene som har oppgaver i gang den dagen foreslås i bemanningen.
  const aktiveFag = [...new Set(oppgaver.filter((o) => o.fra <= valgtDato && o.til >= valgtDato && o.fag).map((o) => o.fag))];
  const bemanning = new Map(aktiveFag.map((fag) => [fag, '']));
  for (const r of side.bemanning || []) bemanning.set(r.fag, r.antall);
  const sumFolk = (b) => b.reduce((s, r) => s + r.antall, 0);

  const bildeListe = () =>
    bilder.length
      ? html`${bilder.map((id) => html`<div class="db-bilde"><a href="${api.filUrl(id)}" target="_blank" rel="noopener"><img src="${api.filUrl(id)}" alt="Bilde fra dagen" loading="lazy"></a>
          <button type="button" class="ikon-knapp" data-fjern-bilde="${id}" aria-label="Fjern bildet">${icon('x')}</button></div>`)}`
      : '';

  el.innerHTML = html`
    <div class="db-oppsett">
      <form class="kort db-skjema skjema" id="dagbok">
        <div class="db-dato">
          <button type="button" class="ikon-knapp" data-dag="-1" aria-label="Forrige dag">${icon('chevronLeft')}</button>
          <label class="felt"><span class="sr-only">Dato</span><input type="date" name="dato" value="${valgtDato}" max="${dag}"></label>
          <button type="button" class="ikon-knapp" data-dag="1" aria-label="Neste dag" ${valgtDato >= dag ? 'disabled' : ''}>${icon('chevronRight')}</button>
          <strong>${valgtDato === dag ? 'I dag' : datoMedDag(valgtDato)}</strong>
          ${lagret?.oppdatering_id ? html`<span class="chip ok">Delt med kunden</span>` : ''}
          ${erHelg(valgtDato) ? html`<span class="chip">Helg</span>` : ''}
        </div>
        <div class="rad2">
          <label class="felt"><span>Vær</span><select name="vaer"><option value="">Ikke valgt</option>${Object.entries(VAER).map(
            ([k, t]) => html`<option value="${k}" ${side.vaer === k ? 'selected' : ''}>${t}</option>`,
          )}</select></label>
          <label class="felt"><span>Temperatur (°C)</span><input type="number" name="temperatur" min="-50" max="50" step="1" inputmode="numeric" value="${side.temperatur ?? ''}"></label>
        </div>
        <div class="felt"><span>Bemanning på plassen</span>
          <div class="db-bemanning" id="bemanning">${[...bemanning].map(([fag, antall]) => html`<label class="db-folk"><span>${fag}</span>
            <input type="number" min="0" max="200" inputmode="numeric" data-fag="${fag}" value="${antall}" placeholder="0"></label>`)}
            <label class="db-folk db-nytt-fag"><input type="text" placeholder="Annet fag" data-nytt-fag><input type="number" min="0" max="200" inputmode="numeric" data-nytt-antall placeholder="0"></label>
          </div>
          ${aktiveFag.length ? html`<small>Fagene med oppgaver i gang denne dagen er fylt inn. Skriv antall personer.</small>` : ''}</div>
        <label class="felt"><span>Hva ble gjort</span><textarea name="notat" rows="4" placeholder="Kort om dagen – kan deles med kunden">${side.notat || ''}</textarea></label>
        <label class="felt"><span>Avvik og hendelser <small class="muted">(bare for deg)</small></span><textarea name="avvik" rows="2" placeholder="Forsinkelser, skader, tillegg, beskjeder gitt …">${side.avvik || ''}</textarea></label>
        <div class="felt"><span>Bilder</span>
          <div class="db-bilder" id="db-bilder">${bildeListe()}</div>
          <div class="mangel-bildevalg"><label class="knapp liten">${icon('camera')} Legg til bilder<input type="file" accept="image/*" multiple hidden data-bilder></label><span class="small muted" data-bildestatus></span></div></div>
        <div class="knapperad">
          ${lagret ? html`<button type="button" class="knapp lys" data-slett>${icon('trash')} Slett</button>` : ''}
          <span class="spacer"></span>
          ${lagret && !lagret.oppdatering_id ? html`<button type="button" class="knapp" data-del>${icon('share')} Del med kunden</button>` : ''}
          <button class="knapp primar">${lagret ? 'Lagre endringer' : 'Lagre dagen'}</button>
        </div>
      </form>

      <section class="db-historikk">
        <div class="gruppe-tittel">${icon('file')} Tidligere dager <span class="mono">${sider.length}</span></div>
        ${sider.length
          ? html`<ul class="kort db-liste">${sider.map((s) => html`<li class="${s.dato === valgtDato ? 'valgt' : ''}">
              <button type="button" data-velg="${s.dato}">
                <span class="db-liste-dato"><strong>${datoKort(s.dato)}</strong><small>${datoMedDag(s.dato).split(' ')[0]}</small></span>
                <span class="db-liste-tekst">
                  <span class="meta small muted">${s.vaer ? html`<span>${VAER[s.vaer]}${s.temperatur !== null ? ` ${s.temperatur}°` : ''}</span>` : ''}
                    ${s.bemanning.length ? html`<span>${icon('users')} ${sumFolk(s.bemanning)}</span>` : ''}
                    ${s.bilder.length ? html`<span>${icon('image')} ${s.bilder.length}</span>` : ''}
                    ${s.oppdatering_id ? html`<span>${icon('share')} Delt</span>` : ''}</span>
                  ${s.notat ? html`<span class="small db-utdrag">${s.notat}</span>` : ''}
                  ${s.avvik ? html`<span class="small text-fare db-utdrag">${icon('alert')} ${s.avvik}</span>` : ''}
                </span>
              </button></li>`)}</ul>`
          : html`<div class="kort tom">${icon('file')} Ingen dager skrevet ennå. Et par linjer og et bilde om dagen gir god dokumentasjon hvis det blir uenighet om fremdrift eller tillegg.</div>`}
      </section>
    </div>`.toString();

  const form = $('#dagbok', el);
  const byttDag = (dato) => {
    valgtDato = dato > dag ? dag : dato;
    dagbokFane(el, ctx);
  };
  form.elements.dato.addEventListener('change', (e) => e.target.value && byttDag(e.target.value));
  $$('[data-dag]', el).forEach((b) => b.addEventListener('click', () => byttDag(leggTilDager(valgtDato, Number(b.dataset.dag)))));
  $$('[data-velg]', el).forEach((b) => b.addEventListener('click', () => {
    byttDag(b.dataset.velg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  const tegnBilder = () => {
    $('#db-bilder', el).innerHTML = bildeListe().toString();
    $$('[data-fjern-bilde]', el).forEach((b) => b.addEventListener('click', () => {
      bilder = bilder.filter((id) => id !== Number(b.dataset.fjernBilde));
      tegnBilder();
    }));
  };
  tegnBilder();
  $('[data-bilder]', el).addEventListener('change', async (e) => {
    const filer = [...e.target.files];
    const status = $('[data-bildestatus]', el);
    for (const [i, fil] of filer.entries()) {
      status.textContent = `Laster opp ${i + 1} av ${filer.length} …`;
      const r = await attempt(() => api.lastOpp(fil, p.id));
      if (r) bilder.push(r.id);
    }
    status.textContent = '';
    e.target.value = '';
    tegnBilder();
  });

  const lesBemanning = () => {
    const rader = $$('[data-fag]', el).map((i) => ({ fag: i.dataset.fag, antall: Number(i.value) || 0 }));
    const nytt = $('[data-nytt-fag]', el).value.trim();
    if (nytt) rader.push({ fag: nytt, antall: Number($('[data-nytt-antall]', el).value) || 0 });
    return rader.filter((r) => r.antall > 0);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      vaer: form.elements.vaer.value,
      temperatur: form.elements.temperatur.value,
      notat: form.elements.notat.value,
      avvik: form.elements.avvik.value,
      bemanning: lesBemanning(),
      bilder,
    };
    if (await attempt(() => api.put(`/prosjekter/${p.id}/dagbok/${valgtDato}`, data), 'Dagboken er lagret')) dagbokFane(el, ctx);
  });
  $('[data-slett]', el)?.addEventListener('click', async () => {
    if (!(await bekreft('Slette dagen?', `Dagboken for ${datoMedDag(valgtDato)} slettes. En oppdatering som er delt med kunden blir liggende.`, { ok: 'Slett', fare: true }))) return;
    if (await attempt(() => api.del(`/prosjekter/${p.id}/dagbok/${valgtDato}`), 'Slettet')) dagbokFane(el, ctx);
  });
  $('[data-del]', el)?.addEventListener('click', () => delMedKunden(lagret, ctx, () => dagbokFane(el, ctx)));
}

function delMedKunden(side, ctx, ferdig) {
  const { prosjekt: p } = ctx;
  return modal({
    tittel: 'Del dagen med kunden',
    undertittel: `${datoMedDag(side.dato)} · blir en oppdatering på kundesiden`,
    innhold: html`<form class="skjema" id="del">
      <label class="felt"><span>Tittel</span><input type="text" name="tittel" value="Fra byggeplassen ${datoMedDag(side.dato)}" required></label>
      <label class="felt"><span>Tekst</span><textarea name="tekst" rows="4">${side.notat || ''}</textarea><small>Avvik og bemanning blir igjen i dagboken.</small></label>
      ${side.bilder.length ? html`<div class="felt"><span>Bilder</span><div class="db-bilder">${side.bilder.map((id) => html`<label class="db-bilde velg">
        <img src="${api.filUrl(id)}" alt="" loading="lazy"><input type="checkbox" data-del-bilde="${id}" checked aria-label="Ta med bildet"></label>`)}</div></div>` : ''}
      ${p.kunde_epost ? html`<label class="avkrysning"><input type="checkbox" name="varsle_kunde"><span>Send e-post til kunden<small>${p.kunde_epost}</small></span></label>` : ''}
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">${icon('share')} Del med kunden</button></div>
    </form>`,
    onMount: (el, lukk) =>
      $('#del', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        const data = {
          tittel: f.tittel.value,
          tekst: f.tekst.value,
          bilder: $$('[data-del-bilde]', el).filter((c) => c.checked).map((c) => Number(c.dataset.delBilde)),
          varsle_kunde: f.varsle_kunde?.checked || false,
        };
        if (await attempt(() => api.post(`/prosjekter/${p.id}/dagbok/${side.dato}/del`, data), 'Delt på kundesiden')) {
          lukk(true);
          ferdig();
        }
      }),
  });
}
