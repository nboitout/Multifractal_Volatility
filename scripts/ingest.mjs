#!/usr/bin/env node
// Backfill 5-minute bars from Polygon into the Neon research store.
//
//   node scripts/ingest.mjs --init            create the schema and seed the asset table
//   node scripts/ingest.mjs                   backfill every asset over the free-tier window
//   node scripts/ingest.mjs --asset MSFT      one asset only
//   node scripts/ingest.mjs --derive          recompute session / bucket / gap_min and stop
//   node scripts/ingest.mjs --status          show what has been ingested so far
//
// Reads POLYGON_API_KEY and DATABASE_URL from the environment or from a local
// .env file. Neither is ever written to the repository; .env is gitignored.
//
// The free tier allows 5 requests per minute and reaches back two years, so a
// full backfill is a rate-limited loop of roughly 72 requests. Progress is
// recorded per asset-month in ingest_chunk and completed months are skipped, so
// the run can be interrupted and restarted at no cost.

import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const RESOLUTION_MIN = 5;
const POLYGON_HOST = 'api.polygon.io';
const LOOKBACK_YEARS = 2;
const MS_PER_REQUEST = 12_500;   // 5 requests/minute, with margin
const MAX_RETRIES = 4;
const INSERT_BATCH = 1000;

// The instrument set. Only the three Polygon-served assets appear here: DGS10 and
// Brent are FRED daily series with no intraday equivalent and are loaded elsewhere.
// NOTE: the equity is provisional — block 2 of the "Daily Market Data" sheet was
// unlabelled. Confirm before treating any measured result as final.
const ASSETS = [
  {id: 1, symbol: 'MSFT',      class: 'stocks', label: 'Microsoft',  session_tz: 'America/New_York', has_volume: true},
  {id: 2, symbol: 'X:BTCUSD',  class: 'crypto', label: 'Bitcoin',    session_tz: 'UTC',              has_volume: true},
  {id: 3, symbol: 'C:EURUSD',  class: 'fx',     label: 'EUR/USD',    session_tz: 'UTC',              has_volume: false},
];

// ---------------------------------------------------------------- environment

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env; rely on the real environment */ }
}

// -------------------------------------------------------------------- polygon

let lastRequestAt = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function throttle() {
  const wait = lastRequestAt + MS_PER_REQUEST - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

// Polygon paginates with an absolute next_url. Validate its host before following
// it so a malformed or redirected response cannot send the key somewhere else.
function checkedUrl(raw) {
  const url = new URL(raw);
  if (url.host !== POLYGON_HOST) throw new Error(`Refusing to follow pagination to ${url.host}`);
  url.searchParams.set('apiKey', process.env.POLYGON_API_KEY);
  return url;
}

async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await sleep(15_000 * 2 ** attempt);
      continue;
    }
    if (response.status === 429) {
      if (attempt >= MAX_RETRIES) throw new Error('Rate limited after repeated backoff.');
      await sleep(15_000 * 2 ** attempt);
      continue;
    }
    if (response.status === 403) {
      throw new Error('403 from Polygon. The key may lack entitlement for this asset class '
        + '(stocks, crypto and forex are separate free subscriptions) or the range may predate the free-tier window.');
    }
    if (!response.ok) throw new Error(`Polygon returned ${response.status} ${response.statusText}`);
    const body = await response.json();
    if (body.status === 'ERROR') throw new Error(`Polygon error: ${body.error ?? 'unspecified'}`);
    return body;
  }
}

async function fetchMonth(symbol, from, to) {
  const path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${RESOLUTION_MIN}/minute/${from}/${to}`;
  let url = checkedUrl(`https://${POLYGON_HOST}${path}?adjusted=true&sort=asc&limit=50000`);
  const bars = [];
  for (;;) {
    const body = await getJson(url);
    for (const b of body.results ?? []) bars.push(b);
    if (!body.next_url) return bars;
    url = checkedUrl(body.next_url);
  }
}

// ----------------------------------------------------------------- date range

const iso = d => d.toISOString().slice(0, 10);

// Inclusive list of {from, to, month} covering the free-tier lookback window.
function monthChunks() {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear() - LOOKBACK_YEARS, today.getUTCMonth(), today.getUTCDate() + 1));
  const chunks = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= today) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    chunks.push({
      month: iso(monthStart),
      from: iso(monthStart < start ? start : monthStart),
      to: iso(monthEnd > today ? today : monthEnd),
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return chunks;
}

// ---------------------------------------------------------------------- store

async function upsertBars(client, assetId, bars) {
  for (let i = 0; i < bars.length; i += INSERT_BATCH) {
    const slice = bars.slice(i, i + INSERT_BATCH);
    const values = [];
    const rows = slice.map((b, j) => {
      const p = j * 7;
      values.push(assetId, new Date(b.t).toISOString(), b.o ?? null, b.h ?? null, b.l ?? null, b.c, b.v ?? null);
      return `($${p + 1},$${p + 2},$${p + 3},$${p + 4},$${p + 5},$${p + 6},$${p + 7})`;
    });
    await client.query(
      `insert into bar (asset_id, ts, open, high, low, close, volume) values ${rows.join(',')}
       on conflict (asset_id, ts) do update set
         open = excluded.open, high = excluded.high, low = excluded.low,
         close = excluded.close, volume = excluded.volume`,
      values,
    );
  }
}

// Derive the context columns in one pass, in SQL, so that bars loaded in separate
// monthly chunks still get correct gaps across the chunk boundaries.
async function deriveBarContext(client) {
  await client.query(`
    with ordered as (
      select b.asset_id, b.ts,
             (b.ts at time zone a.session_tz)::date as session,
             extract(epoch from b.ts - lag(b.ts) over (partition by b.asset_id order by b.ts)) / 60 as gap
        from bar b join asset a on a.id = b.asset_id
    ), numbered as (
      select asset_id, ts, session, gap,
             row_number() over (partition by asset_id, session order by ts) - 1 as bucket
        from ordered
    )
    update bar b
       set session = n.session, bucket = n.bucket, gap_min = n.gap::integer
      from numbered n
     where b.asset_id = n.asset_id and b.ts = n.ts
       and (b.session is distinct from n.session
         or b.bucket  is distinct from n.bucket
         or b.gap_min is distinct from n.gap::integer)
  `);
}

// ----------------------------------------------------------------------- runs

async function init(client) {
  await client.query(readFileSync(resolve(ROOT, 'scripts/schema.sql'), 'utf8'));
  for (const a of ASSETS) {
    await client.query(
      `insert into asset (id, symbol, class, label, session_tz, resolution_min, adjusted, has_volume)
       values ($1,$2,$3,$4,$5,$6,true,$7)
       on conflict (id) do update set
         symbol = excluded.symbol, class = excluded.class, label = excluded.label,
         session_tz = excluded.session_tz, resolution_min = excluded.resolution_min,
         has_volume = excluded.has_volume`,
      [a.id, a.symbol, a.class, a.label, a.session_tz, RESOLUTION_MIN, a.has_volume],
    );
  }
  console.log(`Schema ready. ${ASSETS.length} assets registered at ${RESOLUTION_MIN}-minute resolution.`);
}

async function status(client) {
  const {rows} = await client.query(`
    select a.symbol,
           count(b.ts)                    as bars,
           min(b.ts)::date                as first_day,
           max(b.ts)::date                as last_day,
           count(*) filter (where b.gap_min = $1) as contiguous
      from asset a left join bar b on b.asset_id = a.id
     group by a.symbol order by a.symbol`, [RESOLUTION_MIN]);
  for (const r of rows) {
    console.log(`${r.symbol.padEnd(10)} ${String(r.bars).padStart(8)} bars  `
      + `${r.first_day ? `${r.first_day.toISOString().slice(0,10)} .. ${r.last_day.toISOString().slice(0,10)}` : '(empty)'}  `
      + `${r.bars > 0 ? `${((r.contiguous / r.bars) * 100).toFixed(1)}% contiguous` : ''}`);
  }
}

async function backfill(client, only) {
  const chunks = monthChunks();
  const targets = only ? ASSETS.filter(a => a.symbol === only) : ASSETS;
  if (!targets.length) throw new Error(`Unknown asset: ${only}`);

  const {rows: done} = await client.query(`select asset_id, month from ingest_chunk where status = 'ok'`);
  const complete = new Set(done.map(r => `${r.asset_id}:${iso(r.month)}`));

  const pending = targets.flatMap(a => chunks
    .filter(c => !complete.has(`${a.id}:${c.month}`))
    .map(c => ({asset: a, chunk: c})));

  console.log(`${pending.length} asset-months to fetch (${complete.size} already complete). `
    + `At ${(60_000 / MS_PER_REQUEST).toFixed(0)} requests/min this is about `
    + `${Math.ceil(pending.length * MS_PER_REQUEST / 60_000)} minutes.\n`);

  let n = 0;
  for (const {asset, chunk} of pending) {
    const tag = `${asset.symbol} ${chunk.month.slice(0, 7)}`;
    try {
      const bars = await fetchMonth(asset.symbol, chunk.from, chunk.to);
      if (bars.length) await upsertBars(client, asset.id, bars);
      await client.query(
        `insert into ingest_chunk (asset_id, month, status, bars, note) values ($1,$2,$3,$4,$5)
         on conflict (asset_id, month) do update set
           status = excluded.status, bars = excluded.bars, fetched_at = now(), note = excluded.note`,
        [asset.id, chunk.month, bars.length ? 'ok' : 'empty', bars.length, `${chunk.from}..${chunk.to}`],
      );
      console.log(`[${String(++n).padStart(3)}/${pending.length}] ${tag.padEnd(20)} ${String(bars.length).padStart(6)} bars`);
    } catch (error) {
      await client.query(
        `insert into ingest_chunk (asset_id, month, status, bars, note) values ($1,$2,'error',0,$3)
         on conflict (asset_id, month) do update set
           status = 'error', fetched_at = now(), note = excluded.note`,
        [asset.id, chunk.month, String(error.message).slice(0, 500)],
      );
      console.error(`[${String(++n).padStart(3)}/${pending.length}] ${tag.padEnd(20)} FAILED: ${error.message}`);
    }
  }

  console.log('\nDeriving session, bucket and gap columns...');
  await deriveBarContext(client);
  await status(client);
}

// ------------------------------------------------------------------------ cli

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const flag = name => args.includes(name);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  const needsKey = !flag('--init') && !flag('--derive') && !flag('--status');
  if (needsKey && !process.env.POLYGON_API_KEY) throw new Error('POLYGON_API_KEY is not set.');

  // Neon requires TLS and its connection string carries sslmode=require. Honour the
  // string rather than forcing it, so the script also runs against a local Postgres.
  const sslDisabled = /[?&]sslmode=(disable|allow)\b/.test(process.env.DATABASE_URL);
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslDisabled ? false : {rejectUnauthorized: true},
  });
  await client.connect();
  try {
    if (flag('--init')) await init(client);
    else if (flag('--status')) await status(client);
    else if (flag('--derive')) { await deriveBarContext(client); await status(client); }
    else await backfill(client, value('--asset'));
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
