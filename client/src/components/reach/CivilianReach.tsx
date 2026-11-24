import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn, focusRing, labelClass } from '@/lib/utils';
import type { CareerWithinReach } from '../../lib/api';
import { DetailSection, ShowAll, detailActionClass, rowHoverClass } from '../layout/Page';

/**
 * "Civilian careers within reach", on a military career's page, after its
 * skills: what else a person can do with them. Each civilian career whose
 * path this one covers a third or more of is a row ("CNC Machine Operator ·
 * 11 of 14 skills"), the closest first, five and then "Show all", at every
 * width. A row is a button that opens in place, one at a time and none on
 * arrival, to what the civilian career asks that this path does not (the
 * first five, then the rest behind "N more") and one button to its page.
 * What carries over is not listed again: the skills above are this path's.
 * Computed from the two paths: nothing here is a stored link.
 */
export function CivilianReach({ careers }: { careers: CareerWithinReach[] }) {
  if (careers.length === 0) return null;
  return (
    <DetailSection id="reach" title="Civilian careers within reach" description="Where these skills carry over.">
      <ReachRows careers={careers} />
    </DetailSection>
  );
}

/** How many careers are listed before "Show all". */
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
function ReachDetail({ career, className }: { career: CareerWithinReach; className?: string }) {
  const [all, setAll] = useState(false);
  const missing = career.missing;
  const shown = all || missing.length <= MISSING_SHOWN + 1 ? missing : missing.slice(0, MISSING_SHOWN);
  const more = missing.length - shown.length;
  return (
    <div role="region" aria-label={career.title} className={cn('min-w-0', className)} data-reach-panel={career.id}>
      {missing.length > 0 && (
        <div data-reach-missing>
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
