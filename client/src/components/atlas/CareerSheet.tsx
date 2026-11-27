import { useRef, useState, type RefObject } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Dialog, DialogPanel, DialogTitle } from '@/components/ui/dialog';
import { cn, focusRing } from '@/lib/utils';
import { kindLine } from '@shared/military';
import { occupationsApi, type Occupation } from '../../lib/api';
import { errorMessage } from '../../lib/http';
import { publicKeys } from '../../lib/queryKeys';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { ATLAS_BUTTON, GUTTER, careerName } from './parts';

/**
 * Choosing a career to lay over the wheel, or a military career to lay under
 * it: one field and the careers it finds, asked of the catalogue as the person
 * types. The whole screen on a phone; from a wide screen a panel down the
 * right edge, where the list stands, so the wheel stays in sight.
 */

/** How many careers the sheet lists at once. */
const SHOWN = 60;

interface CareerSheetProps {
  /** What is being chosen: a career to lay over the wheel, or the military career under it. Null while the sheet is shut. */
  picking: 'career' | 'from' | null;
  onPick: (career: Occupation) => void;
  /** Take the career, or the military career, off. */
  onNone: () => void;
  onClose: () => void;
  /** Where the keyboard goes when the sheet shuts and the control that opened it is no longer there. */
  fallback: RefObject<HTMLElement>;
}

export default function CareerSheet({ picking, onPick, onNone, onClose, fallback }: CareerSheetProps) {
  // What the sheet last chose between: it keeps its words while it closes.
  const kind = useRef<'career' | 'from'>('career');
  if (picking) kind.current = picking;
  const military = kind.current === 'from';
  // What had the focus when the sheet opened: the button that asked for it.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (picking && !wasOpen.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasOpen.current = picking !== null;
  const input = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={picking !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPanel
        aria-describedby={undefined}
        data-atlas-sheet={kind.current}
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          // A finger has come to read the list first: the keyboard waits until the field is pressed.
          if (matchMedia('(hover: hover) and (pointer: fine)').matches) input.current?.focus();
          else if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (opener.current?.isConnected ? opener.current : fallback.current)?.focus();
        }}
        className="inset-0 grid touch-none grid-rows-[auto_auto_minmax(0,1fr)] pt-[env(safe-area-inset-top,0px)] min-[900px]:left-auto min-[900px]:w-[420px] min-[900px]:border-l min-[900px]:border-line"
      >
        <header className={cn('flex items-center gap-2.5 py-3', GUTTER)}>
          <DialogTitle className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">{military ? 'Military rating' : 'Lay a career over'}</DialogTitle>
          <button type="button" className={ATLAS_BUTTON} data-atlas-sheet-none onClick={onNone}>
            None
          </button>
          <button type="button" className={ATLAS_BUTTON} data-atlas-sheet-close onClick={onClose}>
            Close
          </button>
        </header>
        {/* Drawn only while the sheet is open, so every opening starts from an empty field. */}
        <Careers military={military} input={input} onPick={onPick} />
      </DialogPanel>
    </Dialog>
  );
}

/** The field and what it finds. */
function Careers({ military, input, onPick }: { military: boolean; input: RefObject<HTMLInputElement>; onPick: (career: Occupation) => void }) {
  const [term, setTerm] = useState('');
  const query = useDebouncedValue(term.trim(), 180);
  const found = useQuery({
    queryKey: publicKeys.picker(military ? 'atlas-military' : 'atlas-careers', query),
    queryFn: () => occupationsApi.list({ search: query, limit: SHOWN, ...(military && { military: 1 }) }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    // Asked even when the browser says it is offline, so the list says so.
    networkMode: 'always',
    retry: false,
  });
  // A career with no path has nothing to lay over the wheel.
  const careers = (found.data?.data ?? []).filter((career) => (career.skillCount ?? 1) > 0);
  const label = military ? 'Search military careers' : 'Search careers';

  return (
    <>
      <div className={cn('mb-2', GUTTER)}>
        <input
          ref={input}
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={label}
          aria-label={label}
          autoComplete="off"
          className="box-border w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-base text-text-1 placeholder:text-text-3"
        />
      </div>
      <ol aria-busy={found.isFetching || undefined} className={cn('touch-pan-y overflow-y-auto overscroll-contain pb-6', GUTTER)}>
        {found.isError ? (
          <li role="alert" className="py-3 text-xs text-danger">
            {errorMessage(found.error)}
          </li>
        ) : found.data && careers.length === 0 ? (
          <li className="py-3 text-xs text-text-3" data-atlas-sheet-empty>
            None found.
          </li>
        ) : (
          careers.map((career) => {
            // A military career's kind and code; a career found by another name says which, or the title alone looks like a wrong answer.
            const line = kindLine(career.kind, career.code) ?? (career.alsoCalled ? `Also called ${career.alsoCalled}` : null);
            return (
              <li key={career.id}>
                <button
                  type="button"
                  data-atlas-pick={career.id}
                  onClick={() => onPick(career)}
                  className={cn('flex w-full items-baseline gap-2.5 border-b border-line py-[11px] text-left text-sm text-text-1', focusRing)}
                >
                  <span className="min-w-0 flex-1">{careerName(career)}</span>
                  {line && <small className="max-w-[55%] shrink-0 truncate text-xs text-text-3">{line}</small>}
                </button>
              </li>
            );
          })
        )}
      </ol>
    </>
  );
}
