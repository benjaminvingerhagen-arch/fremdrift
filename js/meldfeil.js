import { api } from './api.js';
import { html, $, modal, attempt, toast } from './ui.js';

// «Meld feil»: en kort beskrivelse går til den som drifter systemet, med hvilken side
// brukeren sto på. Siden huskes før dialogen åpnes, så det er stedet feilen skjedde.
// Brukes både i menyen for prosjektleder og nederst på siden for ansatte og leverandører.
export function meldFeil() {
  const side = location.hash || '#/';
  return modal({
    tittel: 'Meld feil',
    undertittel: 'Noe som ikke virket, eller som burde vært annerledes?',
    innhold: html`<form class="skjema" id="meld-feil">
      <p class="small muted">Fortell hva du gjorde og hva som skjedde. Vi får med hvilken side du sto på og hvilken nettleser du bruker, men ikke innholdet på siden.</p>
      <label class="felt"><span>Hva skjedde?</span>
        <textarea name="tekst" rows="6" required minlength="5" maxlength="4000" placeholder="Jeg trykket … og da …"></textarea></label>
      <div class="knapperad"><span class="spacer"></span><button type="button" class="knapp" data-lukk>Avbryt</button><button class="knapp primar">Send</button></div>
    </form>`,
    onMount: (el, lukk) =>
      $('#meld-feil', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const knapp = $('button.primar', e.target);
        knapp.disabled = true;
        const r = await attempt(() => api.post('/feilmelding', { tekst: e.target.elements.tekst.value, side, nettleser: navigator.userAgent }));
        knapp.disabled = false;
        if (r) {
          toast('Takk! Meldingen er sendt.');
          lukk(true);
        }
      }),
  });
}
