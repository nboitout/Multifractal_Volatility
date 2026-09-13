# Multifractal Volatility Lab

Complete source for Nicolas Boitout's Chapter 1 research laboratory, prepared for a new GitHub repository and deployment on Vercel.

The application uses plain HTML, CSS and JavaScript modules. There are no framework dependencies, no compilation step and no API keys in this version. The four application files and the numerical checks are identical to the published source at commit `8c7dff5e9eea7de3302139741368deed7bd8b131`. This handover adds Vercel configuration, npm convenience commands and documentation. The previous host's project identifiers, credentials and Git history are not included.

## Files

| File | Purpose |
| --- | --- |
| `dist/index.html` | Page structure, controls, chapter context and model assumptions |
| `dist/style.css` | Responsive layout and visual design |
| `dist/app.mjs` | Interface state, chart rendering and interaction handlers |
| `dist/model.mjs` | Seeded cascade simulation, statistics, autocorrelations and scaling calculations |
| `verify.mjs` | Numerical checks and original-table transcription checks |
| `vercel.json` | Static deployment configuration |
| `package.json` | Optional `npm test` and `npm run check` commands; no dependencies |
| `docs/RESEARCH_NOTES.md` | Research provenance and numerical definitions |
| `docs/POLYGON_INTEGRATION.md` | Proposed next stage for real market data; not implemented |

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

Keep that distinction when extending the lab. Polygon market data would be a new empirical experiment unless it matches the original instrument, observation period and preprocessing. See [the integration notes](docs/POLYGON_INTEGRATION.md).

## Validation

The source package retains the numerical checks for reproducibility, the exact Gaussian limit at zero intermittency, aggregation, Gaussian moments and scaling, parameter boundaries and historical-table entries. The package's application files have been checked against the published source. No browser QA or live Polygon API test was performed for this handover.
