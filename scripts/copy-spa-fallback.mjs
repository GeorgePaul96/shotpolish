// Copies dist/index.html -> dist/404.html after build.
// Static hosts without a rewrite engine (e.g. GitHub Pages) serve 404.html for
// unknown paths; making it a copy of index.html lets client-side routes like
// /story and /editor survive a refresh or deep-link instead of returning a 404.
import { copyFileSync, existsSync } from 'node:fs'

const src = 'dist/index.html'
const dest = 'dist/404.html'

if (existsSync(src)) {
  copyFileSync(src, dest)
  console.log('SPA fallback: copied dist/index.html -> dist/404.html')
} else {
  console.warn('SPA fallback: dist/index.html not found, skipping 404.html copy')
}
