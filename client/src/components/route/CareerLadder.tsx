import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ShowAll } from '../layout/Page';
import { panelClass } from '../layout/Panel';
import { Tree, TreeBranch, TreeItem, TreeLink, TreeRoot } from '../layout/Tree';
import type { LadderCareer } from '../path/model';

/** How many careers a side names before the rest wait behind "Show all": a career leads to at most this many. */
const SHOWN = 3;

/**
 * A career's place on its ladder, as one connector tree (`Tree`) in one
 * frame: where people come to it from, the career itself as the root, and
 * where it leads. From 640 px the three stand side by side under their labels
 * (Comes from, This career, Leads to), the career's line running out to a
 * spine on each side and an elbow to each career there; under 640 px the
 * same tree stands down the page. Each career beside it is a node that opens
 * its page. Several on a side are alternatives, not a sequence. A side of
 * more than four names three, and "Show all", the frame's last row under the
 * tree, shows the rest in place: more of a list is a button, never a node.
 *
 * Its frame is the place the career's own Atlas will take (`atlas`,
 * `data-career-atlas-slot`), over the same careers. The frame, its heading and
 * its place on the page (after the skills, before the open jobs) are the
 * Atlas's, and these nodes stay under it as its words.
 */
export function CareerLadder({
  title,
  comesFrom = [],
  leadsTo = [],
  atlas,
}: {
  /** The career this page is about. */
  title: string;
  comesFrom?: LadderCareer[];
  leadsTo?: LadderCareer[];
  /** The career's Atlas, when there is one to draw: it stands at the top of the frame. */
  atlas?: React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  const from = cut(comesFrom, all);
  const to = cut(leadsTo, all);
  const cutShort = comesFrom.length > SHOWN + 1 || leadsTo.length > SHOWN + 1;
  if (comesFrom.length === 0 && leadsTo.length === 0) return null;
  const hasFrom = from.shown.length > 0;
  const hasTo = to.shown.length > 0;
  return (
    <div className={cn(panelClass, 'min-w-0')} data-career-ladder data-career-atlas-slot>
      {atlas && (
        <div className="border-b border-line" data-career-atlas>
          {atlas}
        </div>
      )}
      <Tree across="sm" shape="ladder" before={hasFrom} after={hasTo}>
        {hasFrom && (
          <TreeBranch side="before" label="Comes from" data-path-ladder="before">
            {from.shown.map((career) => (
              <TreeItem key={career.id} node={<TreeLink to={`/occupations/${career.id}`}>{career.title}</TreeLink>} />
            ))}
          </TreeBranch>
        )}
        <TreeRoot label="This career" sub="This career" data-ladder-this="">
          {title}
        </TreeRoot>
        {hasTo && (
          <TreeBranch side="after" label="Leads to" data-path-ladder="after">
            {to.shown.map((career) => (
              <TreeItem key={career.id} node={<TreeLink to={`/occupations/${career.id}`}>{career.title}</TreeLink>} />
            ))}
          </TreeBranch>
        )}
      </Tree>
      {cutShort && (
        <ShowAll open={all} total={comesFrom.length + leadsTo.length} onToggle={() => setAll((value) => !value)} data-ladder-more="" />
      )}
    </div>
  );
}

/** A list cut at `SHOWN`, unless it is only one longer. */
function cut(careers: LadderCareer[], all: boolean): { shown: LadderCareer[] } {
  return { shown: all || careers.length <= SHOWN + 1 ? careers : careers.slice(0, SHOWN) };
}
