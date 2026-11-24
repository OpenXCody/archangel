import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import {
  TAU,
  arcPath,
  arcPathReversed,
  between,
  branchPath,
  cameraOn,
  cameraWhole,
  leafWeight,
  locate,
  placeLabels,
  point,
  project,
  sectorPath,
  skeletonPath,
  spreadRound,
  stemsPath,
  turn,
  unproject,
  type AtlasCamera,
  type AtlasDomain,
  type AtlasGroup,
  type AtlasLabel,
  type AtlasLayout,
  type AtlasLeaf,
} from './layout';
import { routePath, shareDash, walkOf } from './walk';

/**
 * The Atlas as a drawing: one SVG, drawn from the layout's arithmetic.
 *
 * It is built in layers so that nothing but the layer concerned is rendered
 * again: the plate itself (`Plate`: the skeleton of branches, the rim and
 * every leaf) is rendered once per taxonomy; turning and enlarging is one
 * transform on the group that holds it; a career laid over it, a person's
 * marks, the names beside the open domain and what the pointer is over are
 * each a handful of elements drawn on top. The pointer is read with
 * arithmetic (which angle, which radius, which row of names), so no leaf
 * carries a listener.
 *
 * The plate is quiet on purpose: the branches are one faint skeleton of
 * curves from the centre to the groups, the skills are small marks of nearly
 * one size, brighter the more careers use them, and colour is a legend: each
 * domain's hairline on the rim, and a tint on its leaves.
 *
 * To a screen reader the drawing is one image; the tree itself is the panel
 * beside it (`AtlasPanel`), which is also what the keyboard uses.
 */

/** The plate's radius in the drawing's own units. */
const S = 500;

/**
 * How much wider than the plate the frame is: half the frame, in plate radii.
 * The domains' names take one line outside the rim, two for a long name on a
 * narrow plate, and a line is as tall on a small phone as on a large one, so
 * a narrow frame leaves the plate a little less of itself.
 */
function frameFor(width: number, ring: number): number {
  return Math.max(1.03, ring / (1 - 64 / Math.max(width, 200)));
}

/** What a press or the pointer lands on. */
export interface AtlasTarget {
  domain: AtlasDomain;
  group?: AtlasGroup;
  leaf?: AtlasLeaf;
}

/** Which skills a career laid over the atlas has, as positions in `layout.leaves`. */
export interface AtlasOverlay {
  first: ReadonlySet<number>;
  /** A second career, laid over the first. */
  second: ReadonlySet<number> | null;
}

export type AtlasMarks = ReadonlyMap<number, 'held' | 'learning'>;

/** The leaf a person has just marked held, by its position in `layout.leaves`. */
export interface AtlasFresh {
  index: number;
  tick: number;
}

interface AtlasDrawingProps {
  layout: AtlasLayout;
  /** What is open: nothing (the whole atlas), a domain, one of its groups, one of that group's skills. */
  domain: AtlasDomain | null;
  group: AtlasGroup | null;
  leaf: AtlasLeaf | null;
  overlay: AtlasOverlay | null;
  marks: AtlasMarks | null;
  /**
   * A seeker is filling the one career laid over the atlas in: its skills
   * still ahead are open marks, the way to each held one is drawn bright from
   * the centre, and the centre is the ring of how much is held.
   */
  walk?: boolean;
  /** The skill just marked held (`tick` changes with every mark): its way is drawn in once, and its leaf answers. */
  fresh?: AtlasFresh | null;
  /** What the pointer, or the keyboard in the panel, is on. */
  preview: AtlasTarget | null;
  onPreview: (target: AtlasTarget | null) => void;
  onChoose: (target: AtlasTarget) => void;
  /** Said to a screen reader in place of the picture. */
  label: string;
  className?: string;
}

const deg = (radians: number) => (radians * 180) / Math.PI;
const fixed = (value: number, digits = 2) => Number(value.toFixed(digits));

/**
 * A leaf's radius on the plate. A skill more careers use is a little larger
 * and much brighter (`leafOpacity`): the sizes stay in a narrow range, so no
 * mark covers its neighbours.
 */
function dotRadius(layout: AtlasLayout, leaf: AtlasLeaf): number {
  return 0.0048 + 0.0026 * leafWeight(leaf.careers, layout.maxCareers);
}

function leafOpacity(layout: AtlasLayout, leaf: AtlasLeaf): number {
  return 0.42 + 0.58 * leafWeight(leaf.careers, layout.maxCareers);
}

// ---------------------------------------------------------------------------
// The plate: drawn once
// ---------------------------------------------------------------------------

const Plate = memo(function Plate({ layout }: { layout: AtlasLayout }) {
  const g = layout.geometry;
  const skeleton = useMemo(() => skeletonPath(layout, S), [layout]);

  return (
    <>
      {/* The branches from the centre to every group, as one faint path: the tree is there, and stays behind its skills. */}
      <path className="atlas-skeleton" d={skeleton} />
      <circle className="atlas-root" r={g.root * S} />
      {/* A domain's rim hairline and its leaves take the domain's hue (`[data-domain]` in globals.css). */}
      {layout.domains.map((domain) => (
        <g key={domain.slug} data-domain={domain.slug}>
          <path className="atlas-ring" d={arcPath(g.ring, domain.from, domain.to, S)} />
          {layout.leaves.slice(domain.first, domain.last + 1).map((leaf) => {
            const [x, y] = point(leaf.angle, leaf.radius);
            return (
              <circle
                key={leaf.id}
                className="atlas-leaf"
                cx={fixed(x * S)}
                cy={fixed(y * S)}
                r={fixed(dotRadius(layout, leaf) * S)}
                opacity={fixed(leafOpacity(layout, leaf))}
              />
            );
          })}
        </g>
      ))}
    </>
  );
});

/** The open group's skills, drawn again at full strength: the rest of the plate steps back under them. */
const OpenLeaves = memo(function OpenLeaves({ layout, group, hued }: { layout: AtlasLayout; group: AtlasGroup; hued: boolean }) {
  const domain = layout.domains[group.domain];
  return (
    <g data-domain={hued ? domain.slug : undefined} data-atlas-open={group.slug}>
      {layout.leaves.slice(group.first, group.last + 1).map((leaf) => {
        const [x, y] = point(leaf.angle, leaf.radius);
        return <circle key={leaf.id} className="atlas-open-leaf" cx={fixed(x * S)} cy={fixed(y * S)} r={fixed((dotRadius(layout, leaf) + 0.0008) * S)} />;
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// A career laid over it, and a person's own marks
// ---------------------------------------------------------------------------

const Overlay = memo(function Overlay({ layout, overlay, ahead }: { layout: AtlasLayout; overlay: AtlasOverlay; ahead: boolean }) {
  const parts = useMemo(() => {
    const shared: number[] = [];
    const firstOnly: number[] = [];
    const secondOnly: number[] = [];
    for (const index of overlay.first) (overlay.second?.has(index) ? shared : firstOnly).push(index);
    if (overlay.second) for (const index of overlay.second) if (!overlay.first.has(index)) secondOnly.push(index);
    // The domains the careers reach keep their hue on the rim; the rest of the plate has stepped back to ink.
    const reached = new Set<number>();
    for (const index of overlay.first) reached.add(layout.leaves[index].domain);
    if (overlay.second) for (const index of overlay.second) reached.add(layout.leaves[index].domain);
    return {
      reached: layout.domains.filter((domain) => reached.has(domain.index)),
      shared,
      firstOnly,
      secondOnly,
      first: branchPath(layout, overlay.first, S),
      second: secondOnly.length > 0 ? branchPath(layout, secondOnly, S) : '',
      both: shared.length > 0 ? branchPath(layout, shared, S) : '',
    };
  }, [layout, overlay]);

  const dot = (index: number, kind: 'first' | 'second' | 'shared') => {
    const leaf = layout.leaves[index];
    const [x, y] = point(leaf.angle, leaf.radius);
    const r = Math.max(dotRadius(layout, leaf) + 0.0018, 0.0085);
    return (
      <g key={leaf.id} data-atlas-lit={kind}>
        {kind === 'shared' && <circle className="atlas-lit-halo" cx={fixed(x * S)} cy={fixed(y * S)} r={fixed((r + 0.0062) * S)} />}
        {/* While a person fills the career in, a skill of it is an open mark until it is held: the Marks layer fills it. */}
        <circle className="atlas-lit-dot" data-second={kind === 'second' || undefined} data-ahead={ahead || undefined} cx={fixed(x * S)} cy={fixed(y * S)} r={fixed(r * S)} />
      </g>
    );
  };

  return (
    <g data-atlas-ahead={ahead || undefined}>
      {parts.reached.map((domain) => (
        <path key={domain.slug} className="atlas-ring" data-domain={domain.slug} data-atlas-reached={domain.slug} d={arcPath(layout.geometry.ring, domain.from, domain.to, S)} />
      ))}
      {parts.second && <path className="atlas-lit" data-second d={parts.second} />}
      <path className="atlas-lit" d={parts.first} />
      {parts.both && <path className="atlas-lit" data-shared d={parts.both} />}
      {parts.secondOnly.map((index) => dot(index, 'second'))}
      {parts.firstOnly.map((index) => dot(index, 'first'))}
      {parts.shared.map((index) => dot(index, 'shared'))}
    </g>
  );
});

const Marks = memo(function Marks({
  layout,
  marks,
  overlay,
  fresh,
}: {
  layout: AtlasLayout;
  marks: AtlasMarks;
  overlay: AtlasOverlay | null;
  /** The leaf just marked: its mark arrives above the plate, and the lasting one here waits, unseen, until it has. */
  fresh: number | null;
}) {
  return (
    <g>
      {[...marks].map(([index, status]) => {
        const leaf = layout.leaves[index];
        if (!leaf) return null;
        const [x, y] = point(leaf.angle, leaf.radius);
        const r = Math.max(dotRadius(layout, leaf) + 0.002, 0.0095) * S;
        // A skill of the career laid over the atlas keeps the accent as the mark's rim.
        const lit = overlay ? overlay.first.has(index) || Boolean(overlay.second?.has(index)) : false;
        const cx = fixed(x * S);
        const cy = fixed(y * S);
        return (
          <g key={leaf.id} className="atlas-mark-at" data-atlas-mark={status} data-atlas-mark-of={leaf.id} data-arriving={fresh === index || undefined}>
            <circle className="atlas-mark" data-status={status} data-lit={lit || undefined} cx={cx} cy={cy} r={fixed(r)} />
            {/* Learning: the same half-filled ring the skill carries in every list. */}
            {status === 'learning' && <path className="atlas-mark-half" d={`M${cx} ${fixed(cy - r)}A${fixed(r)} ${fixed(r)} 0 0 0 ${cx} ${fixed(cy + r)}Z`} />}
          </g>
        );
      })}
    </g>
  );
});

/**
 * A career, part walked: the way from the centre out to each skill of it the
 * person holds, drawn bright over the career's own branches. A mark changing
 * adds or removes one line here; the plate under it is not drawn again.
 */
const Walk = memo(function Walk({
  layout,
  career,
  marks,
  arriving,
}: {
  layout: AtlasLayout;
  career: ReadonlySet<number>;
  marks: AtlasMarks | null;
  /** The leaf whose way is being drawn in above the plate: its lasting line waits, unseen, until that is done. */
  arriving: number | null;
}) {
  const walk = useMemo(() => walkOf(career, (index) => marks?.get(index)), [career, marks]);
  return (
    <g data-atlas-walk data-atlas-whole-career={walk.whole || undefined}>
      {walk.heldLeaves.map((index) => {
        const leaf = layout.leaves[index];
        return <path key={leaf.id} className="atlas-walked" data-atlas-walked={leaf.id} data-arriving={arriving === index || undefined} d={routePath(layout, leaf, S)} />;
      })}
    </g>
  );
});

/**
 * What moves when a career is being filled in, kept off the plate: these few
 * elements are a drawing of their own, laid exactly over the plate and turned
 * by the same camera, so their motion paints them and never the plate's 700
 * elements under them.
 *
 * At the centre, where every trunk leaves from, the ring of how much of the
 * career is held: the one the career's page carries, which closes when the
 * career is whole. And for the skill just marked: the way to it drawn in from
 * the centre, its mark arriving, and one ring that opens from the leaf and is
 * gone. When that is done the lasting line and mark on the plate are shown
 * and these are taken away.
 */
const Moving = memo(function Moving({
  layout,
  career,
  marks,
  fresh,
  unit,
}: {
  layout: AtlasLayout;
  career: ReadonlySet<number>;
  marks: AtlasMarks | null;
  fresh: AtlasFresh | null;
  /** One CSS pixel in the drawing's units, as the plate is enlarged now. */
  unit: number;
}) {
  const walk = useMemo(() => walkOf(career, (index) => marks?.get(index)), [career, marks]);
  const r = layout.geometry.root * S;
  const ring = shareDash(walk, r);
  const arriving = fresh && marks?.get(fresh.index) === 'held' ? layout.leaves[fresh.index] : null;
  const [x, y] = arriving ? point(arriving.angle, arriving.radius) : [0, 0];
  const markR = arriving ? Math.max(dotRadius(layout, arriving) + 0.002, 0.0095) * S : 0;
  return (
    <>
      {arriving && fresh && (
        <g key={fresh.tick} data-atlas-arriving={arriving.id}>
          {career.has(arriving.index) && <path className="atlas-walk-in" pathLength={1} strokeWidth={fixed(1.5 * unit, 3)} d={routePath(layout, arriving, S)} />}
          <circle className="atlas-mark-in" cx={fixed(x * S)} cy={fixed(y * S)} r={fixed(markR)} />
          <circle className="atlas-pulse" cx={fixed(x * S)} cy={fixed(y * S)} r={fixed((dotRadius(layout, arriving) + 0.012) * S)} />
        </g>
      )}
      <circle className="atlas-share-bed" r={fixed(r * 1.34)} />
      <circle className="atlas-share-track" r={fixed(r)} strokeWidth={fixed(r * 0.2, 3)} />
      <circle
        className="atlas-share"
        data-atlas-share={`${walk.held}/${walk.total}`}
        r={fixed(r)}
        strokeWidth={fixed(r * 0.34, 3)}
        strokeDasharray={ring.dash}
        transform="rotate(-90)"
        opacity={walk.held > 0 ? 1 : 0}
      />
      {walk.whole && (
        <g className="atlas-share-whole">
          <circle r={fixed(r * 1.1)} />
          <path d={`M${fixed(-0.48 * r)} ${fixed(0.04 * r)}L${fixed(-0.16 * r)} ${fixed(0.36 * r)}L${fixed(0.48 * r)} ${fixed(-0.32 * r)}`} strokeWidth={fixed(r * 0.25, 3)} />
        </g>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Measuring text, to know what fits
// ---------------------------------------------------------------------------

let measurer: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, fontPx: number, weight: number, tracking = 0): number {
  if (measurer === undefined) measurer = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!measurer) return text.length * fontPx * (0.56 + tracking);
  measurer.font = `${weight} ${fontPx}px "Oxanium Variable", ui-sans-serif, system-ui, sans-serif`;
  return measurer.measureText(text).width + tracking * fontPx * text.length;
}

/** The text, cut to a width with an ellipsis when it is longer. */
function fitted(text: string, maxPx: number, fontPx: number, weight: number): string {
  if (textWidth(text, fontPx, weight) <= maxPx) return text;
  let cut = text.length - 1;
  while (cut > 1 && textWidth(`${text.slice(0, cut).trimEnd()}…`, fontPx, weight) > maxPx) cut -= 1;
  return `${text.slice(0, cut).trimEnd()}…`;
}

/** Counts up once the page's font has loaded: what was measured before it must be measured again. */
function useFontsLoaded(): number {
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setLoaded(1);
    });
    return () => {
      live = false;
    };
  }, []);
  return loaded;
}

// ---------------------------------------------------------------------------
// The domains' names, set along the outer ring
// ---------------------------------------------------------------------------

const NAME_TRACKING = 0.04;

interface NamesProps {
  layout: AtlasLayout;
  /** The plate's radius in CSS pixels. */
  radiusPx: number;
  away: boolean;
  on: AtlasDomain | null;
  /** Domains a career laid over the atlas reaches; null when none is. */
  reached: ReadonlySet<number> | null;
}

/** The font size of the domains' names: as large as the plate's rim gives them room for. */
function nameSize(radiusPx: number): number {
  return radiusPx < 200 ? 10 : radiusPx < 290 ? 11 : 12.5;
}

/** A name of more than one word broken into two lines at the space nearest its middle. */
function twoLines(name: string): string[] {
  const spaces = [...name.matchAll(/ /g)].map((match) => match.index ?? 0);
  if (spaces.length === 0) return [name];
  const cut = spaces.reduce((best, at) => (Math.abs(at - name.length / 2) < Math.abs(best - name.length / 2) ? at : best));
  return [name.slice(0, cut), name.slice(cut + 1)];
}

/**
 * The names are set along the rim, each over its own domain, in ink: the
 * domain's hue is the hairline under it. None runs into another: neighbours
 * make room for each other along the row (`spreadRound`). They are one row
 * wherever they fit one: where they do not (a phone), a long name of several
 * words takes two lines in its own place, the longest first, until they fit.
 * On a plate smaller still, a career laid over it has only the domains it
 * reaches named; and with no career the names take two rows, every other
 * name on the outer one, so a name's neighbours on its row are two domains
 * away.
 */
const Names = memo(function Names({ layout, radiusPx, away, on, reached }: NamesProps) {
  const id = useId().replace(/:/g, '');
  const fonts = useFontsLoaded();
  const fontPx = nameSize(radiusPx);
  const names = useMemo(() => {
    const cap = 0.72 * fontPx;
    const lineGap = fontPx * 1.18;
    // The baseline nearest the rim, in pixels from the centre.
    const rim = layout.geometry.ring * radiusPx + 7;
    const width = (text: string) => textWidth(text, fontPx, 500, NAME_TRACKING);
    const air = fontPx * 1.2;

    /** One row of these domains' names round the rim, long names broken onto two lines until they fit. */
    const oneRow = (members: AtlasDomain[]) => {
      const lines = new Map(members.map((domain) => [domain.index, [domain.name]]));
      const sizes = () => members.map((domain) => (Math.max(...(lines.get(domain.index) ?? []).map(width)) + air) / rim);
      let placed = spreadRound(members.map((domain) => domain.angle), sizes());
      const breakable = members.filter((domain) => domain.name.includes(' ')).sort((a, b) => width(b.name) - width(a.name));
      for (const domain of breakable) {
        if (placed.overlap < 1e-6) break;
        lines.set(domain.index, twoLines(domain.name));
        placed = spreadRound(members.map((each) => each.angle), sizes());
      }
      return { fits: placed.overlap < 1e-6, set: members.map((domain, i) => ({ domain, lines: lines.get(domain.index) ?? [domain.name], angle: placed.placed[i], row: 0 })) };
    };

    const all = oneRow(layout.domains);
    let set = all.set;
    if (!all.fits) {
      const own = reached ? layout.domains.filter((domain) => reached.has(domain.index)) : [];
      const named = own.length > 0 ? oneRow(own) : null;
      if (named?.fits) set = named.set;
      else {
        // Two rows, the names taking them in turn round the rim.
        set = [];
        for (const row of [0, 1]) {
          const members = layout.domains.filter((domain) => domain.index % 2 === row);
          const radius = rim + row * lineGap * 1.3;
          const placed = spreadRound(members.map((domain) => domain.angle), members.map((domain) => (width(domain.name) + air) / radius));
          members.forEach((domain, i) => set.push({ domain, lines: [domain.name], angle: placed.placed[i], row }));
        }
        set.sort((a, b) => a.domain.index - b.domain.index);
      }
    }

    return set.map(({ domain, lines, angle, row }) => {
      // On the lower half the text runs the other way round the circle, so it is never upside down: there the first line is the inner one.
      const lower = turn(angle) > Math.PI / 2 && turn(angle) < (3 * Math.PI) / 2;
      const base = rim + row * lineGap * 1.3;
      const paths = lines.map((line, k) => {
        const baseline = (lower ? base + cap + k * lineGap : base + (lines.length - 1 - k) * lineGap) / radiusPx;
        const reach = Math.min(Math.PI * 0.9, (width(line) / 2 + fontPx) / (baseline * radiusPx));
        return lower ? arcPathReversed(baseline, angle - reach, angle + reach, S) : arcPath(baseline, angle - reach, angle + reach, S);
      });
      return { domain, lines, paths, row };
    });
    // `fonts`: measured again once the font is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, radiusPx, fontPx, fonts, reached]);

  return (
    <g className="atlas-names" data-away={away || undefined} fontSize={fixed((fontPx / radiusPx) * S)}>
      <defs>
        {names.flatMap(({ domain, paths }) => paths.map((d, k) => <path key={`${domain.slug}-${k}`} id={`${id}-${domain.index}-${k}`} d={d} />))}
      </defs>
      {names.map(({ domain, lines, row }) => (
        <text
          key={domain.slug}
          className="atlas-name"
          data-atlas-domain={domain.slug}
          data-row={row}
          data-lines={lines.length}
          data-on={on?.index === domain.index || undefined}
          // A career is laid over the atlas: the domains it does not reach step back.
          data-off={(reached && !reached.has(domain.index)) || undefined}
        >
          {lines.map((line, k) => (
            <textPath key={k} href={`#${id}-${domain.index}-${k}`} startOffset="50%" textAnchor="middle">
              {/* The space between two lines stays in the text, so the name reads whole to a screen reader and a test. */}
              {k < lines.length - 1 ? `${line} ` : line}
            </textPath>
          ))}
        </text>
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// The names beside the open domain
// ---------------------------------------------------------------------------

/** How the enlarged plate is framed, by the room there is. Lengths in frame units (plate radii) unless they say px. */
interface Zoom {
  scale: number;
  /** Where the rim, at the open domain's middle, is brought to: right of the frame's centre, left of the names. */
  anchorX: number;
  /** Where the column of names starts, and how wide it is. */
  labelX: number;
  labelPx: number;
  fontPx: number;
  groupPitchPx: number;
  skillPitchPx: number;
  /** The rows the names are kept between. */
  top: number;
  bottom: number;
}

/**
 * The open domain turned to three o'clock and enlarged so the whole of it,
 * from its groups' branches out to the rim, stands in the frame's left part
 * and its full height, and its names have a column of their own to the right
 * of the rim.
 */
function zoomFor(layout: AtlasLayout, domain: AtlasDomain | null, radiusPx: number, frame: number): Zoom {
  const phone = radiusPx < 240;
  const g = layout.geometry;
  const labelPx = phone ? Math.min(168, radiusPx * 0.96) : Math.min(250, radiusPx * 0.78);
  const gap = phone ? 14 : 22;
  const edge = 16 / radiusPx;
  const anchorX = frame - (labelPx + gap) / radiusPx;
  // From just inside the Fundamentals' band to the rim, across the frame's left part: every skill of the domain is in sight.
  let scale = (anchorX + frame - edge) / (g.ring - (g.bands[1].from - 0.045));
  // And the domain's whole sweep inside the frame's height.
  const half = domain ? Math.min(Math.PI / 2, Math.max(0.05, (domain.to - domain.from) / 2)) : 0.3;
  scale = Math.min(scale, (frame - 3 * edge) / (g.ring * Math.sin(half)));
  return {
    scale,
    anchorX,
    labelX: anchorX + gap / radiusPx,
    labelPx,
    fontPx: phone ? 11 : 12,
    groupPitchPx: phone ? 17 : 19,
    skillPitchPx: phone ? 17 : 19,
    top: -frame + 30 / radiusPx,
    bottom: frame - 30 / radiusPx,
  };
}

interface LabelsProps {
  layout: AtlasLayout;
  labels: AtlasLabel[];
  zoom: Zoom;
  camera: AtlasCamera;
  radiusPx: number;
  leaf: AtlasLeaf | null;
  preview: AtlasTarget | null;
  overlay: AtlasOverlay | null;
}

/**
 * The names beside the open domain, set level in one column to the right of
 * the rim, never turned with the plate: they are drawn in the frame's own
 * units, where the camera has put the plate. A group's name is joined to its
 * place on the rim by one smooth hairline. An open group's skills are named
 * in its place, and only the skill under the pointer, or chosen, is joined to
 * its leaf.
 */
const Labels = memo(function Labels({ layout, labels, zoom, camera, radiusPx, leaf, preview, overlay }: LabelsProps) {
  const g = layout.geometry;
  const fonts = useFontsLoaded();
  const texts = useMemo(
    () => labels.map((label) => fitted(label.text, zoom.labelPx - 6, zoom.fontPx, 500)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels, zoom.labelPx, zoom.fontPx, fonts]
  );
  // A pixel on screen, in frame units.
  const px = 1 / radiusPx;
  const lit = (index: number) => Boolean(overlay && (overlay.first.has(index) || overlay.second?.has(index)));
  const groupLit = (group: AtlasGroup) => {
    for (let i = group.first; i <= group.last; i++) if (lit(i)) return true;
    return false;
  };
  // A group is open: its skills are named, and the other groups' names step back.
  const opened = labels.some((label) => label.kind === 'skill');
  const end = zoom.labelX - 5 * px;
  /** A hairline from a point of the plate to a row of the column, leaving and arriving level. */
  const leader = (x: number, y: number, rowY: number) => {
    const reach = Math.max(6 * px, (end - x) * 0.55);
    return `M${fixed(x * S)} ${fixed(y * S)}C${fixed((x + reach) * S)} ${fixed(y * S)} ${fixed((end - reach) * S)} ${fixed(rowY * S)} ${fixed(end * S)} ${fixed(rowY * S)}`;
  };

  return (
    <g className="atlas-labels" fontSize={fixed(zoom.fontPx * px * S, 3)}>
      {labels.map((label, i) => {
        const skill = label.kind === 'skill';
        const chosen = skill && leaf?.index === label.index;
        const pointed = skill ? preview?.leaf?.index === label.index : !preview?.leaf && preview?.group?.index === label.index;
        // Under a career, the groups it does not reach step back. The open group's skills stay readable: the career's are in the accent.
        const quiet = !skill && overlay ? !groupLit(layout.groups[label.index]) : false;
        let line = '';
        if (!skill) {
          const [x, y] = project(camera, label.from, g.ring + 3 / (radiusPx * camera.scale));
          line = leader(x, y, label.y);
        } else if (chosen || pointed) {
          const named = layout.leaves[label.index];
          const [x, y] = project(camera, named.angle, named.radius);
          line = leader(x + dotRadius(layout, named) * camera.scale + 4 * px, y, label.y);
        }
        return (
          <g key={`${label.kind}-${label.index}`}>
            {line && <path className="atlas-leader" data-on={chosen || pointed || undefined} data-step={(!skill && opened) || undefined} d={line} />}
            <text
              className="atlas-label"
              data-atlas-label={label.kind}
              data-on={chosen || pointed || undefined}
              data-lit={(chosen || (skill && lit(label.index))) || undefined}
              data-quiet={quiet || undefined}
              data-step={(!skill && opened) || undefined}
              x={fixed(zoom.labelX * S)}
              y={fixed(label.y * S)}
              dy="0.35em"
            >
              {texts[i]}
            </text>
          </g>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

export default function AtlasDrawing({ layout, domain, group, leaf, overlay, marks, walk, fresh, preview, onPreview, onChoose, label, className }: AtlasDrawingProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // The frame's width in CSS pixels. Guessed from the window until it is measured, before the first paint.
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 358 : Math.min(window.innerWidth - 32, 720)));
  const [still, setStill] = useState(true);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const next = Math.round(svg.getBoundingClientRect().width);
      if (next > 0) setWidth((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  // The first frame is put in place, not flown to: a link that opens a domain opens on it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setStill(false));
    return () => cancelAnimationFrame(frame);
  }, []);

  const frame = frameFor(width, layout.geometry.ring);
  const box = S * frame;
  const radiusPx = width / (2 * frame);
  const zoom = useMemo(() => zoomFor(layout, domain, radiusPx, frame), [layout, domain, radiusPx, frame]);

  // The camera: the whole plate, or the open domain turned to three o'clock and enlarged.
  const turned = useRef(0);
  const camera: AtlasCamera = useMemo(() => {
    const next = domain ? cameraOn(domain.angle, zoom.scale, layout.geometry.ring, zoom.anchorX, turned.current) : cameraWhole(turned.current);
    turned.current = next.rotate;
    return next;
  }, [domain, zoom, layout]);

  const labels = useMemo(() => {
    if (!domain) return [];
    return placeLabels(layout, domain, group, camera, {
      group: zoom.groupPitchPx / radiusPx,
      skill: zoom.skillPitchPx / radiusPx,
      top: zoom.top,
      bottom: zoom.bottom,
    });
  }, [layout, domain, group, camera, zoom, radiusPx]);

  /** What is at a point of the screen. */
  const targetAt = (clientX: number, clientY: number, fine: boolean): AtlasTarget | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const x = (((clientX - rect.left) / rect.width) * 2 - 1) * frame;
    const y = (((clientY - rect.top) / rect.height) * 2 - 1) * frame;
    const g = layout.geometry;
    const where = unproject(camera, x, y);
    if (!domain) {
      if (where.radius > 1 || where.radius < g.root) return null;
      const hit = locate(layout, where.angle);
      return hit && { domain: hit.domain };
    }
    if (x >= zoom.labelX - 8 / radiusPx) {
      // In the column of names: the row the point is on.
      let nearest: AtlasLabel | null = null;
      for (const candidate of labels) if (!nearest || Math.abs(candidate.y - y) < Math.abs(nearest.y - y)) nearest = candidate;
      if (!nearest || Math.abs(nearest.y - y) > (zoom.skillPitchPx * 0.55) / radiusPx) return null;
      return nearest.kind === 'skill'
        ? { domain, group: layout.groups[layout.leaves[nearest.index].group], leaf: layout.leaves[nearest.index] }
        : { domain, group: layout.groups[nearest.index] };
    }
    const hit = locate(layout, where.angle);
    if (!hit) return null;
    if (hit.domain.index !== domain.index) return where.radius > 1.25 ? null : { domain: hit.domain };
    // Inside the groups' tips is the domain itself.
    if (where.radius < g.group - 0.03) return { domain };
    // A mouse can pick one leaf of the open group; a finger picks the group, and its skills from the panel.
    if (fine && group && hit.group.index === group.index && where.radius < g.ring) {
      let best = hit.leaf;
      let bestDistance = Infinity;
      for (let i = group.first; i <= group.last; i++) {
        const candidate = layout.leaves[i];
        const distance = Math.hypot(between(candidate.angle, where.angle) * candidate.radius, candidate.radius - where.radius);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      return { domain, group, leaf: best };
    }
    return { domain, group: hit.group };
  };

  const sameTarget = (a: AtlasTarget | null, b: AtlasTarget | null) =>
    a?.domain.index === b?.domain.index && a?.group?.index === b?.group?.index && a?.leaf?.index === b?.leaf?.index;

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'mouse') return;
    const target = targetAt(event.clientX, event.clientY, true);
    if (!sameTarget(target, preview)) onPreview(target);
  };
  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
    const target = targetAt(event.clientX, event.clientY, fine);
    if (target) onChoose(target);
  };

  const g = layout.geometry;
  const reached = useMemo(() => {
    if (!overlay) return null;
    const domains = new Set<number>();
    for (const index of overlay.first) domains.add(layout.leaves[index].domain);
    if (overlay.second) for (const index of overlay.second) domains.add(layout.leaves[index].domain);
    return domains;
  }, [overlay, layout]);

  const cameraStyle: CSSProperties = {
    transform: `translate(${fixed(camera.x * S)}px, ${fixed(camera.y * S)}px) scale(${fixed(camera.scale, 4)}) rotate(${fixed(deg(camera.rotate), 4)}deg)`,
  };
  // One career, and a person filling it in. Two careers are compared, not walked.
  const walking = Boolean(walk && overlay && !overlay.second);
  const pointed = preview && (!domain || preview.domain.index !== domain.index) ? preview.domain : null;
  const pointedGroup = domain && preview?.group && preview.domain.index === domain.index && !preview.leaf ? preview.group : null;
  const ringed = preview?.leaf ?? leaf;
  const half = (g.domainGap / 2) * layout.step;
  // A group's own share of the plate, from its branch's tip to the rim.
  const groupSector = (each: AtlasGroup) => sectorPath(g.group, g.ring, each.a0 - 0.5 * layout.step, each.a1 + 0.5 * layout.step, S);

  const view = leaf ? 'skill' : group ? 'group' : domain ? 'domain' : 'whole';
  const viewBox = `${fixed(-box)} ${fixed(-box)} ${fixed(2 * box)} ${fixed(2 * box)}`;
  // The leaf whose mark is arriving: only while it is held, and only where there is a drawing above the plate to arrive in.
  const arriving = walking && fresh && marks?.get(fresh.index) === 'held' ? fresh.index : null;

  return (
    <div className="atlas-stack">
    <svg
      ref={svgRef}
      role="img"
      aria-label={label}
      viewBox={viewBox}
      className={`atlas-plate ${className ?? ''}`}
      data-still={still || undefined}
      data-atlas-view={view}
      data-atlas-over={overlay ? true : undefined}
      data-atlas-walking={walking || undefined}
      style={{ cursor: preview ? 'pointer' : undefined }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => preview && onPreview(null)}
      onClick={onClick}
    >
      <g className="atlas-camera" style={cameraStyle}>
        <g className="atlas-base" data-dim={overlay ? true : undefined} data-marked={marks && marks.size > 0 ? true : undefined}>
          <Plate layout={layout} />
        </g>
        {pointed && <path className="atlas-hover" d={sectorPath(g.domain, g.ring, pointed.from, pointed.to, S)} />}
        {/* Everything but the open domain, veiled. */}
        {domain && <path key={`veil-${domain.slug}`} className="atlas-veil" d={sectorPath(0.0001, 3, domain.a1 + half, domain.a0 - half + TAU, S)} />}
        {/* An open group: its own branches, on from its tip to each of its skills, and its skills at full strength over the stepped-back plate. */}
        {group && <path key={`stems-${group.slug}`} className="atlas-stems" d={stemsPath(layout, group, S)} />}
        {group && <OpenLeaves layout={layout} group={group} hued={!overlay} />}
        {overlay && <Overlay layout={layout} overlay={overlay} ahead={walking} />}
        {walking && overlay && <Walk layout={layout} career={overlay.first} marks={marks} arriving={arriving} />}
        {marks && marks.size > 0 && <Marks layout={layout} marks={marks} overlay={overlay} fresh={arriving} />}
        {pointedGroup && <path className="atlas-hover" d={groupSector(pointedGroup)} />}
        {group && <path className="atlas-chosen-arc" d={arcPath(g.ring, group.a0 - 0.5 * layout.step, group.a1 + 0.5 * layout.step, S)} />}
        {ringed && (
          <circle
            className="atlas-chosen"
            data-atlas-chosen={ringed.id}
            cx={fixed(point(ringed.angle, ringed.radius)[0] * S)}
            cy={fixed(point(ringed.angle, ringed.radius)[1] * S)}
            r={fixed((dotRadius(layout, ringed) + (domain ? 0.006 : 0.012)) * S)}
          />
        )}
        <Names layout={layout} radiusPx={radiusPx} away={Boolean(domain)} on={pointed} reached={reached} />
      </g>
      {/* The names beside the open domain stand level, in the frame's own units: they never turn with the plate. */}
      {domain && (
        <Labels key={domain.slug} layout={layout} labels={labels} zoom={zoom} camera={camera} radiusPx={radiusPx} leaf={leaf} preview={preview} overlay={overlay} />
      )}
    </svg>
    {/* What moves while a career is filled in: a drawing of its own over the plate, under the same camera. */}
    {walking && overlay && (
      <svg aria-hidden="true" viewBox={viewBox} className="atlas-moving" data-still={still || undefined} data-atlas-view={view}>
        <g className="atlas-camera" style={cameraStyle}>
          <Moving layout={layout} career={overlay.first} marks={marks} fresh={fresh ?? null} unit={S / (radiusPx * camera.scale)} />
        </g>
      </svg>
    )}
    </div>
  );
}
