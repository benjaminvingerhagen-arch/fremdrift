import { api } from '../api.js';
import { html, icon, $, $$, modal, attempt, formData, bekreft, toast } from '../ui.js';
import { MANGEL_STATUS, mangelStatus, datoKort, datoMedDag, dagerMellom } from '/shared/plan.js';
import { fagMerke } from './oppgave.js';

// Mangelliste ved overtakelse. Prosjektlederen registrerer, faget melder utbedret,
// prosjektlederen godkjenner eller sender tilbake.

const chip = (m, dag) => {
  const s = MANGEL_STATUS[mangelStatus(m, dag)];
  return html`<span class="chip ${s.tone}">${s.tekst}</span>`;
};

const bilde = (id, alt) =>
  id ? html`<a class="mangel-bilde" href="${api.filUrl(id)}" target="_blank" rel="noopener"><img src="${api.filUrl(id)}" alt="${alt}" loading="lazy"></a>` : '';

function fristTekst(m, dag) {
  if (!m.frist || m.godkjent) return '';
  const n = dagerMellom(dag, m.frist);
  return html`<span class="${n < 0 ? 'text-fare strong' : ''}">${icon('clock')} ${n < 0 ? `${-n} dager over fristen` : n === 0 ? 'Frist i dag' : `Frist ${datoMedDag(m.frist)}`}</span>`;
}

// ---------- Prosjektleder: fanen «Mangler» ----------

export function manglerFane(el, ctx) {
  const { mangler = [], dag } = ctx;
  const venter = mangler.filter((m) => !m.godkjent && m.utbedret);
  const apne = mangler.filter((m) => !m.godkjent && !m.utbedret);
  const ferdige = mangler.filter((m) => m.godkjent);

  const rad = (m) => html`<li class="mangel ${m.godkjent ? 'ferdig' : ''}" data-mangel="${m.id}">
    ${bilde(m.bilde_id, m.tittel)}
    <div class="mangel-tekst">
      <div class="mangel-topp"><strong>${m.tittel}</strong>${chip(m, dag)}</div>
      <div class="meta small muted">
        ${m.rom ? html`<span>${icon('home')} ${m.rom}</span>` : ''}
        ${fagMerke(m.fag)}
        ${m.ansvarlig_navn ? html`<span>${m.ansvarlig_navn}</span>` : ''}
        ${fristTekst(m, dag)}
        ${!m.synlig_for_kunde ? html`<span>${icon('eye')} Skjult for kunden</span>` : ''}
      </div>
      ${m.beskrivelse ? html`<p class="small pre">${m.beskrivelse}</p>` : ''}
      ${m.avvist_grunn && !m.utbedret ? html`<p class="small text-fare">Sendt tilbake: ${m.avvist_grunn}</p>` : ''}
      ${m.utbedret && !m.godkjent ? html`<div class="mangel-utbedret">
          <p class="small"><strong>${m.utbedret_av || 'Faget'}</strong> meldte utbedret ${datoKort(m.utbedret.slice(0, 10))}${m.utbedret_kommentar ? html`: «${m.utbedret_kommentar}»` : ''}</p>
          ${bilde(m.utbedret_bilde_id, 'Bilde av utbedringen')}
        </div>` : ''}
    </div>
    <div class="mangel-knapper">
      ${m.godkjent
        ? html`<button class="knapp liten lys" data-gjenapne="${m.id}">${icon('undo')} Åpne igjen</button>`
        : html`${m.utbedret ? html`<button class="knapp liten ok" data-godkjenn="${m.id}">${icon('check')} Godkjenn</button>
              <button class="knapp liten" data-avvis="${m.id}">${icon('undo')} Send tilbake</button>`
            : html`<button class="knapp liten" data-godkjenn="${m.id}" title="Utbedret uten at faget har meldt det">${icon('check')} Utbedret</button>`}`}
      <button class="knapp liten lys" data-endre="${m.id}" aria-label="Endre">${icon('settings')}</button>
    </div>
  </li>`;

  const gruppe = (tittel, liste, ikon) =>
    liste.length ? html`<div class="gruppe-tittel">${icon(ikon)} ${tittel} <span class="mono">${liste.length}</span></div><ul class="kort mangelliste">${liste.map(rad)}</ul>` : '';

  el.innerHTML = html`
    <div class="mangel-hode">
      <p class="muted small">Feil og rester som må utbedres før eller etter overtakelse. Faget ser sine mangler på oppgavesiden og melder dem utbedret, du godkjenner. Kunden ser bare om en mangel er åpen eller utbedret.</p>
      <button class="knapp primar" data-ny-mangel>${icon('plus')} Ny mangel</button>
    </div>
    ${mangler.length
      ? html`${gruppe('Venter på kontroll', venter, 'checkCircle')}${gruppe('Åpne', apne, 'alert')}
          ${ferdige.length ? html`<details class="mangel-ferdige"><summary class="gruppe-tittel">${icon('check')} Utbedret <span class="mono">${ferdige.length}</span> <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">– vis</span></summary>
            <ul class="kort mangelliste">${ferdige.map(rad)}</ul></details>` : ''}`
      : html`<div class="kort tom">${icon('checkCircle')} Ingen mangler registrert. Bruk «Ny mangel» under befaring eller overtakelse – gjerne med bilde fra telefonen.</div>`}`.toString();

  const finn = (id) => mangler.find((m) => m.id === Number(id));
  $('[data-ny-mangel]', el).addEventListener('click', () => mangelSkjema(null, ctx));
  $$('[data-endre]', el).forEach((b) => b.addEventListener('click', () => mangelSkjema(finn(b.dataset.endre), ctx)));
  $$('[data-godkjenn]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      if (await attempt(() => api.post(`/mangler/${b.dataset.godkjenn}/godkjenn`, { godkjent: true }), 'Mangelen er godkjent som utbedret')) ctx.onEndret?.();
    }),
  );
  $$('[data-gjenapne]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      if (await attempt(() => api.post(`/mangler/${b.dataset.gjenapne}/godkjenn`, { godkjent: false }), 'Mangelen er åpnet igjen')) ctx.onEndret?.();
    }),
  );
  $$('[data-avvis]', el).forEach((b) => b.addEventListener('click', () => sendTilbake(finn(b.dataset.avvis), ctx)));
}

function sendTilbake(m, ctx) {
  return modal({
    tittel: 'Send mangelen tilbake',
    undertittel: m.tittel,
    innhold: html`<form class="skjema" id="avvis">
      <label class="felt"><span>Hva mangler?</span><textarea name="grunn" rows="3" required placeholder="F.eks. «Fortsatt riper i lakken ved døra»"></textarea></label>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Send tilbake</button></div>
    </form>`,
    onMount: (el, lukk) =>
      $('#avvis', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await attempt(() => api.post(`/mangler/${m.id}/avvis`, formData(e.target)), 'Sendt tilbake til faget')) {
          lukk(true);
          ctx.onEndret?.();
        }
      }),
  });
}

function mangelSkjema(m, ctx) {
  const ny = !m;
  const v = m || { synlig_for_kunde: true };
  const fagListe = [...new Set([...ctx.oppgaver.map((x) => x.fag), ...ctx.personer.map((p) => p.fag)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
  const folk = ctx.personer.filter((p) => p.rolle !== 'leder' && (p.aktiv || p.id === v.ansvarlig_id));
  let bildeId = v.bilde_id || null;
  return modal({
    tittel: ny ? 'Ny mangel' : v.tittel,
    undertittel: ctx.prosjekt.navn,
    innhold: html`<form class="skjema" id="mangel">
      <label class="felt"><span>Mangel</span><input type="text" name="tittel" value="${v.tittel || ''}" required placeholder="F.eks. «Riper i parkett»"></label>
      <div class="rad2">
        <label class="felt"><span>Rom / sted</span><input type="text" name="rom" value="${v.rom || ''}" placeholder="F.eks. Stue"></label>
        <label class="felt"><span>Frist</span><input type="date" name="frist" value="${v.frist || ''}"></label>
      </div>
      <div class="rad2">
        <label class="felt"><span>Fag</span><input type="text" name="fag" value="${v.fag || ''}" list="mangel-fag" placeholder="F.eks. Maler">
          <datalist id="mangel-fag">${fagListe.map((f) => html`<option value="${f}">`)}</datalist></label>
        <label class="felt"><span>Ansvarlig</span><select name="ansvarlig_id"><option value="">Etter fag (automatisk)</option>${folk.map(
          (p) => html`<option value="${p.id}" ${p.id === v.ansvarlig_id ? 'selected' : ''}>${p.navn}${p.fag ? ` (${p.fag})` : ''}</option>`,
        )}</select></label>
      </div>
      <label class="felt"><span>Gjelder oppgave</span><select name="oppgave_id"><option value="">Ingen bestemt oppgave</option>${ctx.oppgaver.map(
        (o) => html`<option value="${o.id}" ${o.id === v.oppgave_id ? 'selected' : ''}>${o.fag ? `${o.fag}: ` : ''}${o.tittel}</option>`,
      )}</select><small>Faget hentes fra oppgaven hvis du ikke har valgt et.</small></label>
      <label class="felt"><span>Beskrivelse</span><textarea name="beskrivelse" rows="3">${v.beskrivelse || ''}</textarea></label>
      <div class="felt"><span>Bilde</span>
        <div class="mangel-bildevalg">${bilde(v.bilde_id, 'Bilde av mangelen')}
          <label class="knapp liten">${icon('camera')} ${v.bilde_id ? 'Bytt bilde' : 'Ta eller velg bilde'}<input type="file" accept="image/*" capture="environment" hidden data-bilde></label>
          <span class="small muted" data-bildestatus></span></div></div>
      <label class="avkrysning"><input type="checkbox" name="synlig_for_kunde" ${v.synlig_for_kunde !== false ? 'checked' : ''}>
        <span>Vis på kundesiden<small>Kunden ser mangelen og om den er utbedret – ikke frist, fag eller ansvarlig.</small></span></label>
      <div class="knapperad">
        ${!ny ? html`<button type="button" class="knapp lys" data-slett>${icon('trash')} Slett</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="knapp" data-lukk>Avbryt</button>
        <button class="knapp primar">${ny ? 'Registrer mangel' : 'Lagre'}</button>
      </div>
    </form>`,
    onMount: (el, lukk) => {
      const form = $('#mangel', el);
      $('[data-bilde]', el).addEventListener('change', async (e) => {
        const fil = e.target.files[0];
        if (!fil) return;
        const status = $('[data-bildestatus]', el);
        status.textContent = 'Laster opp …';
        const r = await attempt(() => api.lastOpp(fil, ctx.prosjekt.id));
        if (r) bildeId = r.id;
        status.textContent = r ? `Lagt ved: ${fil.name}` : '';
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = { ...formData(form), bilde_id: bildeId };
        const r = await attempt(() => (ny ? api.post(`/prosjekter/${ctx.prosjekt.id}/mangler`, data) : api.put(`/mangler/${v.id}`, data)));
        if (r) {
          toast(ny ? 'Mangelen er registrert' : 'Lagret');
          lukk(r);
          ctx.onEndret?.();
        }
      });
      $('[data-slett]', el)?.addEventListener('click', async () => {
        if (!(await bekreft('Slette mangelen?', `«${v.tittel}» slettes for godt.`, { ok: 'Slett', fare: true }))) return;
        if (await attempt(() => api.del(`/mangler/${v.id}`))) {
          lukk(true);
          ctx.onEndret?.();
        }
      });
    },
  });
}

// ---------- Ansatte og leverandører: på oppgavesiden ----------

export function mineManglerHtml(mangler, dag, flereProsjekter) {
  if (!mangler.length) return '';
  const apne = mangler.filter((m) => !m.godkjent);
  const kort = (m) => {
    const s = mangelStatus(m, dag);
    return html`<div class="kort mkort mangel-kort ${m.godkjent ? 'ferdig' : ''}">
      <div class="rad">
        <div class="hva"><strong>${m.tittel}</strong><small>${[m.rom, flereProsjekter || !m.rom ? m.prosjekt : null].filter(Boolean).join(' · ')}</small></div>
        ${chip(m, dag)}
      </div>
      <div class="meta">${fristTekst(m, dag)}</div>
      ${m.beskrivelse ? html`<p class="small pre">${m.beskrivelse}</p>` : ''}
      ${bilde(m.bilde_id, m.tittel)}
      ${m.avvist_grunn && !m.utbedret ? html`<p class="small text-fare"><strong>Sendt tilbake:</strong> ${m.avvist_grunn}</p>` : ''}
      <div class="handlinger">
        ${s === 'godkjent' ? html`<span class="small text-ok">${icon('checkCircle')} Godkjent av prosjektleder</span>`
          : s === 'utbedret' ? html`<span class="small" style="color:var(--info-fg);flex:1">Meldt utbedret – venter på kontroll</span><button class="knapp liten lys" data-mangel-angre="${m.id}">${icon('undo')} Angre</button>`
          : html`<button class="knapp ok stor" style="flex:1" data-mangel-utbedret="${m.id}">${icon('check')} Meld utbedret</button>`}
      </div>
    </div>`;
  };
  return html`<div class="gruppe-tittel">${icon('alert')} Mangler å utbedre <span class="mono">${apne.length}</span></div>${mangler.map(kort)}`;
}

export function kobleMineMangler(root, mangler, oppfrisk) {
  const finn = (id) => mangler.find((m) => m.id === Number(id));
  $$('[data-mangel-angre]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      if (await attempt(() => api.post(`/mangler/${b.dataset.mangelAngre}/utbedret`, { utbedret: false }), 'Meldingen er trukket tilbake')) oppfrisk();
    }),
  );
  $$('[data-mangel-utbedret]', root).forEach((b) =>
    b.addEventListener('click', () => {
      const m = finn(b.dataset.mangelUtbedret);
      let bildeId = null;
      modal({
        tittel: 'Meld utbedret',
        undertittel: [m.tittel, m.rom, m.prosjekt].filter(Boolean).join(' · '),
        innhold: html`<form class="skjema" id="utbedret">
          <label class="felt"><span>Kommentar (valgfritt)</span><textarea name="kommentar" rows="2" placeholder="Hva ble gjort?"></textarea></label>
          <div class="felt"><span>Bilde av utbedringen (valgfritt)</span>
            <div class="mangel-bildevalg"><label class="knapp liten">${icon('camera')} Ta eller velg bilde<input type="file" accept="image/*" capture="environment" hidden data-bilde></label>
            <span class="small muted" data-bildestatus></span></div></div>
          <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp ok">${icon('check')} Meld utbedret</button></div>
        </form>`,
        onMount: (el, lukk) => {
          $('[data-bilde]', el).addEventListener('change', async (e) => {
            const fil = e.target.files[0];
            if (!fil) return;
            const status = $('[data-bildestatus]', el);
            status.textContent = 'Laster opp …';
            const r = await attempt(() => api.lastOpp(fil, m.prosjekt_id));
            if (r) bildeId = r.id;
            status.textContent = r ? `Lagt ved: ${fil.name}` : '';
          });
          $('#utbedret', el).addEventListener('submit', async (e) => {
            e.preventDefault();
            const r = await attempt(() => api.post(`/mangler/${m.id}/utbedret`, { utbedret: true, kommentar: e.target.elements.kommentar.value, bilde_id: bildeId }));
            if (r) {
              toast('Meldt utbedret – prosjektleder får beskjed');
              lukk(true);
              oppfrisk();
            }
          });
        },
      });
    }),
  );
}
