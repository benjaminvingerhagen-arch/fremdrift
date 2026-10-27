import { api } from '../api.js';
import { html, icon, LOGO, avatar } from '../ui.js';
import { store } from '../store.js';
import { lesePlan } from './prosjekt.js';
import { iDag, datoMedDag, datoKort } from '/shared/plan.js';
import { NAVN } from '/shared/merke.js';

// Hele planen for ett prosjekt, for ansatte og leverandører: alle fag, bare til lesing.
// Egne oppgaver er uthevet. Meld ferdig og meldinger skjer fortsatt på «Mine oppgaver».

export async function fagplanView(root, prosjektId) {
  root.innerHTML = html`<div class="loading">Laster planen …</div>`.toString();
  let data;
  try {
    data = await api.get(`/mine/prosjekter/${prosjektId}/plan`);
  } catch (err) {
    root.innerHTML = html`<main class="mine-innhold fagplan-feil"><div class="kort tom">${icon('alert')} ${err.message}</div>
      <a class="knapp" href="#/mine">${icon('chevronLeft')} Tilbake til mine oppgaver</a></main>`.toString();
    return;
  }
  const { prosjekt: p } = data;
  document.title = `${p.navn} · ${NAVN}`;
  const dag = iDag();
  const mine = data.oppgaver.filter((o) => o.min && !o.godkjent).length;
  root.innerHTML = html`<div class="fagplan">
    <header class="mine-topp kompakt"><div class="indre">
      <div class="merkevare" style="display:flex">${LOGO}<div><strong>${NAVN}</strong><small>${store.firma || ''}</small></div>
        <span class="spacer"></span>${avatar(store.me.navn)}</div>
      <a class="tilbake" href="#/mine">${icon('chevronLeft')} Mine oppgaver</a>
      <h1>${p.navn}</h1>
      <p>${[p.adresse && p.adresse !== p.navn ? p.adresse : null, p.innflytting ? `Innflytting ${datoMedDag(p.innflytting)}` : null, p.sluttfrist ? `Sluttfrist ${datoKort(p.sluttfrist)}` : null].filter(Boolean).join(' · ')}</p>
    </div></header>
    <main class="hoved fagplan-innhold">
      <p class="muted small fagplan-hjelp">Hele planen for prosjektet, med alle fag. ${mine ? html`Dine ${mine} åpne ${mine === 1 ? 'oppgave er' : 'oppgaver er'} uthevet.` : ''} Du melder ferdig og sender bilder fra <a href="#/mine">mine oppgaver</a>.</p>
      <section id="fagplan"></section>
    </main>
  </div>`.toString();
  lesePlan(root.querySelector('#fagplan'), { ...data, dag, personer: [] });
}
