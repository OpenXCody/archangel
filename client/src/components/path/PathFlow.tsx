import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn, focusRing } from '@/lib/utils';
import { ShareCount, ShareRing } from './HeldShare';
import { levelSkills, shareOf, type LadderCareer, type SkillMarks, type SkillPath } from './model';
import { SkillGroupBox } from './SkillGroupBox';

interface PathFlowProps {
  /** The path to draw: levels, then groups, then skills. */
  path: SkillPath;
  /** A seeker's marks; without them the diagram shows no marks and no progress, and loses nothing else. */
  marks?: SkillMarks | null;
  /** The careers a person usually comes from: drawn before the first level. */
  comesFrom?: LadderCareer[];
  /** The careers this one leads to: drawn after the last level. */
  leadsTo?: LadderCareer[];
  className?: string;
}

/**
 * A skill path drawn as a flow: one trunk through the three levels, a branch
 * for each domain a level draws on, and on each branch the skill groups as
 * boxes of tags. Down the page on a narrow screen, across it on a wide one:
 * the same parts, arranged by the room the diagram is given (a container
 * query in globals.css, `.path-flow`). The lines are drawn by the layout
 * itself, so there is nothing to measure and nothing to redraw when a mark
 * changes or the type reflows.
 *
 * To a screen reader it is a list of levels, each a list of groups, each a
 * list of skills; the lines are decoration.
 */
export function PathFlow({ path, marks, comesFrom = [], leadsTo = [], className }: PathFlowProps) {
  const levels = path.levels;
  return (
    <div className={cn('path-flow', className)} data-path-flow>
      <ol className="path-levels" data-leads-on={leadsTo.length > 0 || undefined}>
        {comesFrom.length > 0 && <Ladder label="Comes from" careers={comesFrom} place="before" />}
        {levels.map((level, index) => {
          const share = marks ? shareOf(levelSkills(level), marks) : null;
          const last = index === levels.length - 1;
          const entered = index > 0 || comesFrom.length > 0;
          const continues = !last || leadsTo.length > 0;
          // The branch a level's trunk ends in, when nothing follows it: the last domain's.
          const lastBranch = level.groups.reduce((found, group, at) => (at === 0 || group.domain?.slug !== level.groups[at - 1].domain?.slug ? at : found), 0);
          return (
            <li
              key={level.level}
              className="path-level"
              data-path-level={level.level}
              data-last={last || undefined}
              data-entered={entered || undefined}
              data-continues={continues || undefined}
            >
              <div className="path-level-head" data-below={level.groups.length > 0 || continues || undefined} data-groups={level.groups.length > 0 || undefined}>
                <span className="path-node">
                  <ShareRing share={share} />
                </span>
                <h3 className="min-w-0 text-[15px] font-semibold text-fg-default">{level.name}</h3>
                {level.gloss && <p className="path-level-gloss">{level.gloss}</p>}
                {share && share.total > 0 && <ShareCount share={share} data-level-count={level.level} />}
                <span className="path-level-line" aria-hidden="true" />
              </div>
              {level.groups.length > 0 ? (
                <ul className="path-groups">
                  {level.groups.map((group, at) => {
                    const opensDomain = at === 0 || group.domain?.slug !== level.groups[at - 1].domain?.slug;
                    const pos = at < lastBranch ? 'before' : at === lastBranch ? 'last' : 'after';
                    return (
                      <li key={group.slug} className="path-branch" data-pos={pos} data-domain={opensDomain ? group.domain?.slug ?? '' : undefined}>
                        {opensDomain && group.domain && <p className="path-domain">{group.domain.name}</p>}
                        <SkillGroupBox name={group.name} skills={group.skills} marks={marks} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="path-empty">Nothing at this level yet.</p>
              )}
            </li>
          );
        })}
        {leadsTo.length > 0 && <Ladder label="Leads to" careers={leadsTo} place="after" />}
      </ol>
    </div>
  );
}

/**
 * A career whose path is not written yet still stands on its ladder: one
 * node on the trunk for the career, where a person comes from above it and
 * where it leads below. Kept narrow, so it runs down the page at any width.
 */
export function LadderAlone({ comesFrom = [], leadsTo = [], children }: { comesFrom?: LadderCareer[]; leadsTo?: LadderCareer[]; children: React.ReactNode }) {
  return (
    <div className="path-flow max-w-xl" data-path-flow data-path-unwritten>
      <ol className="path-levels">
        {comesFrom.length > 0 && <Ladder label="Comes from" careers={comesFrom} place="before" />}
        <li className="path-level" data-last data-entered={comesFrom.length > 0 || undefined} data-continues={leadsTo.length > 0 || undefined}>
          <div className="path-level-head" data-below={leadsTo.length > 0 || undefined}>
            <span className="path-node">
              <ShareRing share={null} />
            </span>
            <p className="min-w-0 text-sm leading-7 text-fg-muted">{children}</p>
          </div>
        </li>
        {leadsTo.length > 0 && <Ladder label="Leads to" careers={leadsTo} place="after" />}
      </ol>
    </div>
  );
}

/** How many careers a ladder's side names before the rest wait behind "N more": a career leads to at most this many. */
const LADDER_SHOWN = 3;

/**
 * The careers before or after this one on the ladder: branches of the same
 * trunk, each a quiet link. Several are alternatives, not a sequence, which
 * is why they are branches and not nodes. Many careers can lead to one
 * (seven to a maintenance technician): the first few are named and the rest
 * wait behind one quiet word, so the path itself stays in reach.
 */
function Ladder({ label, careers, place }: { label: string; careers: LadderCareer[]; place: 'before' | 'after' }) {
  const [all, setAll] = useState(false);
  // One more than the limit is shown rather than hidden behind "1 more".
  const shown = all || careers.length <= LADDER_SHOWN + 1 ? careers : careers.slice(0, LADDER_SHOWN);
  const more = careers.length - shown.length;
  return (
    <li className="path-ladder" data-path-ladder={place}>
      <p className="path-domain">{label}</p>
      <ul>
        {shown.map((career) => (
          <li key={career.id}>
            <Link
              to={`/occupations/${career.id}`}
              className={cn('group inline-flex min-h-11 max-w-full items-center text-sm text-fg-muted transition-colors hover:text-fg-default', focusRing)}
            >
              <span className="min-w-0 break-words underline decoration-border-strong underline-offset-4 group-hover:decoration-fg-muted">{career.title}</span>
            </Link>
          </li>
        ))}
        {more > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setAll(true)}
              className={cn('inline-flex min-h-11 items-center text-sm text-fg-soft transition-colors hover:text-fg-default', focusRing)}
              data-ladder-more
            >
              {more} more
            </button>
          </li>
        )}
      </ul>
    </li>
  );
}
