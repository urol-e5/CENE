// Build-time reader for the generated JSON in public/data/. Used inside .astro
// frontmatter (runs in Node during `astro build`). Browser code should fetch
// via dataUrl() instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA_DIR = fileURLToPath(new URL('../../public/data/', import.meta.url));

export function readData<T = any>(rel: string): T {
  return JSON.parse(readFileSync(`${DATA_DIR}${rel}`, 'utf8')) as T;
}
