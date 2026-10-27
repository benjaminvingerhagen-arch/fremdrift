// Forsiden. Lastes i <head> uten defer, så videresendingen skjer før siden tegnes.

// Appen lå tidligere på «/». Gamle bokmerker og lenker i e-post ser ut som «/#/p/12»
// eller «/#/mine». De sendes videre til appen med hele adressedelen, så ingenting går tapt.
// En app som er lagt på hjemskjermen fra den gamle adressen, åpner også rett i appen.
const fraHjemskjerm = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
if (location.hash.startsWith('#/') || fraHjemskjerm) {
  location.replace(`/app${location.hash}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const aar = document.getElementById('aar');
  if (aar) aar.textContent = String(new Date().getFullYear());

  // Toppen får en strek når man har scrollet.
  const topp = document.getElementById('topp');
  const oppdaterTopp = () => topp?.classList.toggle('scrollet', window.scrollY > 8);
  window.addEventListener('scroll', oppdaterTopp, { passive: true });
  oppdaterTopp();

  // Fanene i «Se selv». Piltaster flytter mellom fanene, som i en vanlig fanerad.
  const faner = [...document.querySelectorAll('.demo-faner [role="tab"]')];
  const velg = (fane, fokus) => {
    for (const f of faner) {
      const valgt = f === fane;
      f.setAttribute('aria-selected', String(valgt));
      f.tabIndex = valgt ? 0 : -1;
      const panel = document.getElementById(f.getAttribute('aria-controls'));
      if (panel) panel.hidden = !valgt;
    }
    if (fokus) fane.focus();
  };
  faner.forEach((fane, i) => {
    fane.addEventListener('click', () => velg(fane, false));
    fane.addEventListener('keydown', (e) => {
      const flytt = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (e.key === 'Home') velg(faner[0], true);
      else if (e.key === 'End') velg(faner[faner.length - 1], true);
      else if (flytt) velg(faner[(i + flytt + faner.length) % faner.length], true);
      else return;
      e.preventDefault();
    });
  });

  // «Be om demo»: lagres i systemet, og sendes på e-post når det er satt opp.
  const skjema = document.getElementById('demo-skjema');
  if (!skjema) return;
  const melding = skjema.querySelector('.skjema-melding');
  const knapp = skjema.querySelector('button[type="submit"]');
  const vis = (tekst, type = '') => {
    melding.textContent = tekst;
    melding.className = `skjema-melding ${type}`;
  };
  skjema.addEventListener('submit', async (e) => {
    e.preventDefault();
    const felt = skjema.elements;
    const mangler = ['navn', 'firma', 'epost'].filter((n) => !felt[n].value.trim() || !felt[n].checkValidity());
    for (const n of ['navn', 'firma', 'epost']) felt[n].setAttribute('aria-invalid', String(mangler.includes(n)));
    if (mangler.length) {
      vis(mangler.includes('epost') && felt.epost.value.trim() ? 'Sjekk e-postadressen.' : 'Fyll ut navn, firma og e-post.', 'feil');
      felt[mangler[0]].focus();
      return;
    }
    knapp.disabled = true;
    vis('Sender …');
    try {
      const svar = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-FD': '1' },
        body: JSON.stringify(Object.fromEntries(new FormData(skjema))),
      });
      const data = await svar.json().catch(() => ({}));
      if (!svar.ok) throw new Error(data.error || 'Noe gikk galt. Prøv igjen litt senere.');
      skjema.classList.add('sendt');
      vis(`Takk, ${felt.navn.value.trim().split(' ')[0]}! Vi tar kontakt så snart vi kan.`, 'ok');
    } catch (err) {
      vis(err.message, 'feil');
      knapp.disabled = false;
    }
  });
});
