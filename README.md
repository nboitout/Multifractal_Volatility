# Multifractal Volatility Lab

Complete source for Nicolas Boitout's Chapter 1 research laboratory, prepared for a new GitHub repository and deployment on Vercel.

The application uses plain HTML, CSS and JavaScript modules. There are no framework dependencies, no compilation step and no API keys in the deployed application. The offline data scripts under `scripts/` are separate: they read credentials from a local `.env` and never ship to `dist`. The four application files and the numerical checks are identical to the published source at commit `8c7dff5e9eea7de3302139741368deed7bd8b131`. This handover adds Vercel configuration, npm convenience commands and documentation. The previous host's project identifiers, credentials and Git history are not included.

## Files

| File | Purpose |
| --- | --- |
| `dist/index.html` | Page structure, the chapter's argument rail, controls and model assumptions |
| `dist/style.css` | Responsive layout and visual design |
| `dist/app.mjs` | Interface state, chart rendering and interaction handlers |
| `dist/model.mjs` | Seeded cascade simulation, statistics, autocorrelations and scaling calculations |
| `dist/longmemory.mjs` | Periodogram, GPH and local Whittle estimation of the chapter's d(q) |
| `dist/empirical.mjs` | Bars to returns, overnight-gap and seasonality corrections, extended scaling |
| `dist/data/` | Precomputed curves the Measured view reads, plus their manifest |
| `verify.mjs` | Numerical checks and original-table transcription checks |
| `vercel.json` | Static deployment configuration |
| `package.json` | `npm test` and `npm run check`; `pg` is a devDependency used only by the offline scripts |
| `scripts/schema.sql` | Research-store schema for five-minute bars |
| `scripts/ingest.mjs` | Offline backfill from Polygon into the research store |
| `scripts/derive.mjs` | Turns stored bars into the precomputed curves, or a labelled fixture |
| `.env.example` | Template for the credentials the scripts read |
| `docs/RESEARCH_NOTES.md` | Research provenance and numerical definitions |
| `docs/POLYGON_INTEGRATION.md` | Market data design: architecture, corrections and staging |

The files in `dist` are the editable application source, not generated bundles. Keep them under version control.

## Run locally

Use any local static web server. For example, with Python 3 installed, run this from the project root:

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Then open http://localhost:8000 in your browser. On Windows, `py -m http.server 8000 --bind 127.0.0.1 --directory dist` is an alternative when the Python launcher is installed. Opening the HTML directly with a `file:` URL can prevent the JavaScript modules from loading.

With Node.js installed, run:

```sh
node verify.mjs
```

Or use `npm test` and `npm run check`. No `npm install` is needed for the current dependency-free code.

## Put the project on GitHub

1. Extract the ZIP and open the `multifractal-volatility-lab` folder.
2. Create an empty GitHub repository using your preferred name.
3. Upload the contents of this folder, keeping `vercel.json`, `package.json` and `dist` at the repository root. Include `.gitignore`.

Alternatively, from the extracted folder:

```sh
git init -b main
git add .
git commit -m "Initial multifractal volatility lab"
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

Replace the placeholder with your repository URL. These commands assume the remote repository is empty.

## Deploy on Vercel

Import the GitHub repository into Vercel and use these settings:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root |
| Framework Preset | Other |
| Build Command | Empty |
| Install Command | Empty |
| Output Directory | `dist` |
| Environment variables | None needed for this version |

The supplied `vercel.json` sets the framework, build, installation and output options. Vercel documents static sites with no build step and configuration overrides in its [build settings](https://vercel.com/docs/builds/configure-a-build) and [vercel.json reference](https://vercel.com/docs/project-configuration/vercel-json).

Check the new deployment's access settings before sharing it: access restrictions on the previous host are not part of these application files. Deployment to your Vercel account has not been performed or tested in this handover.

## Research fidelity

The simulator illustrates the chapter's finite multiplicative-cascade framework. Its implementation choices are documented on the page. It is not calibrated to the original Alcatel dataset. The original Table 1.4 is a separate historical transcription.

Keep that distinction when extending the lab. Market data is a new empirical experiment, not a reproduction: it matches neither the original instrument nor its observation period or preprocessing. See [the integration notes](docs/POLYGON_INTEGRATION.md).

## Market data

The research store holds five-minute bars and is populated offline. It is not
part of the deployed application and the browser never queries it.

```sh
cp .env.example .env      # then fill in POLYGON_API_KEY and DATABASE_URL
npm install               # pulls pg, used only by the scripts
npm run ingest:init       # create the schema and register the assets
npm run ingest            # backfill; resumable, roughly 75 rate-limited requests
npm run ingest:status     # what has been ingested so far
npm run derive            # build dist/data/*.curves.json from the store
```

The Measured view reads those derived files and nothing else, so the deployed
site stays static and never queries the database. To review the view before any
real data exists, `npm run derive:fixture` writes a synthetic placeholder that is
labelled as such everywhere it appears.

The backfill records progress per asset-month and skips completed months, so it
can be interrupted and restarted at no cost. Overnight, weekend and holiday
boundaries are flagged at load time as `bar.gap_min`; excluding them is a query
filter, and doing so is required before any estimate is reported.

## Validation

The source package retains the numerical checks for reproducibility, the exact Gaussian limit at zero intermittency, aggregation, Gaussian moments and scaling, parameter boundaries and historical-table entries. The package's application files have been checked against the published source. No browser QA or live Polygon API test was performed for this handover.
