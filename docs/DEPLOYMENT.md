# Deployment

The site is a fully static build deployed to **GitHub Pages** via GitHub Actions.

## Automated deployment (recommended)

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs on every push
to `main`:

1. `npm ci` — install dependencies
2. `npm run build:data` — generate `public/data/*.json` from `data/source/`
3. `npm run validate:data` — fail the build if generated data is invalid
4. `npx vitest run` — run the test suite
5. `npm run build` — build the static site into `dist/`
6. Upload `dist/` and deploy to Pages

### One-time repository setup

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Ensure Actions has Pages permissions (the workflow already requests
   `pages: write` and `id-token: write`).
3. Push to `main`. The site publishes at
   `https://<owner>.github.io/<repo>/` (for this repo, `https://urol-e5.github.io/CENE/`).

## The repository subpath (important)

GitHub Pages serves project sites from a subpath (`/CENE/`). The build handles this:

- `astro.config.mjs` reads `base` from the `BASE_PATH` env var (default `/CENE`).
- The workflow sets `BASE_PATH: /${{ github.event.repository.name }}` so the base
  path always matches the repo name — forks work automatically.
- All internal links and data fetches use `import.meta.env.BASE_URL`
  (via `withBase()` / `dataUrl()` in `src/lib/site.ts`), so nothing is hard-coded.

To build for a different path locally:

```bash
BASE_PATH=/my-fork SITE_URL=https://example.github.io npm run build
npm run preview   # serves at http://localhost:4321/my-fork/
```

## Manual deployment

```bash
npm ci
npm run build          # → dist/ (runs build:data via prebuild)
# publish dist/ to any static host
```

Because `public/data/` is git-ignored and regenerated at build time, a fresh clone
must run `npm run build:data` (or `npm run build`, which does it) before serving.

## Troubleshooting

- **404s / missing CSS on Pages** — almost always a base-path mismatch. Confirm
  `BASE_PATH` equals `/<repo-name>`.
- **Empty network graph** — check the browser console; the per-species JSON under
  `/<base>/data/network/*.json` must be reachable (they are large; allow the loading
  indicator to finish).
- **Data validation fails in CI** — run `npm run build:data && npm run validate:data`
  locally to see the specific error.
