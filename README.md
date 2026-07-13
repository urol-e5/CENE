# Coral Epigenetic Network Explorer

An interactive, static web resource that lets readers explore the predicted
multi-layered epigenetic regulatory networks described in the manuscript
**"Cross-talk among miRNAs, lncRNAs, and DNA methylation in three coral species reveal conserved epigenetic regulatory architecture"**
(*Acropora pulchra*, *Porites evermanni*, *Pocillopora tuahiniensis*).

It is a publication companion to the analysis repository
[`urol-e5/deep-dive-expression`](https://github.com/urol-e5/deep-dive-expression):
readers can move from a plain-language overview to detailed inspection of
individual miRNAs, lncRNAs, genes, predicted interactions, DNA methylation, and
cross-species differences — and download the underlying evidence.

> **Scientific framing.** Every interaction shown is **computationally predicted**
> from sequence complementarity (miRanda) and/or expression coexpression (Pearson
> correlation, n = 5 per species, unadjusted p-values). These are *hypotheses* for
> future experimental testing — not validated causal relationships. See
> [`docs/SCIENTIFIC_INTERPRETATION.md`](docs/SCIENTIFIC_INTERPRETATION.md).

## Scientific context

The study integrates matched RNA-seq, small RNA-seq, and whole-genome bisulfite
sequencing to characterize DNA methylation, miRNAs, and lncRNAs across three coral
species and — for the first time in cnidarians — describes predicted **epi-miRNAs**
(miRNAs targeting epigenetic machinery) and candidate **competing endogenous RNA
(ceRNA)** networks (lncRNAs predicted to sequester miRNAs). ceRNA sponging is only
one of many possible lncRNA functions; most lncRNAs identified were *not* assigned to
a ceRNA network, and the site's ceRNA framing reflects the question asked rather than
these transcripts' full functional repertoire.

## Features / views

| View | What it shows |
| --- | --- |
| **Home** | Overview, multilayer diagram, entry points, caveats. |
| **Network Explorer** | Cytoscape.js graph of predicted miRNA / lncRNA / mRNA / epi-machinery interactions with rich filters, presets, node/edge detail, and PNG/SVG/CSV export. |
| **Regulatory Story** | Curated chains (lncRNA sponge → miRNA → mRNA → function), incl. the ptuh-mir-novel-4 → TNRC6 ceRNA example. |
| **Compare Species** | Cross-species cards, comparative charts, and the miR-100 panel. |
| **Epigenetic Machinery** | Epi-miRNA targets by functional category (TET3, MBD, AGO, TNRC6, …). |
| **Methylation Landscape** | Global CpG methylation and feature-level context. |
| **Evidence Table** | Searchable / sortable / exportable table of every displayed interaction. |
| **Methods & Caveats** | Plain-language methods and the limitations that must frame interpretation. |
| **Downloads** | Grouped datasets with provenance + the data manifest. |

## Tech stack

- **[Astro](https://astro.build)** static site + **TypeScript**
- **[Cytoscape.js](https://js.cytoscape.org)** for network visualization
- Inline, accessible **SVG** charts (no heavy charting dependency)
- **Node** preprocessing pipeline (`csv-parse`) → browser-ready JSON
- **Vitest** tests · **GitHub Actions** → **GitHub Pages**

No backend or database. Everything is prebuilt to static JSON in `public/data/`.

## Local setup

```bash
npm install        # install dependencies
npm run dev        # build web data, then start the dev server
# → http://localhost:4321/CENE/
```

### Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build data + start dev server. |
| `npm run build:data` | Regenerate `public/data/*.json` from `data/source/`. |
| `npm run validate:data` | Validate the generated data (fails on errors). |
| `npm run fetch:data` | Re-download source CSVs from `deep-dive-expression`. |
| `npm test` | Build data + run the Vitest suite. |
| `npm run build` | Production build (runs `build:data` first) → `dist/`. |
| `npm run preview` | Serve the production build locally. |

## Data preprocessing

Source CSVs are vendored under [`data/source/`](data/source/) (verbatim copies of
`deep-dive-expression` outputs — see [`data/source/README.md`](data/source/README.md)).
The pipeline in [`scripts/build_web_data/`](scripts/build_web_data/) reads them,
normalizes column names while retaining original identifiers, validates required
columns, reports (never silently drops) missing fields, and writes:

- `public/data/network/{Apul,Peve,Ptuh}.json` — per-species nodes + edges
- `public/data/{summary,epimachinery,methylation,mir100,regulatory-stories,downloads}.json`
- `public/data/data-manifest.json`, `build-summary.json`, `dictionaries/network.json`

```bash
npm run build:data      # regenerate everything
npm run validate:data   # then validate
```

## Build & GitHub Pages deployment

`npm run build` outputs a fully static site to `dist/`. Deployment is automated by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): on push to `main` it
installs, builds data, validates, tests, builds the site (with the correct repo
subpath), and deploys to GitHub Pages. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

The subpath is configurable via `BASE_PATH` (default `/CENE`) so forks and
user-pages deployments work without code changes.

## Directory structure

```
CENE/
├── data/source/              # vendored source CSVs (verbatim, do not edit)
├── scripts/build_web_data/   # preprocessing pipeline (CSV → JSON) + validation
├── public/
│   ├── data/                 # generated JSON (git-ignored; rebuilt by build:data)
│   └── favicon.svg
├── src/
│   ├── components/           # BarChart.astro, …
│   ├── layouts/Base.astro
│   ├── lib/                  # site config, data reader, pure filter helpers
│   ├── pages/                # one .astro per view
│   ├── scripts/              # client TS (network.ts, evidence.ts)
│   └── styles/global.css     # design system
├── tests/                    # Vitest (filters + generated-data integrity)
├── docs/                     # DATA_SOURCES, SCIENTIFIC_INTERPRETATION, DEPLOYMENT, ADDING_DATA
└── .github/workflows/deploy.yml
```

## Data provenance

Every dataset maps to an original `deep-dive-expression` file. See
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) and the generated
`public/data/data-manifest.json`.

## Adding new datasets

See [`docs/ADDING_DATA.md`](docs/ADDING_DATA.md).

## Known limitations

- Predicted interactions only (no experimental validation); n = 5 per species; unadjusted p-values.
- A machine-readable **per-feature methylation** summary is not available in the source repo (only a figure); the Methylation view shows global values + manuscript-derived qualitative levels and labels the numeric per-feature table as *awaiting data*.
- Non-epigenetic-machinery genes are shown by transcript ID; functional annotation is currently only joined for epi-machinery targets.
- Cross-species comparisons are affected by differing genome-assembly quality — interpret cautiously.

## License / attribution

Scientific data © the study authors, from `urol-e5/deep-dive-expression`. This
resource reproduces their published statistics and framing; consult the manuscript
and analysis repository as the source of truth.
