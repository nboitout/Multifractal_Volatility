# Market data integration

Design for extending the lab from a pure simulator to a lab that measures the
chapter's quantities on real series. Supersedes the earlier handover plan, which
proposed a server-side market-data endpoint over daily bars.

Decisions recorded here were settled in review; the open questions are listed at
the end. Numbers quoted from experiments are single-realization illustrations
unless stated otherwise, and are order-of-magnitude arguments, not estimates.

## What the lab is missing

The `Original chapter` tab shows Table 1.4's reported fractional-dependence
estimates `d(q)` as static numbers. The simulator tab computes structure-function
exponents `zeta(q)`. These are different quantities, so the two halves of the
application never meet, and adding market data alone would not connect them: the
result would be the same four charts computed on a different series.

What connects them is implementing the semiparametric long-memory estimator, so
that a measured `d(q)` curve can be drawn on the same axes as the reported one.
That is the point of this work; the data pipeline exists to serve it.

## Architecture

Three tiers, deliberately separated:

1. **Research store** — Neon Postgres, in a project of its own so the free plan's
   per-project allowances are not shared with unrelated work. Five-minute bars for
   the intraday assets, written once by `scripts/ingest.mjs`. Never queried by the
   browser. Use the direct connection string rather than the pooled one: the
   backfill is a batch job holding a single long-lived client.
2. **Batch derivation** — an offline job that reads the store, applies the
   corrections below, and writes small precomputed curves (structure functions,
   autocorrelations, `d(q)` across the sixteen chapter moment orders).
3. **Static dashboard** — `dist/` continues to deploy as static files with no
   build step. It loads the precomputed curves as JSON, a few tens of kilobytes
   per asset, and keeps computing the *simulator* live in the browser.

This keeps the Vercel deployment static, keeps Neon's cold starts off the
interactive path, and enforces the simulated/measured separation structurally.

`dist/model.mjs` stays byte-identical so its existing invariants keep holding and
`node verify.mjs` keeps passing. New numerics go in new modules.

### Security

No API key or connection string reaches the browser or the repository. Both live
in a local `.env` (gitignored) and are read only by the offline scripts. Pagination
URLs returned by the provider are validated against the expected host before being
followed. There is no server-side market-data endpoint and no key in `dist/`.

## Instruments

| asset | source | resolution | volume |
| --- | --- | --- | --- |
| equity (provisional, see open questions) | Polygon stocks | 5-minute + daily | yes |
| `X:BTCUSD` | Polygon crypto | 5-minute + daily | yes |
| `C:EURUSD` | Polygon forex | 5-minute | no |
| `DGS10` | FRED | daily only | n/a |
| `DCOILBRENTEU` | FRED | daily only | n/a |

Two of the five have no intraday equivalent: they are FRED daily series and
Polygon carries no commodity futures. The manifest therefore carries resolution
and volume availability per asset, and views degrade where a series lacks them.

Polygon's free tiers are per asset class — stocks, crypto and forex are separate
free subscriptions. FRED is free with no lookback limit, so the two daily-only
series need no Polygon entitlement at all.

`DGS10` is a yield, not a price. The `100 * log(P_t / P_{t-1})` pipeline assumes a
price, so its treatment must be an explicit, recorded choice (daily yield
differences in basis points, or log-changes labelled as such) rather than a
default falling out of shared code. FRED marks holidays with `.`, which must not
parse as zero.

## Why five-minute bars

Measured against a two-year free-tier window:

| | 30-minute | 5-minute | 1-minute |
| --- | --- | --- | --- |
| rows, three assets | 67 K | 400 K | 2.0 M |
| Neon storage | 6 MB | 38 MB | 190–260 MB |
| octaves below the daily scale | 3.7 | 6.3 | 8.6 |
| equity sample / octaves | 6,552 / 8 | 39,312 / 11 | 196,560 / 13 |

Five minutes is the canonical sampling frequency in the realized-volatility
literature for the microstructure-noise-versus-frequency tradeoff, so it needs no
special defence. Thirty minutes would gain only two octaves over the daily series
already in hand. One minute sits far closer to the bandwidth problem described
below, clearing the GPH band by 14 per cent against five minutes' factor of 2.5.

Storage does not decide this. Neon's free-plan allowances are per project, so a
dedicated project carries 0.5 GB, 100 CU-hours per month and 5 GB of transfer of
its own, and every resolution in the table above fits. The bandwidth margin and
the literature convention are the reasons.

Stitched onto the ten-year daily series, five-minute bars span roughly five
minutes to 128 days: about fifteen octaves.

## Corrections that must be applied before estimation

### Overnight and weekend gaps

The bar spanning a market close to the next open is not a five-minute return; it
carries a full session of variance, roughly twenty standard deviations on the
intraday scale, once per session. On a cascade rescaled to intraday magnitude, a
single such outlier per session drives `d(3)` from .456 to .031 and `d(4)`
negative, while `d(1)`, `zeta(1)` and `zeta(2)` barely move. The corruption is
invisible in every chart the lab currently draws.

`bar.gap_min` is derived at load time for exactly this reason, so excluding these
observations is the query filter `where gap_min = resolution_min` rather than a
reprocessing step. It generalises to halts, holidays, early closes and the FX
Sunday open. Verified against a DST boundary: sessions and buckets remain correct
when the UTC time of the open shifts.

### A false positive worth naming

On the fixture, the *uncorrected* variant produces d(3) = .031 and d(4) = -.001
against Table 1.4's reported .0301 and .0035. The corrected variant gives .321 and
.249, far from the reported values. In other words the artefact reproduces the
chapter's headline decay almost exactly, and removing the artefact destroys the
agreement.

Anyone skipping the corrections would conclude they had reproduced the chapter, for
entirely the wrong reason. This is why the preprocessing variant is a visible control
in the Measured view rather than a fixed pipeline decision: the uncorrected curve has
to be inspectable to be recognised as spurious. It is also why a measured curve that
happens to match Table 1.4 should be treated as a warning to check the preprocessing
before it is treated as a result.

### Intraday seasonality

The U-shaped diurnal volatility pattern biases the estimators downward and puts a
deterministic harmonic in the periodogram. Deseasonalise by the time-of-day mean
absolute return before estimating; `bar.bucket` holds the time-of-day index.

The harmonic sits at Fourier index equal to the **number of sessions**, which is
independent of bar size, while the GPH regression band is `m`. So coarsening the
bars shrinks `m` and pushes the contamination further outside the band:

| sample | harmonic index | `m = n^0.5` | verdict |
| --- | --- | --- | --- |
| two years, 5-minute | 504 | 198 | outside the band |
| two years, 1-minute | 504 | 443 | outside by 14 per cent |
| any span, `m = n^0.6` | 504 | 571+ | inside — contaminated |

Use `m = n^0.5`, and deseasonalise regardless. Note that deseasonalisation is not
free: a time-of-day profile estimated from few sessions is itself noisy.

### Splicing daily history to the Polygon tail

The ten-year daily history and the Polygon tail do not share an adjustment
convention. Any disagreement lands as one spurious return on the join date. A
single 30 per cent join error collapses `d(2)` from .353 to .052 and `d(4)` to
zero; after overlap rescaling to within 0.5 per cent, the estimates are
indistinguishable from clean.

So: never butt-join. Request an overlap, rescale the older segment by the median
price ratio across it, record the ratio as provenance, and fail loudly if the
residual per-day discrepancy exceeds tolerance — serving history-only rather than
publishing a corrupted series. Volume needs the same treatment, since sources
differ on consolidated versus primary-exchange tape.

## Code changes required

`scaling()` hardcodes `[1,2,4,8,16,32,64]`, `acf()` defaults to 64 lags and
`horizon` is validated against `[1,5,20,64]`. All three cap at 64, so intraday
data would span five minutes to about five hours — worse coverage than the daily
series. Since `model.mjs` is frozen, the extended versions live in the new
modules, targeting scales up to about 2048 bars.

Planned modules:

- `dist/empirical.mjs` — bars to log returns, volume transforms, gap reporting.
- `dist/longmemory.mjs` — periodogram, GPH, local Whittle, `d(q)` curve.
- `dist/app.mjs` — a dataset abstraction replacing the direct `simulate()` call,
  and a third state on the data badge: SIMULATED / MEASURED / ORIGINAL RESULTS.

The estimator only needs the periodogram at the `m` lowest Fourier frequencies,
which is `O(n*m)` and needs no FFT. A prototype recovers known `d` within about
one standard error and, run on the uncalibrated cascade, reproduces the shape of
Table 1.4 — levels near .43–.47 at low `q`, decaying with `q` — without fitting.
Report a confidence band rather than R-squared: log-periodogram regression errors
are log-chi-squared, so R-squared runs .05–.32 even on good estimates and would
mislead if displayed the way the structure-function fit displays it.

## Stages

- **A — ingestion.** Schema, backfill script, splice integrity, manifest. *Schema and
  backfill are in place and verified against the live store; the daily-history importer
  and splice logic are not.*
- **B — estimator.** *In place.* `dist/longmemory.mjs`, `dist/empirical.mjs`,
  `scripts/derive.mjs` and the Measured view. Curves are precomputed offline for three
  preprocessing variants and served as static JSON; the browser does no estimation.
  Running against a labelled fixture until the backfill produces real bars.
- **C — volume.** Second Table 1.4 column and the mixture-of-distributions view,
  gated on per-asset volume availability.

## Acceptance criteria

- Simulated, measured and originally reported results stay clearly distinguished.
- The seeded simulator and its zero-intermittency Gaussian limit are unchanged.
- No key or connection string in the repository, in `dist/`, or in any browser request.
- Empty data, unavailable history, invalid inputs and provider errors produce clear
  states, never fabricated observations.
- Overnight and weekend observations are excluded, and deseasonalisation applied,
  before any estimate is reported.
- A splice whose overlap residual exceeds tolerance fails rather than publishes.
- Bar normalization and units are tested against a small fixture before any
  empirical chart is compared with the chapter.

## Open questions

1. The equity is provisional. Block 2 of the source spreadsheet is unlabelled;
   close 56.53 with 30.1 M volume on 2016-09-13 resembles MSFT, which is what
   `scripts/ingest.mjs` currently assumes. Confirm before publishing results.
2. `DGS10` treatment: yield differences or labelled log-changes.
3. Whether the Polygon key covers crypto and forex, or stocks only.
