# Multifractal Volatility Lab

An interactive reconstruction based on Chapter 1 supplied by Nicolas Boitout and the publication by Nicolas Boitout and Loredana Ureche-Rangau, *Towards a Multifractal Paradigm of Stochastic Volatility?*, IJTAF 7(7), 823–851 (2004), DOI 10.1142/S0219024904002736.

## Scope and provenance

The source supplied for implementation is the reconstructed Word chapter `multifractal_volatility_article(1).docx`, not the original scanned publication or Datastream observations. Original Table 1.4 is transcribed as reported. It is never recomputed or presented as simulator output.

That chapter is now reproduced in full under `Original chapter`, converted from the supplied document: seven sections, four tables, seven figures and forty displayed equations. Its Table 1.4 was checked against the constants in `dist/model.mjs` and all sixteen rows of both columns agree, so the transcription is verified against the source rather than asserted.

Two rendering decisions were made in that conversion. Every body paragraph in the supplied document is italicised and none are upright, so the italics carry no emphasis and the web rendering sets body prose upright, keeping italics for captions and the provenance note. The document also reuses one image for both Figure 1.2 and Figure 1.4; both are reproduced as supplied. The reconstruction labels its figure redrawings as indicative, and they are not used as measured data in this lab.

The simulation implements a finite dyadic lognormal realization of the chapter's multiplicative-cascade framework. The normalization and computational details are explicit choices, disclosed in the page. This is not a calibrated reproduction of the Alcatel data-generating process or a claim to recover the author's original simulation code.

No modern rough-volatility model, synthetic trading volume, data import, or export is included. Original volume findings remain a historical reference, and no Chapter 2 integration is implemented.

## Narrative order

The views follow the chapter's argument rather than the order in which results are
easiest to plot. Information flow states the Mixture of Distributions premise first;
Returns, Memory and Scaling then present its consequences in the chapter's sequence;
the two data views carry the evidence. A numbered rail names the four claims and
marks which one each view serves.

The Information flow view plots the benchmark series that `simulate` has always
returned and the interface never displayed. Because the Gaussian shocks are shared
across models at a fixed seed, the two lines there differ in K alone, which is what
makes the mixture visible rather than merely asserted.

## Applicability of the corrections

Overnight-gap removal and deseasonalisation are properties of an intraday sample, not
of the pipeline. A daily series has no bar spanning a market close, because consecutive
trading days are the chapter's own convention, and no time-of-day profile to estimate.
The payload therefore declares which corrections apply and the view offers only those.
Applying the intraday filter to a daily sample would discard every observation after a
weekend, a fifth of the sample and systematically the Mondays.

The ten-year daily series carry roughly 2,600 observations each, which puts them close
to the chapter's own 2,633 Alcatel returns and gives the same estimator bandwidth.

DGS10 is a yield in per cent. It passes through the same transformation as the price
series, so its values are log-changes of a yield rather than returns in the chapter's
sense, and every view that shows it says so.

## Numerical specification

- N = 2^J, J in 8..13. Independent lognormal multipliers on each child interval of a complete dyadic tree.
- log W ~ Normal(-v, v), v = lambda^2 * log(2). Here the UI `lambda` variable stores lambda squared itself.
- E[W^2] = 1; sigma_t = sigma0 * product W_j,t; r_t = sigma_t * Z_t.
- Gaussian shocks and cascade multipliers use separate deterministic pseudorandom streams, with Box–Muller normal draws. The benchmark and cascade share the Gaussian shocks for a fixed seed. Intermittency zero yields exact equality.
- Returns and volatility are in percentage points; aggregated log returns are non-overlapping sums, dropping incomplete last blocks.
- Histograms cover full observed ranges. The reference Gaussian uses sample mean and population variance. Excess kurtosis and skewness use uncorrected central sample moments.
- Autocorrelations use sample centering and the full centered sum of squares as the denominator.
- Coarse/fine dependence: all sliding 5-observation windows; coarse is absolute summed return, fine is mean absolute return. Correlation at lag k pairs coarse_t with fine_(t+k), using full-series means and overlapping pairs. No significance or causal claims.
- Structure functions: overlapping increments at powers of two up to min(64, N/16); moment orders .25..4 by .25. Ordinary least squares on log2 moments against log2 horizon. A finite stochastic-cascade realization is not a proof of asymptotic multifractality.

## Source

`dist/index.html`, `dist/style.css`, `dist/app.mjs` and `dist/model.mjs` are authored static assets. No framework or dependency installation is required. The Site manifest selects `dist` as the public output. Scientific checks can be run with `node verify.mjs`.

## Validation scope

Numerical invariants, benchmark moments and scaling, boundary parameters, original-table entries, JavaScript syntax, HTML associations and local assets were checked. Browser interaction and visual QA were not requested and were not run. Optional WebMCP registration and execution validation was unavailable because no permitted supported browser context was available; the tools are feature-detected and use the same parameter validation as the controls.
