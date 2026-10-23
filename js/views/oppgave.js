import { api } from '../api.js';
import { html, icon, $, modal, attempt, formData, avatar, bekreft, kobleDatoer, toast } from '../ui.js';
import { fagHue } from '../store.js';
import { STATUS, oppgaveStatus, PRIORITET_TEKST, datoMedDag, arbeidsdager } from '/shared/plan.js';

export function statusChip(o, dag) {
  const s = STATUS[oppgaveStatus(o, dag)];
  return html`<span class="chip ${s.tone === 'noytral' ? '' : s.tone}">${s.tekst}</span>`;
}

export function fagMerke(fag) {
  return fag ? html`<span class="fagmerke" style="--hue:${fagHue(fag)}"><i></i>${fag}</span>` : '';
}

function personValg(personer, valgt) {
  const aktive = personer.filter((p) => p.aktiv || p.id === valgt);
  return html`<option value="">Etter fag (automatisk)</option>${aktive.map(
    (p) => html`<option value="${p.id}" ${p.id === valgt ? 'selected' : ''}>${p.navn}${p.firma ? ` · ${p.firma}` : ''}${p.fag ? ` (${p.fag})` : ''}</option>`,
  )}`;
}

// Panelet for én oppgave: detaljer, godkjenning og samtalen med den som utfører.
// ctx: { prosjekt, oppgaver, personer, onEndret }
export function aapneOppgave(o, ctx) {
  const ny = !o;
  const v = o || { fra: ctx.prosjekt.start || '', til: '', prioritet: 'normal', synlig_for_kunde: true };
  const fagListe = [...new Set(ctx.oppgaver.map((x) => x.fag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
  const ansvarlig = ctx.personer.find((p) => p.id === v.ansvarlig_id);
  const automatisk = !v.ansvarlig_id && v.fag ? ctx.personer.find((p) => p.aktiv && p.fag && p.fag.toLowerCase() === v.fag.toLowerCase()) : null;

  return modal({
    tittel: ny ? 'Ny oppgave' : v.tittel,
    undertittel: ny ? ctx.prosjekt.navn : html`${v.nr ? html`<span class="mono">${v.nr}</span> · ` : ''}${v.fag || 'Uten fag'} · ${datoMedDag(v.fra)} – ${datoMedDag(v.til)}`,
    panel: true,
    innhold: html`
      ${!ny ? statusBlokk(v, ansvarlig || automatisk) : ''}
      <form class="skjema" id="oppgave" style="margin-top:${ny ? 0 : 20}px">
        <label class="felt"><span>Oppgave</span><input type="text" name="tittel" value="${v.tittel || ''}" required></label>
        <div class="rad2">
          <label class="felt"><span>Fag</span><input type="text" name="fag" value="${v.fag || ''}" list="fagliste" placeholder="F.eks. Elektro">
            <datalist id="fagliste">${fagListe.map((f) => html`<option value="${f}">`)}</datalist></label>
          <label class="felt"><span>Nr.</span><input type="text" name="nr" value="${v.nr || ''}" placeholder="Valgfritt"></label>
        </div>
        <div class="rad2">
          <label class="felt"><span>Fra</span><input type="date" name="fra" value="${v.fra || ''}" required></label>
          <label class="felt"><span>Til</span><input type="date" name="til" value="${v.til || ''}" required></label>
        </div>
        <div class="rad2">
          <label class="felt"><span>Prioritet</span><select name="prioritet">${Object.entries(PRIORITET_TEKST).map(
            ([k, t]) => html`<option value="${k}" ${v.prioritet === k ? 'selected' : ''}>${t}</option>`,
          )}</select></label>
          <label class="felt"><span>Ansvarlig</span><select name="ansvarlig_id">${personValg(ctx.personer, v.ansvarlig_id)}</select>
            ${automatisk ? html`<small>Går automatisk til ${automatisk.navn} (${automatisk.fag}).</small>` : ''}</label>
        </div>
        <label class="felt"><span>Beskrivelse / utførelse</span><textarea name="beskrivelse" rows="4">${v.beskrivelse || ''}</textarea></label>
        <label class="felt"><span>Avhengighet / merknad</span><input type="text" name="merknad" value="${v.merknad || ''}" placeholder="F.eks. «Maler ferdig 01.11»"></label>
        <label class="avkrysning"><input type="checkbox" name="synlig_for_kunde" ${v.synlig_for_kunde !== false ? 'checked' : ''}>
          <span>Vis på kundesiden<small>Kunden ser fag, oppgave og datoer – ikke merknader eller hvem som er ansvarlig.</small></span></label>
        <label class="avkrysning"><input type="checkbox" name="kunde_styrt" ${v.kunde_styrt ? 'checked' : ''}>
          <span>Styres av kunden<small>Kunden kan flytte datoene og melde levert fra kundesiden (f.eks. kjøkken eller garderober kunden har bestilt).</small></span></label>
        <div class="knapperad">
          ${!ny ? html`<button type="button" class="knapp lys" data-slett>${icon('trash')} Slett</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="knapp" data-lukk>Avbryt</button>
          <button class="knapp primar">${ny ? 'Legg til oppgave' : 'Lagre endringer'}</button>
        </div>
      </form>
      ${!ny ? html`<hr style="border:0;border-top:1px solid var(--line);margin:26px 0 18px">
        <h3 style="display:flex;gap:8px;align-items:center">${icon('chat')} Samtale med utførende</h3>
        <div class="traad" id="traad" style="margin-top:14px"><p class="muted small">Laster …</p></div>
        ${skrivFelt()}` : ''}`,
    onMount: (el, lukk) => {
      const form = $('#oppgave', el);
      kobleDatoer(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = formData(form);
        const r = await attempt(() => (ny ? api.post(`/prosjekter/${ctx.prosjekt.id}/oppgaver`, data) : api.put(`/oppgaver/${v.id}`, data)));
        if (r) {
          toast(ny ? 'Oppgaven er lagt til' : 'Lagret');
          lukk(r);
          ctx.onEndret?.();
        }
      });
      $('[data-slett]', el)?.addEventListener('click', async () => {
        if (!(await bekreft('Slette oppgaven?', `«${v.tittel}» og samtalen om den slettes for godt.`, { ok: 'Slett', fare: true }))) return;
        if (await attempt(() => api.del(`/oppgaver/${v.id}`))) {
          lukk(true);
          ctx.onEndret?.();
        }
      });
      if (!ny) {
        kobleStatus(el, v, lukk, ctx);
        lastTraad(el, v, ctx.prosjekt.id);
      }
    },
  });
}

function statusBlokk(o, hvem) {
  const s = oppgaveStatus(o);
  const tekst = {
    ferdig: html`<strong>Godkjent.</strong> Oppgaven teller som ferdig i fremdriften.`,
    meldt: html`<strong>${o.meldt_av || 'Utførende'} har meldt ferdig.</strong> Kontroller arbeidet og godkjenn, eller send tilbake med beskjed om hva som mangler.`,
    forsinket: html`<strong>Fristen er passert</strong> og oppgaven er ikke meldt ferdig.`,
  }[s];
  return html`<div class="kort" style="padding:16px;display:grid;gap:12px;background:var(--surface-2)">
    <div style="display:flex;gap:12px;align-items:center">
      ${hvem ? avatar(hvem.navn) : html`<span class="avatar" style="--hue:30">?</span>`}
      <div style="flex:1;min-width:0"><strong>${hvem ? hvem.navn : 'Ingen ansvarlig'}</strong>
        <div class="muted small">${hvem ? [hvem.firma, hvem.telefon].filter(Boolean).join(' · ') || hvem.fag || '' : 'Legg inn en person med dette faget under Folk og leverandører.'}</div></div>
      ${statusChip(o)}
    </div>
    ${tekst ? html`<p class="small">${tekst}</p>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${o.godkjent
        ? html`<button class="knapp liten" data-status="angre">${icon('undo')} Ta tilbake godkjenning</button>`
        : html`<button class="knapp liten ok" data-status="godkjenn">${icon('check')} Godkjenn som ferdig</button>
               ${o.ferdig_meldt ? html`<button class="knapp liten" data-status="avvis">Send tilbake …</button>` : ''}`}
      ${hvem?.telefon ? html`<a class="knapp liten lys" href="tel:${hvem.telefon}">${icon('phone')} Ring</a>` : ''}
    </div>
  </div>`;
}

function kobleStatus(el, o, lukk, ctx) {
  el.querySelectorAll('[data-status]').forEach((b) =>
    b.addEventListener('click', async () => {
      const hva = b.dataset.status;
      let r;
      if (hva === 'godkjenn') r = await attempt(() => api.post(`/oppgaver/${o.id}/godkjenn`, { godkjent: true }), 'Godkjent');
      if (hva === 'angre') r = await attempt(() => api.post(`/oppgaver/${o.id}/godkjenn`, { godkjent: false }), 'Godkjenningen er tatt tilbake');
      if (hva === 'avvis') r = await sendTilbake(o);
      if (r) {
        lukk(true);
        ctx.onEndret?.();
      }
    }),
  );
}

export async function sendTilbake(o) {
  const grunn = await modal({
    tittel: 'Send tilbake',
    undertittel: o.tittel,
    innhold: html`<form class="skjema" id="avvis">
      <label class="felt"><span>Hva mangler?</span><textarea name="grunn" required placeholder="F.eks. «Deksel mangler på to stikk i gangen»"></textarea>
      <small>Beskjeden havner i samtalen på oppgaven, og den utførende ser at den ikke er godkjent.</small></label>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Send tilbake</button></div>
    </form>`,
    onMount: (el, lukk) => $('#avvis', el).addEventListener('submit', (e) => {
      e.preventDefault();
      lukk(e.target.elements.grunn.value);
    }),
  });
  if (!grunn) return undefined;
  return attempt(() => api.post(`/oppgaver/${o.id}/avvis`, { grunn }), 'Sendt tilbake');
}

export function skrivFelt() {
  return html`<form class="skriv" id="skriv">
    <label class="ikon-knapp" title="Legg ved bilde" style="flex:none">${icon('camera')}<input type="file" accept="image/*" class="sr" name="bilde"></label>
    <textarea name="tekst" placeholder="Skriv en melding …" rows="1"></textarea>
    <button class="knapp primar" style="flex:none">Send</button>
  </form>
  <p class="muted xs" data-vedlagt style="margin-top:6px"></p>`;
}

export async function lastTraad(el, o, prosjektId) {
  const traad = $('#traad', el);
  const tegn = async () => {
    const liste = await attempt(() => api.get(`/oppgaver/${o.id}/kommentarer`));
    if (!liste) return;
    traad.innerHTML = liste.length
      ? html`${liste.map(
          (k) => html`<div class="innlegg">${avatar(k.av || 'Kunde')}<div class="boble">
            <div class="av"><strong>${k.av || 'Kunden'}</strong> · ${new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(k.opprettet))}</div>
            ${k.tekst ? html`<div class="pre">${k.tekst}</div>` : ''}
            ${k.vedlegg_id ? (String(k.vedlegg_type).startsWith('image/')
              ? html`<a href="${api.filUrl(k.vedlegg_id)}" target="_blank" rel="noopener"><img src="${api.filUrl(k.vedlegg_id)}" alt="Bilde"></a>`
              : html`<a href="${api.filUrl(k.vedlegg_id)}" target="_blank" rel="noopener">${icon('file')} Vedlegg</a>`) : ''}
          </div></div>`,
        )}`.toString()
      : html`<p class="muted small">Ingen meldinger ennå. Skriv til den som utfører oppgaven – de ser meldingen neste gang de åpner oppgavelisten.</p>`.toString();
  };
  await tegn();
  const form = $('#skriv', el);
  let vedlegg = null;
  form.elements.bilde.addEventListener('change', async (e) => {
    const fil = e.target.files[0];
    if (!fil) return;
    $('[data-vedlagt]', el).textContent = 'Laster opp bilde …';
    vedlegg = await attempt(() => api.lastOpp(fil, prosjektId));
    $('[data-vedlagt]', el).textContent = vedlegg ? `Vedlagt: ${fil.name}` : '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tekst = form.elements.tekst.value.trim();
    if (!tekst && !vedlegg) return;
    const r = await attempt(() => api.post(`/oppgaver/${o.id}/kommentarer`, { tekst, vedlegg_id: vedlegg?.id }));
    if (r) {
      form.reset();
      vedlegg = null;
      $('[data-vedlagt]', el).textContent = '';
      tegn();
    }
  });
}

export { arbeidsdager };
