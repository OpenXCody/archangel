import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn, focusRing, labelClass } from '@/lib/utils';
import type { LadderCareer } from '../path/model';

/** How many careers a ladder's side names before the rest wait behind "N more": a career leads to at most this many. */
const LADDER_SHOWN = 3;

/**
 * The careers before or after this one on the ladder: one line of quiet
 * links, "Comes from" above the route's first stop and "Leads to" under its
 * last. Several are alternatives, not a sequence. Many careers can lead to one
 * (seven to a maintenance technician): the first few are named and the rest
 * wait behind one quiet word, so the path itself stays in reach.
 */
export function Ladder({ label, careers, place }: { label: string; careers: LadderCareer[]; place: 'before' | 'after' }) {
  const [all, setAll] = useState(false);
  // One more than the limit is shown rather than hidden behind "1 more".
  const shown = all || careers.length <= LADDER_SHOWN + 1 ? careers : careers.slice(0, LADDER_SHOWN);
  const more = careers.length - shown.length;
  return (
    <div className="route-ladder" data-path-ladder={place}>
      <p className={cn(labelClass, 'flex min-h-11 shrink-0 items-center')}>{label}</p>
      <ul className="flex min-w-0 flex-1 basis-40 flex-wrap gap-x-4">
        {shown.map((career) => (
          <li key={career.id} className="min-w-0 max-w-full">
            <Link to={`/occupations/${career.id}`} className={cn('inline-flex min-h-11 max-w-full items-center text-sm text-text-1', focusRing)}>
              <span className="min-w-0 break-words underline">{career.title}</span>
            </Link>
          </li>
        ))}
        {more > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setAll(true)}
              className={cn('inline-flex min-h-11 items-center text-sm text-text-3 transition-colors hover:text-text-1', focusRing)}
              data-ladder-more
            >
              {more} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * A career whose path is not written yet still stands on its ladder: where a
 * person comes from above one stop that says so, and where it leads below.
 */
export function RouteAlone({ comesFrom = [], leadsTo = [], children }: { comesFrom?: LadderCareer[]; leadsTo?: LadderCareer[]; children: React.ReactNode }) {
  return (
    <div className="route max-w-xl" data-route data-path-unwritten>
      <div className="route-main">
        {comesFrom.length > 0 && <Ladder label="Comes from" careers={comesFrom} place="before" />}
        <ol className="route-stops">
          <li className="route-stop route-item" data-first data-last>
            <span className="route-node" aria-hidden="true">
              <span className="route-dot" />
            </span>
            <p className="flex min-h-11 min-w-0 items-center text-sm text-text-2">{children}</p>
          </li>
        </ol>
        {leadsTo.length > 0 && <Ladder label="Leads to" careers={leadsTo} place="after" />}
      </div>
    </div>
  );
}
