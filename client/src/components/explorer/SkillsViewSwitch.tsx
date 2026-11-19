import { Link } from 'react-router-dom';
import { cn, focusRing } from '@/lib/utils';

/**
 * The Skills list and the Atlas are two views of one thing: every skill, by
 * domain and group. Both sit under the Skills tab, and this is the one quiet
 * switch between them. It keeps the domain and group that are open, so the
 * list narrowed to a group opens the atlas on that group, and back.
 */
export default function SkillsViewSwitch({ current, domain, group }: { current: 'list' | 'atlas'; domain?: string | null; group?: string | null }) {
  const list = new URLSearchParams({ tab: 'skills' });
  if (domain) list.set('domain', domain);
  if (domain && group) list.set('group', group);
  const atlas = new URLSearchParams();
  if (group) atlas.set('group', group);
  else if (domain) atlas.set('domain', domain);
  const views = [
    { key: 'list', label: 'List', to: `/explore?${list.toString()}` },
    { key: 'atlas', label: 'Atlas', to: atlas.size > 0 ? `/atlas?${atlas.toString()}` : '/atlas' },
  ] as const;
  return (
    <nav aria-label="Skills as" data-skills-view className="inline-flex shrink-0 rounded-lg border border-border-strong p-0.5">
      {views.map((view) => {
        const on = view.key === current;
        return (
          <Link
            key={view.key}
            to={view.to}
            aria-current={on ? 'page' : undefined}
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
