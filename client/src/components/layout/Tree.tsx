import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, focusRing, labelClass } from '@/lib/utils';
import { useMediaQuery } from '../../lib/media';
import { SkillMark } from '../account/SkillStatusButton';
import { OpenChevron } from './Panel';

/*
 * The connector tree: one thing (the root) and what hangs off it, drawn as
 * nodes joined by hairlines. A career's skills (`SkillGroups`: the career,
 * its skill groups, each group's skills), a career's ladder (`CareerLadder`:
 * where people come to it from, where it leads) and a military career's
 * civilian careers within reach (`CivilianReach`) are each one.
 *
 * The rule: everything in a tree is a node on a line, or inside a node's own
 * card that the node's line runs into. Nothing stands loose, no stretch of
 * line runs past nothing, and nothing that acts (a page to go to, more of a
 * list) is drawn as a node: it is a link inside a card, or a button under
 * the tree.
 *
 * The grammar, the same at every level:
 * - The root is the page's own record, so it never says the record's name
 *   again: it is the one larger filled dot and what hangs off it, as a count
 *   ("23 skills", "22 careers") or, on a ladder, "This career".
 * - A branch is a spine (an upright hairline) with an elbow out to each of
 *   its nodes. The parent's own line meets the spine; every line is whole and
 *   ends on a node, on the spine, or on the edge of a card.
 * - A node is one row, the same height everywhere (44px for a name of one
 *   line), running to the frame's right edge: its mark, its name with its
 *   figure straight after it in meta ink ("Composite fabrication · 10
 *   skills"), and at the row's right end what it does: a chevron pointing
 *   right goes to another page (`TreeLink`), one pointing down opens
 *   something here (`TreeToggle`), up while it is open. A node that only
 *   names what hangs off it (a ladder's "Comes from" down a phone) is
 *   `TreeHeading`: the mark and the words in small capitals, nothing to
 *   press. A second line under the name is for what is particular to one
 *   node (the makes a company runs on a skill), never for a figure every
 *   node has.
 * - Open and closed are told apart by the mark, the ink and the chevron
 *   together: a closed node is an open ring and its name at body weight; an
 *   open one is a filled dot (as the root is, whose branch always shows), its
 *   name heavier, its chevron turned, and its line running on down into what
 *   it opened. A skill a seeker holds keeps the product's mark (the filled
 *   check) open or closed, one being learned the half mark.
 * - What a node opens stands straight under it, at every width, and its
 *   siblings follow straight after: either a branch of its own (`TreeBranch
 *   nested`), indented, its spine running down from under the node's mark and
 *   its elbows down the left, or a card (`TreeCard`), a hairline frame hung
 *   from the node, its line running down from under the mark into the card's
 *   top edge. A card spans its row and keeps its words at a reading measure.
 *   It holds what the node is (a skill's level, what it is, how it is
 *   learned) and the way to its page as a link; names in it are one quiet run
 *   of words (`TreeCardNames`), never more nodes.
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
function useTreeLayout(): Layout {
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
        className={cn('tree px-2 py-2 sm:px-4 sm:py-5', className)}
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

/** What a node's mark is: the root's filled dot, a node's ring (open while it is closed, filled while it is open), or a seeker's mark on a skill. */
export type TreeMark = 'root' | 'node' | 'held' | 'learning';

/** A node's mark, in a box the width of every mark so the names line up and the lines meet each one at its edge. */
function TreeMarker({ mark }: { mark: TreeMark }) {
  return (
    <span className="tree-mark" aria-hidden="true" data-mark={mark}>
      {/* A seeker's mark, a little larger than a ring so its check reads and it is never taken for an open node's dot. */}
      {mark === 'held' || mark === 'learning' ? <SkillMark status={mark} className="h-3.5 w-3.5" /> : <span className="tree-dot" />}
    </span>
  );
}

/**
 * The root: the filled dot and what hangs off it, in a few words ("23
 * skills", "This career"). Never the record's name: the page's heading says
 * that, once.
 */
export function TreeRoot({ children, ...rest }: { children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  const layout = useTreeLayout();
  const nameRef = useSnugName(layout === 'wide', children);
  return (
    <div className="tree-this">
      <div className="tree-root" data-tree-root="" {...rest}>
        <TreeMarker mark="root" />
        <span ref={nameRef} className="min-w-0 break-words text-sm font-semibold leading-5 text-text-1">
          {children}
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
  /** The branch's name, in small capitals, above its column: only across (down, a ladder names its sides as nodes, `TreeHeading`). */
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
 * A node's row: the mark, the words, and at the right end what it does. The
 * hover fill and the focus ring (`.tree-row` in `globals.css`) start just
 * after the mark, so neither is ever laid over a line or the ring.
 */
const rowClass = 'tree-row flex w-full min-w-0 items-start gap-2.5 px-2 py-3 text-left';

/** The name with its figure straight after it, and, for what is particular to this node, a second line. */
function Words({ title, figure, meta }: { title: ReactNode; figure?: ReactNode; meta?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block break-words text-sm leading-5 text-text-1">
        <span className="tree-name">{title}</span>
        {figure != null && figure !== false && (
          <span className="whitespace-nowrap text-xs font-normal tabular-nums text-text-3" data-tree-figure="">
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            {figure}
          </span>
        )}
      </span>
      {meta && <span className="block break-words text-xs font-normal leading-[18px] text-text-3">{meta}</span>}
    </span>
  );
}

/** The right end of a row, level with its first line: what the node does. */
function End({ children }: { children: ReactNode }) {
  return <span className="flex h-5 shrink-0 items-center">{children}</span>;
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
      <Words title={children} figure={figure} meta={meta} />
      <End>
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
  /** Its figure, straight after its name in meta ink ("10 skills", "1 of 2 held"). */
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
      <Words title={title} figure={figure} meta={meta} />
      {said && <span className="sr-only">{said}</span>}
      <End>
        <OpenChevron open={open} />
      </End>
    </button>
  );
  return Heading ? <Heading className="m-0 font-normal">{button}</Heading> : button;
}

/**
 * A node that names what hangs off it and does nothing itself (a ladder's
 * "Comes from" and "Leads to" down a phone): the mark and the words in small
 * capitals, its own branch straight under it. Its item is always open, so its
 * mark is the filled dot.
 */
export function TreeHeading({ children, as: Heading = 'h3' }: { children: ReactNode; as?: 'h3' | 'h4' }) {
  return (
    <Heading className={cn(rowClass, 'm-0')} data-tree-heading="">
      <TreeMarker mark="node" />
      <span className={cn(labelClass, 'flex h-5 min-w-0 flex-1 items-center')}>{children}</span>
    </Heading>
  );
}

/**
 * What a node is, opened straight under it as its card: a hairline frame with
 * an 8px corner, hung from the node, the node's line running down from under
 * its mark into the card's top edge. It spans its row; its words keep a
 * reading measure, and where the card is wide enough two parts of it stand
 * side by side (`TreeCardColumns`). It holds what the node is and the way to
 * its page (`TreeCardLink`); names in it are one quiet run of words
 * (`TreeCardNames`), never more nodes.
 */
export function TreeCard({ id, children, ...rest }: { id: string; children: ReactNode; 'aria-label': string } & Record<`data-${string}`, string | undefined>) {
  return (
    <div id={id} role="region" className="tree-card" {...rest}>
      <div className="tree-card-body">{children}</div>
    </div>
  );
}

/** Two parts of a card side by side where it is wide enough (what a skill is, how it is learned); one under the other where it is not. */
export function TreeCardColumns({ children }: { children: ReactNode }) {
  return <div className="tree-card-columns">{children}</div>;
}

/** One part of a card, under its label in small capitals where the node's own name does not already say what it is. */
export function TreeCardPart({ label, children, ...rest }: { label?: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <div className="tree-card-part" {...rest}>
      {label && <h4 className={labelClass}>{label}</h4>}
      <div className={cn('text-sm leading-relaxed text-text-2', label && 'mt-1')}>{children}</div>
    </div>
  );
}

/**
 * Names inside a card (the skills a career asks that this path does not), as
 * one quiet run of words in secondary ink, all of them: no marks, no lines,
 * nothing to press, so nothing in it reads as a node.
 */
export function TreeCardNames({ label, names, ...rest }: { label?: string; names: readonly { id: string; name: string }[] } & Record<`data-${string}`, string | undefined>) {
  return (
    <TreeCardPart label={label} {...rest}>
      <p>
        {names.map((item, at) => (
          <span key={item.id} data-name="">
            {item.name}
            {at < names.length - 1 ? ', ' : '.'}
          </span>
        ))}
      </p>
    </TreeCardPart>
  );
}

/** The way from a card to the page of what it is: a text link with a chevron, so a card never holds a box of its own. */
export function TreeCardLink({ to, name, children, ...rest }: { to: string; name: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <Link
      to={to}
      className={cn(
        'mt-3 inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-text-1 underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-text-1 sm:min-h-8',
        focusRing
      )}
      {...rest}
    >
      <span className="sr-only">{name}: </span>
      {children}
      <ChevronRight aria-hidden="true" className="h-4 w-4 text-text-2" />
    </Link>
  );
}
