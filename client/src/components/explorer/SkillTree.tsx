import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, focusRing, plural } from '@/lib/utils';
import type { TaxonomyDomain } from '../../lib/api';
import { LEVEL_NAME } from '../../lib/stages';

/**
 * The Skills list in the taxonomy's own order: the Atlas, as a list. Each
 * domain is a heading with its sentence, each skill group a small heading
 * over its skills, and each skill a row with its level; the order is the
 * order the drawing runs in, clockwise from the top. A domain's heading
 * leads to that domain on the atlas.
 */
export default function SkillTree({ domains }: { domains: TaxonomyDomain[] }) {
  return (
    <div data-skill-tree>
      {domains.map((domain) => (
        <section
          key={domain.slug}
          data-skill-domain={domain.slug}
          // Sections below the fold are laid out when they are scrolled to: 643 rows, drawn as they are needed.
          className="border-t border-line pb-8 pt-6 first:border-t-0 first:pt-3 [contain-intrinsic-size:auto_60rem] [content-visibility:auto] sm:pb-10"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-6">
            <h2 className="text-xl font-semibold text-text-1">{domain.name}</h2>
            <Link
              to={`/atlas?domain=${encodeURIComponent(domain.slug)}`}
              className={cn(
                'inline-flex min-h-11 items-center gap-1 text-sm text-text-2 transition-colors hover:text-text-1 hover:underline sm:min-h-0',
                focusRing
              )}
            >
              On the atlas
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-text-3" />
            </Link>
          </div>
          {domain.description && <p className="max-w-3xl text-sm leading-relaxed text-text-2 sm:mt-1">{domain.description}</p>}
          <div className="mt-5 grid grid-cols-1 gap-x-12 gap-y-7 lg:grid-cols-2">
            {domain.groups.map((group) => (
              <div key={group.slug} data-skill-group={group.slug} className="min-w-0">
                <h3 className="border-b border-line pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-2">{group.name}</h3>
                <ul>
                  {group.skills.map((skill) => (
                    <li key={skill.id} className="border-b border-line">
                      <Link
                        to={`/skills/${skill.id}`}
                        className={cn('group flex min-h-11 items-baseline justify-between gap-4 py-2.5 text-[15px] leading-snug sm:min-h-0 sm:py-2', focusRing)}
                      >
                        <span className="min-w-0 text-text-1 group-hover:underline">{skill.name}</span>
                        <span className="shrink-0 whitespace-nowrap text-sm text-text-3">
                          <span data-skill-level>{LEVEL_NAME[skill.level]}</span>
                          {/* How many careers use it: on a phone the level alone fits. */}
                          {skill.careers > 0 && <span className="hidden tabular-nums sm:inline">{` · ${plural(skill.careers, 'career', 'careers')}`}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
