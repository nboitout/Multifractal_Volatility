// Minimal xlsx reader: enough to pull one sheet out of a spreadsheet export, with no
// dependencies. An xlsx is a ZIP of XML, and Node can inflate raw deflate streams, so
// the only pieces needed are a central-directory walk and a cell parse.
//
// Google Sheets exports mix cell encodings in the same file: dates that came from a
// formula arrive as serial numbers, dates that were entered as text arrive as shared
// strings. Both are returned here as the strings a CSV export would have produced, so
// downstream parsing does not have to care which.

import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';

function readZip(path) {
  const buf = readFileSync(path);
  // End of central directory: scan back from the tail for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip archive (no end-of-central-directory record).');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt central directory.');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressed);
    files.set(name, () => method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// Excel serial 25569 is 1970-01-01. Values carry a time fraction; the date is what matters.
export function serialToISO(serial) {
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

const columnIndex = ref => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Returns rows of strings, shaped like a CSV export of the sheet.
export function readSheet(path) {
  const files = readZip(path);
  const text = name => files.has(name) ? files.get(name)().toString('utf8') : '';

  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));

  // Style indices whose number format is a date, so serial numbers can be recognised.
  const styles = text('xl/styles.xml');
  const dateFormats = new Set(['14','15','16','17','22','164','165','166','167']);
  for (const m of styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)) {
    if (/[dmy]/i.test(m[2]) && !/^\[/.test(m[2])) dateFormats.add(m[1]);
  }
  const cellXfs = styles.slice(styles.indexOf('<cellXfs'));
  const styleIsDate = [...cellXfs.matchAll(/<xf [^>]*numFmtId="(\d+)"[^>]*>/g)].map(m => dateFormats.has(m[1]));

  const sheetName = [...files.keys()].find(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!sheetName) throw new Error('No worksheet found in the workbook.');
  const sheet = text(sheetName);

  const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                         .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of rowMatch[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ''] = c;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = unescape([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));
      else if (v !== undefined) {
        value = unescape(v);
        if (!type && style >= 0 && styleIsDate[style] && Number.isFinite(Number(v))) value = serialToISO(Number(v));
      }
      cells[columnIndex(ref)] = value;
    }
    rows.push(Array.from(cells, x => x ?? ''));
  }
  return rows;
}
