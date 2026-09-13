// Turning stored bars into the quantities the chapter measures.
//
// Two corrections must be applied before any estimate is reported, and both are
// demonstrated in docs/POLYGON_INTEGRATION.md:
//   - the bar spanning a market close to the next open is not a five-minute return.
//     Left in, one such observation per session drives d(3) and d(4) to zero.
//   - the intraday U-shaped volatility profile biases every estimate downward and
//     puts a deterministic harmonic in the periodogram.
// Both are reversible here so the page can show their effect rather than assert it.

import {mean, stats, acf, regress} from './model.mjs';
import {dCurve, defaultBandwidth} from './longmemory.mjs';

export const MOMENT_ORDERS = Array.from({length: 16}, (_, i) => (i + 1) / 4);
export const ACF_ORDERS = [0.5, 1, 2];
export const ACF_LAGS = 256;

// Log returns in percentage points, in the simulator's units. A bar whose gap from
// its predecessor is not exactly one sampling interval starts a new run rather than
// contributing a return.
export function returnsFromBars(bars, resolutionMin, {dropGaps = true} = {}) {
  const returns = [], buckets = [];
  let dropped = 0;
  for (let i = 1; i < bars.length; i++) {
    const previous = bars[i - 1].close, current = bars[i].close;
    const contiguous = bars[i].gap_min === resolutionMin;
    if (!contiguous) dropped++;
    if (dropGaps && !contiguous) continue;
    if (!(previous > 0 && current > 0)) continue;
    returns.push(100 * Math.log(current / previous));
    buckets.push(bars[i].bucket ?? 0);
  }
  return {returns, buckets, dropped};
}

// Divide out the mean absolute return for each time-of-day bucket. The profile is
// itself estimated, so this is not a free correction: with few sessions it is noisy.
export function deseasonalise(returns, buckets) {
  const total = new Map(), count = new Map();
  returns.forEach((r, i) => {
    const b = buckets[i];
    total.set(b, (total.get(b) ?? 0) + Math.abs(r));
    count.set(b, (count.get(b) ?? 0) + 1);
  });
  const profile = new Map();
  for (const [b, sum] of total) profile.set(b, sum / count.get(b));
  const overall = mean([...profile.values()]);
  return returns.map((r, i) => {
    const p = profile.get(buckets[i]);
    return p > 0 ? r * overall / p : r;
  });
}

// model.mjs caps the structure function at k = 64, which over five-minute bars is
// barely five hours. This is the same calculation with the ceiling lifted.
export function scalingExt(x, power, maxScale = 2048) {
  const scales = [];
  for (let k = 1; k <= maxScale; k *= 2) if (k <= x.length / 16) scales.push(k);
  if (!scales.length) return {points: [], fit: {slope: NaN, intercept: NaN, r2: NaN}, scales};
  const prefix = [0];
  for (const v of x) prefix.push(prefix.at(-1) + v);
  const points = scales.map(k => {
    let sum = 0;
    const count = x.length - k + 1;
    for (let i = 0; i < count; i++) sum += Math.abs(prefix[i + k] - prefix[i]) ** power;
    return {x: Math.log2(k), y: Math.log2(sum / count)};
  });
  return {points, fit: regress(points), scales};
}

// Everything the Measured view needs for one preprocessing variant.
export function buildVariant(returns, {maxScale = 2048, bandwidth} = {}) {
  const m = bandwidth ?? defaultBandwidth(returns.length);
  const structure = MOMENT_ORDERS.map(q => {
    const {points, fit, scales} = scalingExt(returns, q, maxScale);
    return {q, points, slope: fit.slope, r2: fit.r2, scales};
  });
  const summary = stats(returns);
  return {
    n: returns.length,
    bandwidth: m,
    d: dCurve(returns, {orders: MOMENT_ORDERS, bandwidth: m}),
    zeta: structure.map(s => ({x: s.q, y: s.slope})),
    structure,
    acf: ACF_ORDERS.map(q => ({
      q,
      points: acf(Array.from(returns, r => Math.abs(r) ** q), Math.min(ACF_LAGS, returns.length - 1)),
    })),
    summary: {sd: summary.sd, excess: summary.excess, skew: summary.skew, tail: summary.tail},
  };
}

// The payload served to the browser. Which corrections apply depends on the series:
// a daily series has no overnight bar to drop, because consecutive trading days are
// the chapter's own convention, and no time-of-day profile to divide out. Applying
// the intraday filter to it would discard every Monday. So the payload declares what
// is applicable and the view offers only that.
export function buildPayload(bars, provenance, options = {}) {
  const resolution = provenance.resolutionMin;
  const intraday = resolution < 1440 && new Set(bars.map(b => b.bucket ?? 0)).size > 1;
  const rawRun = returnsFromBars(bars, resolution, {dropGaps: false});

  let variants, defaultVariant;
  if (intraday) {
    const cleanRun = returnsFromBars(bars, resolution, {dropGaps: true});
    variants = {
      raw: buildVariant(rawRun.returns, options),
      degapped: buildVariant(cleanRun.returns, options),
      clean: buildVariant(deseasonalise(cleanRun.returns, cleanRun.buckets), options),
    };
    defaultVariant = 'clean';
  } else {
    variants = {asis: buildVariant(rawRun.returns, options)};
    defaultVariant = 'asis';
  }

  return {
    schema: 2,
    provenance: {...provenance, generatedAt: new Date().toISOString()},
    corrections: {gaps: intraday, seasonality: intraday},
    defaultVariant,
    diagnostics: {
      intraday,
      barsLoaded: bars.length,
      returnsRaw: rawRun.returns.length,
      returnsUsed: variants[defaultVariant].n,
      gapsDropped: intraday ? returnsFromBars(bars, resolution, {dropGaps: true}).dropped : 0,
      nonContiguous: rawRun.dropped,
      buckets: new Set(bars.map(b => b.bucket ?? 0)).size,
    },
    variants,
  };
}

export const VARIANT_LABELS = {
  asis: 'As supplied — consecutive trading observations',
  raw: 'No corrections',
  degapped: 'Overnight and weekend returns dropped',
  clean: 'Dropped and deseasonalised',
};
