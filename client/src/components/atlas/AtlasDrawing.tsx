import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import {
  TAU,
  arcPath,
  arcPathReversed,
  between,
  branchPath,
  cameraOn,
  cameraWhole,
  domainPath,
  groupPath,
  leafWeight,
  locate,
  placeLabels,
  point,
  sectorPath,
  spokePath,
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
 * again: the plate itself (`Plate`: every branch and every leaf) is rendered
 * once per taxonomy; turning and enlarging is one transform on the group that
 * holds it; a career laid over it, a person's marks, the labels of the open
 * domain and what the pointer is over are each a handful of elements drawn on
 * top. The pointer is read with arithmetic (which angle, which radius), so
 * no leaf carries a listener.
 *
 * To a screen reader the drawing is one image; the tree itself is the panel
 * beside it (`AtlasPanel`), which is also what the keyboard uses.
 */

/** The plate's radius in the drawing's own units. */
const S = 500;

/**
 * How much wider than the plate the frame is: half the frame, in plate radii.
 * The domains' names take two rows outside the ring, and a row is as tall on
 * a small phone as on a large one, so a narrow frame leaves the plate a
 * little less of itself.
 */
function frameFor(width: number, ring: number): number {
  return Math.max(1.02, ring / (1 - 54 / Math.max(width, 200)));
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

/** A leaf's radius on the plate, by how many careers use the skill. */
function dotRadius(layout: AtlasLayout, leaf: AtlasLeaf): number {
  return 0.0048 + 0.01 * Math.pow(leafWeight(leaf.careers, layout.maxCareers), 1.6);
}

// ---------------------------------------------------------------------------
// The plate: drawn once
// ---------------------------------------------------------------------------

const Plate = memo(function Plate({ layout }: { layout: AtlasLayout }) {
  const g = layout.geometry;
  const shapes = useMemo(() => {
    let wash = '';
    let trunks = '';
    let fans = '';
    let groupRing = '';
    let ring = '';
    for (const domain of layout.domains) {
      // Every other sector carries a faint wash, so the sixteen read as sixteen.
      if (domain.index % 2 === 1) wash += sectorPath(g.root, g.ring - 0.012, domain.from, domain.to, S);
      trunks += domainPath(layout, domain, S);
      ring += arcPath(g.ring, domain.from, domain.to, S);
    }
    for (const group of layout.groups) {
      fans += groupPath(layout, group, S);
      groupRing += arcPath(g.groupRing, group.a0 - 0.35 * layout.step, group.a1 + 0.35 * layout.step, S);
    }
    return { wash, trunks, fans, groupRing, ring };
  }, [layout, g]);

  return (
    <>
      <path className="atlas-wash" d={shapes.wash} />
      <path className="atlas-fan" d={shapes.fans} />
      <path className="atlas-trunk" d={shapes.trunks} />
      <circle className="atlas-root" r={g.root * S} />
      <path className="atlas-group-ring" d={shapes.groupRing} />
      <path className="atlas-ring" d={shapes.ring} />
      {layout.leaves.map((leaf) => {
        const [x, y] = point(leaf.angle, leaf.radius);
        const weight = leafWeight(leaf.careers, layout.maxCareers);
        return (
          <circle
            key={leaf.id}
            className="atlas-leaf"
            cx={fixed(x * S)}
            cy={fixed(y * S)}
            r={fixed(dotRadius(layout, leaf) * S)}
            opacity={fixed(0.5 + 0.5 * weight)}
          />
        );
      })}
    </>
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
    return {
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
    const r = Math.max(dotRadius(layout, leaf) + 0.002, 0.0085);
    return (
      <g key={leaf.id} data-atlas-lit={kind}>
        {kind === 'shared' && <circle className="atlas-lit-halo" cx={fixed(x * S)} cy={fixed(y * S)} r={fixed((r + 0.007) * S)} />}
        {/* While a person fills the career in, a skill of it is an open mark until it is held: the Marks layer fills it. */}
        <circle className="atlas-lit-dot" data-second={kind === 'second' || undefined} data-ahead={ahead || undefined} cx={fixed(x * S)} cy={fixed(y * S)} r={fixed(r * S)} />
      </g>
    );
  };

  return (
    <g data-atlas-ahead={ahead || undefined}>
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

/**
 * A name is set on the arc of its own domain. Where it is longer than the arc
 * (a short domain with a long name, on a phone) it moves to a second row
 * outside the first, so sixteen names fit a circle 358 pixels wide.
 */
const Names = memo(function Names({ layout, radiusPx, away, on, reached }: NamesProps) {
  const id = useId().replace(/:/g, '');
  const fonts = useFontsLoaded();
  const fontPx = radiusPx < 240 ? 9 : radiusPx < 330 ? 10.5 : 11.5;
  const names = useMemo(() => {
    const cap = 0.72 * fontPx;
    const first = layout.geometry.ring * radiusPx + 5;
    const rowGap = fontPx * 1.3;
    const lowerHalf = (domain: AtlasDomain) => turn(domain.angle) > Math.PI / 2 && turn(domain.angle) < (3 * Math.PI) / 2;
    const widths = layout.domains.map((domain) => textWidth(domain.name, fontPx, 500, NAME_TRACKING));
    // The angle a name takes on a row, from its middle to either end, with a little air.
    const half = (index: number, row: number) => (widths[index] / 2 + fontPx * 0.3) / (first + row * rowGap);
    // A name that fits its own arc is set on it, on the first row. The few that
    // do not are tried on either row, every way round, and the arrangement kept
    // is the one where names run into each other least, then the one that moves
    // the fewest out to the second row.
    const fits = (domain: AtlasDomain) => 2 * half(domain.index, 0) <= domain.to - domain.from + layout.geometry.domainGap * layout.step * 0.2;
    const rows = layout.domains.map(() => 0);
    const loose = layout.domains.filter((domain) => !fits(domain)).slice(0, 12);
    const overlap = () => {
      let total = 0;
      for (const a of layout.domains) {
        for (const b of layout.domains) {
          if (b.index <= a.index || rows[a.index] !== rows[b.index]) continue;
          total += Math.max(0, half(a.index, rows[a.index]) + half(b.index, rows[b.index]) - Math.abs(between(a.angle, b.angle)));
        }
      }
      return total;
    };
    let best = { cost: Infinity, choice: 0 };
    for (let choice = 0; choice < 1 << loose.length; choice++) {
      let moved = 0;
      loose.forEach((domain, bit) => {
        rows[domain.index] = (choice >> bit) & 1;
        moved += rows[domain.index];
      });
      const cost = overlap() * 1000 + moved;
      if (cost < best.cost) best = { cost, choice };
    }
    loose.forEach((domain, bit) => {
      rows[domain.index] = (best.choice >> bit) & 1;
    });
    return layout.domains.map((domain) => {
      const row = rows[domain.index];
      // On the lower half the text runs the other way round the circle, so it is never upside down.
      const lower = lowerHalf(domain);
      const baseline = (first + row * rowGap + (lower ? cap : 0)) / radiusPx;
      const reach = Math.min(Math.PI * 0.9, (widths[domain.index] / 2 + fontPx) / (baseline * radiusPx));
      const d = lower
        ? arcPathReversed(baseline, domain.angle - reach, domain.angle + reach, S)
        : arcPath(baseline, domain.angle - reach, domain.angle + reach, S);
      return { domain, d };
    });
    // `fonts`: measured again once the font is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, radiusPx, fontPx, fonts]);

  return (
    <g className="atlas-names" data-away={away || undefined} fontSize={fixed((fontPx / radiusPx) * S)}>
      <defs>
        {names.map(({ domain, d }) => (
          <path key={domain.slug} id={`${id}-${domain.index}`} d={d} />
        ))}
      </defs>
      {names.map(({ domain }) => (
        <text
          key={domain.slug}
          className="atlas-name"
          data-atlas-domain={domain.slug}
          data-on={on?.index === domain.index || undefined}
          opacity={reached && !reached.has(domain.index) ? 0.45 : undefined}
        >
          <textPath href={`#${id}-${domain.index}`} startOffset="50%" textAnchor="middle">
            {domain.name}
          </textPath>
        </text>
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// The labels of the open domain
// ---------------------------------------------------------------------------

/** How the enlarged plate is framed, by the room there is. */
interface Zoom {
  scale: number;
  /** Where the outer ring is brought to, in plate radii from the frame's centre. */
  anchorX: number;
  /** The radius the labels start at, and the room a label has, in CSS pixels. */
  labelRadius: number;
  labelRoomPx: number;
  fontPx: number;
  groupPitchPx: number;
  skillPitchPx: number;
}

function zoomFor(layout: AtlasLayout, radiusPx: number, frame: number): Zoom {
  const phone = radiusPx < 240;
  // A phone shows the open domain from its groups' arcs outward; a wider frame from the domain's own arc.
  const innermost = phone ? layout.geometry.group - 0.02 : layout.geometry.domain - 0.05;
  const labelRoomPx = phone ? 172 : Math.min(250, radiusPx * 0.72);
  const anchorX = frame - labelRoomPx / radiusPx;
  const scale = (anchorX + frame) / (layout.geometry.ring - innermost);
  return {
    scale,
    anchorX,
    labelRadius: layout.geometry.ring + 15 / (radiusPx * scale),
    labelRoomPx: labelRoomPx - 20,
    fontPx: phone ? 11 : 12,
    groupPitchPx: phone ? 14 : 16,
    skillPitchPx: phone ? 15 : 17,
  };
}

interface LabelsProps {
  layout: AtlasLayout;
  labels: AtlasLabel[];
  zoom: Zoom;
  radiusPx: number;
  leaf: AtlasLeaf | null;
  preview: AtlasTarget | null;
  overlay: AtlasOverlay | null;
}

const Labels = memo(function Labels({ layout, labels, zoom, radiusPx, leaf, preview, overlay }: LabelsProps) {
  const g = layout.geometry;
  const fonts = useFontsLoaded();
  const texts = useMemo(
    () => labels.map((label) => fitted(label.text, zoom.labelRoomPx - (label.kind === 'skill' ? 10 : 0), zoom.fontPx, 600)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels, zoom.labelRoomPx, zoom.fontPx, fonts]
  );
  // A pixel on screen, in plate radii, at this enlargement.
  const px = 1 / (radiusPx * zoom.scale);
  const lit = (index: number) => Boolean(overlay && (overlay.first.has(index) || overlay.second?.has(index)));
  const groupLit = (group: AtlasGroup) => {
    for (let i = group.first; i <= group.last; i++) if (lit(i)) return true;
    return false;
  };
  // A group is open: its skills are named, and the other groups' names step back.
  const opened = labels.some((label) => label.kind === 'skill');

  return (
    <g className="atlas-labels" fontSize={fixed((zoom.fontPx / (radiusPx * zoom.scale)) * S, 3)}>
      {labels.map((label, i) => {
        const skill = label.kind === 'skill';
        const chosen = skill && leaf?.index === label.index;
        const pointed = skill ? preview?.leaf?.index === label.index : !preview?.leaf && preview?.group?.index === label.index;
        // Under a career, the groups it does not reach step back. The open group's skills stay readable: the career's are in the accent.
        const quiet = label.far || (!skill && overlay ? !groupLit(layout.groups[label.index]) : false);
        // From the ring out to the label: a short stroke that leans to wherever the label found room.
        // A skill's name is set a step further out than a group's: it is one level down the tree.
        const radius = zoom.labelRadius + (skill ? 10 * px : 0);
        let leader = `M${at(label.from, g.ring + 4 * px)}L${at(label.angle, radius - 4 * px)}`;
        // A skill is tied to its leaf by a dotted line, as far as the ring of groups.
        const dotted = skill ? spokePath(label.from, layout.leaves[label.index].radius + 0.014, g.groupRing - 0.006, S) : '';
        if (!skill) leader = spokePath(label.from, g.groupRing + 2 * px, g.ring - 3 * px, S) + leader;
        return (
          <g key={`${label.kind}-${label.index}`}>
            {dotted && <path className="atlas-leader" data-dotted data-on={chosen || undefined} d={dotted} />}
            <path className="atlas-leader" data-on={chosen || undefined} data-quiet={label.far || undefined} d={leader} />
            <text
              className="atlas-label"
              data-atlas-label={label.kind}
              data-far={label.far || undefined}
              data-on={chosen || pointed || undefined}
              data-lit={(chosen || (skill && lit(label.index))) || undefined}
              data-quiet={quiet || undefined}
              data-step={(!skill && opened && !label.far) || undefined}
              transform={`rotate(${fixed(deg(label.angle) - 90, 3)}) translate(${fixed(radius * S)} 0)`}
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

const at = (angle: number, radius: number) => {
  const [x, y] = point(angle, radius);
  return `${fixed(x * S)} ${fixed(y * S)}`;
};

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
  const zoom = useMemo(() => zoomFor(layout, radiusPx, frame), [layout, radiusPx, frame]);

  // As far round the rim as the frame shows, from its middle to its top or bottom edge.
  const inSight = Math.asin(Math.min(1, frame / (zoom.labelRadius * zoom.scale)));
  const labelRadiusPx = zoom.labelRadius * radiusPx * zoom.scale;
  const labels = useMemo(() => {
    if (!domain) return [];
    // Named a little past the frame's edge, so a small turn of the plate does not run out of names.
    return placeLabels(layout, domain, group, { group: zoom.groupPitchPx / labelRadiusPx, skill: zoom.skillPitchPx / labelRadiusPx }, inSight * 1.5);
  }, [layout, domain, group, zoom, labelRadiusPx, inSight]);

  // The camera: the whole plate, or the open domain turned to three o'clock and
  // enlarged. An open group at the edge of a wide domain would name its skills
  // past the frame: the plate then turns just far enough to bring them in.
  const lean = useMemo(() => {
    if (!domain || !group) return 0;
    const named = labels.filter((label) => label.kind === 'skill');
    if (named.length === 0) return 0;
    // A name near the top or bottom of the frame runs out of it as it goes: the names are kept to the middle half.
    const edge = inSight * 0.5;
    const first = between(named[0].angle, domain.angle);
    const last = between(named[named.length - 1].angle, domain.angle);
    return first < -edge ? first + edge : last > edge ? last - edge : 0;
  }, [domain, group, labels, inSight]);
  const turned = useRef(0);
  const camera: AtlasCamera = useMemo(() => {
    const next = domain ? cameraOn(domain.angle + lean, zoom.scale, layout.geometry.ring, zoom.anchorX, turned.current) : cameraWhole(turned.current);
    turned.current = next.rotate;
    return next;
  }, [domain, lean, zoom, layout]);

  /** What is at a point of the screen. */
  const targetAt = (clientX: number, clientY: number, fine: boolean): AtlasTarget | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const x = (((clientX - rect.left) / rect.width) * 2 - 1) * frame;
    const y = (((clientY - rect.top) / rect.height) * 2 - 1) * frame;
    const where = unproject(camera, x, y);
    const g = layout.geometry;
    if (!domain) {
      if (where.radius > 1 || where.radius < g.root) return null;
      const hit = locate(layout, where.angle);
      return hit && { domain: hit.domain };
    }
    if (where.radius > g.ring + 6 / (radiusPx * zoom.scale)) {
      // Among the labels: the nearest one, if the point is on its line.
      const pitch = zoom.skillPitchPx / (zoom.labelRadius * radiusPx * zoom.scale);
      let nearest: AtlasLabel | null = null;
      for (const candidate of labels) {
        if (!nearest || Math.abs(between(candidate.angle, where.angle)) < Math.abs(between(nearest.angle, where.angle))) nearest = candidate;
      }
      if (nearest && Math.abs(between(nearest.angle, where.angle)) <= pitch * 0.75) {
        return nearest.kind === 'skill'
          ? { domain, group: layout.groups[layout.leaves[nearest.index].group], leaf: layout.leaves[nearest.index] }
          : { domain, group: layout.groups[nearest.index] };
      }
    }
    const hit = locate(layout, where.angle);
    if (!hit) return null;
    if (hit.domain.index !== domain.index) return where.radius > 1.25 ? null : { domain: hit.domain };
    // Inside the groups' arcs is the domain itself.
    if (where.radius < g.group - 0.03) return { domain };
    // A mouse can pick one leaf of the open group; a finger picks the group, and its skills from the panel.
    if (fine && group && hit.group.index === group.index && where.radius < g.groupRing) {
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
        {pointed && <path className="atlas-hover" d={sectorPath(g.root, g.ring - 0.012, pointed.from, pointed.to, S)} />}
        {/* Everything but the open domain, veiled. */}
        {domain && <path key={`veil-${domain.slug}`} className="atlas-veil" d={sectorPath(0.0001, 3, domain.a1 + half, domain.a0 - half + TAU, S)} />}
        {overlay && <Overlay layout={layout} overlay={overlay} ahead={walking} />}
        {walking && overlay && <Walk layout={layout} career={overlay.first} marks={marks} arriving={arriving} />}
        {marks && marks.size > 0 && <Marks layout={layout} marks={marks} overlay={overlay} fresh={arriving} />}
        {pointedGroup && (
          <path className="atlas-hover" d={sectorPath(g.group, g.ring - 0.012, pointedGroup.a0 - 0.5 * layout.step, pointedGroup.a1 + 0.5 * layout.step, S)} />
        )}
        {group && <path className="atlas-chosen-arc" d={arcPath(g.groupRing, group.a0 - 0.35 * layout.step, group.a1 + 0.35 * layout.step, S)} />}
        {ringed && (
          <circle
            className="atlas-chosen"
            data-atlas-chosen={ringed.id}
            cx={fixed(point(ringed.angle, ringed.radius)[0] * S)}
            cy={fixed(point(ringed.angle, ringed.radius)[1] * S)}
            r={fixed((dotRadius(layout, ringed) + (domain ? 0.007 : 0.014)) * S)}
          />
        )}
        <Names layout={layout} radiusPx={radiusPx} away={Boolean(domain)} on={pointed} reached={reached} />
        {domain && (
          <Labels key={domain.slug} layout={layout} labels={labels} zoom={zoom} radiusPx={radiusPx} leaf={leaf} preview={preview} overlay={overlay} />
        )}
      </g>
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
