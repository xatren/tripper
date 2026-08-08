import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_DISCOVER_CATEGORY,
  DISCOVER_CATEGORIES,
  LIVE_LAYER_MIN_ZOOM,
  categoryAvailableAtZoom,
  curatedCategories,
  discoverCategory,
  isDiscoverCategory,
  liveCategories,
} from '../lib/discover/categories.ts'

test('every category id is unique and resolvable', () => {
  const ids = DISCOVER_CATEGORIES.map((category) => category.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) {
    assert.equal(discoverCategory(id).id, id)
    assert.ok(isDiscoverCategory(id))
  }
})

test('an unknown or missing category degrades to the default rather than throwing', () => {
  for (const value of ['hidden_gems', 'routes', '', null, undefined]) {
    assert.equal(discoverCategory(value).id, DEFAULT_DISCOVER_CATEGORY)
    assert.equal(isDiscoverCategory(value), false)
  }
})

test('the default category is curated, so a cold open never costs a billed call', () => {
  assert.equal(discoverCategory(DEFAULT_DISCOVER_CATEGORY).source, 'curated')
})

test('live layers carry a provider mapping and a zoom gate; curated layers carry neither', () => {
  for (const category of liveCategories()) {
    assert.ok(category.placesCategories?.length, `${category.id} must name its provider categories`)
    assert.equal(category.minZoom, LIVE_LAYER_MIN_ZOOM, `${category.id} must be zoom-gated`)
  }
  for (const category of curatedCategories()) {
    assert.equal(category.placesCategories, undefined, `${category.id} is curated and must not proxy Places`)
    assert.equal(category.minZoom, undefined, `${category.id} is curated and must work at country zoom`)
  }
})

test('the two layer kinds together account for every category', () => {
  assert.equal(curatedCategories().length + liveCategories().length, DISCOVER_CATEGORIES.length)
  assert.ok(curatedCategories().length > 0 && liveCategories().length > 0)
})

test('only overnight-shaped categories default to a night, so a stop never silently adds a trip day', () => {
  // `nights: 1` creates a trip day (20260808120000_stop_overnight_semantics.sql).
  // Getting this wrong on a viewpoint would lengthen the trip behind the user's back.
  const overnight = DISCOVER_CATEGORIES.filter((category) => category.defaultStopNights === 1).map((c) => c.id)
  assert.deepEqual([...overnight].sort(), ['cities', 'stays'])
  for (const category of DISCOVER_CATEGORIES) {
    assert.ok([0, 1].includes(category.defaultStopNights), `${category.id} has a non-boolean night default`)
  }
})

test('the zoom gate hides live layers at country zoom and never hides curated ones', () => {
  for (const category of curatedCategories()) {
    assert.ok(categoryAvailableAtZoom(category, 1.5), `${category.id} must survive a country-wide view`)
  }
  for (const category of liveCategories()) {
    assert.equal(categoryAvailableAtZoom(category, LIVE_LAYER_MIN_ZOOM - 0.1), false)
    assert.equal(categoryAvailableAtZoom(category, LIVE_LAYER_MIN_ZOOM), true)
  }
})

test('every category has a distinct literal marker colour the map can paint with', () => {
  const colors = DISCOVER_CATEGORIES.map((category) => category.markerColor)
  assert.equal(new Set(colors).size, colors.length)
  for (const color of colors) assert.match(color, /^#[0-9a-f]{6}$/)
})

test('every category has a human label', () => {
  for (const category of DISCOVER_CATEGORIES) assert.ok(category.label.trim().length > 0)
})
