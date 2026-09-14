# Multifractal Volatility Lab

An interactive reconstruction based on Chapter 1 supplied by Nicolas Boitout and the publication by Nicolas Boitout and Loredana Ureche-Rangau, *Towards a Multifractal Paradigm of Stochastic Volatility?*, IJTAF 7(7), 823–851 (2004), DOI 10.1142/S0219024904002736.

## The opening figure

`docs/From Turbulence to Multifractal Volatility.png` is reproduced above the laboratory,
outside the tab strip, so it is the first thing a reader meets and stays in view whichever
analysis is selected. It states the analogy the chapter rests on: a multiplicative cascade
carries energy from large scales to small ones in turbulence, and the same construction in
time produces volatility clustering across horizons. Its own footer records the limit of
the analogy, that the statistical geometry transfers and the physical mechanism does not.

The deployed copy lives in `dist/figures/` because only `dist` is served. It is 1.49 MB
and above the fold, so it loads eagerly with its dimensions declared to avoid reflow, and
links to itself at full size for readers on narrow screens where the panel labels are too
small to read. Lossless recompression was tried and returned four per cent, so the file is
served as supplied.

It does not take the full width of the page. The laboratory below it runs to 1450px, and
at that width the plate dominates the screen: the chapter opens on an illustration rather
than on an argument, and the controls are pushed off the fold. It is capped instead at the
measure the Chapter 2 site gives its own opening figure — that page's width less its
gutters, stepping with it at 1500px and 1800px — so the two chapters open at the same size
on the same screen: 1112px wide on a laptop, 1240px, then 1368px. Below about 1160px the
cap stops applying and the figure is as wide as the page, as it was before. It stays flush
left rather than centring in the width it gives up, so that its edge is the one the
running head, the title and the controls column already share.

## The view strip

The five views are the page's navigation: everything in the workspace is whichever one
is selected. As underlined text between the boxed steps of the argument above it and a
section heading below, the strip carried the least weight in its own neighbourhood, and
the opening figure had pushed it about a thousand pixels down the page, so it was no
longer met on arrival. Four changes, and none of them touch what the tabs do:

- it comes first in the workspace, level with *The experiment* beside it, so choosing a
  view is the first thing the laboratory offers rather than something found after the
  argument list;
- it has a surface of its own — white, bordered, the same card treatment as the controls
  and the charts — and the selected view is a filled pill rather than an underline, which
  reads as a control rather than a label;
- it says what it is for (`Choose a view`), which is also the tablist's accessible name,
  so it is taken out of the flow rather than removed when there is no room for it;
- it sticks to the top of the viewport, at the offset the controls column already sticks
  at, so the other four views stay in reach anywhere in a two-thousand-pixel laboratory.

The masthead gained a matching link, `Open the laboratory`, because the figure now fills
the first screen on a laptop and nothing else said there was a laboratory below it.

Pills are wider than bare labels, and the workspace is only about 690px once the controls
have their column, so the strip scrolls horizontally on its own whenever the five views do
not fit — which needs `min-width: 0` on it, or the row refuses to shrink and pushes the
whole page sideways instead.

## Scope and provenance

The source supplied for implementation is the reconstructed Word chapter `multifractal_volatility_article(1).docx`, not the original scanned publication or Datastream observations. Original Table 1.4 is transcribed as reported. It is never recomputed or presented as simulator output.

That chapter is now reproduced in full under `Original chapter`, converted from the supplied document: seven sections, four tables, seven figures and forty displayed equations. Its Table 1.4 was checked against the constants in `dist/model.mjs` and all sixteen rows of both columns agree, so the transcription is verified against the source rather than asserted.

Two rendering decisions were made in that conversion. Every body paragraph in the supplied document is italicised and none are upright, so the italics carry no emphasis and the web rendering sets body prose upright, keeping italics for captions and the provenance note. The document also reuses one image for both Figure 1.2 and Figure 1.4; both are reproduced as supplied. The reconstruction labels its figure redrawings as indicative, and they are not used as measured data in this lab.

The simulation implements a finite dyadic lognormal realization of the chapter's multiplicative-cascade framework. The normalization and computational details are explicit choices, disclosed in the page. This is not a calibrated reproduction of the Alcatel data-generating process or a claim to recover the author's original simulation code.

No modern rough-volatility model, synthetic trading volume, data import, or export is included. Original volume findings remain a historical reference, and no Chapter 2 integration is implemented.

Measured market series are not part of this laboratory. They are Chapter 3's subject and live in [`PhD_Empirical_Study`](https://github.com/nboitout/PhD_Empirical_Study), together with the long-memory estimators, the derivation pipeline and its notes. That chapter draws Table 1.4 from here as its reference curve; the transcription is checked in both repositories so they cannot drift apart silently.

## Narrative order

The views follow the chapter's argument rather than the order in which results are
easiest to plot. Information flow states the Mixture of Distributions premise first;
Returns, Memory and Scaling then present its consequences in the chapter's sequence;
Original chapter carries the evidence, as reported. A numbered rail names the four
claims and marks which one each view serves.

The Information flow view plots the benchmark series that `simulate` has always
returned and the interface never displayed. Because the Gaussian shocks are shared
across models at a fixed seed, the two lines there differ in K alone, which is what
makes the mixture visible rather than merely asserted.

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
