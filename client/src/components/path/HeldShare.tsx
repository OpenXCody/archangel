import { cn } from '@/lib/utils';
import type { Share } from './model';

/*
 * How much of a set of skills a person holds: the one visual for a group, a
 * level and a whole career. A ring that fills clockwise, bright for what is
 * held, mid-bright for what is being learned, quiet for the rest; whole, it
 * is the same disc with a tick that a held skill carries. Shape and
 * brightness only: there is no colour for progress.
 */

const R = 7.5;
const LENGTH = 2 * Math.PI * R;

/** The ring. Decoration: the figure beside it (`ShareCount`) is what is read out. */
export function ShareRing({ share, className }: { share: Share | null; className?: string }) {
  const total = share?.total ?? 0;
  const held = total > 0 ? Math.min(share?.held ?? 0, total) / total : 0;
  const learning = total > 0 ? Math.min(share?.learning ?? 0, total - (share?.held ?? 0)) / total : 0;
  const whole = total > 0 && held === 1;
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" data-share-ring className={cn('h-[18px] w-[18px] shrink-0', className)}>
      {whole ? (
        <>
          <circle cx="10" cy="10" r="8.25" className="fill-text-1" />
          <path d="M6.4 10.3l2.4 2.4 4.8-5.1" stroke="var(--bg)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r={R} strokeWidth="1.5" className="stroke-line-strong" />
          {learning > 0 && (
            <circle
              cx="10"
              cy="10"
              r={R}
              strokeWidth="2.5"
              className="stroke-text-3"
              strokeDasharray={`${(held + learning) * LENGTH} ${LENGTH}`}
              transform="rotate(-90 10 10)"
            />
          )}
          {held > 0 && (
            <circle
              cx="10"
              cy="10"
              r={R}
              strokeWidth="2.5"
              className="stroke-text-1"
              strokeDasharray={`${held * LENGTH} ${LENGTH}`}
              transform="rotate(-90 10 10)"
            />
          )}
        </>
      )}
    </svg>
  );
}

/** "2 of 6", with what it counts said to a screen reader. */
export function ShareCount({ share, className, ...rest }: { share: Share; className?: string } & Record<`data-${string}`, string | number | undefined>) {
  return (
    <span className={cn('shrink-0 whitespace-nowrap text-xs tabular-nums text-text-3', className)} {...rest}>
      <span className={share.held > 0 ? 'text-text-1' : undefined}>{share.held}</span> of {share.total}
      <span className="sr-only"> held</span>
    </span>
  );
}
