import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn, focusRing, labelClass, optionDetailClass, optionTileClass, optionTitleClass } from '@/lib/utils';
import type { CareerWithinReach, PathSkill } from '../../lib/api';
import { useMediaQuery } from '../../lib/media';
import { onGroupArrowKeys } from '../../lib/roving';
import { DetailSection, ShowAll, detailActionClass, rowHoverClass } from '../layout/Page';
import { curve, layoutFlow, type FlowLayout } from './flow';

/**
 * "Civilian careers within reach", on a military career's page, after its
 * skills: what else a person can do with them. Each civilian career whose
 * path this one covers a third or more of is a row ("CNC Machine Operator ·
 * 11 of 14 skills"), the closest first, five and then "Show all". A row is a
 * button that opens in place, one at a time and none on arrival, to what the
 * civilian career asks that this path does not (the first five, then the
 * rest behind "N more") and one button to its page. What carries over is not
 * listed again: the skills above are this path's.
 *
 * From 1024 px the careers are drawn as a flow, read left to right
 * (`ReachFlow`): this path's skills by group, then the careers. A line is one
 * skill shared, so a bundle is as thick as what carries. There one career is
 * chosen at a time (the closest, to begin with), its lines drawn in the
 * accent, and the same short account of it stands under the drawing. The
 * careers are a radio group with a roving tabindex; the drawing is one image
 * with a name. Computed from the two paths: nothing here is a stored link.
 */
export function CivilianReach({
  careerTitle,
  skills,
  careers,
}: {
  /** The military career's own title, as its page is headed. */
  careerTitle: string;
  /** Its path, in the route's order. */
  skills: PathSkill[];
  careers: CareerWithinReach[];
}) {
  const wide = useMediaQuery(WIDE);
  if (careers.length === 0) return null;
  return (
    <DetailSection id="reach" title="Civilian careers within reach" description="Civilian careers whose skills this path already covers a third or more of.">
      {wide ? <ReachDrawn careerTitle={careerTitle} skills={skills} careers={careers} /> : <ReachRows careers={careers} />}
    </DetailSection>
  );
}

/** From this width the careers are drawn as a flow; under it they are rows. */
const WIDE = '(min-width: 1024px)';
/** How many careers are drawn before "Show all", and how many rows are listed. */
const SHOWN = 12;
const LISTED = 5;
/** How many of the skills a career still asks are named before "N more". */
const MISSING_SHOWN = 5;

/** A list cut at `limit`, unless it is only a row or two longer. */
function cutAt<T>(items: T[], limit: number, all: boolean): { shown: T[]; cut: boolean } {
  const cut = items.length > limit + 2;
  return { shown: all || !cut ? items : items.slice(0, limit), cut };
}

/** "11 of 14 skills". */
function covers(career: CareerWithinReach): string {
  return `${career.held} of ${career.total} ${career.total === 1 ? 'skill' : 'skills'}`;
}

/** The careers as rows, each opening in place: one at a time, none to begin with. */
function ReachRows({ careers }: { careers: CareerWithinReach[] }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { shown, cut } = cutAt(careers, LISTED, all);
  const base = useId();
  return (
    <>
      <ul data-reach-list>
        {shown.map((career) => {
          const on = career.id === open;
          const id = `${base}-${career.id}`;
          return (
            <li key={career.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                aria-expanded={on}
                aria-controls={id}
                onClick={() => setOpen(on ? null : career.id)}
                className={cn('flex min-h-12 w-full min-w-0 items-center gap-3 py-2 text-left', rowHoverClass, focusRing)}
                data-reach-career={career.id}
                data-open={on || undefined}
              >
                <span className="min-w-0 flex-1 break-words text-sm leading-snug">
                  <span className={cn('text-text-1', on && 'font-medium')}>{career.title}</span>
                  <span className="whitespace-nowrap text-[13px] tabular-nums text-text-3"> · {covers(career)}</span>
                </span>
                <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-text-3 transition-transform motion-reduce:transition-none', on && 'rotate-180')} />
              </button>
              <div id={id} hidden={!on}>
                {on && <ReachDetail career={career} className="pb-4 pt-1" />}
              </div>
            </li>
          );
        })}
      </ul>
      {cut && <ShowAll open={all} total={careers.length} onToggle={() => setAll((value) => !value)} />}
    </>
  );
}

/**
 * What one career asks that this path does not, in its own route's order and
 * with no level named, and the way to its page.
 */
function ReachDetail({ career, headed, className }: { career: CareerWithinReach; headed?: boolean; className?: string }) {
  const [all, setAll] = useState(false);
  const missing = career.missing;
  const shown = all || missing.length <= MISSING_SHOWN + 1 ? missing : missing.slice(0, MISSING_SHOWN);
  const more = missing.length - shown.length;
  return (
    <div role="region" aria-label={career.title} className={cn('min-w-0', className)} data-reach-panel={career.id}>
      {headed && (
        <>
          <h3 className="break-words text-xl font-semibold text-text-1">{career.title}</h3>
          <p className="mt-0.5 text-sm text-text-2" data-reach-carries>
            {career.held} of its {career.total} skills carry over.
          </p>
        </>
      )}
      {missing.length > 0 && (
        <div className={cn(headed && 'mt-4')} data-reach-missing>
          <h4 className={labelClass}>Missing</h4>
          <ul className="mt-1 text-sm text-text-1" data-next-skills>
            {shown.map((skill) => (
              <li key={skill.id} className="break-words py-0.5">
                {skill.name}
              </li>
            ))}
          </ul>
          {more > 0 && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className={cn('inline-flex min-h-11 items-center text-sm text-text-3 transition-colors hover:text-text-1 md:min-h-8', focusRing)}
              data-reach-more
            >
              {more} more
            </button>
          )}
        </div>
      )}
      <Link to={`/occupations/${career.id}`} className={cn(detailActionClass, 'mt-4')} data-reach-open>
        <span className="sr-only">{career.title}: </span>
        Career page
      </Link>
    </div>
  );
}

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

/** From 1024 px: the flow, one career chosen, and under it that career's short account. */
function ReachDrawn({ careerTitle, skills, careers }: { careerTitle: string; skills: PathSkill[]; careers: CareerWithinReach[] }) {
  const [all, setAll] = useState(false);
  const [chosenId, choose] = useState(careers[0]?.id ?? '');
  const { shown, cut } = cutAt(careers, SHOWN, all);
  const chosen = shown.find((career) => career.id === chosenId) ?? shown[0];
  const panelId = useId();
  if (!chosen) return null;
  return (
    <>
      <ReachFlow careerTitle={careerTitle} skills={skills} careers={shown} chosen={chosen.id} onChoose={choose} controls={panelId} />
      {cut && <ShowAll open={all} total={careers.length} onToggle={() => setAll((value) => !value)} />}
      <div id={panelId} className="reach-panel" data-headed>
        <ReachDetail key={chosen.id} career={chosen} headed />
      </div>
    </>
  );
}

/** Where the two columns stand, in thousandths of the drawing's width: the groups' lines leave at the first, reach the careers at the second. */
const GROUP_END = 300;
const CAREER_START = 440;
/** The drawing's width in its own units. */
const WIDTH = 1000;
/** Pixels between a name and the end of its lines. */
const LABEL_GAP = 12;

/**
 * The flow: two columns read left to right, drawn in one SVG from
 * `layoutFlow`'s numbers, with the groups' names beside it and the careers
 * as buttons over it at the same rows.
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
  // The flow's arithmetic without the industries: only what carries from the path into each career.
  const layout = useMemo(() => layoutFlow(skills, careers.map((career) => ({ ...career, industries: [], everywhere: false }))), [skills, careers]);
  const groupsOn = new Set(layout.lines.filter((line) => line.career === chosen).map((line) => line.group));
  return (
    <div className="reach-flow" data-reach-flow>
      <div className="reach-flow-heads" aria-hidden="true">
        <span className={cn(labelClass, 'text-right')} style={{ width: `calc(${GROUP_END / 10}% - ${LABEL_GAP}px)` }}>
          Its skills by group
        </span>
        <span className={labelClass} style={{ left: `${CAREER_START / 10}%` }}>
          Civilian careers
        </span>
      </div>
      <div className="relative" style={{ height: layout.height }}>
        <div
          role="img"
          aria-label={`${careerTitle}: its skills by group, and the ${careers.length === 1 ? 'civilian career' : `${careers.length} civilian careers`} they carry into.`}
          className="absolute inset-0"
        >
          <FlowDrawing layout={layout} chosen={chosen} groupsOn={groupsOn} />
          {layout.groups.map((group) => (
            <span
              key={group.key}
              className="reach-flow-name reach-flow-group"
              data-on={groupsOn.has(group.key) || undefined}
              data-idle={group.lines === 0 || undefined}
              style={{ top: group.y, width: `calc(${GROUP_END / 10}% - ${LABEL_GAP}px)` }}
            >
              {group.name ?? 'Other skills'}
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
                style={{ top: layout.careers[at].y, left: `${CAREER_START / 10}%`, right: 0 }}
                data-reach-career={career.id}
                data-on={on || undefined}
              >
                <span className={cn('reach-flow-career-name', optionTitleClass(on), on && 'font-medium')}>{career.title}</span>
                <span className={cn('shrink-0 text-xs tabular-nums', optionDetailClass(on))}>{covers(career)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The lines and the ends they leave from. The chosen career's are drawn last,
 * in the accent, over the rest.
 */
function FlowDrawing({ layout, chosen, groupsOn }: { layout: FlowLayout; chosen: string; groupsOn: Set<string> }) {
  const line = (from: number, to: number) => curve(GROUP_END, from, CAREER_START, to);
  const ends = (ys: number[]) => [Math.min(...ys) - 1, Math.max(...ys) + 1];
  return (
    <svg className="reach-flow-svg" viewBox={`0 0 ${WIDTH} ${layout.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g>
        {layout.lines.filter((each) => each.career !== chosen).map((each) => (
          <path key={`${each.career}:${each.skill}`} className="reach-line" d={line(each.from, each.to)} />
        ))}
      </g>
      {layout.groups.filter((group) => group.lines > 0).map((group) => {
        const ys = layout.lines.filter((each) => each.group === group.key).map((each) => each.from);
        const [top, bottom] = ends(ys);
        return <line key={group.key} className="reach-end" data-on={groupsOn.has(group.key) || undefined} x1={GROUP_END} x2={GROUP_END} y1={top} y2={bottom} />;
      })}
      <g data-reach-chosen={chosen}>
        {layout.lines.filter((each) => each.career === chosen).map((each) => (
          <path key={`${each.career}:${each.skill}`} className="reach-line" data-on="" d={line(each.from, each.to)} />
        ))}
      </g>
    </svg>
  );
}
