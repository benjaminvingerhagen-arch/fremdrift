import { api } from '../api.js';
import { html, icon, $, $$, attempt, toast, bar } from '../ui.js';
import { ddmm, datoKort } from '/shared/plan.js';

// Økonomi i prosjektet, hentet fra Tripletex: bokførte kostnader, fakturaer til godkjenning
// og førte timer, sammen med budsjett og fremdrift. Oppdaterer seg selv mens fanen er åpen.

const OPPDATER_MS = 150_000;
const kr = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const t1 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 });
const kl = new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' });
const MND = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const mndNavn = (p) => `${MND[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;

let tidtaker = null;

export async function okonomiFane(el, ctx) {
  clearInterval(tidtaker);
  const last = async (oppdater = false) => {
    const data = await api.get(`/prosjekter/${ctx.prosjekt.id}/okonomi${oppdater ? '?oppdater=1' : ''}`);
    if (!el.isConnected) return clearInterval(tidtaker);
    tegn(el, ctx, data);
  };
  el.innerHTML = html`<div class="kort tom">${icon('refresh')} Henter tall fra Tripletex …</div>`.toString();
  try {
    await last();
  } catch (err) {
    el.innerHTML = html`<div class="kort tom">${icon('alert')} ${err.message}</div>`.toString();
    return;
  }
  // «Live»: hent på nytt med jevne mellomrom så lenge fanen vises. Serveren mellomlagrer.
  tidtaker = setInterval(() => {
    if (!el.isConnected) return clearInterval(tidtaker);
    if (document.visibilityState === 'visible') last().catch(() => {});
  }, OPPDATER_MS);
  el.oppdater = last;
}

function tegn(el, ctx, d) {
  if (!d.satt_opp) return ikkeSattOpp(el);
  if (!d.tripletex_id) return kobleTil(el, ctx, d);
  const k = d.kostnader;
  const t = d.timer;
  const brukt = k.bokfort + k.til_godkjenning;
  const pstKost = d.budsjett.kostnad ? Math.round((brukt / d.budsjett.kostnad) * 100) : null;
  const pstTimer = d.budsjett.timer ? Math.round((t.sum / d.budsjett.timer) * 100) : null;
  const foran = pstKost !== null && pstKost > d.fremdrift + 10;

  el.innerHTML = html`
    <div class="ok-hode">
      <span class="ok-kilde">${icon('link')} Tripletex-prosjekt <strong>${d.tripletex_navn}</strong>
        ${d.miljo !== 'produksjon' ? html`<span class="chip varsel">${d.miljo === 'falsk' ? 'Oppdiktede testdata' : 'Testmiljø'}</span>` : ''}</span>
      <span class="muted small" data-hentet>Oppdatert ${kl.format(new Date(d.hentet))} · oppdateres av seg selv</span>
      <span class="spacer"></span>
      <button class="knapp liten" data-oppdater>${icon('refresh')} Oppdater nå</button>
      <button class="knapp liten lys" data-endre>${icon('settings')} Endre kobling</button>
    </div>
    ${d.feil ? html`<div class="banner fare">${icon('alert')} ${d.feil} Viser tallene fra ${kl.format(new Date(d.hentet))}.</div>` : ''}
    ${(d.merknader || []).map((m) => html`<div class="banner">${icon('help')} ${m}</div>`)}

    <div class="tall-rad">
      <div class="tall"><span class="etikett">${icon('file')} Bokførte kostnader</span>
        <span class="verdi">${kr.format(k.bokfort)}<small>kr</small></span>
        <span class="hint">${k.antall_bilag} bilag · eks. mva.</span></div>
      <div class="tall ${k.til_godkjenning ? 'lilla' : ''}"><span class="etikett">${icon('checkCircle')} Til godkjenning</span>
        <span class="verdi">${kr.format(k.til_godkjenning)}<small>kr</small></span>
        <span class="hint">${k.venter.length ? `${k.venter.length} ${k.venter.length === 1 ? 'faktura' : 'fakturaer'} som ikke er bokført` : 'Ingen fakturaer venter'}</span></div>
      <div class="tall"><span class="etikett">${icon('clock')} Timer ført</span>
        <span class="verdi">${t1.format(t.sum)}<small>t</small></span>
        <span class="hint">${t1.format(t.fakturerbare)} fakturerbare${t.timekost ? ` · timekost ${kr.format(t.timekost)} kr` : ''}</span></div>
      <div class="tall ${foran ? 'fare' : ''}" data-budsjett-tall><span class="etikett">${icon('gantt')} Budsjett og fremdrift</span>
        ${pstKost !== null
          ? html`<span class="verdi">${pstKost}<small>% brukt</small></span>
              <div class="ok-meter" role="img" aria-label="${pstKost} % av budsjettet brukt, ${d.fremdrift} % av oppgavene godkjent">
                <span class="brukt ${pstKost > 100 ? 'over' : ''}" style="width:${Math.min(pstKost, 100)}%"></span>
                <span class="merke" style="left:${Math.min(d.fremdrift, 100)}%" title="Fremdrift ${d.fremdrift} %"></span></div>
              <span class="hint ok-linjer">${foran ? html`<b class="text-fare">${icon('alert')} Kostnadene løper foran fremdriften</b>` : ''}
                <span>${d.fremdrift} % av oppgavene er godkjent</span>
                <span>Budsjett ${kr.format(d.budsjett.kostnad)} kr${pstTimer !== null ? ` · timer ${pstTimer} % av ${t1.format(d.budsjett.timer)}` : ''}</span></span>`
          : html`<span class="verdi">${d.fremdrift}<small>% godkjent</small></span><span class="hint">Legg inn budsjett for å se forbruket mot fremdriften.</span>`}
        <button class="lenkeknapp small" data-budsjett>${icon('settings')}<span>${d.budsjett.kostnad || d.budsjett.timer ? 'Endre budsjett' : 'Legg inn budsjett'}</span></button>
      </div>
    </div>

    <div class="ok-diagrammer">
      <div class="kort"><div class="kort-topp"><h2>${icon('file')} Kostnader per måned</h2><span class="spacer"></span><span class="muted small">kr, bokført</span></div>
        <div class="kort-innhold">${stolper(k.per_maaned.map((x) => ({ etikett: mndNavn(x.periode), verdi: x.verdi, tekst: `${kr.format(x.verdi)} kr` })), 'kost')}</div></div>
      <div class="kort"><div class="kort-topp"><h2>${icon('clock')} Timer per uke</h2><span class="spacer"></span><span class="muted small">timer</span></div>
        <div class="kort-innhold">${stolper(t.per_uke.slice(-12).map((x) => ({ etikett: x.etikett.replace('Uke ', 'u'), verdi: x.verdi, tekst: `${x.etikett}: ${t1.format(x.verdi)} t` })), 'timer')}</div></div>
    </div>

    <div class="ok-tre">
      ${fordeling('Kostnader per type', 'file', k.per_klasse, (v) => `${kr.format(v)} kr`)}
      ${fordeling('Største leverandører', 'users', k.per_leverandor, (v) => `${kr.format(v)} kr`)}
      ${fordeling('Timer per person', 'clock', t.per_ansatt, (v) => `${t1.format(v)} t`)}
    </div>

    <div class="to-kol">
      <div class="kort"><div class="kort-topp"><h2>${icon('file')} Siste bilag</h2><span class="antall">${k.antall_bilag}</span></div>
        ${k.siste.length ? html`<div class="ok-tabell-rull"><table class="ok-tabell">
          <thead><tr><th>Dato</th><th>Bilag</th><th>Tekst</th><th class="tall-k">Beløp</th></tr></thead>
          <tbody>${k.siste.map((b) => html`<tr><td class="mono">${ddmm(b.dato)}</td><td class="mono muted">${b.bilag}</td>
            <td><strong>${b.tekst}</strong>${b.leverandor ? html`<small>${b.leverandor}</small>` : ''}</td><td class="tall-k mono">${kr.format(b.belop)}</td></tr>`)}</tbody></table></div>`
          : html`<div class="tom">Ingen bokførte kostnader på prosjektet ennå.</div>`}
      </div>
      <div class="kol">
        <div class="kort"><div class="kort-topp"><h2>${icon('checkCircle')} Til godkjenning</h2><span class="antall">${k.venter.length}</span></div>
          ${k.venter.length ? html`<ul class="ok-liste">${k.venter.map((v) => html`<li><span><strong>${v.leverandor || 'Ukjent leverandør'}</strong><small>${v.fakturanr ? `Faktura ${v.fakturanr} · ` : ''}${datoKort(v.dato)}</small></span><span class="mono">${kr.format(v.belop)} kr</span></li>`)}</ul>`
            : html`<div class="tom">Ingen fakturaer venter på godkjenning.</div>`}
        </div>
        <div class="kort"><div class="kort-topp"><h2>${icon('clock')} Siste timeføringer</h2><span class="antall">${t.antall}</span></div>
          ${t.siste.length ? html`<ul class="ok-liste">${t.siste.map((x) => html`<li><span><strong>${x.ansatt}</strong><small>${datoKort(x.dato)}${x.aktivitet ? ` · ${x.aktivitet}` : ''}${x.kommentar ? ` · ${x.kommentar}` : ''}</small></span><span class="mono">${t1.format(x.timer)} t</span></li>`)}</ul>`
            : html`<div class="tom">Ingen timer ført på prosjektet ennå.</div>`}
        </div>
      </div>
    </div>
    <p class="muted xs ok-fot">Kostnader er posteringer på konto 4000–7999 som er ført på prosjektet i Tripletex, uten mva. «Til godkjenning» er leverandørfakturaer på prosjektet som ennå ikke er bokført. Ingenting endres i Tripletex herfra.</p>`.toString();

  $('[data-oppdater]', el).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await el.oppdater(true);
      toast('Oppdatert fra Tripletex');
    } catch (err) {
      toast(err.message, 'feil');
      e.currentTarget.disabled = false;
    }
  });
  $('[data-endre]', el).addEventListener('click', () => kobleTil(el, ctx, d, true));
  $('[data-budsjett]', el).addEventListener('click', () => budsjettSkjema(el, ctx, d));
}

// Enkle stolper, én serie. Verdien vises ved pek/fokus, og den siste stolpen er merket.
function stolper(rader, klasse) {
  if (!rader.length) return html`<div class="tom">Ingenting ført ennå.</div>`;
  const maks = Math.max(...rader.map((r) => r.verdi), 1);
  return html`<div class="ok-stolper ${klasse}" style="--antall:${rader.length}">${rader.map((r, i) => html`<div class="stolpe" tabindex="0" aria-label="${r.etikett}: ${r.tekst}">
      <span class="verdi-tips">${r.tekst}</span>
      <span class="soyle ${r.verdi < 0 ? 'neg' : ''}" style="height:${Math.max(2, (Math.abs(r.verdi) / maks) * 100)}%"></span>
      ${i === rader.length - 1 ? html`<b class="siste">${r.tekst.replace(/^Uke \d+: /, '')}</b>` : ''}
      <small>${r.etikett}</small></div>`)}</div>`;
}

function fordeling(tittel, ik, rader, fmt) {
  const maks = Math.max(...rader.map((r) => Math.abs(r.verdi)), 1);
  return html`<div class="kort"><div class="kort-topp"><h2>${icon(ik)} ${tittel}</h2></div>
    <div class="kort-innhold">${rader.length ? html`<ul class="ok-fordeling">${rader.map((r) => html`<li><span class="navn">${r.navn}</span><span class="mono">${fmt(r.verdi)}</span>${bar(Math.round((Math.abs(r.verdi) / maks) * 100))}</li>`)}</ul>`
      : html`<div class="tom">Ingenting ennå.</div>`}</div></div>`;
}

function ikkeSattOpp(el) {
  el.innerHTML = html`<div class="kort innst-kort ok-oppsett">
    <h2>${icon('link')} Koble til Tripletex</h2>
    <p class="small">Med Tripletex koblet til ser du kostnadene som er bokført på prosjektet, fakturaer som venter på godkjenning og timene som er ført – oppdatert mens du ser på det. Ingenting endres i Tripletex.</p>
    <ol class="small">
      <li>Gå til <strong>Selskap → API-tokens</strong> i Tripletex og lag en ny nøkkel (modulen «Integrasjoner» må være slått på). Velg en bruker som kan se prosjektregnskapet.</li>
      <li>Legg nøkkelen inn i Vercel under <strong>Settings → Environment Variables</strong> som <span class="mono">TRIPLETEX_API_TOKEN</span>, og deploy på nytt.</li>
      <li>Kom tilbake hit og velg hvilket Tripletex-prosjekt dette prosjektet hører til.</li>
    </ol>
    <p class="xs muted">Nøkkelen står bare i Vercel, aldri i koden. Har du en vanlig integrasjon i stedet, brukes <span class="mono">TRIPLETEX_CONSUMER_TOKEN</span> og <span class="mono">TRIPLETEX_EMPLOYEE_TOKEN</span>.</p>
  </div>`.toString();
}

function kobleTil(el, ctx, d, endre = false) {
  el.innerHTML = html`<div class="kort innst-kort ok-oppsett">
    <h2>${icon('link')} Hvilket Tripletex-prosjekt er dette?</h2>
    <p class="small">Søk på navn eller prosjektnummer i Tripletex. Tallene hentes fra prosjektet du velger.</p>
    <form class="ok-sok" id="ttx-sok"><div class="sok">${icon('search')}<input type="search" name="sok" value="${ctx.prosjekt.navn}" placeholder="Prosjektnavn eller -nummer" autocomplete="off"></div>
      <button class="knapp">Søk</button></form>
    <ul class="ok-treff" id="ttx-treff"></ul>
    <div class="knapperad">${endre ? html`<button type="button" class="knapp lys text-fare" data-fra>Koble fra</button><span class="spacer"></span><button type="button" class="knapp" data-avbryt>Avbryt</button>` : ''}</div>
  </div>`.toString();
  const form = $('#ttx-sok', el);
  const treff = $('#ttx-treff', el);
  const sok = async () => {
    treff.innerHTML = html`<li class="muted small">Søker …</li>`.toString();
    const liste = await attempt(() => api.get(`/tripletex/prosjekter?sok=${encodeURIComponent(form.elements.sok.value.trim())}`));
    if (!liste) return (treff.innerHTML = '');
    treff.innerHTML = (liste.length
      ? html`${liste.map((p) => html`<li><span><strong>${p.nummer ? `${p.nummer} ` : ''}${p.navn}</strong><small>${p.kunde || 'Uten kunde'}${p.id === d.tripletex_id ? ' · koblet nå' : ''}</small></span>
          <button type="button" class="knapp liten ${p.id === d.tripletex_id ? 'lys' : 'primar'}" data-velg="${p.id}">${p.id === d.tripletex_id ? 'Valgt' : 'Velg'}</button></li>`)}`
      : html`<li class="muted small">Fant ingen åpne prosjekter. Prøv et kortere søk eller prosjektnummeret.</li>`).toString();
    $$('[data-velg]', treff).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      if (await attempt(() => api.put(`/prosjekter/${ctx.prosjekt.id}/tripletex`, { tripletex_id: Number(b.dataset.velg) }), 'Koblet til Tripletex')) okonomiFane(el, ctx);
      else b.disabled = false;
    }));
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sok();
  });
  $('[data-avbryt]', el)?.addEventListener('click', () => tegn(el, ctx, d));
  $('[data-fra]', el)?.addEventListener('click', async () => {
    if (await attempt(() => api.put(`/prosjekter/${ctx.prosjekt.id}/tripletex`, { tripletex_id: null }), 'Koblet fra Tripletex')) okonomiFane(el, ctx);
  });
  sok();
}

function budsjettSkjema(el, ctx, d) {
  const boks = $('[data-budsjett-tall]', el);
  boks.innerHTML = html`<form class="ok-budsjett" id="budsjett">
    <span class="etikett">${icon('gantt')} Budsjett</span>
    <label><span>Kostnader (kr)</span><input type="text" inputmode="decimal" name="budsjett_kostnad" value="${d.budsjett.kostnad ?? ''}" placeholder="F.eks. 350000"></label>
    <label><span>Timer</span><input type="text" inputmode="decimal" name="budsjett_timer" value="${d.budsjett.timer ?? ''}" placeholder="F.eks. 400"></label>
    <div class="knapperad"><button type="button" class="knapp liten lys" data-avbryt>Avbryt</button><button class="knapp liten primar">Lagre</button></div>
  </form>`.toString();
  boks.classList.remove('fare');
  $('[data-avbryt]', boks).addEventListener('click', () => tegn(el, ctx, d));
  $('#budsjett', boks).addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await attempt(() => api.put(`/prosjekter/${ctx.prosjekt.id}/budsjett`, Object.fromEntries(new FormData(e.target))), 'Budsjettet er lagret');
    if (r) tegn(el, ctx, { ...d, budsjett: { kostnad: r.budsjett_kostnad === null ? null : Number(r.budsjett_kostnad), timer: r.budsjett_timer === null ? null : Number(r.budsjett_timer) } });
  });
}
