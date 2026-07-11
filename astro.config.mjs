import { defineConfig } from 'astro/config';

// GitHub Pages deploys this project at https://urol-e5.github.io/CENE/
// `base` is read from BASE_PATH so forks / user-pages can override it.
// It must start and end without requiring a trailing slash in links because
// Astro joins `import.meta.env.BASE_URL` for us.
const base = process.env.BASE_PATH ?? '/CENE';
const site = process.env.SITE_URL ?? 'https://urol-e5.github.io';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // Everything is prebuilt to static JSON in public/data — no SSR adapter needed.
  output: 'static',
});
