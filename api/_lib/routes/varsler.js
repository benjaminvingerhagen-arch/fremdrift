import { route } from '../router.js';
import { q, one } from '../db.js';

// Varsler for prosjektlederen: det andre har gjort som krever oppfølging.
// Hentes fra loggen (hendelser med type), og «ulest» er alt etter sist prosjektlederen så på listen.
const TYPER = ['meldt', 'kommentar', 'kundesvar', 'kunde', 'mangel', 'dokument'];

route('GET', '/varsler', async ({ user }) =>
  q(
    `SELECT l.id, l.type, l.hvem, l.handling, l.detaljer, l.tidspunkt, l.prosjekt_id, l.oppgave_id,
            p.navn AS prosjekt, (l.tidspunkt > COALESCE(b.varsler_sett, '-infinity')) AS ulest
       FROM logg l JOIN prosjekter p ON p.id = l.prosjekt_id JOIN brukere b ON b.id = $1
      WHERE l.type = ANY($2::text[]) AND l.bruker_id IS DISTINCT FROM $1 AND l.tidspunkt > now() - interval '30 days'
      ORDER BY l.tidspunkt DESC LIMIT 150`,
    [user.id, TYPER],
  ),
);

route('GET', '/varsler/antall', async ({ user }) => {
  const r = await one(
    `SELECT COUNT(*)::int AS n FROM logg l JOIN brukere b ON b.id = $1
      WHERE l.type = ANY($2::text[]) AND l.bruker_id IS DISTINCT FROM $1
        AND l.tidspunkt > COALESCE(b.varsler_sett, now() - interval '30 days')`,
    [user.id, TYPER],
  );
  return { uleste: r.n };
});

route('POST', '/varsler/sett', async ({ user }) => {
  await q('UPDATE brukere SET varsler_sett = now() WHERE id = $1', [user.id]);
  return { ok: true };
});
