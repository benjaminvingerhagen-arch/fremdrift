// Kalenderfil (iCalendar, RFC 5545) som telefonens kalender kan abonnere på.
// Bare heldagshendelser: oppgavene i planen har datoer, ikke klokkeslett.

const tekst = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// Linjer over 75 byte brettes, uten å dele et tegn som tar flere byte (æ, ø, å).
function brett(linje) {
  const ut = [];
  let del = '';
  let bytes = 0;
  for (const tegn of linje) {
    const n = Buffer.byteLength(tegn);
    const maks = ut.length ? 74 : 75; // fortsettelseslinjer starter med et mellomrom
    if (bytes + n > maks) {
      ut.push(del);
      del = '';
      bytes = 0;
    }
    del += tegn;
    bytes += n;
  }
  ut.push(del);
  return ut.join('\r\n ');
}

const dato = (iso) => String(iso).slice(0, 10).replace(/-/g, '');

function tidsstempel(t) {
  const d = t ? new Date(t) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function nesteDag(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// hendelser: { uid, fra, til (til og med), tittel, beskrivelse?, sted?, endret?, url? }
export function lagKalender({ navn, hendelser }) {
  const linjer = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fremdrift//Kalender//NB',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${tekst(navn)}`,
    'X-WR-TIMEZONE:Europe/Oslo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const h of hendelser) {
    linjer.push(
      'BEGIN:VEVENT',
      `UID:${h.uid}`,
      `DTSTAMP:${tidsstempel(h.endret)}`,
      `DTSTART;VALUE=DATE:${dato(h.fra)}`,
      // DTEND er dagen etter siste dag for heldagshendelser.
      `DTEND;VALUE=DATE:${dato(nesteDag(h.til || h.fra))}`,
      `SUMMARY:${tekst(h.tittel)}`,
      'TRANSP:TRANSPARENT',
    );
    if (h.beskrivelse) linjer.push(`DESCRIPTION:${tekst(h.beskrivelse)}`);
    if (h.sted) linjer.push(`LOCATION:${tekst(h.sted)}`);
    if (h.url) linjer.push(`URL:${h.url}`);
    linjer.push('END:VEVENT');
  }
  linjer.push('END:VCALENDAR');
  return linjer.map(brett).join('\r\n') + '\r\n';
}
