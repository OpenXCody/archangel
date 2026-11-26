import { useState } from 'react';
import { useMediaQuery } from '../../lib/media';
import { ShowAll } from '../layout/Page';
import { panelClass } from '../layout/Panel';
import { Tree, TreeBranch, TreeHeading, TreeItem, TreeLink, TreeRoot } from '../layout/Tree';
import type { LadderCareer } from '../path/model';

/** How many careers a side names before the rest wait behind "Show all": a career leads to at most this many. */
const SHOWN = 3;

/** From which width the ladder stands across (the tree's `across="sm"`). */
const ACROSS = '(min-width: 640px)';

/**
 * A career's place on its ladder, as one connector tree (`Tree`) in one
 * frame: where people come to it from, the career itself as the root, and
 * where it leads. The root says "This career" (the page's heading has its
 * name); each career beside it is a node that opens its page.
 *
 * From 640 px the three stand side by side, the sides under their labels
 * (Comes from, Leads to), the career's line running out to a spine on each
 * side and an elbow to each career there: the career in the middle of its
 * sides, or, when a side runs past three careers, all three on the first row,
 * each label straight over its first node. Under 640 px it stands down the
 * page as a career's skills do: the career first, then "Comes from" and
 * "Leads to" as two nodes on its spine, each with its careers on a spine of
 * its own, so which way is which is said by the tree and not by a loose label.
 *
 * A side of more than four names three, and "Show all", the frame's last row
 * under the tree, shows the rest in place: more of a list is a button, never
 * a node.
 */
export function CareerLadder({ comesFrom = [], leadsTo = [] }: { comesFrom?: LadderCareer[]; leadsTo?: LadderCareer[] }) {
  const across = useMediaQuery(ACROSS);
  const [all, setAll] = useState(false);
  if (comesFrom.length === 0 && leadsTo.length === 0) return null;
  const from = cut(comesFrom, all);
  const to = cut(leadsTo, all);
  const fromCut = comesFrom.length > SHOWN + 1;
  const toCut = leadsTo.length > SHOWN + 1;
  const hasFrom = from.length > 0;
  const hasTo = to.length > 0;
  const nodes = (careers: LadderCareer[]) =>
    careers.map((career) => <TreeItem key={career.id} node={<TreeLink to={`/occupations/${career.id}`}>{career.title}</TreeLink>} />);
  return (
    <div className={panelClass} data-career-ladder>
      {across ? (
        <Tree across="sm" shape="ladder" before={hasFrom} after={hasTo} data-top={from.length > SHOWN || to.length > SHOWN || undefined}>
          {hasFrom && (
            <TreeBranch side="before" label="Comes from" data-path-ladder="before">
              {nodes(from)}
            </TreeBranch>
          )}
          <TreeRoot data-ladder-this="">This career</TreeRoot>
          {hasTo && (
            <TreeBranch side="after" label="Leads to" data-path-ladder="after">
              {nodes(to)}
            </TreeBranch>
          )}
        </Tree>
      ) : (
        <Tree across="sm" shape="ladder" after>
          <TreeRoot data-ladder-this="">This career</TreeRoot>
          <TreeBranch aria-label="Where it leads">
            {hasFrom && (
              <TreeItem open node={<TreeHeading>Comes from</TreeHeading>}>
                <TreeBranch nested aria-label="Comes from" data-path-ladder="before">
                  {nodes(from)}
                </TreeBranch>
              </TreeItem>
            )}
            {hasTo && (
              <TreeItem open node={<TreeHeading>Leads to</TreeHeading>}>
                <TreeBranch nested aria-label="Leads to" data-path-ladder="after">
                  {nodes(to)}
                </TreeBranch>
              </TreeItem>
            )}
          </TreeBranch>
        </Tree>
      )}
      {(fromCut || toCut) && (
        <ShowAll
          open={all}
          total={comesFrom.length + leadsTo.length}
          label={fromCut && !toCut ? `Show all ${comesFrom.length} it comes from` : !fromCut && toCut ? `Show all ${leadsTo.length} it leads to` : undefined}
          onToggle={() => setAll((value) => !value)}
          data-ladder-more=""
        />
      )}
    </div>
  );
}

/** A list cut at `SHOWN`, unless it is only one longer. */
function cut(careers: LadderCareer[], all: boolean): LadderCareer[] {
  return all || careers.length <= SHOWN + 1 ? careers : careers.slice(0, SHOWN);
}
