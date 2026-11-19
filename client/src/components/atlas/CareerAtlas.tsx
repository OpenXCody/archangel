import { useCallback, useMemo, useState, type FocusEvent, type PointerEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn, focusRing, plural } from '@/lib/utils';
import { LoadError } from '../account/parts';
import type { PlacedSkill, SkillMarks, SkillPath } from '../path/model';
import { SkillTag, SkillTags } from '../path/SkillTag';
import AtlasDrawing, { type AtlasMarks, type AtlasOverlay, type AtlasTarget } from './AtlasDrawing';
import PlateSkeleton from './PlateSkeleton';
import { useAtlasLayout } from './useAtlasLayout';
import { useFreshMark } from './useFreshMark';
import { pathViewSearch } from './pathView';

/**
 * A career's path, seen on the Atlas: the plate with this career laid over
 * it, and under it the career's skills as the tags a person marks.
 *
 * The two are one object. For a seeker a skill still ahead is an open mark in
 * the accent, a held one is filled and the way to it from the centre is
 * bright, and the ring at the centre is how much of the career is held; a
 * tap on a tag's mark draws that way in and fills the leaf. The plate holds
 * still at the top of the screen while the tags move under it, so the change
 * is seen where it is made. A visitor, or someone here to hire, sees the
 * career's shape and the same tags with no marks.
 *
 * Pressing a domain the career reaches turns to it and enlarges, and the tags
 * are narrowed to the career's part of that domain (`?domain=`); one press
 * back shows the whole. The plate itself is drawn once: a mark is a change to
 * a layer over it (`AtlasDrawing`).
 */

interface CareerAtlasProps {
  career: { id: string; title: string; skills: readonly PlacedSkill[] };
  /** The same path the flow draws: levels, then groups, then skills. */
  path: SkillPath;
  /** A seeker's marks; null for a visitor and for someone here to hire. */
  marks: SkillMarks | null;
}

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3';

export default function CareerAtlas({ career, path, marks }: CareerAtlasProps) {
  const { layout, taxonomy } = useAtlasLayout();
  const [params] = useSearchParams();
  const { search } = useLocation();
  const navigate = useNavigate();

  // The career's skills as positions on the plate, and the domains it reaches.
  const overlay: AtlasOverlay | null = useMemo(() => {
    if (!layout) return null;
    const first = new Set<number>();
    for (const skill of career.skills) {
      const leaf = layout.leafById.get(skill.id);
      if (leaf) first.add(leaf.index);
    }
    return first.size > 0 ? { first, second: null } : null;
  }, [layout, career.skills]);
  const reached = useMemo(() => {
    if (!layout || !overlay) return [];
    const found = new Set<number>();
    for (const index of overlay.first) found.add(layout.leaves[index].domain);
    return layout.domains.filter((each) => found.has(each.index));
  }, [layout, overlay]);

  // The open domain, from the address: only one the career has skills in.
  const slug = params.get('domain');
  const domain = (slug && reached.find((each) => each.slug === slug)) || null;

  // This career's skills as the person has marked them: nothing else of theirs is drawn here.
  const drawn: AtlasMarks | null = useMemo(() => {
    if (!layout || !marks) return null;
    const found = new Map<number, 'held' | 'learning'>();
    for (const skill of career.skills) {
      const leaf = layout.leafById.get(skill.id);
      const status = marks.statusOf(skill.id);
      if (leaf && status !== 'none') found.set(leaf.index, status);
    }
    return found;
  }, [layout, marks, career.skills]);

  // The skill just marked held: the plate draws the way to it in, once.
  const { marking, fresh } = useFreshMark(marks, layout);

  const [preview, setPreview] = useState<AtlasTarget | null>(null);
  const open = useCallback(
    (next: string | null) => {
      setPreview(null);
      navigate(pathViewSearch(search, 'atlas', next));
    },
    [navigate, search]
  );
  // On the plate a press opens a domain the career reaches; the rest of the plate is not this career's.
  const within = (target: AtlasTarget | null) => (target && target.domain.index !== domain?.index && reached.some((each) => each.index === target.domain.index) ? target.domain : null);
  const onPreview = (target: AtlasTarget | null) => {
    const next = within(target);
    setPreview((current) => {
      if (!next) return null;
      return current && !current.group && current.domain.index === next.index ? current : { domain: next };
    });
  };
  const onChoose = (target: AtlasTarget) => {
    const next = within(target);
    if (next) open(next.slug);
  };

  // A tag under the pointer or the keyboard is shown on the plate: one listener for the list, none per tag.
  // A finger's tap is not pointing: what it marks is answered by the plate itself.
  const pointAt = (event: PointerEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if ('pointerType' in event ? event.pointerType !== 'mouse' : !target.matches?.(':focus-visible')) return;
    const id = target.closest?.('[data-skill-tag]')?.getAttribute('data-skill-tag');
    const leaf = (id && layout?.leafById.get(id)) || null;
    setPreview((current) => (current?.leaf?.index === leaf?.index ? current : leaf && layout ? { domain: layout.domains[leaf.domain], group: layout.groups[leaf.group], leaf } : null));
  };

  if (taxonomy.isError && !layout) {
    return <LoadError error={taxonomy.error} onRetry={() => void taxonomy.refetch()} retrying={taxonomy.isFetching} />;
  }

  const levels = path.levels
    .map((level) => ({ ...level, groups: domain ? level.groups.filter((group) => group.domain?.slug === domain.slug) : level.groups }))
    .filter((level) => level.groups.length > 0);
  const label = `${career.title} on the Atlas of Manufacturing: ${plural(overlay?.first.size ?? 0, 'skill', 'skills')} across ${plural(reached.length, 'domain', 'domains')}. The skills follow as a list.`;
  const crumb = cn('inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:text-text-1 hover:underline sm:min-h-8', focusRing);

  return (
    <div className="career-atlas" data-career-atlas data-career-atlas-domain={domain?.slug}>
      <div className="career-atlas-plate">
        {!layout ? (
          <PlateSkeleton />
        ) : (
          <div className="relative">
            <AtlasDrawing
              layout={layout}
              domain={domain}
              group={null}
              leaf={null}
              overlay={overlay}
              marks={drawn}
              walk={Boolean(marks)}
              fresh={fresh}
              preview={preview}
              onPreview={onPreview}
              onChoose={onChoose}
              label={label}
            />
            {domain && (
              <Link
                to={pathViewSearch(search, 'atlas')}
                data-career-atlas-whole
                className={cn(
                  'absolute left-0 top-0 inline-flex h-11 items-center gap-1.5 rounded-lg bg-bg/85 pr-3 text-sm text-text-2 transition-colors hover:text-text-1',
                  focusRing
                )}
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Whole path
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="career-atlas-list min-w-0" onPointerOver={pointAt} onPointerLeave={() => setPreview(null)} onFocus={pointAt} onBlur={() => setPreview(null)}>
        {/* The domains this career draws on, in the plate's order: the same press in words, for the keyboard and a screen reader. */}
        {reached.length > 1 && (
          <nav aria-label="Domains of this path" data-career-atlas-domains className="text-sm text-text-2">
            <ul className="flex flex-wrap items-center gap-x-4">
              <li>
                <Link to={pathViewSearch(search, 'atlas')} aria-current={domain ? undefined : 'true'} className={cn(crumb, !domain && 'font-medium text-text-1')}>
                  All
                </Link>
              </li>
              {reached.map((each) => (
                <li key={each.slug}>
                  <Link
                    to={pathViewSearch(search, 'atlas', each.slug)}
                    aria-current={domain?.index === each.index ? 'true' : undefined}
                    data-career-atlas-domain-link={each.slug}
                    className={cn(crumb, domain?.index === each.index && 'font-medium text-text-1')}
                  >
                    {each.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {levels.map((level) => (
          <section key={level.level} className="mt-4 first:mt-0" data-career-atlas-level={level.level}>
            <h3 className={cn(EYEBROW, 'mb-2')}>{level.name}</h3>
            <ul className="career-atlas-groups">
              {level.groups.map((group) => {
                const whole = marking ? group.skills.every((skill) => marking.statusOf(skill.id) === 'held') : false;
                return (
                  <li key={group.slug} className="min-w-0">
                    {/* The same frame the flow uses, with no figure of its own: here the plate says how much is held. */}
                    <fieldset className="skill-group" data-group-box data-complete={whole || undefined}>
                      <legend className="skill-group-name">
                        <span className="min-w-0 break-words">{group.name}</span>
                      </legend>
                      <SkillTags>
                        {group.skills.map((skill) => (
                          <SkillTag key={skill.id} skill={skill} marks={marking} />
                        ))}
                      </SkillTags>
                    </fieldset>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <p className="mt-4">
          <Link
            to={`/atlas?career=${career.id}`}
            data-atlas-link
            className={cn('inline-flex min-h-11 items-center text-sm text-text-2 underline underline-offset-4 transition-colors hover:text-text-1', focusRing)}
          >
            Open in the atlas
          </Link>
        </p>
      </div>
    </div>
  );
}
