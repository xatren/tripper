import { readFile, writeFile } from 'node:fs/promises'

const inputPath = process.argv[2]
const outputPath = process.argv[3]

if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/generate-country-data.mjs <countries.json> <output.ts>')
}

const source = JSON.parse(await readFile(inputPath, 'utf8'))

const countries = source
  .filter((country) => country.status === 'officially-assigned' && country.cca2 && country.name?.common)
  .map((country) => {
    const nativeNames = Object.values(country.name.native ?? {})
      .flatMap((name) => [name.common, name.official])
      .filter(Boolean)

    return {
      code: country.cca2,
      name: country.name.common,
      flag: country.flag,
      lat: country.latlng?.[0] ?? 0,
      lng: country.latlng?.[1] ?? 0,
      area: country.area ?? 1,
      nativeNames: [...new Set(nativeNames)].filter((name) => name !== country.name.common),
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const banner = `// Generated from the mledoze/countries ISO 3166-1 dataset.\n// Re-run scripts/generate-country-data.mjs when the upstream country list changes.\n`
const body = `export const COUNTRY_DATA = ${JSON.stringify(countries, null, 2)} as const\n`

await writeFile(outputPath, banner + body, 'utf8')
