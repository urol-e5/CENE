# Adding or updating datasets

The site is driven entirely by JSON generated from vendored source CSVs. This guide
covers refreshing existing data and wiring in a new dataset.

## Refresh existing data from the analysis repo

```bash
npm run fetch:data     # re-download source CSVs into data/source/
npm run build:data     # regenerate public/data/*.json
npm run validate:data  # confirm integrity
npm test               # run the suite
```

`fetch:data` pulls the files listed in
[`scripts/build_web_data/00_fetch_sources.mjs`](../scripts/build_web_data/00_fetch_sources.mjs)
from `deep-dive-expression@main`. Update that list if source paths change.

## Golden rules

- **Never edit files in `data/source/` by hand** — they are verbatim copies. Fix
  data upstream in `deep-dive-expression`, then re-fetch.
- **Retain original identifiers.** The pipeline normalizes column *names* but keeps
  transcript/miRNA IDs exactly as published.
- **Never silently drop records.** If a required column is missing or an endpoint is
  unresolved, emit a warning (collected into `build-summary.json`) rather than
  dropping data quietly.

## Add a brand-new dataset

1. **Vendor the source file.** Add it to `data/source/<group>/` and to the fetch
   list in `00_fetch_sources.mjs`. Add a row to `data/source/README.md`.
2. **Read + transform** in `scripts/build_web_data/build.mjs`:
   - use `readCSV('<group>/<file>.csv')` and `num()` / helpers from `lib.mjs`;
   - normalize column names, keep original IDs;
   - validate required columns and `warn(...)` on anything missing;
   - `writeJSON('<name>.json', obj)`.
3. **Register it** in the `manifest.datasets` array and (if downloadable) in the
   `downloads` array in `build.mjs`.
4. **Add a data dictionary** entry under `dictionaries/`.
5. **Add validation** in `scripts/build_web_data/validate.mjs` and/or a test in
   `tests/data.test.ts`.
6. **Consume it** in a page: read at build time with `readData('<name>.json')`
   (in `.astro` frontmatter) or fetch at runtime with `dataUrl('<name>.json')`
   (in client scripts).

## Filling a documented gap

The current gaps (see [`DATA_SOURCES.md`](DATA_SOURCES.md#known-data-gaps)):

- **Per-feature methylation numbers** — add a machine-readable table to the source
  repo, vendor it, and replace the qualitative table in `methylation.json` /
  `src/pages/methylation.astro` (remove the *awaiting data* tag).
- **General gene annotation** — join `04.2-miRNA-comparison-targets-FE/*` GO/enrichment
  outputs to give non-epi genes functional labels in node/edge detail.

## Validation checklist (enforced by `validate:data` + tests)

- expected species (Apul, Peve, Ptuh) all represented;
- every edge endpoint exists in the node table;
- correlations numeric and in [-1, 1]; p-values numeric and in [0, 1];
- node IDs unique within species + node class;
- required evidence fields present (source, target, interactionClass, evidence);
- duplicate interactions reported (not silently merged);
- epi-machinery categories are from the canonical list.
