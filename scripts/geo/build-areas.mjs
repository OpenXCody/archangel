#!/usr/bin/env node
// Builds a focus area's boundary from the counties of its metro area, the way
// client/public/data/areas/austin.geojson was made: the US Census Bureau's
// county shapes as us-atlas publishes them (counties-10m.json, the 1:10,000,000
// cartographic boundaries as TopoJSON), the counties merged into one outline
// (the arcs two of them share fall away), points rounded to four decimals.
//
//   node scripts/geo/build-areas.mjs --atlas counties-10m.json <id> <name> <fips,fips,...> [...]
//   node scripts/geo/build-areas.mjs --atlas counties-10m.json --out <dir> <id> <name> <fips,...>   (somewhere else)
//
// For each area it writes client/public/data/areas/<id>.geojson and prints the
// ring and the box to paste into FOCUS_AREAS (shared/scope.ts), which the server
// counts with: the two must stay the same points (tests/unit/shared.unit.ts
// holds them to the file). The atlas file stays outside the repository
// (https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AREAS = path.join(ROOT, 'client', 'public', 'data', 'areas');
const round = (n) => Math.round(n * 1e4) / 1e4;

/** Every arc of a topology as [longitude, latitude] points. */
export function decodeArcs(topology) {
  const { scale, translate } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

/**
 * The outline of the named counties together: an arc used by two of them is
 * inside the area and falls away; the rest are chained into rings. Polygons,
 * each [outer ring, ...holes], points rounded to four decimals.
 */
export function mergeCounties(topology, fips) {
  const arcs = decodeArcs(topology);
  const wanted = new Set(fips);
  const geometries = topology.objects.counties.geometries.filter((g) => wanted.has(String(g.id)));
  const missing = [...wanted].filter((id) => !geometries.some((g) => String(g.id) === id));
  if (missing.length) throw new Error(`no county ${missing.join(', ')} in the atlas`);
  const used = new Map();
  const rings = [];
  for (const g of geometries) {
    const polygons = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    for (const polygon of polygons) for (const ring of polygon) {
      rings.push(ring);
      for (const i of ring) {
        const k = i < 0 ? ~i : i;
        used.set(k, (used.get(k) ?? 0) + 1);
      }
    }
  }
  // The arcs on the edge, each in the direction its county runs it.
  const edge = [];
  for (const ring of rings) for (const i of ring) if (used.get(i < 0 ? ~i : i) === 1) edge.push(i < 0 ? [...arcs[~i]].reverse() : arcs[i]);
  const key = ([x, y]) => `${x.toFixed(9)},${y.toFixed(9)}`;
  const from = new Map();
  edge.forEach((points, n) => {
    const k = key(points[0]);
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(n);
  });
  const done = new Set();
  const out = [];
  for (let start = 0; start < edge.length; start += 1) {
    if (done.has(start)) continue;
    const ring = [...edge[start]];
    done.add(start);
    for (let guard = 0; guard < edge.length; guard += 1) {
      const end = key(ring[ring.length - 1]);
      if (end === key(ring[0])) break;
      const next = (from.get(end) ?? []).find((n) => !done.has(n));
      if (next === undefined) throw new Error('the outline does not close');
      done.add(next);
      ring.push(...edge[next].slice(1));
    }
    const points = [];
    for (const [x, y] of ring) {
      const p = [round(x), round(y)];
      const last = points[points.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
    }
    if (points.length >= 4) out.push(points);
  }
  // Outer rings and holes: a ring inside another is that one's hole.
  const area = (r) => r.reduce((s, [x1, y1], i) => (i ? s + (r[i - 1][0] * y1 - x1 * r[i - 1][1]) : 0), 0) / 2;
  const inside = ([x, y], r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  out.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const polygons = [];
  for (const ring of out) {
    const holder = polygons.find((p) => inside(ring[0], p[0]));
    if (holder) holder.push(ring);
    else polygons.push([ring]);
  }
  return polygons;
}

/** The box around every point: [[west, south], [east, north]]. */
export function boxOf(polygons) {
  const points = polygons.flat(2);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

export function areaFile({ id, name, counties, polygons }) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id,
        properties: { id, name, counties, source: 'us-atlas counties-10m (US Census Bureau cartographic boundaries)' },
        geometry: { type: 'MultiPolygon', coordinates: polygons },
      },
    ],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--atlas');
  if (at < 0) throw new Error('give --atlas <counties-10m.json>');
  const topology = JSON.parse(readFileSync(args[at + 1], 'utf8'));
  const to = args.indexOf('--out');
  const dir = to < 0 ? AREAS : args[to + 1];
  const rest = args.filter((_, i) => i !== at && i !== at + 1 && i !== to && i !== to + 1);
  const names = new Map(topology.objects.counties.geometries.map((g) => [String(g.id), g.properties?.name]));
  for (let i = 0; i + 2 < rest.length + 1; i += 3) {
    const [id, name, list] = rest.slice(i, i + 3);
    if (!id || !name || !list) break;
    const fips = list.split(',').map((s) => s.trim()).filter(Boolean);
    const polygons = mergeCounties(topology, fips);
    const counties = fips.map((f) => names.get(f)).sort();
    const file = areaFile({ id, name, counties, polygons });
    file.features[0].properties.fips = fips;
    writeFileSync(path.join(dir, `${id}.geojson`), JSON.stringify(file));
    const [outer] = polygons;
    console.log(`${id}: ${counties.join(', ')}; ${polygons.length} part${polygons.length === 1 ? '' : 's'} (${polygons.map((p) => p[0].length).join(', ')} points), ring of ${outer[0].length}`);
    console.log(`  bounds: ${JSON.stringify(boxOf(polygons))}`);
    console.log(`  ring: ${JSON.stringify(outer[0])}`);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
