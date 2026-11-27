import { useId } from 'react';
import { plural } from '@/lib/utils';
import type { CareerWithinReach } from '../../lib/api';
import { useKept } from '../../lib/kept';
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
 * A career is a node that opens its card straight under it, none on arrival
 * and opening one closes no other (so nothing pressed moves from under the
 * finger): under "Missing", what it asks that this path does not, as one
 * quiet run of names (all of them, in its own route's order, with no level
 * named), and the way to its page. Going Back to the page returns it as it
 * was left (`useKept`).
 * What carries over is not listed again: the skills above are this path's.
 * Computed from the two paths: nothing here is a stored link.
 */
export function CivilianReach({ careers, keepAs }: { careers: CareerWithinReach[]; /** Whose reach this is, for the way back to it: the military career. */ keepAs: string }) {
  if (careers.length === 0) return null;
  return (
    <DetailSection id="reach" title="Civilian careers within reach">
      <ReachTree careers={careers} keepAs={keepAs} />
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

/** What a person has open: the whole list, and the cards of careers by id. */
interface Opened {
  all: boolean;
  cards: Record<string, boolean>;
}

const CLOSED: Opened = { all: false, cards: {} };

/** The careers as the root's branch, each opening its card: none to begin with. */
function ReachTree({ careers, keepAs }: { careers: CareerWithinReach[]; keepAs: string }) {
  const base = useId();
  const [opened, setOpened] = useKept<Opened>(`reach ${keepAs}`, CLOSED);
  const { shown, cut } = cutAt(careers, LISTED, opened.all);
  const toggleCard = (id: string) => setOpened((current) => ({ ...current, cards: { ...current.cards, [id]: !current.cards[id] } }));
  const toggleAll = () =>
    setOpened((current) => {
      if (!current.all) return { ...current, all: true };
      // A card left open on a career that the shorter list no longer shows closes with it.
      const listed = new Set(careers.slice(0, LISTED).map((career) => career.id));
      return { all: false, cards: Object.fromEntries(Object.entries(current.cards).filter(([id]) => listed.has(id))) };
    });
  return (
    <div className={panelClass} data-reach-list="">
      <Tree across="lg" shape="tree" after data-reach-tree="">
        <TreeRoot data-reach-size="">{plural(careers.length, 'career', 'careers')}</TreeRoot>
        <TreeBranch aria-label="Civilian careers within reach">
          {shown.map((career, index) => {
            const isOpen = Boolean(opened.cards[career.id]);
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
                    onToggle={() => toggleCard(career.id)}
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
      {cut && <ShowAll open={opened.all} total={careers.length} label="Show all" onToggle={toggleAll} />}
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
