#!/usr/bin/env node
// Import the "Daily Market Data" spreadsheet into the curves the Markets today view reads.
//
//   node scripts/import-sheet.mjs --csv sources/daily-market-data.csv
//
// The sheet holds several series side by side, each with its OWN Date column and its
// own calendar: the equity skips NYSE holidays, the FRED series skip bond holidays,
// Bitcoin trades weekends. Rows therefore do not line up across blocks and must never
// be read across. Each block is parsed independently and keyed by its own dates.
//
// Dates come in two formats in the same file: DD/MM/YYYY for the first blocks and ISO
// for the rest. DD/MM is ambiguous against MM/DD for any day up to the twelfth, so the
// European reading is forced rather than sniffed.

import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPayload} from '../dist/empirical.mjs';
import {rebuildManifest} from './manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist/data');
const MISSING = new Set(['', '.', 'NA', 'N/A', '#N/A', 'null', '#VALUE!', '#REF!']);

// Recognised by the name of the block's value column, not by position.
const SERIES = [
  {match: c => c.includes('Volume') && !c.some(x => x.includes('BTC')), symbol: 'MSFT',
   label: 'Microsoft', assetClass: 'equity', quantity: 'price', order: 1},
  {match: c => c.some(x => x.includes('BTC')), symbol: 'BTCUSD',
   label: 'Bitcoin', assetClass: 'crypto', quantity: 'price', order: 2},
  {match: c => c.length === 1 && c[0] === 'Close', symbol: 'EURUSD',
   label: 'EUR/USD', assetClass: 'fx', quantity: 'price', order: 3},
  {match: c => c.includes('DGS10'), symbol: 'DGS10',
   label: 'US 10-year Treasury yield', assetClass: 'rates', quantity: 'yield', order: 4,
   note: 'This series is a yield in per cent, not a price. The pipeline applies the same '
       + '100·log(x_t / x_{t-1}) transformation used for the price series, so these are '
       + 'log-changes of a yield and are not returns in the chapter’s sense.'},
  {match: c => c.includes('DCOILBRENTEU'), symbol: 'BRENT',
   label: 'Brent crude', assetClass: 'commodity', quantity: 'price', order: 5},
];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Returns a UTC midnight timestamp, or null when the cell is not a date.
function parseDate(raw) {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);           // DD/MM/YYYY, European
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                      // ISO
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return null;
}

const number = raw => {
  const s = raw.trim();
  if (MISSING.has(s)) return null;
  const v = Number(s.replace(/\s/g, ''));
  return Number.isFinite(v) ? v : null;
};

// Split the header into blocks, each starting at a Date column.
function blocks(header) {
  const starts = header.map((h, i) => h.trim() === 'Date' ? i : -1).filter(i => i >= 0);
  return starts.map((start, k) => ({
    start,
    columns: header.slice(start + 1, starts[k + 1] ?? header.length).map(h => h.trim()),
  }));
}

function seriesFrom(rows, block) {
  const spec = SERIES.find(s => s.match(block.columns));
  if (!spec) return null;
  const closeIdx = block.columns.findIndex(c => /^Close/.test(c));
  const valueIdx = closeIdx >= 0 ? closeIdx : block.columns.length - 1;
  const volumeIdx = block.columns.findIndex(c => /^Volume/.test(c));

  const byDate = new Map();
  for (const row of rows) {
    const ts = parseDate(row[block.start] ?? '');
    if (ts === null) continue;
    const value = number(row[block.start + 1 + valueIdx] ?? '');
    if (value === null || value <= 0) continue;         // a yield of zero is unusable here too
    const volume = volumeIdx >= 0 ? number(row[block.start + 1 + volumeIdx] ?? '') : null;
    byDate.set(ts, {value, volume});
  }

  const bars = [...byDate.keys()].sort((a, b) => a - b).map((ts, i, all) => ({
    ts: new Date(ts).toISOString(),
    close: byDate.get(ts).value,
    volume: byDate.get(ts).volume,
    bucket: 0,                                           // daily: no time-of-day structure
    gap_min: i === 0 ? null : Math.round((ts - all[i - 1]) / 60_000),
    session: new Date(ts).toISOString().slice(0, 10),
  }));
  return {spec, bars, hasVolume: volumeIdx >= 0 && bars.some(b => b.volume !== null)};
}

function main() {
  const args = process.argv.slice(2);
  const csvPath = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : undefined;
  if (!csvPath) throw new Error('Usage: node scripts/import-sheet.mjs --csv <file>');

  const text = readFileSync(resolve(ROOT, csvPath), 'utf8').replace(/^﻿/, '');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The CSV has no data rows.');
  const [header, ...data] = rows;

  const found = blocks(header);
  console.log(`${found.length} date-keyed blocks in the header, ${data.length} rows\n`);

  mkdirSync(OUT, {recursive: true});
  let imported = 0;
  for (const block of found) {
    const series = seriesFrom(data, block);
    if (!series) { console.warn(`  unrecognised block at column ${block.start}: ${block.columns.join(', ')}`); continue; }
    const {spec, bars, hasVolume} = series;
    if (bars.length < 100) { console.warn(`  ${spec.symbol}: only ${bars.length} observations, skipping`); continue; }

    const payload = buildPayload(bars, {
      symbol: spec.symbol, label: spec.label, assetClass: spec.assetClass,
      quantity: spec.quantity, note: spec.note, order: spec.order,
      resolutionMin: 1440, adjusted: null, hasVolume,
      source: 'Daily Market Data spreadsheet', kind: 'measured',
      from: bars[0].session, to: bars.at(-1).session,
    });
    writeFileSync(resolve(OUT, `${spec.symbol}.curves.json`), JSON.stringify(payload));
    const gaps = bars.filter(b => b.gap_min !== null && b.gap_min > 1440).length;
    console.log(`  ${spec.symbol.padEnd(8)} ${String(bars.length).padStart(5)} obs  `
      + `${bars[0].session} .. ${bars.at(-1).session}  `
      + `${gaps} multi-day gaps  volume:${hasVolume ? 'yes' : 'no'}`);
    imported++;
  }
  if (!imported) throw new Error('No recognised series in that CSV.');
  const datasets = rebuildManifest(OUT);
  console.log(`\nmanifest.json lists ${datasets.length}: ${datasets.map(d => d.symbol).join(', ')}`);
}

main();
