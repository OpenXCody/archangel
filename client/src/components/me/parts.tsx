import { cn } from '@/lib/utils';
import { rowClass, textButtonClass } from '../account/parts';

/* What the sections of the profile page share. */

export const linkClass = 'font-medium text-text-1 underline underline-offset-4 hover:no-underline';

/** "Removed X." with the way back, in the place the row was. */
export function RemovedRow({ name, onUndo, busy }: { name: string; onUndo: () => void; busy?: boolean }) {
  return (
    <li className={cn(rowClass, 'flex min-h-[52px] items-center gap-3 px-4 py-2')} data-removed>
      <p className="min-w-0 flex-1 break-words text-sm text-text-2" role="status">
        Removed {name}.
      </p>
      {/* Focus lands here: the button that was pressed is gone with its row. */}
      <button
        type="button"
        autoFocus
        aria-busy={busy}
        onClick={() => {
          if (!busy) onUndo();
        }}
        className={cn(textButtonClass, 'shrink-0 py-2 text-text-1')}
      >
        Undo
      </button>
    </li>
  );
}
