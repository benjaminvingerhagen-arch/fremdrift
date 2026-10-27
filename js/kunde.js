import { html, icon, LOGO, $, $$, progressRing, bar, modal, toast, attempt, formData, kobleDatoer } from './ui.js';
import { fagHue } from './store.js';
import { dagerMellom, leggTilDager, datoKort, datoMedDag, ddmm, isoUke, ukedag, DOKUMENT_KATEGORIER } from '/shared/plan.js';

// Kundesiden. Nøkkelen i adressen (/k/<nøkkel>) er hele tilgangen.
const token = location.pathname.split('/')[2] || '';
const root = document.getElementById('app');

async function kall(method, sti, body) {
  const res = await fetch(`/api/k/${encodeURIComponent(token)}${sti}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-FD': '1' },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error('Får ikke kontakt med serveren. Sjekk nettforbindelsen.');
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Feil (${res.status})`);
  return data;
}

const fil = (id) => `/api/k/${encodeURIComponent(token)}/fil/${id}`;
const KSTATUS = { ferdig: ['Ferdig', 'ok'], pagar: ['Pågår', 'aktiv'], planlagt: ['Kommer', ''] };

async function last() {
  let d;
  try {
    d = await kall('GET', '');
  } catch (err) {
    root.innerHTML = html`<div class="k-feil">${LOGO}<h1>Siden er ikke tilgjengelig</h1><p>${err.message}</p></div>`.toString();
    return;
  }
  tegn(d);
}

function tegn(d) {
  const { prosjekt: p, fremdrift: fr, i_dag: dag } = d;
  document.title = `${p.navn} · ${d.firma || 'Prosjektside'}`;
  const igjen = p.innflytting ? dagerMellom(dag, p.innflytting) : null;
  const neste = d.milepaeler.find((m) => m.dato >= dag && !m.naadd);
  const ubesvart = d.beslutninger.filter((b) => !b.besvart);
  const besvart = d.beslutninger.filter((b) => b.besvart);

  root.innerHTML = html`
    <header class="k-hero ${p.forsidebilde_id ? 'med-bilde' : ''}">
      ${p.forsidebilde_id ? html`<img class="k-hero-bilde" src="${fil(p.forsidebilde_id)}" alt="">` : ''}
      <div class="k-hero-indre">
        <div class="k-topplinje">${LOGO}<span>${d.firma || 'Prosjektside'}</span><span class="spacer"></span><span class="k-live"><i></i> Oppdatert ${datoMedDag(dag)}</span></div>
        <div class="k-hero-rad">
          <div class="k-hero-tekst">
            <p class="k-over">${p.kunde_navn ? `Prosjektside for ${p.kunde_navn}` : 'Prosjektside'}</p>
            <h1>${p.navn}</h1>
            ${p.adresse ? html`<p class="k-adresse">${icon('home')} ${p.adresse}</p>` : ''}
            ${p.beskrivelse ? html`<p class="k-beskrivelse">${p.beskrivelse}</p>` : ''}
          </div>
          <div class="k-glass">
            ${progressRing(fr.prosent, { size: 132, stroke: 11, label: 'ferdig' })}
            <div class="k-glass-tall">
              ${igjen !== null ? html`<div><strong>${igjen > 0 ? igjen : igjen === 0 ? 'I dag' : '✔'}</strong><span>${igjen > 0 ? 'dager til innflytting' : igjen === 0 ? 'Innflytting!' : 'Innflyttet'}</span></div>` : ''}
              <div><strong>${fr.ferdig}<small>/${fr.total}</small></strong><span>arbeider fullført</span></div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="k-innhold">
      <section class="k-tallrad">
        ${fr.for_innflytting !== null ? html`<div class="k-tall"><span>Klart til innflytting</span><strong>${fr.for_innflytting}%</strong>${bar(fr.for_innflytting, 'ok')}</div>` : ''}
        ${p.innflytting ? html`<div class="k-tall"><span>Innflytting</span><strong>${datoKort(p.innflytting)}</strong><em>${igjen > 0 ? `om ${igjen} dager · uke ${isoUke(p.innflytting)}` : igjen === 0 ? 'i dag' : 'gjennomført'}</em></div>` : ''}
        ${neste ? html`<div class="k-tall"><span>Neste milepæl</span><strong class="k-tall-tekst">${neste.navn}</strong><em>${datoMedDag(neste.dato)}</em></div>` : ''}
      </section>

      ${ubesvart.length ? html`<section class="k-seksjon">
        <h2 class="k-tittel">${icon('help')} Vi trenger svar fra deg <span class="k-merke">${ubesvart.length}</span></h2>
        <div class="k-beslutninger">${ubesvart.map((b) => html`<form class="k-kort k-beslutning" data-besl="${b.id}">
          <div><h3>${b.sporsmal}</h3>${b.frist ? html`<p class="k-frist ${b.frist < dag ? 'passert' : ''}">${icon('clock')} Svar innen ${datoMedDag(b.frist)}</p>` : ''}</div>
          ${b.beskrivelse ? html`<p class="k-tekst">${b.beskrivelse}</p>` : ''}
          ${b.alternativer.length
            ? html`<div class="k-valg">${b.alternativer.map((a, i) => html`<label><input type="radio" name="svar" value="${a}" ${i === 0 ? 'required' : ''}><span>${a}</span></label>`)}</div>`
            : html`<input type="text" name="svar" required placeholder="Ditt svar">`}
          <input type="text" name="kommentar" placeholder="Kommentar (valgfritt)">
          <button class="knapp primar">Send svar</button>
        </form>`)}</div>
      </section>` : ''}

      <div class="k-to">
        <div class="k-kol">
          <section class="k-kort">
            <h2 class="k-tittel">${icon('hammer')} Dette skjer denne uken <span class="k-uke">uke ${isoUke(dag)}</span></h2>
            ${d.denne_uken.length ? html`<ul class="k-liste k-uke-liste">${perFag(d.denne_uken).map((g) => html`<li>
              <span class="k-fagprikk" style="--hue:${fagHue(g.fag)}"></span>
              <div><strong>${g.fag}</strong><small>${g.oppgaver.map((o) => o.tittel).join(' · ')}</small></div>
              <span class="chip ${KSTATUS[g.status][1]}">${g.ferdig ? `${g.ferdig}/${g.oppgaver.length} ferdig` : KSTATUS[g.status][0]}</span></li>`)}</ul>`
              : html`<p class="k-tom">Ingen arbeider denne uken.</p>`}
            ${d.neste_uke.length ? html`<h3 class="k-undertittel">Neste uke</h3><ul class="k-liste k-dempet k-uke-liste">${perFag(d.neste_uke).map((g) => html`<li>
              <span class="k-fagprikk" style="--hue:${fagHue(g.fag)}"></span><div><strong>${g.fag}</strong><small>${g.oppgaver.map((o) => o.tittel).join(' · ')}</small></div>
              <span class="k-naar">fra ${datoMedDag(g.oppgaver.map((o) => o.fra).sort()[0]).split(' ')[0]}</span></li>`)}</ul>` : ''}
          </section>

          ${d.oppdateringer.length ? html`<section class="k-seksjon">
            <h2 class="k-tittel">${icon('camera')} Fra byggeplassen</h2>
            <div class="k-feed">${d.oppdateringer.map((u) => html`<article class="k-kort k-innlegg">
              <time>${new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(u.publisert))}</time>
              <h3>${u.tittel}</h3>
              ${u.tekst ? html`<p class="k-tekst pre">${u.tekst}</p>` : ''}
              ${u.bilder.length ? html`<div class="k-galleri antall-${Math.min(u.bilder.length, 4)}">${u.bilder.slice(0, 4).map((b, i) => html`<button data-bilde="${b}" data-gruppe="${u.id}" aria-label="Vis bilde">
                <img src="${fil(b)}" alt="" loading="lazy">${i === 3 && u.bilder.length > 4 ? html`<span>+${u.bilder.length - 4}</span>` : ''}</button>`)}</div>` : ''}
            </article>`)}</div>
          </section>` : ''}
          ${d.fag.length ? html`<section class="k-kort">
            <h2 class="k-tittel">${icon('gantt')} Tidslinje</h2>
            ${tidslinje(d)}
          </section>` : ''}

        </div>

        <div class="k-kol">
          <section class="k-kort">
            <h2 class="k-tittel">${icon('flag')} Milepæler</h2>
            <ol class="k-milepaeler">${d.milepaeler.map((m) => {
              const n = dagerMellom(dag, m.dato);
              const status = m.naadd || n < 0 ? 'forbi' : n === 0 ? 'idag' : m === neste ? 'neste' : '';
              return html`<li class="${status} ${m.type}"><span class="k-mp-dato">${ddmm(m.dato)}</span>
                <div><strong>${m.navn}</strong><small>${m.naadd ? 'Nådd' : n === 0 ? 'I dag' : n > 0 ? `om ${n} ${n === 1 ? 'dag' : 'dager'}` : datoMedDag(m.dato)}</small></div></li>`;
            })}</ol>
          </section>

          ${d.egne.length ? html`<section class="k-kort">
            <h2 class="k-tittel">${icon('calendar')} Dine leveranser</h2>
            <p class="k-tekst" style="margin-bottom:12px">Dette bestiller og styrer du selv. Hold datoene oppdatert, så planlegger vi resten rundt dem.</p>
            <ul class="k-liste">${d.egne.map((o) => html`<li>
              <span class="k-fagprikk" style="--hue:${fagHue(o.fag)}"></span>
              <div><strong>${o.tittel}</strong><small>${o.fag || ''} · ${ddmm(o.fra)}–${ddmm(o.til)}</small></div>
              ${o.godkjent ? html`<span class="chip ok">Ferdig</span>` : html`<button class="knapp liten" data-egen="${o.id}">${o.levert ? 'Levert ✔' : 'Oppdater'}</button>`}</li>`)}</ul>
          </section>` : ''}

          ${d.mangler?.length ? html`<section class="k-kort">
            <h2 class="k-tittel">${icon('checkCircle')} Mangler som utbedres <span class="k-merke">${d.mangler.filter((m) => !m.utbedret).length}</span></h2>
            <p class="k-tekst" style="margin-bottom:12px">Det vi har registrert ved befaring og overtakelse. Hver mangel krysses av når utbedringen er kontrollert.</p>
            <ul class="k-liste">${d.mangler.map((m) => html`<li>
              ${m.utbedret ? html`<span class="k-hake">${icon('check')}</span>` : html`<span class="k-apen" aria-hidden="true"></span>`}
              <div><strong>${m.tittel}</strong><small>${[m.rom, m.utbedret && m.utbedret_dato ? `utbedret ${ddmm(m.utbedret_dato)}` : null].filter(Boolean).join(' · ')}</small></div>
              <span class="chip ${m.utbedret ? 'ok' : 'varsel'}">${m.utbedret ? 'Utbedret' : 'Åpen'}</span></li>`)}</ul>
          </section>` : ''}

          ${d.dokumenter?.length ? html`<section class="k-kort">
            <h2 class="k-tittel">${icon('folder')} Dokumenter <span class="k-merke">${d.dokumenter.length}</span></h2>
            <p class="k-tekst" style="margin-bottom:12px">Tegninger, avtaler og dokumentasjon for boligen din. Trykk for å åpne eller laste ned.</p>
            <ul class="k-liste">${d.dokumenter.map((x) => html`<li>
              <span class="dok-type ${x.type === 'application/pdf' ? 'pdf' : x.type.includes('word') ? 'word' : x.type.includes('sheet') ? 'excel' : ''}">${x.type === 'application/pdf' ? 'PDF' : x.type.includes('word') ? 'Word' : x.type.includes('sheet') ? 'Excel' : 'Bilde'}</span>
              <div><a href="${fil(x.id)}" target="_blank" rel="noopener"><strong>${x.tittel}</strong></a><small>${[DOKUMENT_KATEGORIER[x.kategori], x.beskrivelse].filter(Boolean).join(' · ')}</small></div></li>`)}</ul>
          </section>` : ''}

          ${besvart.length ? html`<section class="k-kort">
            <h2 class="k-tittel">${icon('checkCircle')} Dine valg</h2>
            <ul class="k-liste">${besvart.map((b) => html`<li><span class="k-hake">${icon('check')}</span><div><strong>${b.sporsmal}</strong><small>${b.svar}${b.svar_kommentar ? ` – «${b.svar_kommentar}»` : ''}</small></div></li>`)}</ul>
          </section>` : ''}

          ${d.kontakt ? html`<section class="k-kort k-kontakt">
            <h2 class="k-tittel">Spørsmål?</h2>
            <p class="k-tekst">${d.kontakt.navn} er prosjektleder og svarer gjerne.</p>
            <div class="k-kontakt-knapper">
              ${d.kontakt.telefon ? html`<a class="knapp primar" href="tel:${d.kontakt.telefon}">${icon('phone')} Ring ${d.kontakt.navn.split(' ')[0]}</a>` : ''}
              ${d.kontakt.epost ? html`<a class="knapp" href="mailto:${d.kontakt.epost}?subject=${encodeURIComponent(p.navn)}">${icon('message')} E-post</a>` : ''}
            </div>
          </section>` : ''}
        </div>
      </div>
    </main>
    <footer class="k-fot">${LOGO}<span>${d.firma || ''}</span><span class="spacer"></span><span>Siden oppdateres automatisk når arbeid blir ferdig.</span></footer>`.toString();

  $$('[data-besl]', root).forEach((form) =>
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await attempt(() => kall('POST', `/beslutninger/${form.dataset.besl}`, formData(form)));
      if (r) {
        toast('Takk! Svaret er sendt til prosjektlederen.');
        last();
      }
    }),
  );
  $$('[data-egen]', root).forEach((b) => b.addEventListener('click', () => egenLeveranse(d.egne.find((o) => o.id === Number(b.dataset.egen)))));
  $$('[data-bilde]', root).forEach((b) =>
    b.addEventListener('click', () => {
      const u = d.oppdateringer.find((x) => x.id === Number(b.dataset.gruppe));
      lysboks(u.bilder, u.bilder.indexOf(Number(b.dataset.bilde)));
    }),
  );
}

// Én linje per fag over hele prosjektperioden, med i dag markert.
// Ukens arbeid samlet per fag, så kunden ser hvem som er i huset – ikke en lang oppgaveliste.
function perFag(oppgaver) {
  const m = new Map();
  for (const o of oppgaver) {
    const k = o.fag || 'Annet';
    if (!m.has(k)) m.set(k, { fag: k, oppgaver: [], ferdig: 0 });
    const g = m.get(k);
    g.oppgaver.push(o);
    if (o.status === 'ferdig') g.ferdig++;
  }
  return [...m.values()].map((g) => ({
    ...g,
    status: g.ferdig === g.oppgaver.length ? 'ferdig' : g.oppgaver.some((o) => o.status === 'pagar') ? 'pagar' : 'planlagt',
  }));
}

function tidslinje(d) {
  const { prosjekt: p, i_dag: dag } = d;
  const datoer = [...d.fag.flatMap((f) => [f.fra, f.til]), p.start, p.innflytting, p.sluttfrist].filter(Boolean).sort();
  const start = datoer[0];
  const slutt = datoer[datoer.length - 1];
  const lengde = Math.max(1, dagerMellom(start, slutt) + 1);
  const pos = (iso) => `${(dagerMellom(start, iso) / lengde) * 100}%`;
  const uker = [];
  for (let u = leggTilDager(start, (7 - ukedag(start)) % 7); u <= slutt; u = leggTilDager(u, 7)) uker.push(u);
  return html`<div class="k-tidslinje">
    <div class="k-tl-akse">${uker.map((u) => html`<span style="left:${pos(u)}">uke ${isoUke(u)}</span>`)}</div>
    <div class="k-tl-rader">
      <div class="k-tl-overlay">
        ${dag >= start && dag <= slutt ? html`<div class="k-tl-idag" style="left:${pos(dag)}"><span>I dag</span></div>` : ''}
        ${p.innflytting && p.innflytting >= start && p.innflytting <= slutt ? html`<div class="k-tl-innflytting" style="left:${pos(p.innflytting)}" title="Innflytting"></div>` : ''}
      </div>
      ${d.fag.map((f) => {
        const pst = Math.round((f.ferdig / f.total) * 100);
        return html`<div class="k-tl-rad"><span class="k-tl-navn">${f.fag}</span>
          <div class="k-tl-spor"><div class="k-tl-bar" style="left:${pos(f.fra)};width:calc(${pos(leggTilDager(f.til, 1))} - ${pos(f.fra)});--hue:${fagHue(f.fag)}">
            <i style="width:${pst}%"></i></div></div></div>`;
      })}
    </div>
    <p class="k-tl-forklaring"><span><i class="fylt"></i> Ferdig del</span><span><i></i> Gjenstår</span><span><i class="linje"></i> I dag</span>${p.innflytting ? html`<span><i class="ruter"></i> Innflytting</span>` : ''}</p>
  </div>`;
}

function egenLeveranse(o) {
  return modal({
    tittel: o.tittel,
    undertittel: o.fag || '',
    innhold: html`<form class="skjema" id="egen">
      ${o.beskrivelse ? html`<p class="small muted">${o.beskrivelse}</p>` : ''}
      <div class="rad2"><label class="felt"><span>Fra</span><input type="date" name="fra" value="${o.fra}" required></label>
        <label class="felt"><span>Til</span><input type="date" name="til" value="${o.til}" required></label></div>
      <label class="avkrysning"><input type="checkbox" name="levert" ${o.levert ? 'checked' : ''}><span>Dette er levert og montert<small>Prosjektlederen kontrollerer og godkjenner.</small></span></label>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Lagre</button></div>
    </form>`,
    onMount: (el, lukk) => {
      const form = $('#egen', el);
      kobleDatoer(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await attempt(() => kall('PUT', `/oppgaver/${o.id}`, formData(form)), 'Takk! Datoene er oppdatert.')) {
          lukk(true);
          last();
        }
      });
    },
  });
}

function lysboks(bilder, start) {
  let i = Math.max(0, start);
  const el = document.createElement('div');
  el.className = 'k-lysboks';
  const vis = () => {
    el.innerHTML = html`<button class="k-lb-lukk" aria-label="Lukk">${icon('x')}</button>
      ${bilder.length > 1 ? html`<button class="k-lb-pil venstre" aria-label="Forrige">${icon('chevronLeft')}</button><button class="k-lb-pil hoyre" aria-label="Neste">${icon('chevronRight')}</button>` : ''}
      <img src="${fil(bilder[i])}" alt=""><span class="k-lb-teller">${i + 1} / ${bilder.length}</span>`.toString();
  };
  const lukk = () => {
    el.remove();
    document.removeEventListener('keydown', tast);
  };
  const flytt = (n) => {
    i = (i + n + bilder.length) % bilder.length;
    vis();
  };
  const tast = (e) => {
    if (e.key === 'Escape') lukk();
    if (e.key === 'ArrowRight') flytt(1);
    if (e.key === 'ArrowLeft') flytt(-1);
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('.venstre')) return flytt(-1);
    if (e.target.closest('.hoyre')) return flytt(1);
    if (e.target.tagName !== 'IMG') lukk();
  });
  document.addEventListener('keydown', tast);
  vis();
  document.body.append(el);
}

last();
// Siden henter nye tall av seg selv når kunden kommer tilbake til fanen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !document.querySelector('.modal-bakgrunn')) last();
});
