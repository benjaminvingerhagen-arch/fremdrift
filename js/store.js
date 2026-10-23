import { api } from './api.js';

export const store = {
  me: null,
  firma: '',
  prosjekter: [],
};

export async function lastProsjekter() {
  store.prosjekter = await api.get('/prosjekter');
  return store.prosjekter;
}

// Samme farge for samme fag overalt: i planen, på kortene og på kundesiden.
export function fagHue(fag) {
  let h = 7;
  for (const ch of String(fag || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
