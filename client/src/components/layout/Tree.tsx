import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, labelClass } from '@/lib/utils';
import { useMediaQuery } from '../../lib/media';
import { SkillMark } from '../account/SkillStatusButton';
import { OpenChevron } from './Panel';

/*
 * The connector tree: one thing (the root) and what hangs off it, drawn as
 * nodes joined by hairlines. A career's ladder (`CareerLadder`: where people
 * come to it from, where it leads), a career's skills (`SkillGroups`: the
 * career, its skill groups, each group's skills) and a military career's
 * civilian careers within reach (`CivilianReach`) are each one.
 *
 * The rule: everything in a tree is a node on a line, or inside a node's own
 * card that the node's line runs into. Nothing stands loose, no stretch of
 * line runs past nothing, and nothing that acts (a page to go to, more of a
 * list) is drawn as a node: it is a button, inside a card or under the tree.
 *
 * The grammar, the same at every level:
 * - The root is the one filled dot, its name beside it.
 * - A branch is a spine (an upright hairline) with an elbow out to each of
 *   its nodes. The parent's own line meets the spine; every line is whole and
 *   ends on a node, on the spine, or on the edge of a card.
 * - A node is one row, the same height everywhere (44px for a name of one
 *   line): its mark (an open ring; a skill a seeker holds, the product's
 *   mark), its name, and at the right end, level with the name's first line,
 *   its figure in meta ink ("10 skills") and what it does: a chevron pointing
 *   right goes to another page (`TreeLink`), one pointing down opens something
 *   here (`TreeToggle`), up while it is open. A second line under the name is
 *   for what is particular to one node (the makes a company runs on a skill),
 *   never for a figure every node has.
 * - What a node opens stands straight under it, at every width, and its
 *   siblings follow straight after: either a branch of its own (`TreeBranch
 *   nested`), indented, its spine running down from under the node's mark and
 *   its elbows down the left, or a card (`TreeCard`), a hairline frame hung
 *   from the node, its line running down from under the mark into the card's
 *   top edge. A card holds what the node is (a skill's level, what it is, how
 *   it is learned) and its actions as buttons; a list inside it that is only
 *   names is a plain list, not more nodes.
 *
 * The root's own branch stands across from `across` (the root on the left,
 * its branch in the next column, the lines running right; a branch on the
 * root's other side, `side="before"`, mirrored, its lines running left into
 * the root) and down under that width (the root at the top, its branch
 * indented under it). A nested branch is never another column. The lines
 * and their measures are the `.tree*` rules in `globals.css`; nothing here
 * draws a line.
 */

/** From which width a tree stands across: a ladder from a tablet up, a career's skills from a laptop. */
const ACROSS: Record<'sm' | 'lg', string> = {
  sm: '(min-width: 640px)',
  lg: '(min-width: 1024px)',
};

type Layout = 'wide' | 'stacked';

const LayoutContext = createContext<Layout>('stacked');

/** Whether the tree a part stands in is drawn across (`wide`) or down (`stacked`). */
export function useTreeLayout(): Layout {
  return useContext(LayoutContext);
}

interface TreeProps {
  /** From which width the tree stands across; under it, down. */
  across: 'sm' | 'lg';
  /**
   * `ladder`: each column under its label, the root in the middle of what
   * hangs off it. `tree`: no labels, the root level with its first node, and
   * the root's column only as wide as its name.
   */
  shape: 'ladder' | 'tree';
  /** Whether a branch stands before the root (comes into it) and after it (hangs off it). */
  before?: boolean;
  after?: boolean;
  className?: string;
  children: ReactNode;
}

/** The drawing: its root and its branches, as children (`TreeBranch side="before"`, `TreeRoot`, `TreeBranch`). */
export function Tree({ across, shape, before = false, after = false, className, children, ...rest }: TreeProps & Record<`data-${string}`, string | boolean | undefined>) {
  const wide = useMediaQuery(ACROSS[across]);
  const layout: Layout = wide ? 'wide' : 'stacked';
  return (
    <LayoutContext.Provider value={layout}>
      <div
        // One frame's room around every tree, so two trees on a page start their roots on one upright.
        className={cn('tree px-3 py-3 sm:px-4 sm:py-5', className)}
        data-tree=""
        data-layout={layout}
        data-shape={shape}
        data-before={before || undefined}
        data-after={after || undefined}
        {...rest}
      >
        {children}
      </div>
    </LayoutContext.Provider>
  );
}

/** What a node's mark is: the root's filled dot, a node's open ring, or a seeker's mark on a skill. */
export type TreeMark = 'root' | 'node' | 'held' | 'learning';

/** A node's mark, in a box the width of every mark so the names line up and the lines meet each one at its edge. */
export function TreeMarker({ mark }: { mark: TreeMark }) {
  return (
    <span className="tree-mark" aria-hidden="true" data-mark={mark}>
      {/* A seeker's mark at the size of a ring, so a held skill is never louder than the career it belongs to. */}
      {mark === 'held' || mark === 'learning' ? <SkillMark status={mark} className="h-3 w-3" /> : <span className="tree-dot" />}
    </span>
  );
}

/**
 * The root: the filled dot and the name. Across, a ladder's column says what
 * it is above it (`label`); down, the same words stand under the name (`sub`).
 */
export function TreeRoot({ label, sub, children, ...rest }: { label?: string; sub?: string; children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  const layout = useTreeLayout();
  const nameRef = useSnugName(layout === 'wide', children);
  return (
    <div className="tree-this">
      {label && layout === 'wide' && (
        <p className={cn(labelClass, 'tree-label')} data-for="this">
          {label}
        </p>
      )}
      <div className="tree-root" {...rest}>
        <TreeMarker mark="root" />
        <span ref={nameRef} className="min-w-0 break-words text-sm font-semibold leading-5 text-text-1">
          {children}
          {sub && layout === 'stacked' && <span className="block text-xs font-normal leading-[18px] text-text-3">{sub}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * Across, the root's line runs from the end of its name. A name that wraps
 * keeps the width it was given, not the width of its longest line, which
 * would leave the line standing off from the words: this sets the name's
 * width to its longest line, again when the tree's own width changes and
 * once the font has arrived. Down, the name keeps its width.
 */
function useSnugName(snug: boolean, children: ReactNode) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const name = ref.current;
    if (!name) return;
    name.style.width = '';
    if (!snug) return;
    const fit = () => {
      name.style.width = '';
      const range = document.createRange();
      range.selectNodeContents(name);
      const lines = Array.from(range.getClientRects());
      if (lines.length === 0) return;
      const right = Math.max(...lines.map((line) => line.right));
      name.style.width = `${Math.ceil(right - name.getBoundingClientRect().left) + 1}px`;
    };
    fit();
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) fit();
    });
    // The tree's own width, which the name's does not change: watching the root's own column would chase itself.
    const tree = name.closest('.tree');
    let observer: ResizeObserver | null = null;
    if (tree && typeof ResizeObserver !== 'undefined') {
      let width = tree.clientWidth;
      observer = new ResizeObserver(() => {
        if (tree.clientWidth === width) return;
        width = tree.clientWidth;
        fit();
      });
      observer.observe(tree);
    }
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [snug, children]);
  return ref;
}

interface TreeBranchProps {
  /** Which side of the root it stands on: `after` hangs off it, `before` comes into it. A nested branch is always after its node. */
  side?: 'before' | 'after';
  /** The branch's name, in small capitals: above its column across, above its first node down. */
  label?: string;
  /** A branch opened by a node of another branch: it stands straight under that node, indented, at every width. */
  nested?: boolean;
  id?: string;
  /** What a screen reader hears the list called: the group whose skills it is. */
  'aria-label'?: string;
  children: ReactNode;
}

/** One branch: a spine and its nodes (`TreeItem`s). */
export function TreeBranch({ side = 'after', label, nested = false, id, children, ...rest }: TreeBranchProps & Record<`data-${string}`, string | boolean | undefined>) {
  const list = (
    <ul id={id} className="tree-branch" data-side={side} data-nested={nested || undefined} {...rest}>
      {children}
    </ul>
  );
  if (nested) return list;
  return (
    <div className="tree-side" data-side={side}>
      {label && (
        <p className={cn(labelClass, 'tree-label')} data-for={side}>
          {label}
        </p>
      )}
      {list}
    </div>
  );
}

interface TreeItemProps {
  /** The node's row: a `TreeLink` or a `TreeToggle`. */
  node: ReactNode;
  /** What it opens is open: the node then draws its line on from under its mark, down to its branch or into its card. */
  open?: boolean;
  /** What it opened, straight under it: its branch (`TreeBranch nested`) or its card (`TreeCard`). */
  children?: ReactNode;
}

/** One node on a branch: the elbow from the spine, the node, and what it opened. */
export function TreeItem({ node, open = false, children, ...rest }: TreeItemProps & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <li className="tree-item" data-open={open || undefined} {...rest}>
      <div className="tree-node">{node}</div>
      {children}
    </li>
  );
}

/**
 * A node's row: the mark, the words, and at the right end its figure and what
 * it does. The hover fill and the focus ring (`.tree-row` in `globals.css`)
 * start at the mark's edge, where the line from the spine ends, so neither is
 * ever laid over a line.
 */
const rowClass = 'tree-row flex w-full min-w-0 items-start gap-2.5 px-2 py-3 text-left';

/** The name and, for what is particular to this node, a second line. */
function Words({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block break-words text-sm leading-5 text-text-1">{title}</span>
      {meta && <span className="block break-words text-xs font-normal leading-[18px] text-text-3">{meta}</span>}
    </span>
  );
}

/** The right end of a row, level with its first line: the node's figure in meta ink, then its chevron. */
function End({ figure, children }: { figure?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex h-5 shrink-0 items-center gap-3">
      {figure != null && figure !== false && (
        <span className="whitespace-nowrap text-xs tabular-nums text-text-3" data-tree-figure="">
          {figure}
        </span>
      )}
      {children}
    </span>
  );
}

/** A node that goes to another page: a chevron pointing right. */
export function TreeLink({
  to,
  mark = 'node',
  meta,
  figure,
  children,
  ...rest
}: { to: string; mark?: TreeMark; meta?: ReactNode; figure?: ReactNode; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <Link to={to} className={cn(rowClass, 'group')} {...rest}>
      <TreeMarker mark={mark} />
      <Words title={children} meta={meta} />
      <End figure={figure}>
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-text-3 group-hover:text-text-1" />
      </End>
    </Link>
  );
}

interface TreeToggleProps {
  mark?: TreeMark;
  title: ReactNode;
  /** A second line under the name, for what is particular to this node (a company's makes on a skill). */
  meta?: ReactNode;
  /** Its figure, at the right end before the chevron ("10 skills", "1 of 2 held"). */
  figure?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** The id of what it opens. */
  controls: string;
  /** Words a screen reader hears after the name (", held"). */
  said?: string;
  /** The heading level it is, when its name heads what it opens. */
  as?: 'h3' | 'h4';
}

/** A node that opens something here (its branch, or what it is): a button with the chevron that points down, up while open. */
export function TreeToggle({ mark = 'node', title, meta, figure, open, onToggle, controls, said, as: Heading, ...rest }: TreeToggleProps & Record<`data-${string}`, string | undefined>) {
  const button = (
    // It names what it opens only while that is there to name.
    <button type="button" aria-expanded={open} aria-controls={open ? controls : undefined} onClick={onToggle} className={rowClass} {...rest}>
      <TreeMarker mark={mark} />
      <Words title={title} meta={meta} />
      {said && <span className="sr-only">{said}</span>}
      <End figure={figure}>
        <OpenChevron open={open} />
      </End>
    </button>
  );
  return Heading ? <Heading className="m-0 font-normal">{button}</Heading> : button;
}

/**
 * What a node is, opened straight under it as its card: a hairline frame with
 * an 8px corner, hung from the node, the node's line running down from under
 * its mark into the card's top edge, its words at a reading measure. It holds
 * what the node is and what can be done with it, as buttons; a list in it
 * that is only names is a plain list (`TreeCardList`), never more nodes.
 */
export function TreeCard({ id, children, ...rest }: { id: string; children: ReactNode; 'aria-label': string } & Record<`data-${string}`, string | undefined>) {
  return (
    <div id={id} role="region" className="tree-card" {...rest}>
      {children}
    </div>
  );
}

/** A list of names inside a card, under its label in small capitals: no marks, no lines, nothing to press. */
export function TreeCardList({ label, children, ...rest }: { label: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <div {...rest}>
      <h4 className={labelClass}>{label}</h4>
      <ul className="mt-1.5 text-sm leading-6 text-text-1">{children}</ul>
    </div>
  );
}
