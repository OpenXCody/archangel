// Which area a point is in: point in polygon by plain arithmetic, with a grid
// over the areas so a point is tested against the two or three that could
// hold it and not against all 3,200 counties. No database, no package.
//
// An area is { id, rings }: every ring of its outline, outer boundaries and
// holes alike, each a flat array x, y, x, y, ... in degrees (x is longitude).
// A point is inside when a line drawn east from it crosses the rings an odd
// number of times, which handles holes and islands with no bookkeeping.
//
// A point exactly on a border two areas share is given to exactly one of
// them, the one to its east (to its north where the border runs east-west):
// both areas' rings hold the same two corner points, the crossing is worked
// out from the lower corner whichever way a ring runs, and so the two tests
// cannot both say yes or both say no.

/** Whether the point is inside the rings (even-odd rule). */
export function pointInRings(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    if (n < 6) continue;
    // A ring is closed whether or not its last point repeats its first.
    let x1 = ring[n - 2];
    let y1 = ring[n - 1];
    for (let i = 0; i < n; i += 2) {
      const x2 = ring[i];
      const y2 = ring[i + 1];
      if (y1 > y !== y2 > y) {
        // Always from the lower end, so a shared edge gives the same answer in both of its areas.
        const at = y1 < y2 ? x1 + ((y - y1) * (x2 - x1)) / (y2 - y1) : x2 + ((y - y2) * (x1 - x2)) / (y1 - y2);
        if (x < at) inside = !inside;
      }
      x1 = x2;
      y1 = y2;
    }
  }
  return inside;
}

const KM_PER_DEGREE = 111.195;

/** The distance in kilometres from a point to the nearest edge of the rings (flat-earth arithmetic: for short distances only). */
export function kmToRings(rings, x, y) {
  const shrink = Math.cos((y * Math.PI) / 180);
  let best = Infinity;
  for (const ring of rings) {
    const n = ring.length;
    if (n < 4) continue;
    let ax = (ring[n - 2] - x) * shrink;
    let ay = ring[n - 1] - y;
    for (let i = 0; i < n; i += 2) {
      const bx = (ring[i] - x) * shrink;
      const by = ring[i + 1] - y;
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = px * px + py * py;
      if (d < best) best = d;
      ax = bx;
      ay = by;
    }
  }
  return Math.sqrt(best) * KM_PER_DEGREE;
}

function boxOf(ring) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    if (ring[i] < west) west = ring[i];
    if (ring[i] > east) east = ring[i];
    if (ring[i + 1] < south) south = ring[i + 1];
    if (ring[i + 1] > north) north = ring[i + 1];
  }
  return [west, south, east, north];
}

/**
 * An index over areas. `locate(lng, lat)` answers { id, km: 0 } for the area
 * the point is in. With `nearKm`, a point in no area is given to the nearest
 * one whose edge is within that distance ({ id, km }): a plant on a pier, or
 * a coordinate a few metres into the water, where a boundary drawn at the
 * shoreline leaves it outside. Null when there is none. `among` narrows the
 * search to the areas it answers true for (the counties of one state).
 *
 * `cell` is the grid's step in degrees. Each ring is entered under the cells
 * its own box touches, so an area made of far-apart islands (or one that
 * crosses the 180th meridian, as the western Aleutians do) is not a candidate
 * for everything in between.
 */
export function areaIndex(areas, { cell = 0.25 } = {}) {
  const columns = Math.ceil(360 / cell);
  const keyOf = (cx, cy) => cy * columns + cx;
  const cellX = (lng) => Math.min(columns - 1, Math.max(0, Math.floor((lng + 180) / cell)));
  const cellY = (lat) => Math.max(0, Math.floor((lat + 90) / cell));
  const grid = new Map();
  // Each area's rings with their boxes: a ring whose box does not hold the
  // point is crossed an even number of times, so it can be skipped.
  const boxed = areas.map((area) => area.rings.filter((ring) => ring.length >= 6).map((ring) => ({ ring: [ring], box: boxOf(ring) })));
  const inside = (position, x, y) => {
    let within = false;
    for (const { ring, box } of boxed[position]) {
      if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
      if (pointInRings(ring, x, y)) within = !within;
    }
    return within;
  };
  areas.forEach((area, position) => {
    for (const { box } of boxed[position]) {
      const [west, south, east, north] = box;
      for (let cy = cellY(south); cy <= cellY(north); cy++) {
        for (let cx = cellX(west); cx <= cellX(east); cx++) {
          const key = keyOf(cx, cy);
          const list = grid.get(key);
          if (!list) grid.set(key, [position]);
          else if (list[list.length - 1] !== position) list.push(position);
        }
      }
    }
  });

  function locate(lng, lat, { nearKm = 0, among = null } = {}) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const cx = cellX(lng);
    const cy = cellY(lat);
    for (const position of grid.get(keyOf(cx, cy)) ?? []) {
      if (among && !among(areas[position])) continue;
      if (inside(position, lng, lat)) return { id: areas[position].id, km: 0 };
    }
    if (!(nearKm > 0)) return null;
    // The cells around the point reach further than any distance worth calling near.
    const reach = Math.max(1, Math.ceil(nearKm / (KM_PER_DEGREE * cell * Math.max(0.05, Math.cos((lat * Math.PI) / 180)))));
    const seen = new Set();
    let best = null;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = (((cx + dx) % columns) + columns) % columns;
        for (const position of grid.get(keyOf(x, cy + dy)) ?? []) {
          if (seen.has(position)) continue;
          seen.add(position);
          if (among && !among(areas[position])) continue;
          const km = kmToRings(areas[position].rings, lng, lat);
          if (km <= nearKm && (best === null || km < best.km)) best = { id: areas[position].id, km };
        }
      }
    }
    return best;
  }

  return { locate };
}
