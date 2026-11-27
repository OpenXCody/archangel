/**
 * The Atlas's ink: the one reader of colour for the wheel's canvas.
 *
 * It holds no colour. Every colour is a theme token read from the page when
 * asked (`readInk`): the canvas, the three inks, the accent and one hue per
 * core group (`--core-<slug>`, in the token file). A strength is never a
 * colour mixed here: it is a token drawn at an alpha, a `Tone`. `pen` and
 * `fill` set a tone on a canvas and multiply its strength with the alpha of
 * the layer being drawn (the wheel cross-fades whole layers), and they are
 * the only way the wheel sets a colour.
 */

/** A token's colour drawn at a strength. */
export interface Tone {
  color: string;
  alpha: number;
}

/** How strong a hue is where it steps back (the marks at the rim). */
const SOFT = 0.72;

export interface Ink {
  /** The canvas's colour as the token gives it: never painted, only compared, to know when the theme has changed. */
  bg: string;
  t1: Tone;
  t2: Tone;
  t3: Tone;
  ac: Tone;
  /** An ink at a strength: the meta ink (--text-3) unless another is named. */
  mix(t: number, to?: Tone): Tone;
  /** The hue of the core group at place k among the twelve; `soft` steps it back. One the token file has no hue for is ink. */
  hue(k: number, soft?: boolean): Tone;
  /** The page's typeface. */
  font: string;
}

/** The theme as it is on the page now. `core` is the core groups' slugs, in order round the wheel. */
export function readInk(core: readonly string[]): Ink {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const tone = (color: string): Tone => ({ color, alpha: 1 });
  const t1 = tone(v('--text-1'));
  const t2 = tone(v('--text-2'));
  const t3 = tone(v('--text-3'));
  const ac = tone(v('--accent'));
  const hues = core.map((slug) => v(`--core-${slug}`) || t3.color);
  return {
    bg: v('--bg'),
    t1,
    t2,
    t3,
    ac,
    mix: (t, to = t3) => ({ color: to.color, alpha: t }),
    hue: (k, soft = false) => ({ color: hues[k] ?? t3.color, alpha: soft ? SOFT : 1 }),
    font: getComputedStyle(document.body).fontFamily,
  };
}

/** Stroke with a tone, on a layer drawn at `layer` of full strength. */
export function pen(ctx: CanvasRenderingContext2D, tone: Tone, layer = 1): void {
  ctx.strokeStyle = tone.color;
  ctx.globalAlpha = layer * tone.alpha;
}

/** Fill with a tone, on a layer drawn at `layer` of full strength. */
export function fill(ctx: CanvasRenderingContext2D, tone: Tone, layer = 1): void {
  ctx.fillStyle = tone.color;
  ctx.globalAlpha = layer * tone.alpha;
}
