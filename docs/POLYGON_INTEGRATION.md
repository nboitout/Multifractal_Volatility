# Adding Polygon market data

This is a handover plan for the next development stage. The current package is a complete simulator and does not contain a market-data endpoint or a live API integration.

## Provider and historical coverage

Polygon.io was renamed Massive.com in October 2025. Use the current documentation and the `https://api.massive.com` base for a new integration; the rebranding notice explains the transition and existing-key compatibility. [Provider announcement](https://massive.com/blog/polygon-is-now-massive)

The stock custom-bars documentation currently lists its full historical coverage from 10 September 2003. This does not cover the chapter's Alcatel sample from 1991 through 2001; instrument and exchange coverage also need to be checked. An experiment on a supported instrument and newer period should be labelled accordingly. The original study still requires its historical source data. [Stock custom-bars documentation](https://massive.com/docs/rest/stocks/aggregates/custom-bars)

## Proposed implementation

Add a Vercel server-side endpoint such as `/api/market-data`. The browser calls that endpoint with a ticker and date range. The endpoint uses a server environment variable named `POLYGON_API_KEY`, fetches the provider data, and returns only the validated observations and provenance to the browser. The variable name can remain `POLYGON_API_KEY` even when the base URL is Massive.

Keep the key out of `dist`, client-side JavaScript, browser requests to the provider, and Git. Set it in the Vercel project's environment variables when the server endpoint is implemented. Restrict the endpoint's accepted instruments, dates and query size; add caching and request limits so visitors cannot exhaust the provider quota. Keep provider URLs fixed or validate pagination URLs against the expected provider host.

For a framework-free Vercel project, the future function belongs in a root-level `api` directory, outside `dist`. Do not place secrets or server source among public static files. Revisit installation and runtime configuration when adding dependencies. [Vercel Functions documentation](https://vercel.com/docs/functions)

## Data to request

Begin with daily OHLCV bars. The current custom-bars endpoint has the form `/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}`. Its response provides close `c`, volume `v`, and millisecond timestamp `t`. Request ascending order, follow pagination, and record the chosen split-adjustment setting. That setting describes split adjustment and should not be treated as a total-return dividend adjustment. [Endpoint specification](https://massive.com/docs/rest/stocks/aggregates/custom-bars)

## Reuse the existing analysis

1. Normalize observations into sorted, unique trading dates with positive close prices. Preserve missing-data information instead of silently filling gaps.
2. Convert closes to log returns in percentage points: `100 * Math.log(close[t] / close[t - 1])`. The factor of 100 matches the simulator's units.
3. Align each return with its ending date and the corresponding volume observation.
4. Reuse `stats`, `aggregate`, `acf`, `crossScale` and `scaling` from `dist/model.mjs`.
5. Refactor `dist/app.mjs` to select a dataset rather than always calling `simulate`. Keep simulation parameters active only for simulated data.
6. Display the provider, instrument, date range, adjustment convention, observation count and data gaps alongside measured results.

For empirical daily data, horizons should mean trading observations, not calendar days. Compute moments over the same definitions and scale ranges as the chapter when making comparisons. The original volume transformation must be checked against the source before calculating power transforms; raw volume and log volume are not interchangeable.

The current `Original chapter` view displays fixed reported estimates of fractional dependence `d(q)`. It does not implement the chapter's semiparametric estimator. A live-data reproduction of that table requires a separate implementation and validation; neither the autocorrelation function nor the structure-function slope `zeta(q)` should be relabelled as `d(q)`.

## Acceptance criteria for that later stage

- Simulated data, new measured data and the original reported results remain clearly labelled.
- The seeded simulator and its zero-intermittency Gaussian limit remain unchanged.
- No API key appears in downloaded frontend assets or browser-visible responses.
- Empty data, unavailable history, invalid inputs and provider errors produce clear states without falling back to fabricated observations.
- Historical-bar normalization and units are tested with a small known fixture before comparing the empirical charts.

Documentation checked on 13 September 2026. Access to the provider account, original Alcatel data and Vercel project will determine the available instruments and periods.
