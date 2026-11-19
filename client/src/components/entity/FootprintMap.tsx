import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useStatesOutline } from '../../lib/queries';

/**
 * Where a company's plants are: the lower 48 states drawn faintly, one dot per
 * plant. A quiet picture of a footprint, not an interactive map (the map page
 * is one tap away). It is plain SVG: the state shapes the map already uses,
 * projected here with an Albers equal-area conic, so it needs no map library
 * and no tiles.
 *
 * Plants outside the lower 48 (Alaska, Hawaii) are not drawn; the
 * caller lists every plant beside it.
 */

interface FootprintPoint {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
}

interface FootprintMapProps {
  points: FootprintPoint[];
  /** One point to mark as the subject (a plant among its company's others). */
  emphasis?: string;
  className?: string;
}

const NOT_DRAWN = new Set(['Alaska', 'Hawaii']);

// Albers equal-area conic, the standard for a US map: parallels 29.5° and
// 45.5°, centred on 96°W 37.5°N.
const RAD = Math.PI / 180;
const PHI1 = 29.5 * RAD;
const PHI2 = 45.5 * RAD;
const PHI0 = 37.5 * RAD;
const LAMBDA0 = -96 * RAD;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

/** Longitude/latitude to unit-less x/y (y grows downward, as SVG wants). */
function project(longitude: number, latitude: number): [number, number] {
  const rho = Math.sqrt(C - 2 * N * Math.sin(latitude * RAD)) / N;
  const theta = N * (longitude * RAD - LAMBDA0);
  return [rho * Math.sin(theta), -(RHO0 - rho * Math.cos(theta))];
}

// The drawing box: the projected extent of the lower 48, found from points
// around its edge (the projection curves, so the corners are not the extremes).
const EDGE: [number, number][] = [
  [-124.8, 48.4], [-124.6, 40.4], [-123, 49], [-117.1, 32.5], [-106.5, 31.7], [-97.4, 25.8], [-95, 49.4],
  [-89.5, 47.9], [-83.1, 46], [-81.8, 24.5], [-80.1, 25.8], [-75.5, 35.2], [-69.9, 41.3], [-67, 44.8], [-68, 47.4],
];
const EDGE_XY = EDGE.map(([longitude, latitude]) => project(longitude, latitude));
const MARGIN = 0.012;
const WEST = Math.min(...EDGE_XY.map(([x]) => x)) - MARGIN;
const EAST = Math.max(...EDGE_XY.map(([x]) => x)) + MARGIN;
const NORTH = Math.min(...EDGE_XY.map(([, y]) => y)) - MARGIN;
const SOUTH = Math.max(...EDGE_XY.map(([, y]) => y)) + MARGIN;
const WIDTH = 960;
const SCALE = WIDTH / (EAST - WEST);
const HEIGHT = Math.round((SOUTH - NORTH) * SCALE);

function toSvg(longitude: number, latitude: number): [number, number] {
  const [x, y] = project(longitude, latitude);
  return [(x - WEST) * SCALE, (y - NORTH) * SCALE];
}

function inLower48(longitude: number, latitude: number): boolean {
  return longitude > -125 && longitude < -66 && latitude > 24 && latitude < 50;
}

type Ring = [number, number][];

function ringPath(ring: Ring): string {
  let path = '';
  for (let i = 0; i < ring.length; i += 1) {
    const [x, y] = toSvg(ring[i][0], ring[i][1]);
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${path}Z`;
}

function statesPath(collection: GeoJSON.FeatureCollection): string {
  let path = '';
  for (const feature of collection.features) {
    const name = (feature.properties as { name?: string } | null)?.name;
    if (!name || NOT_DRAWN.has(name)) continue;
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') {
      for (const ring of geometry.coordinates) path += ringPath(ring as Ring);
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) for (const ring of polygon) path += ringPath(ring as Ring);
    }
  }
  return path;
}

export default function FootprintMap({ points, emphasis, className }: FootprintMapProps) {
  // The same file the map page loads, under the same query: fetched once for both.
  const { data: states } = useStatesOutline();

  const outline = useMemo(() => (states ? statesPath(states) : ''), [states]);
  const dots = useMemo(
    () =>
      points
        .filter((point) => inLower48(point.longitude, point.latitude))
        .map((point) => ({ ...point, position: toSvg(point.longitude, point.latitude) })),
    [points]
  );

  // Fewer sites, larger dots: three plants should not look like three specks.
  const radius = dots.length > 150 ? 3.5 : dots.length > 40 ? 5 : dots.length > 10 ? 6.5 : 9;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Map of ${dots.length} ${dots.length === 1 ? 'plant' : 'plants'} across the United States`}
      className={cn('block h-auto w-full', className)}
    >
      <path
        d={outline}
        fill="var(--color-bg-elevated)"
        stroke="var(--color-border-strong)"
        strokeWidth={1}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {dots.map((dot) => {
        const subject = dot.id === emphasis;
        // Around a marked site the others step back; the marked one is drawn last, on top.
        if (subject) return null;
        return (
          <circle
            key={dot.id}
            cx={dot.position[0]}
            cy={dot.position[1]}
            r={emphasis ? radius * 0.7 : radius}
            fill={emphasis ? 'var(--color-fg-soft)' : 'var(--color-fg-default)'}
            fillOpacity={dots.length > 40 ? 0.6 : 0.85}
            stroke="var(--color-bg-surface)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          >
            {dot.label && <title>{dot.label}</title>}
          </circle>
        );
      })}
      {dots
        .filter((dot) => dot.id === emphasis)
        .map((dot) => (
          <g key={dot.id}>
            <circle cx={dot.position[0]} cy={dot.position[1]} r={radius * 2.1} fill="rgb(var(--info))" fillOpacity={0.18} />
            <circle
              cx={dot.position[0]}
              cy={dot.position[1]}
              r={radius * 1.05}
              fill="var(--color-fg-default)"
              stroke="rgb(var(--info))"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            >
              {dot.label && <title>{dot.label}</title>}
            </circle>
          </g>
        ))}
    </svg>
  );
}
