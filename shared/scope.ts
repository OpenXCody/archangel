/**
 * What the app covers.
 *
 * Two separate ideas, kept separate on purpose:
 *
 * - COVERAGE is which rows the public API returns. It is the whole country:
 *   seeing every factory in the United States is the point of the map.
 * - FOCUS_AREAS are the regions being filled out in depth (featured employers,
 *   careers, jobs). Each has a boundary drawn on the map as a geofence: its
 *   metro area's counties as the Census Bureau defines the metro, merged by
 *   scripts/geo/build-areas.mjs, which also prints the ring and the box below.
 *
 * The map opens on the whole country. A focus area is somewhere to go, not a
 * limit on what exists.
 */

/** Two-letter state code to limit public reads to, or null for every state. */
export const SCOPE: { stateCode: string | null; stateName: string } = {
  stateCode: null,
  stateName: 'United States',
};

/** [[west, south], [east, north]] */
export type Bounds = [[number, number], [number, number]];

/** The continental United States: the map's opening view. */
export const US_BOUNDS: Bounds = [
  [-125.0, 24.4],
  [-66.9, 49.4],
];

export interface FocusArea {
  id: string;
  /** Shown on the map and in the area picker. */
  name: string;
  /** What the boundary is made of, for the panel. */
  description: string;
  /** Box around the boundary, used to frame it and to select rows on the server. */
  bounds: Bounds;
  /** GeoJSON of the boundary, served by the client (client/public). */
  boundaryUrl: string;
  /**
   * The same boundary as [longitude, latitude] points, closed (first = last).
   * The server counts what is inside the area with it; the map draws the file
   * at boundaryUrl. Keep the two in step.
   */
  ring: [number, number][];
  center: { latitude: number; longitude: number };
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    id: 'austin',
    name: 'Austin, TX',
    description: 'Travis, Williamson, Hays, Bastrop and Caldwell counties',
    bounds: [
      [-98.2985, 29.6306],
      [-97.0243, 30.9063],
    ],
    boundaryUrl: '/data/areas/austin.geojson',
    ring: [
    [-97.315, 29.787], [-97.3186, 29.7844], [-97.5986, 29.6306], [-97.6345, 29.6495],
    [-97.6524, 29.6667], [-97.7206, 29.6822], [-97.7386, 29.7131], [-97.7673, 29.7191],
    [-97.7816, 29.7595], [-97.7996, 29.7526], [-97.8175, 29.7904], [-97.8427, 29.799],
    [-97.8498, 29.8437], [-97.875, 29.8583], [-98.0006, 29.7526], [-98.0293, 29.8488],
    [-98.2985, 30.0378], [-98.1729, 30.3565], [-98.1262, 30.4261], [-98.0975, 30.4673],
    [-98.1226, 30.4845], [-98.0508, 30.6245], [-97.9611, 30.786], [-97.8283, 30.9063],
    [-97.6237, 30.8702], [-97.315, 30.7525], [-97.272, 30.7354], [-97.1535, 30.457],
    [-97.333, 30.4029], [-97.2002, 30.3376], [-97.0817, 30.2594], [-97.0243, 30.0515],
    [-97.315, 29.787],
    ],
    center: { latitude: 30.2672, longitude: -97.7431 },
  },
  {
    id: 'houston',
    name: 'Houston, TX',
    description: 'Harris, Fort Bend, Montgomery, Brazoria, Galveston, Liberty, Waller, Chambers, Austin and San Jacinto counties',
    bounds: [
      [-96.6223, 28.8257],
      [-94.3539, 30.9063],
    ],
    boundaryUrl: '/data/areas/houston.geojson',
    ring: [
    [-95.3589, 30.5043], [-95.3266, 30.8599], [-95.3122, 30.8977], [-95.2512, 30.9063],
    [-95.244, 30.8668], [-95.2009, 30.8247], [-95.1327, 30.7817], [-95.1471, 30.7139],
    [-95.1112, 30.6924], [-95.104, 30.658], [-95.0538, 30.6804], [-95.0071, 30.6065],
    [-95.0286, 30.579], [-94.964, 30.5764], [-94.8348, 30.5309], [-94.8671, 30.5111],
    [-94.8492, 30.494], [-94.7343, 30.4897], [-94.5979, 30.1117], [-94.4436, 30.1134],
    [-94.4436, 29.8892], [-94.3574, 29.8875], [-94.3539, 29.5619], [-94.3718, 29.5559],
    [-94.5943, 29.4682], [-94.6948, 29.4158], [-94.7307, 29.3695], [-94.7846, 29.3755],
    [-94.7056, 29.4365], [-94.6733, 29.4768], [-94.6266, 29.476], [-94.5943, 29.4923],
    [-94.5656, 29.5318], [-94.5333, 29.5181], [-94.4938, 29.5249], [-94.5118, 29.543],
    [-94.5477, 29.5722], [-94.7415, 29.5258], [-94.7702, 29.5481], [-94.7092, 29.6255],
    [-94.6948, 29.6942], [-94.6948, 29.7577], [-94.7379, 29.762], [-94.7559, 29.7818],
    [-94.8169, 29.7569], [-94.8528, 29.7217], [-94.8671, 29.6787], [-94.921, 29.6581],
    [-94.9317, 29.6736], [-94.9676, 29.7002], [-95.0071, 29.659], [-95.0143, 29.6289],
    [-94.982, 29.6014], [-95.0179, 29.555], [-94.982, 29.5112], [-94.9102, 29.4966],
    [-94.9317, 29.4502], [-94.8923, 29.433], [-94.8851, 29.366], [-94.8923, 29.3085],
    [-94.921, 29.2818], [-94.9533, 29.2904], [-95.0574, 29.2028], [-95.1004, 29.1736],
    [-95.1112, 29.1959], [-95.1579, 29.1891], [-95.165, 29.1135], [-95.1435, 29.0911],
    [-95.104, 29.1229], [-95.0035, 29.1848], [-94.9928, 29.2011], [-94.8779, 29.2861],
    [-94.8241, 29.3059], [-94.8241, 29.3445], [-94.7307, 29.3317], [-94.8025, 29.2793],
    [-95.0251, 29.1478], [-95.1184, 29.0782], [-95.2404, 28.9889], [-95.384, 28.866],
    [-95.4378, 28.8592], [-95.506, 28.8257], [-95.5706, 28.8317], [-95.5922, 28.8712],
    [-95.6352, 28.8978], [-95.6496, 28.9416], [-95.6747, 28.9648], [-95.7645, 28.9674],
    [-95.7824, 29.0439], [-95.7645, 29.0602], [-95.8434, 29.1057], [-95.8398, 29.1744],
    [-95.8757, 29.2294], [-95.847, 29.2629], [-95.8757, 29.2664], [-95.8937, 29.3153],
    [-95.9475, 29.3334], [-95.9475, 29.3729], [-95.9726, 29.4115], [-96.0588, 29.4734],
    [-96.0229, 29.5018], [-96.0552, 29.5121], [-96.0408, 29.5404], [-96.0588, 29.5885],
    [-96.0875, 29.6014], [-96.109, 29.6229], [-96.1736, 29.634], [-96.1988, 29.6564],
    [-96.2598, 29.6693], [-96.2705, 29.7165], [-96.2993, 29.7371], [-96.3423, 29.8299],
    [-96.4141, 29.8248], [-96.5361, 29.9072], [-96.5685, 29.9613], [-96.6223, 30.0447],
    [-96.5864, 30.0644], [-96.5182, 30.0653], [-96.2885, 30.0971], [-96.2598, 30.0756],
    [-96.1593, 30.0541], [-96.1449, 30.0704], [-96.1916, 30.1383], [-96.1557, 30.1417],
    [-96.1593, 30.207], [-96.0947, 30.2251], [-96.0875, 30.2285], [-95.8039, 30.2457],
    [-95.8039, 30.3376], [-95.8291, 30.6306], [-95.5993, 30.5094], [-95.3625, 30.5086],
    [-95.3589, 30.5043],
    ],
    center: { latitude: 29.7604, longitude: -95.3698 },
  },
  {
    id: 'dfw',
    name: 'Dallas-Fort Worth, TX',
    description: 'Dallas, Tarrant, Collin, Denton, Ellis, Johnson, Kaufman, Parker, Rockwall, Hunt and Wise counties',
    bounds: [
      [-98.0652, 32.0523],
      [-95.8578, 33.4337],
    ],
    boundaryUrl: '/data/areas/dfw.geojson',
    ring: [
    [-97.918, 33.4337], [-97.4873, 33.4337], [-97.3832, 33.4302], [-96.9453, 33.4165],
    [-96.8341, 33.4053], [-96.3854, 33.3976], [-96.3854, 33.3409], [-96.2957, 33.3521],
    [-95.8578, 33.4096], [-95.8614, 33.2189], [-95.865, 32.9998], [-95.8614, 32.9792],
    [-95.9439, 32.9801], [-95.987, 32.8761], [-95.9331, 32.8375], [-96.0767, 32.8383],
    [-96.0767, 32.3573], [-96.4536, 32.359], [-96.3818, 32.3289], [-96.3962, 32.3238],
    [-96.8951, 32.0738], [-96.9417, 32.0523], [-97.0853, 32.2653], [-97.4765, 32.182],
    [-97.4765, 32.1734], [-97.5124, 32.1623], [-97.516, 32.1339], [-97.5663, 32.1502],
    [-97.5699, 32.1769], [-97.6165, 32.2035], [-97.6165, 32.3186], [-97.6165, 32.5557],
    [-98.0652, 32.5591], [-98.0544, 33.0033], [-97.9216, 33.0016], [-97.918, 33.4337],
    ],
    center: { latitude: 32.7767, longitude: -96.797 },
  },
  {
    id: 'san-antonio',
    name: 'San Antonio, TX',
    description: 'Bexar, Guadalupe, Comal, Medina, Atascosa, Kendall, Wilson and Bandera counties',
    bounds: [
      [-99.6014, 28.6126],
      [-97.6345, 30.1392],
    ],
    boundaryUrl: '/data/areas/san-antonio.geojson',
    ring: [
    [-98.1908, 28.8824], [-98.0975, 28.787], [-98.3344, 28.6126], [-98.3344, 28.6487],
    [-98.801, 28.647], [-98.801, 28.6478], [-98.8046, 29.0903], [-99.4148, 29.0911],
    [-99.4112, 29.6272], [-99.6014, 29.6272], [-99.6014, 29.9081], [-99.2784, 29.9038],
    [-99.1779, 29.8952], [-98.9194, 29.7818], [-98.9194, 30.1383], [-98.5892, 30.1392],
    [-98.4134, 29.9373], [-98.2985, 30.0378], [-98.0293, 29.8488], [-98.0006, 29.7526],
    [-97.875, 29.8583], [-97.8498, 29.8437], [-97.8427, 29.799], [-97.8175, 29.7904],
    [-97.7996, 29.7526], [-97.7816, 29.7595], [-97.7673, 29.7191], [-97.7386, 29.7131],
    [-97.7206, 29.6822], [-97.6524, 29.6667], [-97.6345, 29.6495], [-97.8391, 29.3772],
    [-97.857, 29.3531], [-97.7278, 29.2217], [-98.1908, 28.8824],
    ],
    center: { latitude: 29.4241, longitude: -98.4936 },
  },
];

export function focusArea(id: string): FocusArea | undefined {
  return FOCUS_AREAS.find((area) => area.id === id);
}

/** Great-circle distance in miles between two points. */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}
