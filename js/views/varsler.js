import { api } from '../api.js';
import { html, icon, $$, avatar } from '../ui.js';
import { store } from '../store.js';
import { tegnMeny } from '../app.js';

// Det andre har gjort som prosjektlederen bør følge opp: meldt ferdig, meldinger fra
// fagene, svar fra kunden og leveranser kunden har flyttet.
const TYPE = {
  meldt: { ikon: 'checkCircle', tone: 'info', tekst: 'Meldt ferdig', fane: '' },
  kommentar: { ikon: 'chat', tone: 'aktiv', tekst: 'Melding', fane: '' },
  kundesvar: { ikon: 'help', tone: 'ok', tekst: 'Kundesvar', fane: 'kunde' },
  kunde: { ikon: 'calendar', tone: 'varsel', tekst: 'Kunden', fane: 'plan' },
  mangel: { ikon: 'checkCircle', tone: 'info', tekst: 'Mangel utbedret', fane: 'mangler' },
};

function dagOverskrift(ts) {
  const d = new Date(ts);
  const iDag = new Date();
  const igaar = new Date(Date.now() - 86400000);
  const lik = (a, b) => a.toDateString() === b.toDateString();
  if (lik(d, iDag)) return 'I dag';
  if (lik(d, igaar)) return 'I går';
  return new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export async function varslerView(el) {
  document.title = 'Varsler · Fremdrift';
  const liste = await api.get('/varsler');
  const uleste = liste.filter((v) => v.ulest).length;
  const grupper = [];
  for (const v of liste) {
    const dag = dagOverskrift(v.tidspunkt);
    if (!grupper.length || grupper[grupper.length - 1].dag !== dag) grupper.push({ dag, rader: [] });
    grupper[grupper.length - 1].rader.push(v);
  }
  const klokke = new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = html`
    <div class="topp">
      <div class="tittel"><div class="over">${store.firma || 'Fremdrift'}</div><h1>Varsler</h1>
        <div class="under"><span>${uleste ? `${uleste} nye siden sist` : 'Ingen nye siden sist'} · siste 30 dager</span></div></div>
    </div>
    ${liste.length
      ? grupper.map((g) => html`<h2 class="gruppe-tittel varsel-dag">${g.dag}</h2>
          <ul class="kort varselliste">${g.rader.map((v) => {
            const t = TYPE[v.type] || TYPE.kommentar;
            return html`<li class="varsel ${v.ulest ? 'ulest' : ''}">
              <a href="#/p/${v.prosjekt_id}${t.fane ? `/${t.fane}` : ''}" ${v.oppgave_id ? html`data-oppgave-lenke="${v.oppgave_id}"` : ''}>
                <span class="varsel-ikon ${t.tone}">${icon(t.ikon)}</span>
                <span class="varsel-tekst">
                  <strong>${v.handling}</strong>
                  ${v.detaljer?.utdrag ? html`<span class="varsel-utdrag">«${v.detaljer.utdrag}»</span>` : ''}
                  ${v.detaljer?.kommentar ? html`<span class="varsel-utdrag">«${v.detaljer.kommentar}»</span>` : ''}
                  <small>${v.hvem} · ${v.prosjekt} · ${klokke.format(new Date(v.tidspunkt))}</small>
                </span>
                ${v.ulest ? html`<span class="varsel-prikk" aria-label="Ny"></span>` : ''}
              </a></li>`;
          })}</ul>`)
      : html`<div class="kort tom">${icon('bell')} Ingen varsler de siste 30 dagene. Her dukker det opp når fagene melder ferdig, skriver til deg eller kunden svarer.</div>`}`.toString();

  // Huske oppgaven som skal åpnes når prosjektet er lastet.
  $$('[data-oppgave-lenke]', el).forEach((a) => a.addEventListener('click', () => sessionStorage.setItem('aapneOppgave', a.dataset.oppgaveLenke)));

  if (uleste) {
    await api.post('/varsler/sett').catch(() => {});
    store.uleste = 0;
    tegnMeny();
  }
}
