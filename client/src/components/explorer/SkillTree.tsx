import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn, plural } from '@/lib/utils';
import type { TaxonomyDomain } from '../../lib/api';
import { readStored, writeStored } from '../../lib/storage';
import { Band, Panel, PanelHead, panelRowClass, secondaryActionClass } from '../layout/Panel';

/**
 * The Skills list in the taxonomy's own order: the Atlas, as a list, in the
 * contained system (`components/layout/Panel.tsx`).
 *
 * Each domain is a `Band`: a raised bar with its name at section size and how
 * many skills and groups it holds, closed when the page arrives, so the list
 * opens as an index of the sixteen domains with nothing cut short. Opened, the
 * bar holds under the header while its domain is on screen, its sentence
 * stands under it, and its skill groups follow in the taxonomy's order, one
 * panel each, the width of the page: the group's name and size over its
 * skills, which stand in columns that read down (two from a tablet, three
 * from a laptop). A skill is its name alone: its level is said on its page.
 * The domain ends in the way to it on the atlas, a button, and the next
 * domain begins with its own bar, which nobody can miss.
 */
export default function SkillTree({ domains }: { domains: TaxonomyDomain[] }) {
  // A list narrowed to one domain is that domain, open, whatever the person did to its bar in the whole list:
  // what they open and close there is kept apart from what they open and close in the index of all sixteen.
  const one = domains.length === 1;
  const [open, setOpen] = useState<Record<string, boolean>>(() => readOpen());
  const keyOf = (slug: string) => (one ? `only:${slug}` : slug);
  const isOpen = (state: Record<string, boolean>, slug: string) => state[keyOf(slug)] ?? one;
  const toggle = (slug: string) =>
    setOpen((current) => {
      const next = { ...current, [keyOf(slug)]: !isOpen(current, slug) };
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
              <Link to={`/atlas?domain=${encodeURIComponent(domain.slug)}`} className={secondaryActionClass} data-band-atlas>
                {domain.name} on the atlas
                <ArrowRight aria-hidden="true" className="h-4 w-4 text-text-2" />
              </Link>
            }
            data-skill-domain={domain.slug}
          >
            <div className="space-y-3">
              {domain.groups.map((group) => (
                <Panel key={group.slug} data-skill-group={group.slug}>
                  <PanelHead title={group.name} meta={plural(group.skills.length, 'skill', 'skills')} />
                  {/* Columns read down: the group's skills stay in its own order, top to bottom, then across. */}
                  <ul className="-mt-px gap-0 [column-rule:1px_solid_var(--line)] md:columns-2 lg:columns-3">
                    {group.skills.map((skill) => (
                      <li key={skill.id} className="break-inside-avoid border-t border-line">
                        <Link to={`/skills/${skill.id}`} className={cn(panelRowClass, 'min-h-11 py-2')}>
                          <span className="min-w-0 break-words text-sm leading-snug text-text-1">{skill.name}</span>
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
