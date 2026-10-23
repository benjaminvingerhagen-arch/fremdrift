// Leser .xlsx og .csv i nettleseren uten eksterne biblioteker.
// .xlsx er en zip-fil; DecompressionStream('deflate-raw') pakker ut arkene.

const dv = (buf) => new DataView(buf);

function findEocd(buf) {
  const view = dv(buf);
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new Error('Filen ser ikke ut som en gyldig Excel-fil (.xlsx).');
}

async function inflate(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error('Excel-filen bruker en komprimering som ikke støttes.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(buf) {
  const view = dv(buf);
  const eocd = findEocd(buf);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = {};
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buf, p + 46, nameLen));
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    files[name] = { bytes: new Uint8Array(buf, start, compressedSize), method };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    async text(name) {
      const f = files[name];
      if (!f) return null;
      return new TextDecoder().decode(await inflate(f.bytes, f.method));
    },
    names: Object.keys(files),
  };
}

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');

const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Excel lagrer datoer som dagnummer fra 1899-12-30.
export function excelDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

export async function lesXlsx(file) {
  const zip = await readZip(await file.arrayBuffer());
  const sharedXml = await zip.text('xl/sharedStrings.xml');
  const shared = sharedXml
    ? [...parseXml(sharedXml).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join(''))
    : [];
  const sheetName = zip.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('Fant ingen ark i filen.');
  const sheet = parseXml(await zip.text(sheetName));
  const rows = [];
  for (const row of sheet.getElementsByTagName('row')) {
    const cells = [];
    for (const c of row.getElementsByTagName('c')) {
      const i = colIndex(c.getAttribute('r') || '');
      const type = c.getAttribute('t');
      let value = '';
      if (type === 's') value = shared[Number(c.getElementsByTagName('v')[0]?.textContent)] ?? '';
      else if (type === 'inlineStr') value = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
      else value = c.getElementsByTagName('v')[0]?.textContent ?? '';
      cells[i >= 0 ? i : cells.length] = value;
    }
    rows.push([...cells].map((v) => (v === undefined ? '' : String(v))));
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

export function lesCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const first = clean.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g)?.length || 0) >= (first.match(/,/g)?.length || 0) ? ';' : ',';
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"' && value === '') quoted = true; // bare først i feltet: «27" skjerm» er vanlig tekst
    else if (ch === sep) {
      row.push(value);
      value = '';
    } else if (ch === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += ch;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

export async function lesFil(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    if (/\.xls$/i.test(file.name)) throw new Error('Gamle .xls-filer støttes ikke. Lagre som .xlsx eller CSV i Excel.');
    return lesXlsx(file);
  }
  return lesCsv(dekodTekst(await file.arrayBuffer()));
}

// Nettbanker og Excel lagrer ofte CSV i Windows-1252. Lest som UTF-8 blir æøå til «�»,
// og da kjennes verken «Beløp»-kolonnen eller kundenavnene igjen.
export function dekodTekst(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

// ---------- Fremdriftsplan fra Excel ----------
// Leser arkene «Fremdriftsplan» (oppgaver) og «Oversikt» (milepæler og nøkkeldatoer)
// slik de ligger i Excel-planen, med kommentarene på oppgavenavnene som beskrivelse.

async function lesArbeidsbok(file) {
  const zip = await readZip(await file.arrayBuffer());
  const sharedXml = await zip.text('xl/sharedStrings.xml');
  const shared = sharedXml
    ? [...parseXml(sharedXml).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join(''))
    : [];
  const wb = parseXml(await zip.text('xl/workbook.xml'));
  const rels = parseXml(await zip.text('xl/_rels/workbook.xml.rels'));
  const malFor = {};
  for (const r of rels.getElementsByTagName('Relationship')) malFor[r.getAttribute('Id')] = r.getAttribute('Target');
  const ark = {};
  for (const s of wb.getElementsByTagName('sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const mal = String(malFor[rid] || '').replace(/^\/?xl\//, '');
    ark[s.getAttribute('name')] = `xl/${mal}`;
  }
  async function hentArk(navn) {
    const sti = ark[navn];
    if (!sti) return null;
    const xml = parseXml(await zip.text(sti));
    const celler = {};
    for (const c of xml.getElementsByTagName('c')) {
      const ref = c.getAttribute('r');
      const type = c.getAttribute('t');
      let v = '';
      if (type === 's') v = shared[Number(c.getElementsByTagName('v')[0]?.textContent)] ?? '';
      else if (type === 'inlineStr') v = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
      else v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      celler[ref] = v;
    }
    // Kommentarer: arkets egne relasjoner peker til kommentarfilen.
    const kommentarer = {};
    const relSti = sti.replace(/worksheets\/(sheet\d+\.xml)$/, 'worksheets/_rels/$1.rels');
    const relXml = await zip.text(relSti);
    if (relXml) {
      for (const r of parseXml(relXml).getElementsByTagName('Relationship')) {
        if (!/comments/.test(r.getAttribute('Type') || '')) continue;
        const mal = r.getAttribute('Target').replace(/^\.\.\//, 'xl/').replace(/^\/xl\//, 'xl/');
        const cx = await zip.text(mal);
        if (!cx) continue;
        for (const k of parseXml(cx).getElementsByTagName('comment')) {
          kommentarer[k.getAttribute('ref')] = [...k.getElementsByTagName('t')].map((t) => t.textContent).join('').trim();
        }
      }
    }
    return { celler, kommentarer };
  }
  return { arkNavn: Object.keys(ark), hentArk };
}

const kol = (n) => {
  let s = '';
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const tilDato = (v) => (v && /^\d+(\.\d+)?$/.test(String(v)) ? excelDate(v) : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const ren = (s) => String(s || '').replace(/✎/g, '').trim().toLowerCase();

function finnHode(celler, krav) {
  for (let r = 1; r <= 40; r++) {
    const hode = {};
    for (let c = 0; c < 30; c++) {
      const v = ren(celler[`${kol(c)}${r}`]);
      if (v) hode[v] = c;
    }
    if (krav.every((k) => Object.keys(hode).some((h) => h.startsWith(k)))) {
      const finn = (...navn) => {
        for (const n of navn) {
          const treff = Object.keys(hode).find((h) => h.startsWith(n));
          if (treff !== undefined) return hode[treff];
        }
        return -1;
      };
      return { rad: r, finn };
    }
  }
  return null;
}

const PRIO = { kritisk: 'kritisk', 'høy': 'hoy', hoy: 'hoy', normal: 'normal', tentativ: 'tentativ' };
const MTYPE = { fast: 'fast', innflytting: 'innflytting', sluttfrist: 'sluttfrist', start: 'start' };

export async function lesFremdriftsplan(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Velg Excel-filen (.xlsx) med fremdriftsplanen.');
  const bok = await lesArbeidsbok(file);
  const planNavn = bok.arkNavn.find((n) => /^fremdrift/i.test(n)) || bok.arkNavn[0];
  const plan = await bok.hentArk(planNavn);
  const hode = plan && finnHode(plan.celler, ['id', 'fag', 'oppgave']);
  if (!hode) throw new Error('Fant ikke kolonnene ID, Fag og Oppgave i planen.');
  const k = {
    id: hode.finn('id'), fag: hode.finn('fag'), oppgave: hode.finn('oppgave', 'kort oppgave'), fra: hode.finn('fra'), til: hode.finn('til'),
    prio: hode.finn('prio'), ferdig: hode.finn('ferdig'), status: hode.finn('status'),
    merknad: hode.finn('avhengighet', 'merknad'),
  };
  const celle = (c, r) => (c < 0 ? '' : plan.celler[`${kol(c)}${r}`] ?? '');
  const oppgaver = [];
  for (let r = hode.rad + 1; r < hode.rad + 600; r++) {
    const tittel = String(celle(k.oppgave, r)).trim();
    const fra = tilDato(celle(k.fra, r));
    if (!tittel && !celle(k.id, r)) {
      if (r > hode.rad + 5 && !plan.celler[`A${r + 1}`] && !plan.celler[`A${r + 2}`]) break;
      continue;
    }
    if (!tittel || !fra) continue;
    const ferdigCelle = String(celle(k.ferdig, r)).trim();
    const status = String(celle(k.status, r));
    oppgaver.push({
      nr: String(celle(k.id, r)).trim(),
      fag: String(celle(k.fag, r)).trim(),
      tittel,
      fra,
      til: tilDato(celle(k.til, r)) || fra,
      prioritet: PRIO[ren(celle(k.prio, r))] || 'normal',
      ferdig: Boolean(ferdigCelle) || /^(✔ )?ferdig$/i.test(status.trim()),
      merknad: String(celle(k.merknad, r)).trim() || null,
      beskrivelse: k.oppgave >= 0 ? plan.kommentarer[`${kol(k.oppgave)}${r}`] || null : null,
    });
  }

  const milepaeler = [];
  let innflytting = null;
  let sluttfrist = null;
  const ovNavn = bok.arkNavn.find((n) => /^oversikt$/i.test(n));
  const ov = ovNavn ? await bok.hentArk(ovNavn) : null;
  if (ov) {
    for (let r = 1; r < 12; r++) {
      const etikett = ren(ov.celler[`A${r}`]);
      const dato = tilDato(ov.celler[`C${r}`]) || tilDato(ov.celler[`B${r}`]);
      if (etikett.startsWith('innflytting') && dato) innflytting = dato;
      if (etikett.startsWith('sluttfrist') && dato) sluttfrist = dato;
    }
    const mh = finnHode(ov.celler, ['dato', 'milepæl']);
    if (mh) {
      const c = { dato: mh.finn('dato'), navn: mh.finn('milepæl'), type: mh.finn('type'), kort: mh.finn('tekst i gantt'), naadd: mh.finn('nådd') };
      for (let r = mh.rad + 1; r < mh.rad + 40; r++) {
        const dato = tilDato(ov.celler[`${kol(c.dato)}${r}`]);
        const navn = String(ov.celler[`${kol(c.navn)}${r}`] || '').trim();
        if (!dato || !navn) break;
        const typeRaa = ren(c.type >= 0 ? ov.celler[`${kol(c.type)}${r}`] : '');
        milepaeler.push({
          dato,
          navn,
          type: MTYPE[typeRaa] || 'delmal',
          kort: c.kort >= 0 ? String(ov.celler[`${kol(c.kort)}${r}`] || '').trim() || null : null,
          naadd: c.naadd >= 0 && Boolean(String(ov.celler[`${kol(c.naadd)}${r}`] || '').trim()),
        });
      }
    }
  }
  const datoer = oppgaver.map((o) => o.fra).sort();
  return { oppgaver, milepaeler, innflytting, sluttfrist, start: datoer[0] || null };
}
