// Build-time seeder for the curated Discover dataset (plan §8.3, Tier A).
//
//   node scripts/generate-discover-places.mjs TR IT ES FR GR JP PT NO
//
// Queries Wikidata SPARQL (CC0) for coordinates, images and sitelink counts, then
// merges the hand-curated overlay in scripts/discover-curation.json on top. The
// result is committed as lib/discover/discover-places.generated.ts — this is a
// build-time dependency, not a runtime one: no new production API, no new key, no
// per-user cost. Re-run it when the country list or the curation overlay changes.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_PATH = resolve(ROOT, 'lib/discover/discover-places.generated.ts')
const CURATION_PATH = resolve(ROOT, 'scripts/discover-curation.json')
const CACHE_DIR = resolve(ROOT, 'scripts/.discover-cache')

const ENDPOINT = 'https://query.wikidata.org/sparql'
// Wikidata blocks anonymous clients; a contactable UA is required by their policy.
const USER_AGENT = 'TripperDiscoverSeeder/1.0 (https://github.com/xatren/tripper)'

/**
 * Wikidata classes per Discover category, queried one class at a time.
 * `minSitelinks` is the only quality signal available at scale, so a dense class
 * needs a higher bar; `perClass` caps how many of one class a category may take,
 * which is what keeps "Nature" from becoming a list of lakes.
 */
const CATEGORY_QUERIES = [
  { category: 'national_parks', classes: ['Q46169'], minSitelinks: 4, perClass: 30, hours: 5, mustVisit: 4 },
  {
    category: 'nature',
    classes: ['Q34038', 'Q23397', 'Q35509', 'Q8072', 'Q150784', 'Q177380', 'Q179049'],
    minSitelinks: 6,
    perClass: 7,
    hours: 2,
    mustVisit: 4,
  },
  { category: 'viewpoints', classes: ['Q8502', 'Q1440476', 'Q133056'], minSitelinks: 8, perClass: 9, hours: 1, mustVisit: 2 },
  {
    category: 'landmarks',
    classes: ['Q839954', 'Q23413', 'Q4989906', 'Q9259', 'Q16560', 'Q570116'],
    minSitelinks: 8,
    perClass: 8,
    hours: 2,
    mustVisit: 5,
  },
  { category: 'beaches', classes: ['Q40080'], minSitelinks: 4, perClass: 20, hours: 3, mustVisit: 2 },
  // `direct`: Q515 has thousands of subclasses, and traversing them times the
  // endpoint out. Cities are typed directly as Q515 often enough not to need it.
  { category: 'cities', classes: ['Q515'], minSitelinks: 40, perClass: 25, hours: null, mustVisit: 5, direct: true },
]

/**
 * One class per query rather than a VALUES block over the whole category: a
 * seven-class union with subclass traversal reliably 504s on large countries,
 * and a per-class query also stops one dense class (waterfalls) from crowding
 * out the rest of its category.
 */
function sparqlFor(countryQid, group, classQid) {
  return `
SELECT ?item ?itemLabel ?desc ?coord ?image ?regionLabel ?sitelinks WHERE {
  BIND(wd:${classQid} AS ?class)
  ?item wdt:P17 wd:${countryQid} ;
        wdt:P31${group.direct ? '' : '/wdt:P279*'} ?class ;
        wdt:P625 ?coord ;
        wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${group.minSitelinks})
  # Historical entities (Constantinople, abolished provinces) rank highly on
  # sitelinks and are useless as travel destinations. Both filters stay on direct
  # P31 — the subclass traversal here is what times the endpoint out.
  FILTER NOT EXISTS { ?item wdt:P576 ?abolished }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q19953632 }
  OPTIONAL { ?item wdt:P18 ?image }
  # Only a *current* administrative parent: the plain wdt:P131 truthy value still
  # yields Ottoman-era vilayets for old cities.
  OPTIONAL {
    ?item p:P131 ?regionStatement .
    ?regionStatement ps:P131 ?region .
    FILTER NOT EXISTS { ?regionStatement pq:P582 ?regionEnd }
  }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${group.perClass * 3}`
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * The public endpoint returns 429/504 under load, and a dropped category means a
 * silently thinner dataset rather than a visible failure — so retry with backoff
 * rather than accepting the first refusal.
 */
async function sparql(query, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
      })
      if (!response.ok) throw new Error(`SPARQL ${response.status}: ${(await response.text()).slice(0, 160)}`)
      const body = await response.json()
      return body.results.bindings
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(attempt * 4000)
    }
  }
  throw lastError
}

async function countryQids(codes) {
  const values = codes.map((code) => `"${code}"`).join(' ')
  const rows = await sparql(`
SELECT ?code ?country WHERE {
  VALUES ?code { ${values} }
  ?country wdt:P297 ?code .
}`)
  const map = new Map()
  for (const row of rows) {
    // P297 is occasionally claimed by historic entities; the first match wins.
    if (!map.has(row.code.value)) map.set(row.code.value, row.country.value.split('/').pop())
  }
  return map
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function parseCoord(wkt) {
  const match = /^Point\(([-0-9.eE]+) ([-0-9.eE]+)\)$/.exec(wkt)
  if (!match) return null
  const lng = Number(match[1])
  const lat = Number(match[2])
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

function commonsImage(raw) {
  if (!raw) return null
  const url = raw.replace(/^http:/, 'https:')
  const file = decodeURIComponent(url.split('/').pop() ?? '')
  // The Special:FilePath thumbnailer keeps cards off multi-megabyte originals.
  return { imageUrl: `${url}?width=640`, imageAttribution: `Wikimedia Commons · ${file}` }
}

/**
 * Sitelink counts are Zipf-distributed, so a linear scale would put everything
 * except the Eiffel Tower at rank 1. A log scale over a 250-sitelink ceiling
 * keeps the mid-field usefully separated.
 */
function rankFromSitelinks(sitelinks) {
  const clamped = Math.max(1, Math.min(250, sitelinks))
  return Math.max(1, Math.min(100, Math.round((Math.log10(clamped) / Math.log10(250)) * 100)))
}

function truncateBlurb(value) {
  if (!value) return null
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return null
  return text.length <= 140 ? text : `${text.slice(0, 137).trimEnd()}…`
}

/**
 * Per-country cache. A full seed is dozens of slow public-endpoint queries, and
 * without this a single timeout near the end throws away every country before
 * it. Delete a file (or pass --refresh) to re-query that country.
 */
async function cachedCountry(code) {
  if (process.argv.includes('--refresh')) return null
  try {
    return JSON.parse(await readFile(resolve(CACHE_DIR, `${code}.json`), 'utf8'))
  } catch {
    return null
  }
}

async function collectCountry(code, qid) {
  const byQid = new Map()

  for (const group of CATEGORY_QUERIES) {
    let kept = 0
    for (const classQid of group.classes) {
      let rows
      try {
        rows = await sparql(sparqlFor(qid, group, classQid))
      } catch (error) {
        // One dead class costs its own slice, not the whole category.
        console.warn(`  ! ${code}/${group.category}/${classQid}: ${error.message}`)
        continue
      }

      let keptForClass = 0
      for (const row of rows) {
        if (keptForClass >= group.perClass) break
        const itemQid = row.item.value.split('/').pop()
        const coord = parseCoord(row.coord?.value ?? '')
        const name = row.itemLabel?.value
        // A label that is still the Q-id means Wikidata has no English name for it.
        if (!coord || !name || /^Q\d+$/.test(name)) continue

        const existing = byQid.get(itemQid)
        if (existing) {
          if (!existing.categories.includes(group.category)) existing.categories.push(group.category)
          continue
        }

        const image = commonsImage(row.image?.value)
        byQid.set(itemQid, {
          id: `${code.toLowerCase()}-${slugify(name)}`,
          name,
          countryCode: code,
          region: row.regionLabel?.value && !/^Q\d+$/.test(row.regionLabel.value) ? row.regionLabel.value : null,
          lat: Number(coord.lat.toFixed(5)),
          lng: Number(coord.lng.toFixed(5)),
          categories: [group.category],
          rank: rankFromSitelinks(Number(row.sitelinks.value)),
          blurb: truncateBlurb(row.desc?.value),
          imageUrl: image?.imageUrl ?? null,
          imageAttribution: image?.imageAttribution ?? null,
          suggestedHours: group.hours,
        })
        keptForClass += 1
        kept += 1
      }
    }
    console.log(`  ${code}/${group.category}: ${kept}`)
  }

  const places = [...byQid.values()]

  // `must_visit` is a flag over the country's best, not a place type — so it is
  // applied only after every category query has contributed its candidates.
  //
  // Deliberately a quota *per category* rather than the global top N: sitelink
  // counts are an order of magnitude higher for cities than for waterfalls, so a
  // global cut would make Must Visit a list of cities in every country.
  const mustVisit = new Set()
  for (const group of CATEGORY_QUERIES) {
    places
      .filter((place) => place.categories.includes(group.category))
      .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
      .slice(0, group.mustVisit)
      .forEach((place) => mustVisit.add(place.id))
  }
  for (const place of places) {
    if (mustVisit.has(place.id)) place.categories.unshift('must_visit')
  }

  return places
}

async function loadCuration() {
  try {
    const parsed = JSON.parse(await readFile(CURATION_PATH, 'utf8'))
    return { exclude: new Set(parsed.exclude ?? []), overrides: parsed.overrides ?? {} }
  } catch {
    console.log('No curation overlay found; emitting raw Wikidata output.')
    return { exclude: new Set(), overrides: {} }
  }
}

const codes = process.argv
  .slice(2)
  .filter((argument) => !argument.startsWith('--'))
  .map((code) => code.toUpperCase())
if (codes.length === 0) {
  throw new Error('Usage: node scripts/generate-discover-places.mjs [--refresh] <ISO alpha-2 country codes…>')
}

const curation = await loadCuration()
await mkdir(CACHE_DIR, { recursive: true })

const all = []
const pending = []
for (const code of codes) {
  const cached = await cachedCountry(code)
  if (cached) {
    console.log(`${code} → cache (${cached.length})`)
    all.push(...cached)
  } else {
    pending.push(code)
  }
}

// Only the uncached countries need a QID lookup, so a fully cached rebuild makes
// no network calls at all.
const qids = pending.length > 0 ? await countryQids(pending) : new Map()
for (const code of pending) {
  const qid = qids.get(code)
  if (!qid) {
    console.warn(`! ${code}: no Wikidata entity for this ISO code, skipping`)
    continue
  }
  console.log(`${code} → ${qid}`)
  const collected = await collectCountry(code, qid)
  await writeFile(resolve(CACHE_DIR, `${code}.json`), JSON.stringify(collected), 'utf8')
  all.push(...collected)
}

const seenIds = new Set()
const places = all
  .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || b.rank - a.rank || a.name.localeCompare(b.name))
  .filter((place) => {
    if (curation.exclude.has(place.id)) return false
    // Two places in one country can slugify identically (same-named lakes); the
    // higher-ranked one sorted first and keeps the id.
    if (seenIds.has(place.id)) return false
    seenIds.add(place.id)
    return true
  })
  .map((place) => ({ ...place, ...(curation.overrides[place.id] ?? {}) }))

const banner = `// Generated by scripts/generate-discover-places.mjs from Wikidata (CC0) plus the
// curation overlay in scripts/discover-curation.json. Do not edit by hand — edit
// the overlay and re-run the script.
//
// Countries seeded: ${codes.join(', ')}
// Places: ${places.length}
// Images are Wikimedia Commons files, each under its own licence, so
// \`imageAttribution\` must be surfaced wherever the image is shown.

import type { DiscoverCategoryId } from './categories.ts'

export interface DiscoverPlace {
  /** Stable slug, e.g. 'tr-cappadocia'. Becomes discover_places.id if the dataset moves to Postgres. */
  id: string
  name: string
  /** ISO 3166-1 alpha-2; joins to lib/country-data.generated.ts. */
  countryCode: string
  /** State or province, filling the card's second line. Null where Wikidata has no P131. */
  region: string | null
  lat: number
  lng: number
  /** A place can belong to several layers: 'nature' and 'must_visit' at once. */
  categories: DiscoverCategoryId[]
  /** 0-100, derived from Wikidata sitelink count. Drives Must Visit selection and label priority. */
  rank: number
  blurb: string | null
  imageUrl: string | null
  imageAttribution: string | null
  suggestedHours: number | null
}

`

const body =
  `export const DISCOVER_PLACES: readonly DiscoverPlace[] = ${JSON.stringify(places, null, 2)}\n\n` +
  `/** Countries with curated coverage, so the UI can tell "nothing in this category" from "not mapped yet". */\n` +
  `export const DISCOVER_SEEDED_COUNTRIES: readonly string[] = ${JSON.stringify(
    [...new Set(places.map((place) => place.countryCode))].sort(),
  )}\n`

await writeFile(OUTPUT_PATH, banner + body, 'utf8')
console.log(`\nWrote ${places.length} places across ${new Set(places.map((p) => p.countryCode)).size} countries`)
