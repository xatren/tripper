// Tier C dataset (plan §8.3), ported from the retired `components/explore/explore-routes-data.ts`
// during Phase 6 cleanup so the road-trip templates aren't lost when the old globe page is
// deleted. `countryCode` is new — added so a route can join `lib/country-data.generated.ts`
// the same way `DiscoverPlace.countryCode` does. `id` is new too, added in Phase 7 alongside
// the map/card/CTA wiring — a stable slug, hand-assigned the same way `countryCode` was, since
// this file is manually curated rather than seeder output despite the `.generated` name.

export interface DiscoverRouteWaypoint {
  name: string
  lat: number
  lng: number
}

export interface DiscoverRoute {
  id: string
  name: string
  country: string
  countryCode: string
  lat: number
  lng: number
  emoji: string
  tag: string
  distance: string
  duration: string
  bestSeason: string
  description: string
  highlights: string[]
  waypoints: DiscoverRouteWaypoint[]
}

export const DISCOVER_ROUTES: readonly DiscoverRoute[] = [
  {
    id: "it-amalfi-coast", name: "Amalfi Coast", country: "Italy", countryCode: "IT", lat: 40.6, lng: 14.6, emoji: "🏛️", tag: "Coastal Drive",
    distance: "50 km", duration: "2–3 days", bestSeason: "May – Oct",
    description: "A winding clifftop road above turquoise waters, connecting pastel villages and hidden sea grottos.",
    highlights: ["Positano cliffside village", "Ravello garden terraces", "Path of the Gods trail", "Grotta dello Smeraldo"],
    waypoints: [
      { name: "Sorrento", lat: 40.626, lng: 14.375 },
      { name: "Positano", lat: 40.628, lng: 14.485 },
      { name: "Amalfi", lat: 40.634, lng: 14.603 },
      { name: "Ravello", lat: 40.649, lng: 14.612 },
      { name: "Salerno", lat: 40.683, lng: 14.768 },
    ],
  },
  {
    id: "is-ring-road", name: "Ring Road", country: "Iceland", countryCode: "IS", lat: 65.0, lng: -18.0, emoji: "🌋", tag: "Epic Route",
    distance: "1.332 km", duration: "7–14 days", bestSeason: "Jun – Aug",
    description: "Iceland's Route 1 circles the entire island, passing glaciers, volcanoes, waterfalls, and Northern Lights.",
    highlights: ["Jökulsárlón glacier lagoon", "Skaftafell ice caves", "Mývatn geothermal lakes", "Dettifoss waterfall"],
    waypoints: [
      { name: "Reykjavík", lat: 64.146, lng: -21.942 },
      { name: "Vík", lat: 63.419, lng: -19.007 },
      { name: "Höfn", lat: 64.253, lng: -15.212 },
      { name: "Egilsstaðir", lat: 65.263, lng: -14.394 },
      { name: "Akureyri", lat: 65.684, lng: -18.088 },
      { name: "Borgarnes", lat: 64.537, lng: -21.921 },
    ],
  },
  {
    id: "us-route-66", name: "Route 66", country: "USA", countryCode: "US", lat: 35.5, lng: -96.0, emoji: "🛣️", tag: "Legendary Road",
    distance: "3.940 km", duration: "14–21 days", bestSeason: "Apr – Oct",
    description: "The Mother Road stretches from Chicago to LA through neon diners, vast deserts, and Americana.",
    highlights: ["Cadillac Ranch, Amarillo", "Petrified Forest NP", "Grand Canyon detour", "Santa Monica Pier"],
    waypoints: [
      { name: "Chicago", lat: 41.878, lng: -87.630 },
      { name: "St. Louis", lat: 38.627, lng: -90.199 },
      { name: "Oklahoma City", lat: 35.468, lng: -97.516 },
      { name: "Albuquerque", lat: 35.085, lng: -106.651 },
      { name: "Flagstaff", lat: 35.199, lng: -111.651 },
      { name: "Los Angeles", lat: 34.052, lng: -118.244 },
    ],
  },
  {
    id: "nz-milford-sound", name: "Milford Sound", country: "New Zealand", countryCode: "NZ", lat: -44.7, lng: 167.9, emoji: "🏔️", tag: "Scenic Wonder",
    distance: "120 km", duration: "2–3 days", bestSeason: "Nov – Mar",
    description: "A dramatic fjord carved by glaciers, surrounded by sheer peaks and thundering waterfalls.",
    highlights: ["Mitre Peak reflection", "Stirling & Lady Bowen Falls", "Milford Track hike", "Underwater Observatory"],
    waypoints: [
      { name: "Queenstown", lat: -45.031, lng: 168.663 },
      { name: "Te Anau", lat: -45.415, lng: 167.719 },
      { name: "Cascade Creek", lat: -44.833, lng: 168.117 },
      { name: "Milford Sound", lat: -44.617, lng: 167.897 },
    ],
  },
  {
    id: "no-trollstigen", name: "Trollstigen", country: "Norway", countryCode: "NO", lat: 62.5, lng: 7.7, emoji: "🌊", tag: "Mountain Pass",
    distance: "106 km", duration: "1–2 days", bestSeason: "Jun – Sep",
    description: "Eleven hairpin bends climb a sheer wall with views of cascading waterfalls and deep Norwegian valleys.",
    highlights: ["11 hairpin bends", "Stigfossen 320 m waterfall", "Eagle Road viewpoint", "Geirangerfjord detour"],
    waypoints: [
      { name: "Åndalsnes", lat: 62.567, lng: 7.687 },
      { name: "Trollstigen Pass", lat: 62.472, lng: 7.662 },
      { name: "Valldal", lat: 62.299, lng: 7.357 },
      { name: "Geiranger", lat: 62.101, lng: 7.206 },
    ],
  },
  {
    id: "tr-cappadocia-route", name: "Cappadocia", country: "Turkey", countryCode: "TR", lat: 38.6, lng: 34.8, emoji: "🎈", tag: "Hidden Gem",
    distance: "180 km", duration: "3–4 days", bestSeason: "Apr – Jun",
    description: "Fairy chimneys, underground cities, and sunrise hot-air balloons over a surreal volcanic landscape.",
    highlights: ["Hot-air balloon at sunrise", "Göreme Open-Air Museum", "Derinkuyu underground city", "Rose Valley hike"],
    waypoints: [
      { name: "Nevşehir", lat: 38.624, lng: 34.715 },
      { name: "Göreme", lat: 38.644, lng: 34.829 },
      { name: "Ürgüp", lat: 38.628, lng: 34.911 },
      { name: "Avanos", lat: 38.716, lng: 34.847 },
      { name: "Derinkuyu", lat: 38.374, lng: 34.734 },
    ],
  },
] as const
