import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ChevronRight } from 'lucide-react';
import { cn, labelClass } from '@/lib/utils';
import { panelClass, panelRowClass } from '../layout/Panel';
import type { LadderCareer } from '../path/model';

/** How many careers a side names before the rest wait behind "N more": a career leads to at most this many. */
const LADDER_SHOWN = 3;

/**
 * Where a career stands among others: one panel read left to right (top to
 * bottom on a phone), where people come to it from, this career, and where it
 * leads. Each side is a column of rows that open those careers; an arrow
 * stands on each divide, so the panel reads as one step of a path. Several
 * careers on a side are alternatives, not a sequence.
 *
 * This panel holds the place of the career's own Atlas: when that drawing is
 * ready it takes this frame, in this section, and the ladder is drawn in it.
 */
export function CareerLadder({ title, comesFrom = [], leadsTo = [] }: { title: string; comesFrom?: LadderCareer[]; leadsTo?: LadderCareer[] }) {
  const sides = [
    comesFrom.length > 0 ? <Side key="from" label="Comes from" careers={comesFrom} place="before" /> : null,
    <Here key="here" title={title} />,
    leadsTo.length > 0 ? <Side key="to" label="Leads to" careers={leadsTo} place="after" /> : null,
  ].filter(Boolean);
  const columns = sides.length === 3 ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]';
  return (
    <div className={cn(panelClass, 'grid grid-cols-1', columns)} data-career-ladder>
      {sides.map((side, index) => (
        <div key={index} className={cn('relative min-w-0', index > 0 && 'border-t border-line lg:border-l lg:border-t-0')}>
          {index > 0 && <Step />}
          {side}
        </div>
      ))}
    </div>
  );
}

/** The arrow on a divide: right from a laptop up, down on a phone, standing over the hairline. */
function Step() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 top-0 z-[1] flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-bg text-text-2 lg:left-0 lg:top-1/2"
    >
      <ArrowDown className="h-3.5 w-3.5 lg:hidden" />
      <ArrowRight className="hidden h-3.5 w-3.5 lg:block" />
    </span>
  );
}

/** This career, the step the panel is about: named, not a link. */
function Here({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-24 flex-col justify-center bg-surface px-5 py-5" data-ladder-here>
      <p className={labelClass}>This career</p>
      <p className="mt-1 break-words text-[17px] font-semibold leading-snug text-text-1">{title}</p>
    </div>
  );
}

function Side({ label, careers, place }: { label: string; careers: LadderCareer[]; place: 'before' | 'after' }) {
  const [all, setAll] = useState(false);
  // One more than the limit is shown rather than hidden behind "1 more".
  const shown = all || careers.length <= LADDER_SHOWN + 1 ? careers : careers.slice(0, LADDER_SHOWN);
  const more = careers.length - shown.length;
  return (
    <div className="min-w-0 py-2" data-path-ladder={place}>
      <p className={cn(labelClass, 'px-4 pb-1 pt-2', place === 'after' && 'lg:pl-6')}>{label}</p>
      <ul>
        {shown.map((career) => (
          <li key={career.id}>
            <Link to={`/occupations/${career.id}`} className={cn(panelRowClass, 'min-h-11 py-2 text-sm text-text-1', place === 'after' && 'lg:pl-6')}>
              <span className="min-w-0 flex-1 break-words">{career.title}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-3" />
            </Link>
          </li>
        ))}
        {more > 0 && (
          <li>
            <button type="button" onClick={() => setAll(true)} className={cn(panelRowClass, 'min-h-11 py-2 text-sm text-text-2', place === 'after' && 'lg:pl-6')} data-ladder-more>
              {more} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
