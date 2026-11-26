import { useId, useState } from 'react';
import { plural } from '@/lib/utils';
import type { CareerWithinReach } from '../../lib/api';
import { DetailSection, ShowAll } from '../layout/Page';
import { panelClass } from '../layout/Panel';
import { Tree, TreeBranch, TreeCard, TreeCardLink, TreeCardNames, TreeItem, TreeRoot, TreeToggle } from '../layout/Tree';

/**
 * "Civilian careers within reach", on a military career's page, after its
 * skills: what else a person can do with them, drawn as the same connector
 * tree as the skills above it (`Tree`). The root is the military career, said
 * as what hangs off it ("22 careers": the page's heading has its name); an
 * elbow runs to each civilian career whose path this one covers a third or
 * more of, the closest first, each one row with its figure straight after
 * its name ("Shipfitter · 13 of 18 skills"); five, then "Show all" as the
 * frame's last row, under the tree (a list one or two longer is shown whole).
 * A career is a node that opens its card straight under it, one at a time
 * and none on arrival: under "Missing", what it asks that this path does not,
 * as one quiet run of names (all of them, in its own route's order, with no
 * level named), and the way to its page.
 * What carries over is not listed again: the skills above are this path's.
 * Computed from the two paths: nothing here is a stored link.
 */
export function CivilianReach({ careers }: { careers: CareerWithinReach[] }) {
  if (careers.length === 0) return null;
  return (
    <DetailSection id="reach" title="Civilian careers within reach">
      <ReachTree careers={careers} />
    </DetailSection>
  );
}

/** How many careers are listed before "Show all". */
const LISTED = 5;

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
function ReachTree({ careers }: { careers: CareerWithinReach[] }) {
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
        <TreeRoot data-reach-size="">{plural(careers.length, 'career', 'careers')}</TreeRoot>
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
      {/* The root says how many there are, so the button does not count them again. */}
      {cut && <ShowAll open={all} total={careers.length} label="Show all" onToggle={() => (all ? showFewer() : setAll(true))} />}
    </div>
  );
}

/**
 * One career's card: what it asks that this path does not, in its own route's
 * order and with no level named, as one run of names; then the way to its page.
 */
function ReachCard({ id, career }: { id: string; career: CareerWithinReach }) {
  return (
    <TreeCard id={id} aria-label={`${career.title}: the skills it asks that this path does not`} data-reach-panel={career.id}>
      {career.missing.length > 0 && <TreeCardNames label="Missing" names={career.missing} data-reach-missing="" />}
      <TreeCardLink to={`/occupations/${career.id}`} name={career.title} data-reach-open="">
        Career page
      </TreeCardLink>
    </TreeCard>
  );
}
