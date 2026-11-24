import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, focusRing, labelClass } from '@/lib/utils';
import { useMediaQuery } from '../../lib/media';
import { SkillMark } from '../account/SkillStatusButton';
import { OpenChevron } from './Panel';

/*
 * The connector tree: one thing (the root) and what hangs off it, drawn as
 * nodes joined by hairlines. A career's ladder (`CareerLadder`: where people
 * come to it from, where it leads) and a career's skills (`SkillGroups`: the
 * career, its skill groups, each group's skills) are both one.
 *
 * The grammar, the same at every level:
 * - The root is the one filled dot, its name beside it.
 * - A branch is a spine (an upright hairline) with an elbow out to each of
 *   its nodes. The parent's own line meets the spine; every line is whole and
 *   ends on a node or on the spine.
 * - A node is a row: its mark (an open ring; a skill a seeker holds, the
 *   product's mark), its name, a second line in meta ink, and at the right end
 *   what it does: a chevron pointing right goes to another page (`TreeLink`),
 *   one pointing down opens something here (`TreeToggle`), up while it is open.
 *   A node that opens a branch of its own (`branches` on `TreeItem`) draws its
 *   line on to that branch while it is open; a node that opens what it is
 *   (`TreeDetail`) shows it under itself, inside its own place on the spine.
 *
 * Across (from `across`): the root on the left, each branch in the next
 * column, the lines running right; a branch on the root's other side
 * (`side="before"`) is mirrored, its lines running left into the root. Down
 * (under that width, a phone): the root at the top and each branch stacked
 * under its parent, indented, its spine running down from the parent's mark
 * and its elbows drawn down the left. The lines and their measures are the
 * `.tree*` rules in `globals.css`; nothing here draws a line.
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
        className={cn('tree', className)}
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
      {mark === 'held' || mark === 'learning' ? <SkillMark status={mark} className="h-3.5 w-3.5" /> : <span className="tree-dot" />}
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
  /** A branch opened by a node of another branch: it stands inside that node's item. */
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
  /** The node's row: a `TreeLink`, a `TreeToggle` or a `TreeMore`. */
  node: ReactNode;
  /** It opens a branch of its own: across, the node keeps one column and its branch stands in the next. */
  branches?: boolean;
  /** What it opens is open: a node that branches then draws its line on to its branch. */
  open?: boolean;
  /** What it opened: its branch (`TreeBranch nested`) or what it is (`TreeDetail`). */
  children?: ReactNode;
}

/** One node on a branch: the elbow from the spine, the node, and what it opened. */
export function TreeItem({ node, branches = false, open = false, children, ...rest }: TreeItemProps & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <li className="tree-item" data-branches={branches || undefined} data-open={open || undefined} {...rest}>
      <div className="tree-node">{node}</div>
      {children}
    </li>
  );
}

/** A node's row: the mark, the words, and what it does at the right end, the focus ring inside it. */
const rowClass = cn(
  'flex w-full min-w-0 items-start gap-2.5 rounded-md px-2 py-3 text-left transition-colors hover:bg-surface-hover',
  focusRing,
  // After the ring's own offset, so the ring stands inside the row and never over the line or the words under it.
  'focus-visible:-outline-offset-2'
);

/** The name and its second line. */
function Words({ title, meta, strong = false }: { title: ReactNode; meta?: ReactNode; strong?: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <span className={cn('block break-words text-sm leading-5 text-text-1', strong && 'font-medium')}>{title}</span>
      {meta && <span className="block break-words text-xs font-normal leading-[18px] text-text-3">{meta}</span>}
    </span>
  );
}

/** The mark at a row's right end, level with its first line. */
function End({ children }: { children: ReactNode }) {
  return <span className="flex h-5 shrink-0 items-center">{children}</span>;
}

/** A node that goes to another page: a chevron pointing right. */
export function TreeLink({ to, mark = 'node', meta, children, ...rest }: { to: string; mark?: TreeMark; meta?: ReactNode; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <Link to={to} className={cn(rowClass, 'group')} {...rest}>
      <TreeMarker mark={mark} />
      <Words title={children} meta={meta} />
      <End>
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-text-3 group-hover:text-text-1" />
      </End>
    </Link>
  );
}

interface TreeToggleProps {
  mark?: TreeMark;
  title: ReactNode;
  /** The second line, in meta ink ("10 skills"). */
  meta?: ReactNode;
  /** The name at the weight of a heading: a node whose branch holds others. */
  strong?: boolean;
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
export function TreeToggle({ mark = 'node', title, meta, strong = false, open, onToggle, controls, said, as: Heading, ...rest }: TreeToggleProps & Record<`data-${string}`, string | undefined>) {
  const button = (
    // It names what it opens only while that is there to name.
    <button type="button" aria-expanded={open} aria-controls={open ? controls : undefined} onClick={onToggle} className={rowClass} {...rest}>
      <TreeMarker mark={mark} />
      <Words title={title} meta={meta} strong={strong} />
      {said && <span className="sr-only">{said}</span>}
      <End>
        <OpenChevron open={open} />
      </End>
    </button>
  );
  return Heading ? <Heading className="m-0 font-normal">{button}</Heading> : button;
}

/** The last node of a branch that was cut: "2 more", which shows the rest in place. */
export function TreeMore({ more, onMore }: { more: number; onMore: () => void }) {
  return (
    <button type="button" onClick={onMore} className={cn(rowClass, 'text-sm leading-5 text-text-2 hover:text-text-1')} data-ladder-more="">
      <TreeMarker mark="node" />
      {more} more
    </button>
  );
}

/** What a node is, opened under it: indented to its name, inside its own place on the spine. */
export function TreeDetail({ id, children, ...rest }: { id: string; children: ReactNode; 'aria-label': string } & Record<`data-${string}`, string | undefined>) {
  return (
    <div id={id} role="region" className="tree-detail" {...rest}>
      {children}
    </div>
  );
}
