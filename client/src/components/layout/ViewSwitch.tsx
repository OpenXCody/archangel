import { Link } from 'react-router-dom';
import { cn, focusRing } from '@/lib/utils';

export interface ViewChoice {
  key: string;
  label: string;
  to: string;
}

interface ViewSwitchProps {
  /** What the two are views of, said to a screen reader: "Skills as", "Path as". */
  label: string;
  views: readonly ViewChoice[];
  current: string;
  /** A view of the same page takes the other's place in the history; two pages do not. */
  replace?: boolean;
  onChoose?: (key: string) => void;
  className?: string;
  data?: Record<`data-${string}`, string>;
}

/**
 * One quiet switch between two views of one thing: the Skills list and the
 * Atlas, a career's path as a flow and on the Atlas. Each view is an address,
 * so the switch is two links and the one shown is the current page.
 */
export default function ViewSwitch({ label, views, current, replace, onChoose, className, data }: ViewSwitchProps) {
  return (
    <nav aria-label={label} className={cn('inline-flex shrink-0 rounded-lg border border-border-strong p-0.5', className)} {...data}>
      {views.map((view) => {
        const on = view.key === current;
        return (
          <Link
            key={view.key}
            to={view.to}
            replace={replace}
            aria-current={on ? 'page' : undefined}
            onClick={onChoose ? () => onChoose(view.key) : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-md px-3.5 text-sm transition-colors sm:h-8',
              on ? 'bg-bg-elevated font-medium text-fg-default' : 'text-fg-muted hover:text-fg-default',
              focusRing
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
