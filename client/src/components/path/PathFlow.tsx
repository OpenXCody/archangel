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
 * The careers before or after this one on the ladder: branches of the same
 * trunk, each a quiet link. Several are alternatives, not a sequence, which
 * is why they are branches and not nodes.
 */
function Ladder({ label, careers, place }: { label: string; careers: LadderCareer[]; place: 'before' | 'after' }) {
  return (
    <li className="path-ladder" data-path-ladder={place}>
      <p className="path-domain">{label}</p>
      <ul>
        {careers.map((career) => (
          <li key={career.id}>
            <Link
              to={`/occupations/${career.id}`}
              className={cn('group inline-flex min-h-11 max-w-full items-center text-sm text-fg-muted transition-colors hover:text-fg-default', focusRing)}
            >
              <span className="min-w-0 break-words underline decoration-border-strong underline-offset-4 group-hover:decoration-fg-muted">{career.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}
