import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyStateCopy,
  filterCounts,
  libraryHeadline,
  matchesFilter,
  matchesQuery,
  projectStopMarks,
  seededGradient,
  sortTripsForLibrary,
  statusBadge,
  tripDateLine,
  tripDurationLabel,
  tripFlags,
  tripInitials,
  tripLibraryStatus,
  tripSubtitle,
  tripThumbnail,
  selectNearbyTripPhoto,
  selectIconicLandmarkPhoto,
  selectTripCoverPhoto,
  selectTripPhotoStop,
  tripPhotoSearchParams,
  tripLandmarkSearchParams,
  upcomingBadgeText,
  type LibraryTrip,
} from '../app/trips/trips-library.ts'

const TODAY = '2026-08-05'

function makeTrip(overrides: Partial<LibraryTrip> & { id: string }): LibraryTrip {
  return { title: 'Trip', updated_at: '2026-08-01T09:00:00Z', ...overrides }
}

test('status boundaries follow the map-home vocabulary, including the first and last day', () => {
  // The day a trip starts and the day it ends are both still 'active' — exactly
  // what the old startOfToday()/Date comparison got wrong around DST.
  assert.equal(tripLibraryStatus({ start_date: TODAY, end_date: '2026-08-14' }, TODAY), 'active')
  assert.equal(tripLibraryStatus({ start_date: '2026-07-28', end_date: TODAY }, TODAY), 'active')
  assert.equal(tripLibraryStatus({ start_date: '2026-08-06', end_date: '2026-08-14' }, TODAY), 'upcoming')
  assert.equal(tripLibraryStatus({ start_date: '2026-07-20', end_date: '2026-08-04' }, TODAY), 'completed')
  assert.equal(tripLibraryStatus({ start_date: null, end_date: null }, TODAY), 'undated')

  // A single-sided date is a one-day window, not an open-ended one.
  assert.equal(tripLibraryStatus({ start_date: TODAY, end_date: null }, TODAY), 'active')
  assert.equal(tripLibraryStatus({ start_date: '2026-08-04', end_date: null }, TODAY), 'completed')
  assert.equal(tripLibraryStatus({ start_date: null, end_date: '2026-08-06' }, TODAY), 'upcoming')

  // 'ongoing' and 'nodates' are gone from the vocabulary entirely.
  for (const window of [
    { start_date: TODAY, end_date: TODAY },
    { start_date: null, end_date: null },
  ]) {
    assert.ok(['active', 'upcoming', 'undated', 'completed'].includes(tripLibraryStatus(window, TODAY)))
  }
})

test('status badges carry text as well as tone for every lifecycle', () => {
  assert.equal(upcomingBadgeText(TODAY, TODAY), 'Starts today')

  assert.deepEqual(
    statusBadge(makeTrip({ id: 'a', start_date: '2026-08-06', end_date: '2026-08-10' }), TODAY),
    { text: 'Starts tomorrow', tone: 'soon' },
  )
  assert.deepEqual(
    statusBadge(makeTrip({ id: 'b', start_date: '2026-08-17', end_date: '2026-08-25' }), TODAY),
    { text: 'In 12 days', tone: 'soon' },
  )
  assert.deepEqual(
    statusBadge(makeTrip({ id: 'c', start_date: '2027-03-02', end_date: '2027-03-12' }), TODAY),
    { text: 'Starts Mar 2027', tone: 'soon' },
  )
  assert.deepEqual(
    statusBadge(makeTrip({ id: 'd', start_date: '2026-08-03', end_date: '2026-08-11' }), TODAY),
    { text: 'Day 3 of 9', tone: 'live' },
  )
  assert.deepEqual(
    statusBadge(makeTrip({ id: 'e', start_date: TODAY, end_date: null }), TODAY),
    { text: 'On the road', tone: 'live' },
  )
  assert.deepEqual(
    statusBadge(makeTrip({ id: 'f', start_date: '2026-06-01', end_date: '2026-06-10' }), TODAY),
    { text: 'Completed', tone: 'past' },
  )
  assert.deepEqual(
    statusBadge(makeTrip({ id: 'g' }), TODAY),
    { text: 'Dates open', tone: 'neutral' },
  )
})

test('subtitles fall back countries -> vibe -> status nudge and never say "Your next route"', () => {
  const countries = [{ name: 'Spain', flag: '🇪🇸' }, { name: 'France', flag: '🇫🇷' }, { name: 'Italy', flag: '🇮🇹' }]

  assert.equal(tripSubtitle(makeTrip({ id: 'a', countries, vibe: 'Beach' }), TODAY), 'Spain + France')
  assert.equal(tripSubtitle(makeTrip({ id: 'b', vibe: 'Beach' }), TODAY), 'Coast')
  assert.equal(tripSubtitle(makeTrip({ id: 'c', vibe: 'Nonsense' }), TODAY), 'Add dates and destinations')

  const fallbacks = {
    active: tripSubtitle(makeTrip({ id: 'd', start_date: '2026-08-03', end_date: '2026-08-11' }), TODAY),
    upcoming: tripSubtitle(makeTrip({ id: 'e', start_date: '2026-09-03', end_date: '2026-09-11' }), TODAY),
    completed: tripSubtitle(makeTrip({ id: 'f', start_date: '2026-06-03', end_date: '2026-06-11' }), TODAY),
    undated: tripSubtitle(makeTrip({ id: 'g' }), TODAY),
  }
  assert.deepEqual(fallbacks, {
    active: 'Add your first stop',
    upcoming: 'Destination not set yet',
    completed: 'No destinations logged',
    undated: 'Add dates and destinations',
  })
  for (const copy of Object.values(fallbacks)) assert.doesNotMatch(copy, /Your next route/)

  assert.equal(tripFlags(makeTrip({ id: 'h', countries })), '🇪🇸🇫🇷')
  assert.equal(tripFlags(makeTrip({ id: 'i', countries }), 1), '🇪🇸')
  assert.equal(tripFlags(makeTrip({ id: 'j' })), '')
})

test('duration counts inclusively and needs both bounds', () => {
  assert.equal(tripDurationLabel(makeTrip({ id: 'a', start_date: '2026-08-12', end_date: '2026-08-20' })), '9 days')
  assert.equal(tripDurationLabel(makeTrip({ id: 'b', start_date: '2026-08-12', end_date: '2026-08-12' })), '1 day')
  assert.equal(tripDurationLabel(makeTrip({ id: 'c', start_date: '2026-08-12' })), null)
  assert.equal(tripDurationLabel(makeTrip({ id: 'd', end_date: '2026-08-12' })), null)
})

test('date lines are local-calendar, so a date-only value never renders a day early', () => {
  assert.equal(tripDateLine(makeTrip({ id: 'a', start_date: '2026-08-12', end_date: '2026-08-20' })), 'Aug 12 – Aug 20')
  assert.equal(tripDateLine(makeTrip({ id: 'b', start_date: '2026-08-12' })), 'Aug 12')
  assert.equal(tripDateLine(makeTrip({ id: 'c', end_date: '2026-01-01' })), 'Jan 1')
  assert.equal(tripDateLine(makeTrip({ id: 'd' })), 'Choose dates later')
  assert.doesNotMatch(tripDateLine(makeTrip({ id: 'e', start_date: '2026-08-12', end_date: '2026-08-20' })), /Aug 11/)
})

test('undated trips are planned, never completed, and All equals the whole library', () => {
  assert.equal(matchesFilter('undated', 'planned'), true)
  assert.equal(matchesFilter('undated', 'completed'), false)
  assert.equal(matchesFilter('upcoming', 'planned'), true)
  assert.equal(matchesFilter('active', 'active'), true)
  assert.equal(matchesFilter('completed', 'all'), true)

  const trips = [
    makeTrip({ id: 'a', start_date: '2026-08-03', end_date: '2026-08-11' }),
    makeTrip({ id: 'b', start_date: '2026-08-20', end_date: '2026-08-28' }),
    makeTrip({ id: 'c' }),
    makeTrip({ id: 'd', start_date: '2026-06-01', end_date: '2026-06-09' }),
    makeTrip({ id: 'e', start_date: '2026-07-01', end_date: '2026-07-09' }),
  ]
  assert.deepEqual(filterCounts(trips, TODAY), { all: 5, planned: 2, active: 1, completed: 2 })
  assert.equal(filterCounts(trips, TODAY).all, trips.length)
})

test('search spans title, country names and the vibe label', () => {
  const trip = makeTrip({
    id: 'a',
    title: 'Barcelona Escape',
    countries: [{ name: 'Spain', flag: '🇪🇸' }],
    vibe: 'Beach',
  })

  assert.equal(matchesQuery(trip, ''), true)
  assert.equal(matchesQuery(trip, '   '), true)
  assert.equal(matchesQuery(trip, '  BARCELONA '), true)
  assert.equal(matchesQuery(trip, 'spain'), true)
  assert.equal(matchesQuery(trip, 'coast'), true)
  assert.equal(matchesQuery(trip, 'iceland'), false)
})

test('library order is on the road, then soonest, then loose plans, then the archive', () => {
  const trips = [
    makeTrip({ id: 'past-old', start_date: '2026-05-20', end_date: '2026-05-30' }),
    makeTrip({ id: 'soon-late', start_date: '2026-08-20', end_date: '2026-08-28' }),
    makeTrip({ id: 'open-stale', updated_at: '2026-07-01T09:00:00Z' }),
    makeTrip({ id: 'live', start_date: '2026-08-03', end_date: '2026-08-11' }),
    makeTrip({ id: 'past-recent', start_date: '2026-07-20', end_date: '2026-07-30' }),
    makeTrip({ id: 'open-fresh', updated_at: '2026-08-02T09:00:00Z' }),
    makeTrip({ id: 'soon-next', start_date: '2026-08-10', end_date: '2026-08-14' }),
  ]

  assert.deepEqual(sortTripsForLibrary(trips, TODAY).map((trip) => trip.id), [
    'live',
    'soon-next',
    'soon-late',
    'open-fresh',
    'open-stale',
    'past-recent',
    'past-old',
  ])

  // Identical sort keys still resolve deterministically by id.
  const tied = [
    makeTrip({ id: 'b', start_date: '2026-08-10', end_date: '2026-08-14' }),
    makeTrip({ id: 'a', start_date: '2026-08-10', end_date: '2026-08-14' }),
  ]
  assert.deepEqual(sortTripsForLibrary(tied, TODAY).map((trip) => trip.id), ['a', 'b'])
})

test('the headline points at the next trip, the archive, or nothing at all', () => {
  const ahead = libraryHeadline([
    makeTrip({ id: 'x', title: 'Barcelona Escape', start_date: '2026-08-17', end_date: '2026-08-25' }),
    makeTrip({ id: 'y', title: 'Coastal Run', start_date: '2026-09-01', end_date: '2026-09-05' }),
    makeTrip({ id: 'z', title: 'Old One', start_date: '2026-06-01', end_date: '2026-06-05' }),
  ], TODAY)
  assert.deepEqual(ahead, {
    value: '2',
    label: 'trips ahead',
    hint: 'Barcelona Escape · in 12 days',
    hintTripId: 'x',
  })

  const live = libraryHeadline([
    makeTrip({ id: 'l', title: 'Coastal Run', start_date: '2026-08-03', end_date: '2026-08-11' }),
  ], TODAY)
  assert.deepEqual(live, {
    value: '1',
    label: 'trip ahead',
    hint: 'Day 3 of 9 · Coastal Run',
    hintTripId: 'l',
  })

  const archived = libraryHeadline([
    makeTrip({ id: 'p', start_date: '2026-06-01', end_date: '2026-06-05' }),
    makeTrip({ id: 'q', start_date: '2026-07-01', end_date: '2026-07-05' }),
  ], TODAY)
  assert.equal(archived.hint, '2 trips in your archive')
  assert.equal(archived.hintTripId, null)

  assert.equal(libraryHeadline([], TODAY).hint, 'Nothing planned yet')
  assert.equal(libraryHeadline([], TODAY).hintTripId, null)
})

test('empty states explain their own cause and the all-empty branch offers creation', () => {
  const searched = emptyStateCopy('all', ' Rome ')
  assert.equal(searched.title, 'No trips match “Rome”')
  assert.equal(searched.cta, 'Clear search')

  assert.equal(emptyStateCopy('planned', '').title, 'Nothing planned yet')
  assert.equal(emptyStateCopy('active', '').title, 'No trip in progress')
  assert.equal(emptyStateCopy('completed', '').title, 'No finished trips yet')
  assert.equal(emptyStateCopy('completed', '').cta, null)

  const blank = emptyStateCopy('all', '')
  assert.equal(blank.title, 'Your map is ready')
  assert.equal(blank.cta, 'Create new trip')

  const titles = (['all', 'planned', 'active', 'completed'] as const).map((filter) => emptyStateCopy(filter, '').title)
  assert.equal(new Set(titles).size, titles.length)
})

test('thumbnails are deterministic and reject unsafe cover URLs', () => {
  assert.equal(seededGradient('trip-1'), seededGradient('trip-1'))
  assert.notEqual(seededGradient('a'), seededGradient('d'))

  assert.equal(tripInitials('Barcelona Escape'), 'BE')
  assert.equal(tripInitials('  solo  '), 'S')
  assert.equal(tripInitials(''), '?')

  assert.deepEqual(
    tripThumbnail(makeTrip({ id: 't', cover_image_url: 'https://images.example/cover.jpg' })),
    { kind: 'image', url: 'https://images.example/cover.jpg' },
  )
  assert.deepEqual(
    tripThumbnail(makeTrip({ id: 't', title: 'Barcelona Escape', cover_image_url: 'javascript:alert(1)' })),
    { kind: 'seed', gradient: seededGradient('t'), initials: 'BE' },
  )
  assert.equal(tripThumbnail(makeTrip({ id: 't', title: 'Barcelona Escape' })).kind, 'seed')
})

test('automatic trip photos prefer the destination and require a matching nearby place', () => {
  const stops = [
    { id: 'origin', trip_id: 't', name: 'Seattle', address: 'Seattle, Washington, United States', lat: 47.61, lng: -122.33, order_index: 0, stop_type: 'origin' },
    { id: 'destination', trip_id: 't', name: 'Portland', address: 'Portland, Oregon, United States', lat: 45.52, lng: -122.68, order_index: 2, stop_type: 'destination' },
    { id: 'waypoint', trip_id: 't', name: 'Cesme', lat: 38.32, lng: 26.31, order_index: 1, stop_type: 'waypoint' },
  ]
  const selected = selectTripPhotoStop(stops)
  assert.equal(selected?.id, 'destination')
  assert.equal(tripPhotoSearchParams(selected!).get('q'), 'Portland, Oregon, United States')

  const photo = selectNearbyTripPhoto(selected!, [
    { name: 'Portland Japanese Garden', photoRef: 'places/wrong/photos/1', photoWidth: 800, photoHeight: 600, lat: 45.519, lng: -122.681 },
    { name: 'Portland', photoRef: 'places/near/photos/1', photoWidth: 1200, photoHeight: 800, lat: 45.521, lng: -122.681 },
  ])
  assert.deepEqual(photo, { ref: 'places/near/photos/1', placeName: 'Portland', width: 1200, height: 800 })
  assert.equal(selectNearbyTripPhoto(selected!, [{ name: 'Japanese Garden', photoRef: 'places/wrong/photos/1', photoWidth: null, photoHeight: null, lat: 45.519, lng: -122.681 }]), null)
  assert.equal(selectNearbyTripPhoto(selected!, [{ name: 'Portland', photoRef: 'places/far/photos/1', photoWidth: null, photoHeight: null, lat: 48.85, lng: 2.35 }]), null)
})

test('overview landmark photos reject generic city imagery and keep iconic nearby results', () => {
  const seattle = { id: 'seattle', name: 'Seattle', lat: 47.6062, lng: -122.3321 }
  assert.equal(tripLandmarkSearchParams(seattle).get('q'), 'Seattle iconic landmark')
  assert.equal(tripLandmarkSearchParams(seattle).get('category'), 'attractions')

  const photo = selectIconicLandmarkPhoto(seattle, [
    { name: 'Seattle', photoRef: 'places/city/photos/aerial', photoWidth: 1200, photoHeight: 800, lat: 47.6062, lng: -122.3321 },
    { name: 'Space Needle', photoRef: 'places/needle/photos/iconic', photoWidth: 1200, photoHeight: 800, lat: 47.6205, lng: -122.3493 },
  ])
  assert.deepEqual(photo, { ref: 'places/needle/photos/iconic', placeName: 'Space Needle', width: 1200, height: 800 })
  assert.equal(selectIconicLandmarkPhoto(seattle, [
    { name: 'Space Needle', photoRef: 'places/far/photos/wrong', photoWidth: null, photoHeight: null, lat: 40.7128, lng: -74.006 },
  ]), null)
})

test('trip covers reject hotels, shops and unknown pins in favour of the ranked landmark', () => {
  const izmir = { id: 'izmir', name: 'Izmir', lat: 38.4237, lng: 27.1428 }

  // Nearest is not best: the hotel and the coffee chain are dropped on type, the
  // unnamed pin on popularity, so the well-known clock tower wins from further out.
  assert.deepEqual(selectTripCoverPhoto(izmir, [
    { name: 'Swissotel Buyuk Efes', photoRef: 'places/hotel/photos/lobby', photoWidth: 1200, photoHeight: 800, lat: 38.4256, lng: 27.1401, primaryType: 'hotel', userRatingCount: 4200 },
    { name: 'Kahve Dunyasi Alsancak', photoRef: 'places/cafe/photos/menu', photoWidth: 1200, photoHeight: 800, lat: 38.4331, lng: 27.1425, primaryType: 'coffee_shop', userRatingCount: 2100 },
    { name: 'Ozgur Oto Servis', photoRef: 'places/garage/photos/forecourt', photoWidth: 1200, photoHeight: 800, lat: 38.4262, lng: 27.1466, primaryType: 'car_repair', userRatingCount: 3000 },
    { name: 'Bahri Baba Parki Pin', photoRef: 'places/pin/photos/snapshot', photoWidth: 900, photoHeight: 1600, lat: 38.4222, lng: 27.1391, primaryType: null, userRatingCount: 12 },
    { name: 'Izmir Saat Kulesi', photoRef: 'places/clock/photos/iconic', photoWidth: 1600, photoHeight: 900, lat: 38.4189, lng: 27.1287, primaryType: 'historical_landmark', userRatingCount: 38_000 },
  ]), { ref: 'places/clock/photos/iconic', placeName: 'Izmir Saat Kulesi', width: 1600, height: 900 })

  // With nothing scenic in range the card keeps its seed tile rather than
  // showing the last stop's hotel.
  assert.equal(selectTripCoverPhoto(izmir, [
    { name: 'Izmir', photoRef: 'places/hotel/photos/room', photoWidth: 1200, photoHeight: 800, lat: 38.4237, lng: 27.1428, primaryType: 'lodging', userRatingCount: 900 },
  ]), null)

  // A landmark 55 km away is somewhere else entirely, however famous it is.
  assert.equal(selectTripCoverPhoto(izmir, [
    { name: 'Efes Antik Kenti', photoRef: 'places/ephesus/photos/1', photoWidth: 1600, photoHeight: 900, lat: 37.9395, lng: 27.3417, primaryType: 'historical_landmark', userRatingCount: 60_000 },
  ]), null)
})

test('backdrop projection stays inside its own trip, caps at six pins, and never divides by zero', () => {
  const stops = [
    { id: 's1', trip_id: 't1', lat: 41, lng: 2 },
    { id: 's2', trip_id: 't1', lat: 43, lng: 5 },
    { id: 'other', trip_id: 't2', lat: 10, lng: 10 },
    { id: 'broken', trip_id: 't1', lat: Number.NaN, lng: 3 },
  ]

  const marks = projectStopMarks(stops, 't1')
  assert.deepEqual(marks.map((mark) => mark.id), ['s1', 's2'])
  assert.deepEqual(marks[0], { id: 's1', x: 16, y: 66 })
  assert.deepEqual(marks[1], { id: 's2', x: 84, y: 22 })

  // One stop: both spans are zero, so it centres instead of producing NaN.
  const single = projectStopMarks([{ id: 'only', trip_id: 't1', lat: 41, lng: 2 }], 't1')
  assert.deepEqual(single, [{ id: 'only', x: 50, y: 44 }])

  const many = Array.from({ length: 9 }, (_, index) => ({
    id: `s${index}`,
    trip_id: 't1',
    lat: 40 + index,
    lng: 2 + index,
  }))
  assert.equal(projectStopMarks(many, 't1').length, 6)
  assert.deepEqual(projectStopMarks(stops, null), [])
})
