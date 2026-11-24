import { useId, useState } from 'react';
import type { CareerWithinReach } from '../../lib/api';
import { DetailSection } from '../layout/Page';
import { panelClass } from '../layout/Panel';
import { Tree, TreeBranch, TreeItem, TreeLeaf, TreeLink, TreeMore, TreeRoot, TreeToggle } from '../layout/Tree';

/**
 * "Civilian careers within reach", on a military career's page, after its
 * skills: what else a person can do with them, drawn as the same connector
 * tree as the skills above it (`Tree`). The military career is the root; an
 * elbow runs to each civilian career whose path this one covers a third or
 * more of, the closest first, each one row with its figure at the right end
 * ("13 of 18 skills"); five, then "N more" as the branch's last node (a list
 * one or two longer is shown whole). A career is a node that opens its own
 * branch, one at a time and none on arrival: what it asks that this path does
 * not (the first five, in its own route's order, with no level named, the
 * rest behind "N more"), and last "Career page", the way to it.
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

/** How many careers are listed before "N more". */
const LISTED = 5;
/** How many of the skills a career still asks are named before "N more". */
const MISSING_SHOWN = 5;

/** A list cut at `limit`, unless it is only one or two longer. */
function cutAt<T>(items: T[], limit: number, all: boolean): { shown: T[]; more: number } {
  const shown = all || items.length <= limit + 2 ? items : items.slice(0, limit);
  return { shown, more: items.length - shown.length };
}

/** "11 of 14 skills". */
function covers(career: CareerWithinReach): string {
  return `${career.held} of ${career.total} ${career.total === 1 ? 'skill' : 'skills'}`;
}

/** The careers as the root's branch, each opening its own: one at a time, none to begin with. */
function ReachTree({ title, careers }: { title: string; careers: CareerWithinReach[] }) {
  const base = useId();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { shown, more } = cutAt(careers, LISTED, all);
  return (
    <div className={panelClass} data-reach-list="">
      <Tree across="lg" shape="tree" after data-reach-tree="">
        <TreeRoot>{title}</TreeRoot>
        <TreeBranch aria-label="Civilian careers within reach">
          {shown.map((career, index) => {
            const isOpen = career.id === open;
            const branchId = `${base}-career-${index}`;
            return (
              <TreeItem
                key={career.id}
                branches
                open={isOpen}
                data-reach-career={career.id}
                node={
                  <TreeToggle
                    as="h3"
                    title={career.title}
                    figure={covers(career)}
                    open={isOpen}
                    onToggle={() => setOpen(isOpen ? null : career.id)}
                    controls={branchId}
                  />
                }
              >
                {isOpen && <Missing id={branchId} career={career} />}
              </TreeItem>
            );
          })}
          {more > 0 && <TreeItem node={<TreeMore more={more} onMore={() => setAll(true)} />} />}
        </TreeBranch>
      </Tree>
    </div>
  );
}

/**
 * What one career asks that this path does not, in its own route's order and
 * with no level named, then the way to its page.
 */
function Missing({ id, career }: { id: string; career: CareerWithinReach }) {
  const [all, setAll] = useState(false);
  const missing = career.missing;
  const shown = all || missing.length <= MISSING_SHOWN + 1 ? missing : missing.slice(0, MISSING_SHOWN);
  const more = missing.length - shown.length;
  return (
    <TreeBranch nested id={id} aria-label={`${career.title}: the skills it asks that this path does not`} data-reach-panel={career.id}>
      {shown.map((skill) => (
        <TreeItem key={skill.id} node={<TreeLeaf data-reach-missing="">{skill.name}</TreeLeaf>} />
      ))}
      {more > 0 && <TreeItem node={<TreeMore more={more} onMore={() => setAll(true)} />} />}
      <TreeItem
        node={
          <TreeLink to={`/occupations/${career.id}`} data-reach-open="">
            <span className="sr-only">{career.title}: </span>
            Career page
          </TreeLink>
        }
      />
    </TreeBranch>
  );
}
