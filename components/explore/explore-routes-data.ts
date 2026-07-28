export const COUNTRY_COLORS = [
  "linear-gradient(135deg,#0d9488,#0284c7)",
  "linear-gradient(135deg,#b45309,#f59e0b)",
  "linear-gradient(135deg,#374151,#0f766e)",
  "linear-gradient(135deg,#7c3aed,#4f46e5)",
  "linear-gradient(135deg,#065f46,#0369a1)",
  "linear-gradient(135deg,#be185d,#7c3aed)",
];

export const COUNTRY_COORDS: Record<string, [number, number]> = {
  "Turkey": [39.9, 32.9], "Türkiye": [39.9, 32.9],
  "Italy": [41.9, 12.5], "France": [46.2, 2.2], "Spain": [40.4, -3.7],
  "Germany": [51.2, 10.4], "UK": [55.4, -3.4], "United Kingdom": [55.4, -3.4],
  "Portugal": [39.4, -8.2], "Greece": [39.1, 21.8], "Netherlands": [52.1, 5.3],
  "Belgium": [50.5, 4.5], "Switzerland": [46.8, 8.2], "Austria": [47.5, 14.6],
  "Poland": [51.9, 19.1], "Czech Republic": [49.8, 15.5], "Hungary": [47.2, 19.5],
  "Croatia": [45.1, 15.2], "Romania": [45.9, 24.9], "Bulgaria": [42.7, 25.5],
  "Serbia": [44.0, 21.0], "Sweden": [60.1, 18.6], "Norway": [60.5, 8.5],
  "Denmark": [56.3, 9.5], "Finland": [61.9, 25.7], "Iceland": [64.9, -18.2],
  "USA": [37.1, -95.7], "United States": [37.1, -95.7], "Canada": [56.1, -106.3],
  "Mexico": [23.6, -102.6], "Brazil": [-14.2, -51.9], "Argentina": [-38.4, -63.6],
  "Japan": [36.2, 138.3], "South Korea": [35.9, 127.8], "China": [35.9, 104.2],
  "Thailand": [15.9, 100.9], "Vietnam": [14.1, 108.3], "Indonesia": [-0.8, 113.9],
  "Singapore": [1.4, 103.8], "India": [20.6, 78.9], "Nepal": [28.4, 84.1],
  "UAE": [23.4, 53.8], "Morocco": [31.8, -7.1], "Egypt": [26.8, 30.8],
  "South Africa": [-30.6, 22.9], "Kenya": [0.0, 37.9],
  "Australia": [-25.3, 133.8], "New Zealand": [-40.9, 174.9],
  "Russia": [61.5, 105.3], "Georgia": [42.3, 43.4],
};

export interface Waypoint {
  name: string;
  lat: number;
  lng: number;
}

export interface Destination {
  name: string; country: string; lat: number; lng: number;
  emoji: string; tag: string; distance: string; duration: string;
  bestSeason: string; description: string;
  highlights: string[]; waypoints: Waypoint[];
}

export const ROUTES: Destination[] = [
  {
    name: "Amalfi Coast", country: "Italy", lat: 40.6, lng: 14.6, emoji: "🏛️", tag: "Coastal Drive",
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
    name: "Ring Road", country: "Iceland", lat: 65.0, lng: -18.0, emoji: "🌋", tag: "Epic Route",
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
    name: "Route 66", country: "USA", lat: 35.5, lng: -96.0, emoji: "🛣️", tag: "Legendary Road",
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
    name: "Milford Sound", country: "New Zealand", lat: -44.7, lng: 167.9, emoji: "🏔️", tag: "Scenic Wonder",
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
    name: "Trollstigen", country: "Norway", lat: 62.5, lng: 7.7, emoji: "🌊", tag: "Mountain Pass",
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
    name: "Cappadocia", country: "Turkey", lat: 38.6, lng: 34.8, emoji: "🎈", tag: "Hidden Gem",
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
];
