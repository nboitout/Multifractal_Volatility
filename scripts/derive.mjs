#!/usr/bin/env node
// Derive the precomputed curves the Measured view reads.
//
//   node scripts/derive.mjs --fixture     synthesise a labelled placeholder series
//   node scripts/derive.mjs               read every asset from the research store
//   node scripts/derive.mjs --asset MSFT  one asset
//
// Writes dist/data/<symbol>.curves.json plus dist/data/manifest.json. The browser
// loads those directly; it never queries Neon, so the deployment stays static and
// the database's cold starts stay off the interactive path.

import {writeFileSync, mkdirSync, readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalGenerator} from '../dist/model.mjs';
import {buildPayload} from '../dist/empirical.mjs';
import {rebuildManifest} from './manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist/data');

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* rely on the real environment */ }
}

// --------------------------------------------------------------------- fixture

// A placeholder series with the structure real intraday data has: a volatility
// cascade, a U-shaped time-of-day profile, and an unusable bar at each session
// open. It exists so the view can be built and reviewed before the backfill runs.
// It is not a measurement and is labelled as such everywhere it surfaces.
function fixtureBars({sessions = 504, perSession = 78, seed = 2004, lambda = 0.05} = {}) {
  const n = sessions * perSession;
  const depth = Math.ceil(Math.log2(n));
  const size = 2 ** depth;
  const branch = normalGenerator(seed ^ 0x9e3779b9), noise = normalGenerator(seed);
  const v = lambda * Math.LN2;
  const logSigma = new Float64Array(size);
  for (let level = 1; level <= depth; level++) {
    const width = size / 2 ** level;
    for (let start = 0; start < size; start += width) {
      const w = -v + Math.sqrt(v) * branch();
      for (let t = start; t < start + width; t++) logSigma[t] += w;
    }
  }

  const shape = i => 1 + 0.9 * Math.cos(2 * Math.PI * i / perSession);
  const scale = 0.06;                       // roughly a five-minute return in percent
  const bars = [];
  let price = 100;
  let ts = Date.UTC(2024, 8, 16, 13, 30, 0); // a Monday open, in UTC

  for (let s = 0; s < sessions; s++) {
    for (let i = 0; i < perSession; i++) {
      const t = s * perSession + i;
      const sigma = scale * Math.exp(logSigma[t]) * shape(i);
      // The session's first bar carries an overnight move, not a five-minute one.
      const r = i === 0 && s > 0 ? scale * Math.sqrt(perSession) * noise() : sigma * noise();
      price *= Math.exp(r / 100);
      bars.push({
        ts: new Date(ts).toISOString(),
        close: price,
        volume: Math.round(50_000 * shape(i) * (0.6 + 0.8 * Math.abs(noise()))),
        bucket: i,
        gap_min: t === 0 ? null : i === 0 ? 1020 : 5,
        session: new Date(ts).toISOString().slice(0, 10),
      });
      ts += 5 * 60_000;
    }
    ts += (24 * 60 - perSession * 5) * 60_000;               // to the next session
    if (new Date(ts).getUTCDay() === 6) ts += 2 * 86_400_000; // skip the weekend
  }
  return bars;
}

// ----------------------------------------------------------------------- store

async function fromStore(only) {
  const pg = (await import('pg')).default;
  const sslDisabled = /[?&]sslmode=(disable|allow)\b/.test(process.env.DATABASE_URL ?? '');
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslDisabled ? false : {rejectUnauthorized: true},
  });
  await client.connect();
  try {
    const {rows: assets} = await client.query(
      `select id, symbol, label, class, resolution_min, adjusted, has_volume from asset
        ${only ? 'where symbol = $1' : ''} order by id`, only ? [only] : []);
    const out = [];
    for (const a of assets) {
      const {rows: bars} = await client.query(
        `select ts, close, volume, bucket, gap_min from bar where asset_id = $1 order by ts`, [a.id]);
      if (!bars.length) { console.warn(`${a.symbol}: no bars in the store, skipping.`); continue; }
      out.push({
        bars,
        provenance: {
          symbol: a.symbol, label: a.label, assetClass: a.class,
          resolutionMin: a.resolution_min, adjusted: a.adjusted, hasVolume: a.has_volume,
          source: 'Polygon', kind: 'measured',
          from: bars[0].ts.toISOString().slice(0, 10),
          to: bars.at(-1).ts.toISOString().slice(0, 10),
        },
      });
    }
    return out;
  } finally {
    await client.end();
  }
}

// ------------------------------------------------------------------------ main

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const only = args.includes('--asset') ? args[args.indexOf('--asset') + 1] : undefined;

  let datasets;
  if (args.includes('--fixture')) {
    const bars = fixtureBars();
    datasets = [{
      bars,
      provenance: {
        symbol: 'FIXTURE', label: 'Synthetic placeholder', assetClass: 'fixture',
        resolutionMin: 5, adjusted: null, hasVolume: false,
        source: 'Generated by scripts/derive.mjs --fixture', kind: 'fixture', order: 90,
        from: bars[0].session, to: bars.at(-1).session,
      },
    }];
  } else {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Use --fixture to generate a placeholder instead.');
    datasets = await fromStore(only);
    if (!datasets.length) throw new Error('Nothing to derive: the research store has no bars yet.');
  }

  mkdirSync(OUT, {recursive: true});
  for (const {bars, provenance} of datasets) {
    const started = Date.now();
    const payload = buildPayload(bars, provenance);
    const file = `${provenance.symbol.replace(/[^A-Za-z0-9._-]/g, '_')}.curves.json`;
    const json = JSON.stringify(payload);
    writeFileSync(resolve(OUT, file), json);
    console.log(`${provenance.symbol.padEnd(12)} ${String(bars.length).padStart(7)} bars  `
      + `${(json.length / 1024).toFixed(0)} kB  ${((Date.now() - started) / 1000).toFixed(1)}s  -> dist/data/${file}`);
  }
  const indexed = rebuildManifest(OUT);
  console.log(`manifest.json lists ${indexed.length}: ${indexed.map(d => d.symbol).join(", ")}`);
}

main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
