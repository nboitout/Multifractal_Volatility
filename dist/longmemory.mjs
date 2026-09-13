// Semiparametric long-memory estimation for the chapter's d(q).
//
// Table 1.4 reports fractional-dependence estimates for power transformations of
// volatility and volume. Those are a different quantity from the structure-function
// exponents zeta(q) that model.mjs computes, and the lab previously showed them only
// as transcribed constants. This module estimates them, so a measured curve can be
// drawn against the reported one.
//
// Only the m lowest Fourier frequencies are needed, so the periodogram is evaluated
// directly at those frequencies in O(n*m) rather than by a full transform.

import {mean, regress} from './model.mjs';

// Default bandwidth. n^0.5 keeps the intraday diurnal harmonic, which sits at a
// Fourier index equal to the number of sessions, outside the regression band;
// wider choices such as n^0.6 pull it inside. See docs/POLYGON_INTEGRATION.md.
export const defaultBandwidth = n => Math.max(4, Math.floor(Math.sqrt(n)));

export function periodogram(x, m) {
  const n = x.length, mu = mean(x), out = [];
  for (let j = 1; j <= m; j++) {
    const w = 2 * Math.PI * j / n;
    let re = 0, im = 0;
    for (let t = 0; t < n; t++) {
      const d = x[t] - mu, a = w * t;
      re += d * Math.cos(a);
      im += d * Math.sin(a);
    }
    out.push({lambda: w, I: (re * re + im * im) / (2 * Math.PI * n)});
  }
  return out;
}

// Geweke-Porter-Hudak log-periodogram regression. The asymptotic standard error of
// the slope is pi / sqrt(24 m) and does not depend on the data.
export function gph(x, m = defaultBandwidth(x.length)) {
  const used = periodogram(x, m).filter(p => p.I > 0);
  if (used.length < 4) return {d: NaN, se: NaN, m: used.length, r2: NaN};
  const points = used.map(p => ({x: -2 * Math.log(2 * Math.sin(p.lambda / 2)), y: Math.log(p.I)}));
  const fit = regress(points);
  return {d: fit.slope, se: Math.PI / Math.sqrt(24 * used.length), m: used.length, r2: fit.r2};
}

// Robinson's local Whittle estimator: minimise the concentrated objective over d.
// More efficient than GPH at the same bandwidth, so it is worth reporting as a
// cross-check rather than a replacement.
export function localWhittle(x, m = defaultBandwidth(x.length)) {
  const P = periodogram(x, m).filter(p => p.I > 0);
  if (P.length < 4) return {d: NaN, se: NaN, m: P.length};
  const logLambda = P.reduce((s, p) => s + Math.log(p.lambda), 0) / P.length;
  const objective = d => Math.log(mean(P.map(p => p.lambda ** (2 * d) * p.I))) - 2 * d * logLambda;

  // Golden-section search on (-0.5, 1); the objective is smooth and unimodal there.
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = -0.499, hi = 0.999;
  let a = hi - phi * (hi - lo), b = lo + phi * (hi - lo);
  let fa = objective(a), fb = objective(b);
  for (let i = 0; i < 80; i++) {
    if (fa < fb) { hi = b; b = a; fb = fa; a = hi - phi * (hi - lo); fa = objective(a); }
    else         { lo = a; a = b; fa = fb; b = lo + phi * (hi - lo); fb = objective(b); }
  }
  return {d: (lo + hi) / 2, se: 1 / (2 * Math.sqrt(P.length)), m: P.length};
}

// d(q) across the chapter's sixteen moment orders, for |x|^q.
// `estimator` is 'gph' or 'whittle'.
export function dCurve(x, {orders = Array.from({length: 16}, (_, i) => (i + 1) / 4), bandwidth, estimator = 'gph'} = {}) {
  const m = bandwidth ?? defaultBandwidth(x.length);
  const estimate = estimator === 'whittle' ? localWhittle : gph;
  return orders.map(q => {
    const {d, se} = estimate(Array.from(x, v => Math.abs(v) ** q), m);
    return {x: q, y: d, se};
  });
}
