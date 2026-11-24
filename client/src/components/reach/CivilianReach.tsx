import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn, focusRing } from '@/lib/utils';
import type { CareerWithinReach } from '../../lib/api';
import { DetailSection, ShowAll } from '../layout/Page';
import { panelClass, secondaryActionClass } from '../layout/Panel';
import { Tree, TreeBranch, TreeCard, TreeCardList, TreeItem, TreeRoot, TreeToggle } from '../layout/Tree';

/**
 * "Civilian careers within reach", on a military career's page, after its
 * skills: what else a person can do with them, drawn as the same connector
 * tree as the skills above it (`Tree`). The military career is the root; an
 * elbow runs to each civilian career whose path this one covers a third or
 * more of, the closest first, each one row with its figure at the right end
 * ("13 of 18 skills"); five, then "Show all" as the frame's last row, under
 * the tree (a list one or two longer is shown whole). A career is a node that
 * opens its card straight under it, one at a time and none on arrival: what
 * it asks that this path does not, as a plain list of names (the first five,
 * in its own route's order, with no level named, the rest behind "N more"),
 * and the way to its page as a button.
 * What carries over is not listed again: the skills above are this path's.
 * Computed from the two paths: nothing here is a stored link.
 */
export function CivilianReach({ title, careers }: { title: string; careers: CareerWithinReach[] }) {
  if (careers.length === 0) return null;
  return (
    <DetailSection
      id="reach"
      title="Civilian careers within reach"
      description="Where these skills carry over. Each opens to the skills it asks that this path does not."
    >
      <ReachTree title={title} careers={careers} />
    </DetailSection>
  );
}

/** How many careers are listed before "Show all". */
const LISTED = 5;
/** How many of the skills a career still asks are named before "N more". */
const MISSING_SHOWN = 5;

/** A list cut at `limit`, unless it is only one or two longer. */
function cutAt<T>(items: T[], limit: number, all: boolean): { shown: T[]; cut: boolean } {
  const cut = items.length > limit + 2;
  return { shown: all || !cut ? items : items.slice(0, limit), cut };
}

/** "11 of 14 skills". */
function covers(career: CareerWithinReach): string {
  return `${career.held} of ${career.total} ${career.total === 1 ? 'skill' : 'skills'}`;
}

/** The careers as the root's branch, each opening its card: one at a time, none to begin with. */
function ReachTree({ title, careers }: { title: string; careers: CareerWithinReach[] }) {
  const base = useId();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { shown, cut } = cutAt(careers, LISTED, all);
  const showFewer = () => {
    // A card left open on a career that the shorter list no longer shows closes with it.
    if (open && !careers.slice(0, LISTED).some((career) => career.id === open)) setOpen(null);
    setAll(false);
  };
  return (
    <div className={panelClass} data-reach-list="">
      <Tree across="lg" shape="tree" after data-reach-tree="">
        <TreeRoot>{title}</TreeRoot>
        <TreeBranch aria-label="Civilian careers within reach">
          {shown.map((career, index) => {
            const isOpen = career.id === open;
            const cardId = `${base}-career-${index}`;
            return (
              <TreeItem
                key={career.id}
                open={isOpen}
                data-reach-career={career.id}
                node={
                  <TreeToggle
                    as="h3"
                    title={career.title}
                    figure={covers(career)}
                    open={isOpen}
                    onToggle={() => setOpen(isOpen ? null : career.id)}
                    controls={cardId}
                  />
                }
              >
                {isOpen && <ReachCard id={cardId} career={career} />}
              </TreeItem>
            );
          })}
        </TreeBranch>
      </Tree>
      {cut && <ShowAll open={all} total={careers.length} onToggle={() => (all ? showFewer() : setAll(true))} />}
    </div>
  );
}

/**
 * One career's card: what it asks that this path does not, in its own route's
 * order and with no level named, as names; then the way to its page.
 */
function ReachCard({ id, career }: { id: string; career: CareerWithinReach }) {
  const [all, setAll] = useState(false);
  const missing = career.missing;
  const shown = all || missing.length <= MISSING_SHOWN + 1 ? missing : missing.slice(0, MISSING_SHOWN);
  const more = missing.length - shown.length;
  return (
    <TreeCard id={id} aria-label={`${career.title}: the skills it asks that this path does not`} data-reach-panel={career.id}>
      {missing.length > 0 && (
        <TreeCardList label="Missing" data-reach-missing="">
          {shown.map((skill) => (
            <li key={skill.id} className="break-words">
              {skill.name}
            </li>
          ))}
        </TreeCardList>
      )}
      {more > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={cn('inline-flex min-h-11 items-center text-sm text-text-2 underline transition-colors hover:text-text-1 sm:min-h-8', focusRing)}
          data-reach-more=""
        >
          {more} more
        </button>
      )}
      <div>
        <Link to={`/occupations/${career.id}`} className={cn(secondaryActionClass, 'mt-4 sm:h-9 sm:px-3')} data-reach-open="">
          <span className="sr-only">{career.title}: </span>
          Career page
        </Link>
      </div>
    </TreeCard>
  );
}
