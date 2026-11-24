import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, labelClass } from '@/lib/utils';
import { panelClass } from '../layout/Panel';
import type { LadderCareer } from '../path/model';

/** How many careers a side names before the rest wait behind "N more": a career leads to at most this many. */
const SHOWN = 3;

/**
 * A career's place on its ladder, as one drawing in one frame: where people
 * come to it from, the career itself, and where it leads, joined by lines.
 * From 640 px the three stand side by side (Comes from, This career, Leads
 * to), the career's own name in the middle with a line out to a bracket on
 * each side; under that they stand down one line, the way a route does. Each
 * career beside it is a row that opens its page. Several on a side are
 * alternatives, not a sequence.
 *
 * It stands in one `Panel` (components/layout/Panel.tsx). This is the
 * interim drawing of where a career stands: the career's own Atlas will stand
 * in this frame (`atlas`, `data-career-atlas-slot`), over the same careers.
 * The frame, its heading and its place on the page (after the skills, before
 * the open jobs) are the Atlas's, and these rows stay under it as its words.
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
  const [allFrom, setAllFrom] = useState(false);
  const [allTo, setAllTo] = useState(false);
  const from = cut(comesFrom, allFrom);
  const to = cut(leadsTo, allTo);
  if (comesFrom.length === 0 && leadsTo.length === 0) return null;
  const hasFrom = from.shown.length > 0;
  const hasTo = to.shown.length > 0;
  return (
    // The frame is the place the career's own Atlas will take (`data-career-atlas-slot`).
    <div className={cn(panelClass, 'min-w-0')} data-career-ladder data-career-atlas-slot>
      {atlas && (
        <div className="border-b border-line" data-career-atlas>
          {atlas}
        </div>
      )}

      {/* From 640 px: three columns, joined by lines. */}
      <div className="ladder hidden px-4 py-5 sm:grid" data-from={hasFrom || undefined} data-to={hasTo || undefined}>
        {hasFrom && <p className={cn(labelClass, 'ladder-label-from')}>Comes from</p>}
        <p className={cn(labelClass, 'ladder-label-this')}>This career</p>
        {hasTo && <p className={cn(labelClass, 'ladder-label-to')}>Leads to</p>}
        {hasFrom && (
          <ul className="ladder-from" data-path-ladder="before">
            {from.shown.map((career) => (
              <li key={career.id} className="ladder-item">
                <CareerRow career={career} />
              </li>
            ))}
            {from.more > 0 && (
              <li className="ladder-item">
                <MoreRow more={from.more} onMore={() => setAllFrom(true)} />
              </li>
            )}
          </ul>
        )}
        <div className="ladder-this" data-ladder-this>
          <span aria-hidden="true" className="ladder-dot ladder-dot-this" />
          <span className="min-w-0 break-words text-sm font-semibold leading-snug text-text-1">{title}</span>
        </div>
        {hasTo && (
          <ul className="ladder-to" data-path-ladder="after">
            {to.shown.map((career) => (
              <li key={career.id} className="ladder-item">
                <CareerRow career={career} />
              </li>
            ))}
            {to.more > 0 && (
              <li className="ladder-item">
                <MoreRow more={to.more} onMore={() => setAllTo(true)} />
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Under 640 px: down one line, the career itself the filled stop. */}
      <div className="ladder-route px-4 py-3 sm:hidden">
        {hasFrom && <p className={cn(labelClass, 'flex min-h-9 items-end pb-1')}>Comes from</p>}
        <ol className="route-stops">
          {from.shown.map((career, index) => (
            <li key={career.id} className="route-item" data-first={index === 0 || undefined}>
              <span className="route-node" aria-hidden="true">
                <span className="route-dot" />
              </span>
              <CareerRow career={career} bare />
            </li>
          ))}
          {from.more > 0 && (
            <li className="route-item">
              <span className="route-node" aria-hidden="true" />
              <MoreRow more={from.more} onMore={() => setAllFrom(true)} bare />
            </li>
          )}
          <li className="route-item" data-first={!hasFrom || undefined} data-last={!hasTo || undefined} data-ladder-this>
            <span className="route-node" aria-hidden="true">
              <span className="route-dot ladder-dot-this" />
            </span>
            <span className="flex min-h-11 min-w-0 flex-col justify-center px-2">
              <span className="break-words text-sm font-semibold leading-snug text-text-1">{title}</span>
              <span className="text-xs text-text-3">This career</span>
            </span>
          </li>
          {hasTo && (
            <li className="route-item">
              <span className="route-node" aria-hidden="true" />
              <p className={cn(labelClass, 'flex min-h-11 items-center px-2')}>Leads to</p>
            </li>
          )}
          {to.shown.map((career, index) => (
            <li key={career.id} className="route-item" data-last={(index === to.shown.length - 1 && to.more === 0) || undefined}>
              <span className="route-node" aria-hidden="true">
                <span className="route-dot" />
              </span>
              <CareerRow career={career} bare />
            </li>
          ))}
          {to.more > 0 && (
            <li className="route-item" data-last>
              <span className="route-node" aria-hidden="true">
                <span className="route-dot" />
              </span>
              <MoreRow more={to.more} onMore={() => setAllTo(true)} bare />
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

/** A list cut at `SHOWN`, unless it is only one longer. */
function cut(careers: LadderCareer[], all: boolean): { shown: LadderCareer[]; more: number } {
  const shown = all || careers.length <= SHOWN + 1 ? careers : careers.slice(0, SHOWN);
  return { shown, more: careers.length - shown.length };
}

/** A career beside this one: a row that opens its page. `bare` is the phone's, whose stop is drawn by the route. */
function CareerRow({ career, bare = false }: { career: LadderCareer; bare?: boolean }) {
  return (
    <Link
      to={`/occupations/${career.id}`}
      className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover focus-visible:-outline-offset-2"
    >
      {!bare && <span aria-hidden="true" className="ladder-dot" />}
      <span className="min-w-0 flex-1 break-words text-sm leading-snug text-text-1">{career.title}</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-3 group-hover:text-text-1" />
    </Link>
  );
}

function MoreRow({ more, onMore, bare = false }: { more: number; onMore: () => void; bare?: boolean }) {
  return (
    <button
      type="button"
      onClick={onMore}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left text-sm text-text-2 transition-colors hover:bg-surface-hover hover:text-text-1 focus-visible:-outline-offset-2"
      data-ladder-more
    >
      {!bare && <span aria-hidden="true" className="ladder-dot" />}
      {more} more
    </button>
  );
}
