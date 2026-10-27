import { api } from '../api.js';
import { html, icon, $, $$, modal, attempt, bekreft, toast } from '../ui.js';
import { DOKUMENT_KATEGORIER, VAER, datoKort, datoMedDag, ddmm } from '/shared/plan.js';
import { fagMerke } from './oppgave.js';

// Dokumenthotellet: prosjektets dokumenter samlet på ett sted, og ukesoppsummeringen.
// Begge ligger under fanen «Dokumenter» (#/p/:id/dokumenter og #/p/:id/dokumenter/uke).

export const FILTYPER = 'image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function filtype(type = '') {
  if (type === 'application/pdf') return { kort: 'PDF', tone: 'pdf' };
  if (type.includes('wordprocessingml')) return { kort: 'Word', tone: 'word' };
  if (type.includes('spreadsheetml')) return { kort: 'Excel', tone: 'excel' };
  if (type.startsWith('image/')) return { kort: 'Bilde', tone: 'bilde' };
  return { kort: 'Fil', tone: '' };
}

export const storrelse = (b) => (!b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} kB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const utenEndelse = (navn = '') => navn.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim();

// Bildene vises som miniatyr, andre filer som et merke med filtypen.
export function forhandsvisning(id, type, url = api.filUrl(id)) {
  const t = filtype(type);
  return t.tone === 'bilde'
    ? html`<img src="${url}" alt="" loading="lazy">`
    : html`<span class="dok-type ${t.tone}">${t.kort}</span>`;
}

const KILDER = {
  oppgave: 'Melding på oppgave',
  mangel: 'Mangel',
  dagbok: 'Dagbok',
  oppdatering: 'Oppdatering til kunden',
  forside: 'Forsidebilde',
};

const beskrivKilde = (s) => {
  const k = s.kilder[0];
  return k.tekst || (k.dato ? datoMedDag(k.dato) : s.filnavn || '');
};

let filter = { sok: '', kategori: '' };

export async function dokumenterFane(el, ctx, under = '') {
  const segment = html`<div class="segment" role="tablist">
    <button type="button" class="${under ? '' : 'aktiv'}" data-under="">${icon('folder')} Dokumenter</button>
    <button type="button" class="${under === 'uke' ? 'aktiv' : ''}" data-under="uke">${icon('list')} Ukesoppsummering</button>
  </div>`;
  if (under === 'uke') await ukeVisning(el, ctx, segment);
  else await dokumentVisning(el, ctx, segment);
  $$('[data-under]', el).forEach((b) =>
    b.addEventListener('click', () => {
      location.hash = `#/p/${ctx.prosjekt.id}/dokumenter${b.dataset.under ? `/${b.dataset.under}` : ''}`;
    }),
  );
}

// ---------- Dokumenter ----------

async function dokumentVisning(el, ctx, segment) {
  const { prosjekt: p } = ctx;
  const { dokumenter, samlet } = await api.get(`/prosjekter/${p.id}/dokumenter`);
  const nye = dokumenter.filter((d) => d.lagt_til_rolle && d.lagt_til_rolle !== 'leder' && !d.synlig_for_fag && !d.synlig_for_kunde);
  const sok = filter.sok.toLowerCase();
  const treff = dokumenter.filter(
    (d) => (!filter.kategori || d.kategori === filter.kategori) && (!sok || `${d.tittel} ${d.filnavn} ${d.beskrivelse || ''}`.toLowerCase().includes(sok)),
  );
  const perKategori = Object.keys(DOKUMENT_KATEGORIER)
    .map((k) => [k, treff.filter((d) => d.kategori === k)])
    .filter(([, l]) => l.length);

  const rad = (d) => html`<li class="dok" data-dok="${d.id}">
    <a class="dok-forhand" href="${api.filUrl(d.vedlegg_id)}" target="_blank" rel="noopener" aria-label="Åpne ${d.tittel}">${forhandsvisning(d.vedlegg_id, d.type)}</a>
    <div class="dok-tekst">
      <a class="dok-tittel" href="${api.filUrl(d.vedlegg_id)}" target="_blank" rel="noopener">${d.tittel}</a>
      <div class="meta small muted">
        <span>${filtype(d.type).kort} · ${storrelse(d.storrelse)}</span>
        <span>${datoKort(String(d.opprettet).slice(0, 10))}${d.lagt_til_navn ? ` · ${d.lagt_til_navn}` : ''}</span>
        ${d.synlig_for_kunde ? html`<span class="chip ok">${icon('eye')} Kunden ser</span>` : ''}
        ${d.synlig_for_fag ? html`<span class="chip aktiv">${icon('users')} Fagene ser</span>` : ''}
      </div>
      ${d.beskrivelse ? html`<p class="small pre">${d.beskrivelse}</p>` : ''}
    </div>
    <button class="knapp liten lys" data-endre="${d.id}" aria-label="Endre ${d.tittel}">${icon('settings')}</button>
  </li>`;

  el.innerHTML = html`
    <div class="dok-hode">${segment}<span class="spacer"></span>
      <button class="knapp primar" data-last-opp>${icon('upload')} Last opp</button></div>
    <p class="muted small dok-intro">Tegninger, kontrakter, FDV, samsvarserklæringer og annet som hører til prosjektet. Du velger om kunden og fagene skal se hvert dokument. Fagene kan levere FDV og samsvarserklæringer selv fra sin side.</p>
    ${nye.length ? html`<div class="banner">${icon('inbox')} ${nye.length === 1 ? 'Ett dokument' : `${nye.length} dokumenter`} levert av fagene er bare synlig for deg. Åpne dem og velg om kunden skal se dem.</div>` : ''}
    ${dokumenter.length ? html`<div class="verktoy">
      <label class="sok">${icon('search')}<span class="sr-only">Søk</span><input type="search" data-sok placeholder="Søk i dokumentene" value="${filter.sok}"></label>
      <select data-kategori aria-label="Kategori"><option value="">Alle kategorier</option>${Object.entries(DOKUMENT_KATEGORIER).map(
        ([k, t]) => html`<option value="${k}" ${filter.kategori === k ? 'selected' : ''}>${t} (${dokumenter.filter((d) => d.kategori === k).length})</option>`,
      )}</select></div>` : ''}
    ${perKategori.length
      ? perKategori.map(([k, liste]) => html`<div class="gruppe-tittel">${icon('folder')} ${DOKUMENT_KATEGORIER[k]} <span class="mono">${liste.length}</span></div>
          <ul class="kort dokliste">${liste.map(rad)}</ul>`)
      : html`<div class="kort tom">${icon('folder')} ${dokumenter.length ? 'Ingen dokumenter passer med søket.' : 'Ingen dokumenter ennå. Last opp tegninger, kontrakt, FDV og annet – PDF, Word, Excel eller bilder.'}</div>`}

    ${samlet.length ? html`<div class="gruppe-tittel samlet-tittel">${icon('image')} Bilder og filer fra prosjektet <span class="mono">${samlet.length}</span></div>
      <p class="muted small">Det som er lastet opp i meldinger, mangler, dagbok og oppdateringer. Legg det du vil ta vare på i dokumentene.</p>
      <ul class="samlet">${samlet.slice(0, 120).map((s) => html`<li>
        <a href="${api.filUrl(s.vedlegg_id)}" target="_blank" rel="noopener" class="samlet-bilde">${forhandsvisning(s.vedlegg_id, s.type)}</a>
        <div class="samlet-tekst"><strong>${KILDER[s.kilder[0].kilde] || 'Fil'}${s.kilder.length > 1 ? html` <span class="muted">+${s.kilder.length - 1}</span>` : ''}</strong>
          <small title="${s.kilder.map((k) => KILDER[k.kilde]).join(', ')}">${beskrivKilde(s)} · ${ddmm(String(s.opprettet).slice(0, 10))}</small></div>
        <button class="knapp liten" data-ta-vare="${s.vedlegg_id}" title="Legg i dokumentene">${icon('plus')}<span class="sr-only">Legg i dokumentene</span></button>
      </li>`)}</ul>
      ${samlet.length > 120 ? html`<p class="muted small">Viser de 120 nyeste.</p>` : ''}` : ''}`.toString();

  const vis = () => dokumentVisning(el, ctx, segment).then(() => kobleSegment(el, ctx));
  $('[data-last-opp]', el).addEventListener('click', () => lastOppSkjema(ctx, vis));
  $('[data-sok]', el)?.addEventListener('input', (e) => {
    filter.sok = e.target.value;
    clearTimeout(vis.t);
    vis.t = setTimeout(async () => {
      await vis();
      const s = $('[data-sok]', el);
      s?.focus();
      s?.setSelectionRange(s.value.length, s.value.length);
    }, 250);
  });
  $('[data-kategori]', el)?.addEventListener('change', (e) => {
    filter.kategori = e.target.value;
    vis();
  });
  $$('[data-endre]', el).forEach((b) => b.addEventListener('click', () => dokumentSkjema(ctx, dokumenter.find((d) => d.id === Number(b.dataset.endre)), vis)));
  $$('[data-ta-vare]', el).forEach((b) =>
    b.addEventListener('click', () => {
      const s = samlet.find((x) => x.vedlegg_id === Number(b.dataset.taVare));
      const tittel = s.kilder[0].tekst || (s.kilder[0].dato ? `Dagbok ${datoMedDag(s.kilder[0].dato)}` : utenEndelse(s.filnavn));
      dokumentSkjema(ctx, { vedlegg_id: s.vedlegg_id, type: s.type, tittel, kategori: s.type.startsWith('image/') ? 'bilder' : 'annet' }, vis);
    }),
  );
}

function kobleSegment(el, ctx) {
  $$('[data-under]', el).forEach((b) =>
    b.addEventListener('click', () => {
      location.hash = `#/p/${ctx.prosjekt.id}/dokumenter${b.dataset.under ? `/${b.dataset.under}` : ''}`;
    }),
  );
}

const kategoriValg = (valgt) =>
  html`${Object.entries(DOKUMENT_KATEGORIER).map(([k, t]) => html`<option value="${k}" ${valgt === k ? 'selected' : ''}>${t}</option>`)}`;

function lastOppSkjema(ctx, ferdig) {
  const { prosjekt: p } = ctx;
  return modal({
    tittel: 'Last opp dokumenter',
    undertittel: 'PDF, Word, Excel eller bilder · inntil 4 MB per fil',
    innhold: html`<form class="skjema" id="opp">
      <label class="felt"><span>Filer</span><input type="file" name="filer" multiple required accept="${FILTYPER}"></label>
      <label class="felt"><span>Tittel</span><input type="text" name="tittel" maxlength="150" placeholder="Tom = filnavnet"><small>Velger du flere filer, får hver sitt filnavn som tittel.</small></label>
      <label class="felt"><span>Kategori</span><select name="kategori">${kategoriValg('tegninger')}</select></label>
      <label class="felt"><span>Beskrivelse <small class="muted">(valgfritt)</small></span><textarea name="beskrivelse" rows="2" maxlength="1000" placeholder="F.eks. revisjon, hvem som har laget den"></textarea></label>
      <label class="avkrysning"><input type="checkbox" name="synlig_for_kunde"><span>Kunden ser dokumentet<small>Vises på kundesiden under «Dokumenter».</small></span></label>
      <label class="avkrysning"><input type="checkbox" name="synlig_for_fag"><span>Fagene ser dokumentet<small>Ansatte og leverandører med oppgaver i prosjektet.</small></span></label>
      <p class="small muted" data-status></p>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">${icon('upload')} Last opp</button></div>
    </form>`,
    onMount: (el, lukk) =>
      $('#opp', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        const filer = [...f.filer.files];
        if (!filer.length) return;
        const knapp = $('button.primar', el);
        knapp.disabled = true;
        let ok = 0;
        for (const [i, fil] of filer.entries()) {
          $('[data-status]', el).textContent = `Laster opp ${i + 1} av ${filer.length}: ${fil.name}`;
          const r = await attempt(async () => {
            const v = await api.lastOpp(fil, p.id);
            return api.post(`/prosjekter/${p.id}/dokumenter`, {
              vedlegg_id: v.id,
              tittel: (filer.length === 1 && f.tittel.value.trim()) || utenEndelse(fil.name) || 'Dokument',
              kategori: f.kategori.value,
              beskrivelse: f.beskrivelse.value,
              synlig_for_kunde: f.synlig_for_kunde.checked,
              synlig_for_fag: f.synlig_for_fag.checked,
            });
          });
          if (r) ok++;
        }
        knapp.disabled = false;
        if (ok) {
          toast(ok === 1 ? 'Dokumentet er lagt til' : `${ok} dokumenter er lagt til`);
          lukk(true);
          ferdig();
        }
      }),
  });
}

// Endre et dokument – eller legge en fil som allerede ligger i prosjektet i dokumentene (uten id).
function dokumentSkjema(ctx, d, ferdig) {
  const { prosjekt: p } = ctx;
  const nytt = !d.id;
  const fraFag = d.lagt_til_rolle && d.lagt_til_rolle !== 'leder';
  return modal({
    tittel: nytt ? 'Legg i dokumentene' : 'Dokument',
    undertittel: nytt ? 'Filen blir liggende der den er, og vises i tillegg her' : `${filtype(d.type).kort} · ${d.filnavn}${fraFag ? ` · levert av ${d.lagt_til_navn}` : ''}`,
    innhold: html`<form class="skjema" id="dok">
      <a class="dok-stor" href="${api.filUrl(d.vedlegg_id)}" target="_blank" rel="noopener">${forhandsvisning(d.vedlegg_id, d.type)}<span>${icon('eye')} Åpne filen</span></a>
      <label class="felt"><span>Tittel</span><input type="text" name="tittel" maxlength="150" required value="${d.tittel || ''}"></label>
      <label class="felt"><span>Kategori</span><select name="kategori">${kategoriValg(d.kategori)}</select></label>
      <label class="felt"><span>Beskrivelse <small class="muted">(valgfritt)</small></span><textarea name="beskrivelse" rows="2" maxlength="1000">${d.beskrivelse || ''}</textarea></label>
      <label class="avkrysning"><input type="checkbox" name="synlig_for_kunde" ${d.synlig_for_kunde ? 'checked' : ''}><span>Kunden ser dokumentet</span></label>
      <label class="avkrysning"><input type="checkbox" name="synlig_for_fag" ${d.synlig_for_fag ? 'checked' : ''}><span>Fagene ser dokumentet</span></label>
      <div class="knapperad">
        ${nytt ? '' : html`<button type="button" class="knapp lys" data-slett>${icon('trash')} Slett</button>`}
        <span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">${icon('check')} Lagre</button></div>
    </form>`,
    onMount: (el, lukk) => {
      $('#dok', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        const data = {
          tittel: f.tittel.value,
          kategori: f.kategori.value,
          beskrivelse: f.beskrivelse.value,
          synlig_for_kunde: f.synlig_for_kunde.checked,
          synlig_for_fag: f.synlig_for_fag.checked,
        };
        const r = await attempt(
          () => (nytt ? api.post(`/prosjekter/${p.id}/dokumenter`, { ...data, vedlegg_id: d.vedlegg_id }) : api.put(`/dokumenter/${d.id}`, data)),
          nytt ? 'Lagt i dokumentene' : 'Lagret',
        );
        if (r) {
          lukk(true);
          ferdig();
        }
      });
      $('[data-slett]', el)?.addEventListener('click', async () => {
        if (!(await bekreft(`Slette «${d.tittel}»?`, 'Filen slettes også, med mindre den brukes et annet sted i prosjektet.', { ok: 'Slett', fare: true }))) return;
        if (await attempt(() => api.del(`/dokumenter/${d.id}`), 'Dokumentet er slettet')) {
          lukk(true);
          ferdig();
        }
      });
    },
  });
}

// ---------- Ukesoppsummering ----------

let valgtUke = { prosjekt: null, uke: null };

const liste = (tittel, ikon, rader, tom) =>
  html`<section class="kort uke-del"><h3>${icon(ikon)} ${tittel} ${rader.length ? html`<span class="mono muted">${rader.length}</span>` : ''}</h3>
    ${rader.length ? html`<ul class="uke-liste">${rader}</ul>` : html`<p class="muted small">${tom}</p>`}</section>`;

const oppgaveLinje = (o, ekstra = '') =>
  html`<li><span class="nr">${o.nr || ''}</span><span class="uke-tekst"><strong>${o.tittel}</strong>${ekstra}</span>${fagMerke(o.fag)}</li>`;

async function ukeVisning(el, ctx, segment) {
  const { prosjekt: p } = ctx;
  if (valgtUke.prosjekt !== p.id) valgtUke = { prosjekt: p.id, uke: null };
  const r = await api.get(`/prosjekter/${p.id}/ukerapport${valgtUke.uke ? `?uke=${valgtUke.uke}` : ''}`);
  const endring = r.fremdrift.na - r.fremdrift.uken_for;
  const dagsverk = r.dagsverk.reduce((s, x) => s + x.antall, 0);
  const avvik = r.dagbok.filter((d) => d.avvik);

  el.innerHTML = html`
    <div class="dok-hode">${segment}<span class="spacer"></span>
      <button class="knapp" data-skriv-ut>${icon('file')} Skriv ut</button>
      <button class="knapp primar" data-kundeoppdatering>${icon('share')} Lag oppdatering til kunden</button></div>
    <div class="uke-nav">
      <button class="ikon-knapp" data-uke="${r.forrige}" aria-label="Forrige uke">${icon('chevronLeft')}</button>
      <div><h2>Uke ${r.uke}${r.pagar ? html` <span class="chip aktiv">Pågår</span>` : ''}</h2>
        <span class="muted small">${datoMedDag(r.mandag)} – ${datoMedDag(r.sondag)} · ${p.navn}</span></div>
      <button class="ikon-knapp" ${r.neste ? html`data-uke="${r.neste}"` : 'disabled'} aria-label="Neste uke">${icon('chevronRight')}</button>
    </div>

    <div class="tall-rad">
      <div class="tall"><span class="etikett">${icon('gantt')} Fremdrift</span>
        <span class="verdi">${r.fremdrift.na}<small>%</small></span>
        <span class="hint">${endring > 0 ? `+${endring} prosentpoeng denne uken` : 'Ingen endring denne uken'}</span></div>
      <div class="tall"><span class="etikett">${icon('checkCircle')} Godkjent</span>
        <span class="verdi">${r.godkjent.length}<small>${r.godkjent.length === 1 ? 'oppgave' : 'oppgaver'}</small></span>
        <span class="hint">${r.meldt.length ? `${r.meldt.length} meldt ferdig venter på deg` : 'Ingen venter på godkjenning'}</span></div>
      <div class="tall ${r.ikke_ferdig.length ? 'fare' : ''}"><span class="etikett">${icon('alert')} Passert frist</span>
        <span class="verdi">${r.ikke_ferdig.length}<small>${r.ikke_ferdig.length === 1 ? 'oppgave' : 'oppgaver'}</small></span>
        <span class="hint">Ikke meldt ferdig innen fristen</span></div>
      <div class="tall"><span class="etikett">${icon('users')} Dagsverk</span>
        <span class="verdi">${dagsverk}<small>fra dagboken</small></span>
        <span class="hint">${r.dagbok.length} ${r.dagbok.length === 1 ? 'dag' : 'dager'} skrevet · ${r.mangler.apne} åpne mangler</span></div>
    </div>

    <div class="uke-rutenett">
      ${liste('Godkjent', 'checkCircle', r.godkjent.map((o) => oppgaveLinje(o)), 'Ingen oppgaver ble godkjent denne uken.')}
      ${liste('Meldt ferdig – venter på kontroll', 'clock', r.meldt.map((o) => oppgaveLinje(o)), 'Ingenting venter på deg.')}
      ${liste('Passert frist', 'alert', r.ikke_ferdig.map((o) => oppgaveLinje(o, html`<small class="text-fare">frist ${datoKort(o.til)}</small>`)), 'Alt er i rute.')}
      ${liste('Starter neste uke', 'calendar', r.neste_uke.map((o) => oppgaveLinje(o, html`<small>fra ${datoMedDag(o.fra)}</small>`)), 'Ingen nye oppgaver starter neste uke.')}
      ${liste(
        'Mangler',
        'checkCircle',
        [
          ...r.mangler.nye.map((m) => html`<li><span class="chip varsel">Ny</span><span class="uke-tekst"><strong>${m.tittel}</strong>${m.rom ? html`<small>${m.rom}</small>` : ''}</span>${fagMerke(m.fag)}</li>`),
          ...r.mangler.utbedret.map((m) => html`<li><span class="chip ok">Utbedret</span><span class="uke-tekst"><strong>${m.tittel}</strong>${m.rom ? html`<small>${m.rom}</small>` : ''}</span>${fagMerke(m.fag)}</li>`),
        ],
        `Ingen nye eller utbedrede mangler. ${r.mangler.apne} åpne totalt.`,
      )}
      ${liste(
        'Kundens valg',
        'help',
        [
          ...r.beslutninger.besvart.map((b) => html`<li><span class="chip ok">Svar</span><span class="uke-tekst"><strong>${b.sporsmal}</strong><small>${b.svar}</small></span></li>`),
          ...r.beslutninger.apne.map((b) => html`<li><span class="chip varsel">Venter</span><span class="uke-tekst"><strong>${b.sporsmal}</strong>${b.frist ? html`<small>frist ${datoKort(b.frist)}</small>` : ''}</span></li>`),
        ],
        'Ingen spørsmål til kunden.',
      )}
    </div>

    ${liste(
      'Dagbok',
      'file',
      r.dagbok.map((d) => html`<li class="uke-dag"><span class="uke-dato">${datoMedDag(d.dato)}</span>
        <span class="uke-tekst"><small>${[d.vaer ? VAER[d.vaer] : null, d.temperatur !== null && d.temperatur !== undefined ? `${d.temperatur} °C` : null, d.folk ? `${d.folk} på plassen` : null].filter(Boolean).join(' · ')}</small>
          ${d.notat ? html`<span class="pre">${d.notat}</span>` : ''}
          ${d.avvik ? html`<span class="text-fare pre">${icon('alert')} ${d.avvik}</span>` : ''}</span></li>`),
      'Ingenting skrevet i dagboken denne uken.',
    )}
    ${r.dagsverk.length ? html`<p class="muted small uke-fag">Dagsverk per fag: ${r.dagsverk.map((x) => `${x.fag} ${x.antall}`).join(' · ')}${avvik.length ? ` · ${avvik.length} ${avvik.length === 1 ? 'dag' : 'dager'} med avvik` : ''}</p>` : ''}

    <div class="uke-rutenett">
      ${liste('Sjekkpunkter', 'checkCircle', r.sjekkpunkter.map((s) => html`<li><span class="chip ${s.utfort ? 'ok' : 'varsel'}">${s.utfort ? 'Utført' : 'Ikke utført'}</span><span class="uke-tekst"><strong>${datoMedDag(s.dato)}</strong>${s.notat ? html`<small>${s.notat}</small>` : ''}</span></li>`), 'Ingen sjekkpunkter registrert.')}
      ${liste('Til kunden', 'share', r.oppdateringer.map((u) => html`<li><span class="uke-tekst"><strong>${u.tittel}</strong><small>${datoMedDag(u.dato)}</small></span></li>`), 'Ingen oppdateringer publisert denne uken.')}
      ${liste('Nye dokumenter', 'folder', r.dokumenter.map((d) => html`<li><span class="uke-tekst"><a href="${api.filUrl(d.vedlegg_id)}" target="_blank" rel="noopener"><strong>${d.tittel}</strong></a><small>${DOKUMENT_KATEGORIER[d.kategori] || ''}${d.lagt_til_navn ? ` · ${d.lagt_til_navn}` : ''}</small></span></li>`), 'Ingen nye dokumenter.')}
    </div>

    ${r.bilder.length ? html`<section class="kort uke-del"><h3>${icon('image')} Bilder fra uken <span class="mono muted">${r.bilder.length}</span></h3>
      <div class="uke-bilder">${r.bilder.map((id) => html`<a href="${api.filUrl(id)}" target="_blank" rel="noopener"><img src="${api.filUrl(id)}" alt="Bilde fra uken" loading="lazy"></a>`)}</div></section>` : ''}
  `.toString();

  $$('[data-uke]', el).forEach((b) =>
    b.addEventListener('click', () => {
      valgtUke.uke = b.dataset.uke;
      dokumenterFane(el, ctx, 'uke');
    }),
  );
  $('[data-skriv-ut]', el).addEventListener('click', () => print());
  $('[data-kundeoppdatering]', el).addEventListener('click', () => kundeoppdatering(ctx, r));
}

// Et forslag til ukesoppdatering for kunden: bare oppgaver kunden ser, uten frister som er
// passert, ansvarlige eller avvik. Prosjektlederen retter teksten før den publiseres.
export function utkastTilKunden(r) {
  const synlig = (l) => l.filter((o) => o.synlig_for_kunde);
  const perFag = (l) => {
    const m = new Map();
    for (const o of l) m.set(o.fag || 'Annet', [...(m.get(o.fag || 'Annet') || []), o.tittel]);
    return [...m].map(([fag, t]) => `• ${fag}: ${t.join(', ')}`).join('\n');
  };
  const ferdig = synlig(r.godkjent);
  const neste = synlig(r.neste_uke);
  const deler = [];
  deler.push(ferdig.length ? `Dette ble ferdig denne uken:\n${perFag(ferdig)}` : 'Arbeidet går videre som planlagt denne uken.');
  if (r.mangler.utbedret.length) deler.push(`${r.mangler.utbedret.length === 1 ? 'Én mangel' : `${r.mangler.utbedret.length} mangler`} er utbedret.`);
  if (neste.length) deler.push(`Neste uke starter:\n${perFag(neste)}`);
  if (r.beslutninger.apne.length) deler.push(`Vi venter på svar fra deg om: ${r.beslutninger.apne.map((b) => b.sporsmal).join(', ')}. Du svarer på prosjektsiden.`);
  deler.push(`Fremdrift: ${r.fremdrift.na} % av arbeidet er ferdig.`);
  return deler.join('\n\n');
}

function kundeoppdatering(ctx, r) {
  const { prosjekt: p } = ctx;
  return modal({
    tittel: 'Ukesoppdatering til kunden',
    undertittel: `Uke ${r.uke} · forslag ut fra uken – rett før du publiserer`,
    innhold: html`<form class="skjema" id="uke-del">
      <label class="felt"><span>Tittel</span><input type="text" name="tittel" maxlength="160" required value="Uke ${r.uke}: status fra byggeplassen"></label>
      <label class="felt"><span>Tekst</span><textarea name="tekst" rows="10">${utkastTilKunden(r)}</textarea>
        <small>Bare oppgaver kunden ser er med. Frister, ansvarlige, avvik og bemanning blir ikke med.</small></label>
      ${r.bilder.length ? html`<div class="felt"><span>Bilder <small class="muted">(velg de som skal med)</small></span><div class="db-bilder">${r.bilder.slice(0, 24).map((id) => html`<label class="db-bilde velg">
        <img src="${api.filUrl(id)}" alt="" loading="lazy"><input type="checkbox" data-uke-bilde="${id}" aria-label="Ta med bildet"></label>`)}</div></div>` : ''}
      ${p.kunde_epost ? html`<label class="avkrysning"><input type="checkbox" name="varsle_kunde"><span>Send e-post til kunden<small>${p.kunde_epost}</small></span></label>` : ''}
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">${icon('share')} Publiser</button></div>
    </form>`,
    onMount: (el, lukk) =>
      $('#uke-del', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        const data = {
          tittel: f.tittel.value,
          tekst: f.tekst.value,
          bilder: $$('[data-uke-bilde]', el).filter((c) => c.checked).map((c) => Number(c.dataset.ukeBilde)),
          varsle_kunde: f.varsle_kunde?.checked || false,
        };
        if (await attempt(() => api.post(`/prosjekter/${p.id}/oppdateringer`, data), 'Publisert på kundesiden')) {
          lukk(true);
          ctx.onEndret?.();
        }
      }),
  });
}

// ---------- Ansatte og leverandører: dokumenter på «mine»-siden ----------
// Dokumentene prosjektlederen har delt med fagene, og det man har levert selv.

export function mineDokumenterHtml(d) {
  if (!d?.prosjekter?.length) return '';
  const flere = d.prosjekter.length > 1;
  const navn = (id) => d.prosjekter.find((p) => p.id === id)?.navn || '';
  return html`<div class="gruppe-tittel">${icon('folder')} Dokumenter ${d.dokumenter.length ? html`<span class="mono">${d.dokumenter.length}</span>` : ''}</div>
    <div class="kort">
      ${d.dokumenter.length ? html`<ul class="dokliste" style="margin:0">${d.dokumenter.map((x) => html`<li class="dok">
        <a class="dok-forhand" href="${api.filUrl(x.vedlegg_id)}" target="_blank" rel="noopener" aria-label="Åpne ${x.tittel}">${forhandsvisning(x.vedlegg_id, x.type)}</a>
        <div class="dok-tekst"><a class="dok-tittel" href="${api.filUrl(x.vedlegg_id)}" target="_blank" rel="noopener">${x.tittel}</a>
          <div class="meta small muted"><span>${DOKUMENT_KATEGORIER[x.kategori] || ''}${flere ? ` · ${navn(x.prosjekt_id)}` : ''}</span>
            ${x.eget ? html`<span class="chip ${x.synlig_for_fag ? 'aktiv' : ''}">${x.synlig_for_fag ? 'Levert av deg · delt' : 'Levert av deg'}</span>` : ''}</div></div>
        ${x.eget ? html`<button class="knapp liten lys" data-slett-dok="${x.id}" aria-label="Slett ${x.tittel}">${icon('trash')}</button>` : ''}
      </li>`)}</ul>` : html`<div class="tom">${icon('folder')} Ingen dokumenter er delt med deg ennå.</div>`}
      <div class="kort-innhold dok-lever"><button class="knapp" data-lever-dok>${icon('upload')} Lever dokument</button>
        <span class="small muted">F.eks. samsvarserklæring, FDV eller kontrollskjema</span></div>
    </div>`;
}

export function kobleMineDokumenter(root, d, ferdig) {
  $('[data-lever-dok]', root)?.addEventListener('click', () =>
    modal({
      tittel: 'Lever dokument',
      undertittel: 'Prosjektlederen får beskjed og bestemmer hvem som skal se det',
      innhold: html`<form class="skjema" id="lever">
        ${d.prosjekter.length > 1 ? html`<label class="felt"><span>Prosjekt</span><select name="prosjekt">${d.prosjekter.map((p) => html`<option value="${p.id}">${p.navn}</option>`)}</select></label>` : ''}
        <label class="felt"><span>Fil</span><input type="file" name="fil" required accept="${FILTYPER}"><small>PDF, Word, Excel eller bilde, inntil 4 MB.</small></label>
        <label class="felt"><span>Tittel</span><input type="text" name="tittel" maxlength="150" placeholder="Tom = filnavnet"></label>
        <label class="felt"><span>Kategori</span><select name="kategori">${kategoriValg('samsvar')}</select></label>
        <label class="felt"><span>Kommentar <small class="muted">(valgfritt)</small></span><textarea name="beskrivelse" rows="2" maxlength="1000"></textarea></label>
        <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">${icon('upload')} Lever</button></div>
      </form>`,
      onMount: (el, lukk) =>
        $('#lever', el).addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target.elements;
          const fil = f.fil.files[0];
          if (!fil) return;
          const prosjektId = Number(f.prosjekt?.value || d.prosjekter[0].id);
          $('button.primar', el).disabled = true;
          const r = await attempt(async () => {
            const v = await api.lastOpp(fil, prosjektId);
            return api.post(`/mine/prosjekter/${prosjektId}/dokumenter`, {
              vedlegg_id: v.id,
              tittel: f.tittel.value.trim() || utenEndelse(fil.name) || 'Dokument',
              kategori: f.kategori.value,
              beskrivelse: f.beskrivelse.value,
            });
          }, 'Levert – prosjektlederen får beskjed');
          $('button.primar', el).disabled = false;
          if (r) {
            lukk(true);
            ferdig();
          }
        }),
    }),
  );
  $$('[data-slett-dok]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      const x = d.dokumenter.find((y) => y.id === Number(b.dataset.slettDok));
      if (!(await bekreft(`Slette «${x.tittel}»?`, 'Dokumentet og filen slettes.', { ok: 'Slett', fare: true }))) return;
      if (await attempt(() => api.del(`/mine/dokumenter/${x.id}`), 'Dokumentet er slettet')) ferdig();
    }),
  );
}
