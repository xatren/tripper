// Regenerates public/sw-cache-version.generated.js from the single source of
// truth in lib/offline/cache-contract.ts. public/sw.js cannot import a .ts
// module directly (service workers load plain scripts via importScripts), so
// this generated file is how the two stay in one contract instead of two
// hand-maintained literals drifting apart.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const contractPath = path.join(root, 'lib/offline/cache-contract.ts')
const outPath = path.join(root, 'public/sw-cache-version.generated.js')

const source = readFileSync(contractPath, 'utf8')
const match = source.match(/OFFLINE_STATIC_CACHE_NAME\s*=\s*'([^']+)'/)
if (!match) {
  throw new Error(`Could not find OFFLINE_STATIC_CACHE_NAME in ${contractPath}`)
}

const generated = `// GENERATED FILE — do not edit by hand.
// Source of truth: lib/offline/cache-contract.ts
// Regenerate with: node scripts/generate-sw-cache-version.mjs
self.OFFLINE_STATIC_CACHE_NAME = '${match[1]}'
`

writeFileSync(outPath, generated)
console.log(`Wrote ${path.relative(root, outPath)} (OFFLINE_STATIC_CACHE_NAME = '${match[1]}')`)
