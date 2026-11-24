import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn, plural } from '@/lib/utils';
import type { TaxonomyDomain } from '../../lib/api';
import { LEVEL_NAME } from '../../lib/stages';
import { readStored, writeStored } from '../../lib/storage';
import { Band, Panel, PanelHead, panelRowClass, secondaryActionClass } from '../layout/Panel';

/**
 * The Skills list in the taxonomy's own order: the Atlas, as a list, in the
 * contained system (`components/layout/Panel.tsx`).
 *
 * Each domain is a `Band`: a raised bar with its name at section size and how
 * many groups and skills it holds, closed when the page arrives, so the list
 * opens as an index of the sixteen domains. Opened, the bar holds under the
 * header while its domain is on screen, its sentence and the way to it on the
 * atlas stand under it, and its skill groups follow as panels, each the
 * group's name and size over its skills, set in two balanced columns from a
 * laptop up (no group waits beside a longer one, so the columns leave no
 * holes). A skill is a row: its name, and its level in meta ink. The next
 * domain begins with its own bar, which nobody can miss.
 */
export default function SkillTree({ domains }: { domains: TaxonomyDomain[] }) {
  // A list narrowed to one domain is that domain, open.
  const one = domains.length === 1;
  const [open, setOpen] = useState<Record<string, boolean>>(() => readOpen());
  const isOpen = (state: Record<string, boolean>, slug: string) => state[slug] ?? one;
  const toggle = (slug: string) =>
    setOpen((current) => {
      const next = { ...current, [slug]: !isOpen(current, slug) };
      writeStored(STORE, JSON.stringify(next), 'session');
      return next;
    });

  return (
    <div className="space-y-2" data-skill-tree>
      {domains.map((domain) => {
        const skills = domain.groups.reduce((sum, group) => sum + group.skills.length, 0);
        return (
          <Band
            key={domain.slug}
            title={domain.name}
            meta={
              <>
                <span className="block text-text-2">{plural(skills, 'skill', 'skills')}</span>
                <span className="block">{plural(domain.groups.length, 'group', 'groups')}</span>
              </>
            }
            description={domain.description}
            open={isOpen(open, domain.slug)}
            onToggle={() => toggle(domain.slug)}
            actions={
              <Link to={`/atlas?domain=${encodeURIComponent(domain.slug)}`} className={cn(secondaryActionClass, 'h-9 px-3 sm:h-9')}>
                On the atlas
                <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-text-2" />
              </Link>
            }
            data-skill-domain={domain.slug}
          >
            {/* Columns, not a grid: a short group never stands beside a long one with a hole under it. */}
            <div className="gap-3 lg:columns-2">
              {domain.groups.map((group) => (
                <Panel key={group.slug} className="mb-3 break-inside-avoid" data-skill-group={group.slug}>
                  <PanelHead title={group.name} meta={plural(group.skills.length, 'skill', 'skills')} />
                  <ul>
                    {group.skills.map((skill) => (
                      <li key={skill.id} className="border-t border-line first:border-t-0">
                        <Link to={`/skills/${skill.id}`} className={cn(panelRowClass, 'min-h-11 justify-between gap-4 py-2')}>
                          <span className="min-w-0 break-words text-sm leading-snug text-text-1">{skill.name}</span>
                          <span className="shrink-0 whitespace-nowrap text-[13px] text-text-3" data-skill-level>
                            {LEVEL_NAME[skill.level]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ))}
            </div>
          </Band>
        );
      })}
    </div>
  );
}

/** Where the domains a person opened are kept for the visit. */
const STORE = 'archangel.skillTree.open';

function readOpen(): Record<string, boolean> {
  try {
    const stored: unknown = JSON.parse(readStored(STORE, 'session') ?? '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return {};
  }
}
