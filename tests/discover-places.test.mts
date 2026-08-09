import assert from 'node:assert/strict'
import test from 'node:test'
import { DISCOVER_PLACES } from '../lib/discover/discover-places.generated.ts'

test('every place with an image carries an attribution string', () => {
  for (const place of DISCOVER_PLACES) {
    if (place.imageUrl == null) continue
    assert.ok(
      place.imageAttribution && place.imageAttribution.trim().length > 0,
      `${place.id} has an imageUrl but no imageAttribution`,
    )
  }
})

test('image attribution always credits Wikimedia Commons, not just a bare filename', () => {
  // §18 risk #3: `imageAttribution` must be a real credit (source, and author/
  // license when Commons exposes them for the file), not the source filename on
  // its own — a filename alone satisfies no license's attribution requirement.
  for (const place of DISCOVER_PLACES) {
    if (place.imageAttribution == null) continue
    assert.ok(place.imageAttribution.includes('Wikimedia Commons'), `${place.id}: "${place.imageAttribution}"`)
    assert.ok(!/\.(jpe?g|png|gif|svg|tiff?)$/i.test(place.imageAttribution), `${place.id} attribution is a bare filename`)
  }
})

test('places without an image carry no attribution', () => {
  for (const place of DISCOVER_PLACES) {
    if (place.imageUrl == null) assert.equal(place.imageAttribution, null)
  }
})
