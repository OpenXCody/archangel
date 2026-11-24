import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn, labelClass, optionDetailClass, optionTileClass, optionTitleClass } from '@/lib/utils';
import { industryLabel, industryPath } from '@shared/industry';
import type { CareerWithinReach, PathSkill } from '../../lib/api';
import { useMediaQuery } from '../../lib/media';
import { onGroupArrowKeys } from '../../lib/roving';
import { DetailSection, ShowAll, detailActionClass } from '../layout/Page';
import { atlasHref } from '../atlas/state';
import { SkillGroupBox } from '../path/SkillGroupBox';
import { SkillTag, SkillTags } from '../path/SkillTag';
import type { SkillMarks } from '../path/model';
import { EVERY_INDUSTRY, FLOW, curve, industriesOf, layoutFlow, type FlowLayout } from './flow';

/**
 * "Civilian careers within reach", on a military career's page: where its
 * path carries in industry. From a tablet up it is a flow read left to right
 * (`ReachFlow`): the path's skills by group, the civilian careers whose path
 * it covers a third or more of, the industries those careers are typical of.
 * A line on the left is one skill shared, so a bundle is as thick as what
 * carries. On a phone it is the same careers as a list read top to bottom.
 *
 * One career is chosen at a time (the closest, to begin with). Its lines are
 * drawn in the accent, and under the drawing (on a phone, under the career)
 * it says what carries over, by group, what is missing, in the civilian
 * career's own order, and its industries, and leads to its page and to the
 * two compared on the Atlas. The careers are a radio group with a roving
 * tabindex, so the arrow keys move through them; the drawing is one image
 * with a name, and the list is the way in for the keyboard and a screen reader.
 * Computed from the two paths: nothing here is a stored link.
 */
export function CivilianReach({
  careerId,
  careerTitle,
  skills,
  careers,
  marks,
}: {
  careerId: string;
  /** The military career's own title, as its page is headed. */
  careerTitle: string;
  /** Its path, in the route's order. */
  skills: PathSkill[];
  careers: CareerWithinReach[];
  marks: SkillMarks | null;
}) {
  const wide = useMediaQuery(WIDE);
  const [showAll, setShowAll] = useState(false);
  const [chosenId, choose] = useState(careers[0]?.id ?? '');
  // A list a row or two longer than the cut is shown whole.
  const cut = careers.length > SHOWN + 2;
  const shown = showAll || !cut ? careers : careers.slice(0, SHOWN);
  const chosen = shown.find((career) => career.id === chosenId) ?? shown[0];
  const panelId = useId();
  if (!chosen) return null;

  const panel = (
    <ReachPanel
      id={panelId}
      careerId={careerId}
      skills={skills}
      career={chosen}
      marks={marks}
      headed={wide}
    />
  );
  return (
    <DetailSection
      id="reach"
      title="Civilian careers within reach"
      description="Where this path's skills carry: each civilian career whose path it covers a third or more of, and the industries those careers are typical of."
    >
      {wide ? (
        <>
          <ReachFlow careerTitle={careerTitle} skills={skills} careers={shown} chosen={chosen.id} onChoose={choose} controls={panelId} />
          {cut && <ShowAll open={showAll} total={careers.length} onToggle={() => setShowAll((value) => !value)} />}
          {panel}
        </>
      ) : (
        <>
          <ReachList careers={shown} chosen={chosen.id} onChoose={choose} controls={panelId} panel={panel} />
          {cut && <ShowAll open={showAll} total={careers.length} onToggle={() => setShowAll((value) => !value)} />}
        </>
      )}
    </DetailSection>
  );
}

/** From this width the flow is drawn; under it the careers are a list. */
const WIDE = '(min-width: 768px)';
/** How many careers are drawn before "Show all". */
const SHOWN = 12;

/** Arrow keys move through the careers and choose; a key pressed inside the open career's part is its own. */
function arrowKeys(careers: CareerWithinReach[], chosen: string, onChoose: (id: string) => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).getAttribute('role') !== 'radio') return;
    onGroupArrowKeys(
      event,
      careers.map((career) => career.id),
      chosen,
      onChoose
    );
  };
}

/** "10 of 14", said in full to a screen reader. */
function Covers({ career, className }: { career: CareerWithinReach; className?: string }) {
  return (
    <span className={cn('shrink-0 tabular-nums', className)}>
      {career.held} of {career.total}
      <span className="sr-only"> skills</span>
    </span>
  );
}

/**
 * The flow, from a tablet up: three columns read left to right, drawn in one
 * SVG from `layoutFlow`'s numbers, with the names beside it and the careers as
 * buttons over it at the same rows.
 */
function ReachFlow({
  careerTitle,
  skills,
  careers,
  chosen,
  onChoose,
  controls,
}: {
  careerTitle: string;
  skills: PathSkill[];
  careers: CareerWithinReach[];
  chosen: string;
  onChoose: (id: string) => void;
  controls: string;
}) {
  const layout = useMemo(() => layoutFlow(skills, careers), [skills, careers]);
  const groupsOn = new Set(layout.lines.filter((line) => line.career === chosen).map((line) => line.group));
  const industriesOn = new Set(layout.links.filter((link) => link.career === chosen).map((link) => link.industry));
  const industries = layout.industries.length;
  return (
    <div className="reach-flow" data-reach-flow>
      <div className="reach-flow-heads" aria-hidden="true">
        <span className={cn(labelClass, 'text-right')} style={{ width: `calc(${FLOW.groupEnd / 10}% - ${LABEL_GAP}px)` }}>
          Skills by group
        </span>
        <span className={labelClass} style={{ left: `${FLOW.careerStart / 10}%` }}>
          Civilian careers
        </span>
        <span className={labelClass} style={{ left: `calc(${FLOW.industryStart / 10}% + ${LABEL_GAP}px)` }}>
          Industries
        </span>
      </div>
      <div className="relative" style={{ height: layout.height }}>
        <div
          role="img"
          aria-label={`${careerTitle}: its skills by group, the ${careers.length === 1 ? 'civilian career' : `${careers.length} civilian careers`} they carry into, and the ${industries === 1 ? 'industry' : 'industries'} ${careers.length === 1 ? 'it is' : 'those are'} typical of.`}
          className="absolute inset-0"
        >
          <FlowDrawing layout={layout} chosen={chosen} />
          {layout.groups.map((group) => (
            <span
              key={group.key}
              className="reach-flow-name reach-flow-group"
              data-on={groupsOn.has(group.key) || undefined}
              data-idle={group.lines === 0 || undefined}
              style={{ top: group.y, width: `calc(${FLOW.groupEnd / 10}% - ${LABEL_GAP}px)` }}
            >
              {group.name ?? 'Other skills'}
            </span>
          ))}
          {layout.industries.map((industry) => (
            <span
              key={industry.key}
              className="reach-flow-name reach-flow-industry"
              data-on={industriesOn.has(industry.key) || undefined}
              style={{ top: industry.y, left: `calc(${FLOW.industryStart / 10}% + ${LABEL_GAP}px)` }}
            >
              {industry.key === EVERY_INDUSTRY ? 'Every industry' : industryLabel(industry.key)}
            </span>
          ))}
        </div>
        <div role="radiogroup" aria-label="Civilian careers within reach" onKeyDown={arrowKeys(careers, chosen, onChoose)}>
          {careers.map((career, at) => {
            const on = career.id === chosen;
            return (
              <button
                key={career.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-controls={controls}
                tabIndex={on ? 0 : -1}
                onClick={() => onChoose(career.id)}
                className={cn('reach-flow-career', optionTileClass(on))}
                style={{ top: layout.careers[at].y, left: `${FLOW.careerStart / 10}%`, width: `${(FLOW.careerEnd - FLOW.careerStart) / 10}%` }}
                data-reach-career={career.id}
                data-on={on || undefined}
              >
                <span className={cn('min-w-0 truncate', optionTitleClass(on), on && 'font-medium')}>{career.title}</span>
                <Covers career={career} className={cn('text-xs', optionDetailClass(on))} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Pixels between a name and the end of its lines. */
const LABEL_GAP = 12;

/**
 * The lines and the ends they leave from and arrive at. The chosen career's
 * are drawn last, in the accent, over the rest.
 */
function FlowDrawing({ layout, chosen }: { layout: FlowLayout; chosen: string }) {
  const line = (from: number, to: number) => curve(FLOW.groupEnd, from, FLOW.careerStart, to);
  const link = (from: number, to: number) => curve(FLOW.careerEnd, from, FLOW.industryStart, to);
  const ends = (ys: number[]) => [Math.min(...ys) - 1, Math.max(...ys) + 1];
  return (
    <svg className="reach-flow-svg" viewBox={`0 0 ${FLOW.width} ${layout.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g>
        {layout.lines.filter((each) => each.career !== chosen).map((each) => (
          <path key={`${each.career}:${each.skill}`} className="reach-line" d={line(each.from, each.to)} />
        ))}
        {layout.links.filter((each) => each.career !== chosen).map((each) => (
          <path key={`${each.career}:${each.industry}`} className="reach-line" d={link(each.from, each.to)} />
        ))}
      </g>
      {layout.groups.filter((group) => group.lines > 0).map((group) => {
        const ys = layout.lines.filter((each) => each.group === group.key).map((each) => each.from);
        const [top, bottom] = ends(ys);
        return <line key={group.key} className="reach-end" x1={FLOW.groupEnd} x2={FLOW.groupEnd} y1={top} y2={bottom} />;
      })}
      {layout.industries.map((industry) => {
        const ys = layout.links.filter((each) => each.industry === industry.key).map((each) => each.to);
        const [top, bottom] = ends(ys);
        return <line key={industry.key} className="reach-end" x1={FLOW.industryStart} x2={FLOW.industryStart} y1={top} y2={bottom} />;
      })}
      <g data-reach-chosen={chosen}>
        {layout.lines.filter((each) => each.career === chosen).map((each) => (
          <path key={`${each.career}:${each.skill}`} className="reach-line" data-on="" d={line(each.from, each.to)} />
        ))}
        {layout.links.filter((each) => each.career === chosen).map((each) => (
          <path key={`${each.career}:${each.industry}`} className="reach-line" data-on="" d={link(each.from, each.to)} />
        ))}
      </g>
    </svg>
  );
}

/** On a phone: the careers as a list of choices, the chosen one open under its button. */
function ReachList({
  careers,
  chosen,
  onChoose,
  controls,
  panel,
}: {
  careers: CareerWithinReach[];
  chosen: string;
  onChoose: (id: string) => void;
  controls: string;
  panel: ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label="Civilian careers within reach" onKeyDown={arrowKeys(careers, chosen, onChoose)} className="grid grid-cols-1 gap-2" data-reach-list>
      {careers.map((career) => {
        const on = career.id === chosen;
        return (
          <div key={career.id} className="min-w-0">
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-controls={on ? controls : undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => onChoose(career.id)}
              className={cn('flex min-h-[52px] w-full min-w-0 items-center gap-3 px-3 py-2', optionTileClass(on))}
              data-reach-career={career.id}
              data-on={on || undefined}
            >
              <span className={cn('min-w-0 flex-1 break-words text-sm leading-snug', optionTitleClass(on), on && 'font-medium')}>{career.title}</span>
              <span className={cn('text-xs', optionDetailClass(on))}>
                <Covers career={career} />
                <span aria-hidden="true"> skills</span>
              </span>
            </button>
            {on && panel}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The chosen career: what of the military path carries into it, by group;
 * what of its own path is missing, in its route's order; its industries; and
 * the ways on, its page and the two careers compared on the Atlas.
 */
function ReachPanel({
  id,
  careerId,
  skills,
  career,
  marks,
  headed,
}: {
  id: string;
  careerId: string;
  skills: PathSkill[];
  career: CareerWithinReach;
  marks: SkillMarks | null;
  /** Under the flow the panel names its career; on a phone the button above it already does. */
  headed: boolean;
}) {
  const shared = new Set(career.shared);
  // The skills that carry, in the route's order, in runs by group: each group once, where the route first reaches it.
  const groups: { key: string; name: string; skills: PathSkill[] }[] = [];
  for (const skill of skills) {
    if (!shared.has(skill.id)) continue;
    const key = skill.group?.slug ?? '';
    const run = groups.find((group) => group.key === key);
    if (run) run.skills.push(skill);
    else groups.push({ key, name: skill.group?.name ?? 'Other skills', skills: [skill] });
  }
  const industries = industriesOf(career);
  return (
    <div id={id} role="region" aria-label={career.title} className="reach-panel" data-reach-panel={career.id} data-headed={headed || undefined}>
      {headed && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h3 className="break-words text-xl font-semibold text-text-1">{career.title}</h3>
            <p className="mt-0.5 text-sm text-text-2">
              {career.held} of its {career.total} skills are on this path.
            </p>
          </div>
          <PanelLinks careerId={careerId} career={career} />
        </div>
      )}
      <div className="reach-panel-parts">
        <div className="reach-panel-part" data-reach-shared>
          <h4 className={labelClass}>Carries over</h4>
          <div className="mt-2 grid grid-cols-1 gap-3">
            {groups.map((group) => (
              <SkillGroupBox key={group.key} name={group.name} skills={group.skills} marks={marks} readOnly />
            ))}
          </div>
        </div>
        <div className="reach-panel-part" data-reach-missing>
          <h4 className={labelClass}>Missing</h4>
          <SkillTags className="mt-2">
            {career.missing.map((skill) => (
              <SkillTag key={skill.id} skill={skill} marks={marks} readOnly />
            ))}
          </SkillTags>
        </div>
        <div className="reach-panel-part" data-reach-industries>
          <h4 className={labelClass}>Industries</h4>
          {industries.length === 0 ? (
            <p className="mt-2 text-sm text-text-2">None yet.</p>
          ) : (
            <ul className="mt-1">
              {industries.map((industry) => {
                const to = industry === EVERY_INDUSTRY ? null : industryPath(industry);
                const name = industry === EVERY_INDUSTRY ? 'Factories of every industry' : industryLabel(industry);
                return (
                  <li key={industry} className="text-sm text-text-1">
                    {to ? (
                      <Link to={to} className="inline-flex min-h-11 items-center underline sm:min-h-9">
                        {name}
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center sm:min-h-9">{name}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {!headed && <PanelLinks careerId={careerId} career={career} className="mt-5" />}
    </div>
  );
}

/** The ways on from the chosen career: its own page, and the two paths on one plate. */
function PanelLinks({ careerId, career, className }: { careerId: string; career: CareerWithinReach; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Link to={`/occupations/${career.id}`} className={detailActionClass} data-reach-open>
        <span className="sr-only">{career.title}: </span>
        Career page
      </Link>
      {/* The two paths on one plate: this career's skills a disc, the other's a ring. */}
      <Link
        to={atlasHref({ career: careerId, with: career.id })}
        className={detailActionClass}
        // The same words for every career: said with the career's name to someone who hears the links alone.
        aria-label={`Compare with ${career.title} on the atlas`}
        data-reach-compare
      >
        Compare on the atlas
      </Link>
    </div>
  );
}
