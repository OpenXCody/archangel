import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, X } from 'lucide-react';
import { cn, focusRing, plural } from '@/lib/utils';
import type { OccupationDetail } from '../../lib/api';
import { recordQuery, useTaxonomy } from '../../lib/queries';
import { useMySkills } from '../../lib/seeker';
import { useViewer } from '../../lib/viewer';
import { ApiError, errorMessage } from '../../lib/http';
import CareerPicker from '../account/CareerPicker';
import { LoadError } from '../account/parts';
import SkillsViewSwitch from '../explorer/SkillsViewSwitch';
import AtlasDrawing, { type AtlasMarks, type AtlasOverlay, type AtlasTarget } from './AtlasDrawing';
import AtlasPanel, { LitSign } from './AtlasPanel';
import type { AtlasLayout } from './layout';
import PlateSkeleton from './PlateSkeleton';
import { atlasLayoutOf } from './useAtlasLayout';
import { atlasHref, readAtlasState } from './state';

/**
 * The Atlas of Manufacturing: every skill in one radial tree. The centre is
 * manufacturing; its sixteen domains branch into skill groups and those into
 * skills, each set further out the higher its level, so the foundation reads
 * as the inner band and the specialties as the rim. A career can be laid over
 * it, and a second over the first.
 *
 * Everything the page shows is in its address (see `state.ts`). The drawing
 * waits for one request, the taxonomy; a career is one more.
 */

function useCareer(id: string | null | undefined) {
  return useQuery({ ...recordQuery('occupations', id), enabled: Boolean(id), staleTime: 5 * 60_000, retry: false });
}

/** A career's skills as positions on the plate. A skill the taxonomy does not hold has no leaf to light. */
function leavesOf(layout: AtlasLayout, career: OccupationDetail | undefined): Set<number> | null {
  if (!career) return null;
  const leaves = new Set<number>();
  for (const skill of career.skills) {
    const leaf = layout.leafById.get(skill.id);
    if (leaf) leaves.add(leaf.index);
  }
  return leaves;
}

const domainsOf = (layout: AtlasLayout, leaves: ReadonlySet<number>) => new Set([...leaves].map((index) => layout.leaves[index].domain)).size;

const TEXT_BUTTON = cn(
  'inline-flex min-h-11 items-center text-sm text-fg-muted underline underline-offset-4 transition-colors hover:text-fg-default sm:min-h-9',
  focusRing
);

interface CareerLineProps {
  sign: 'first' | 'second';
  id: string;
  career: ReturnType<typeof useCareer>;
  /** What follows the career's name: "17 skills across 4 domains". */
  facts: string | null;
  removeTo: string;
}

/** One career laid over the atlas: its sign, its name, what is lit, and the way to take it off. */
function CareerLine({ sign, id, career, facts, removeTo }: CareerLineProps) {
  const title = career.data?.title;
  return (
    <div className="flex min-h-11 items-center gap-2.5 text-sm" data-atlas-career={id}>
      <LitSign kind={sign} />
      <p className="min-w-0 flex-1 leading-snug text-fg-muted">
        {career.isError ? (
          // A link to a career that is gone, or was mistyped: said in the product's own word.
          <span role="alert">
            {career.error instanceof ApiError && career.error.status >= 400 && career.error.status < 500 ? 'That career is not in the catalogue.' : errorMessage(career.error)}
          </span>
        ) : title ? (
          <>
            <Link to={`/occupations/${id}`} className={cn('font-medium text-fg-default underline-offset-4 hover:underline', focusRing)}>
              {title}
            </Link>
            {facts && <span data-atlas-career-facts>{` · ${facts}`}</span>}
          </>
        ) : (
          <span aria-hidden="true" className="inline-block h-3.5 w-44 max-w-full animate-pulse rounded bg-primary/10 align-middle" />
        )}
      </p>
      <Link
        to={removeTo}
        replace
        aria-label={title ? `Take ${title} off the atlas` : 'Take this career off the atlas'}
        className={cn('-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:text-fg-default', focusRing)}
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>
  );
}

export default function Atlas() {
  const taxonomy = useTaxonomy();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const state = useMemo(() => readAtlasState(params), [params]);
  const layout = taxonomy.data ? atlasLayoutOf(taxonomy.data) : null;

  // What is open, from the address: a skill opens its group, a group its domain.
  const leaf = (layout && state.skill && layout.leafById.get(state.skill)) || null;
  const group = layout ? (leaf ? layout.groups[leaf.group] : (state.group && layout.groupBySlug.get(state.group)) || null) : null;
  const domain = layout ? (group ? layout.domains[group.domain] : (state.domain && layout.domainBySlug.get(state.domain)) || null) : null;

  // The careers laid over it.
  const first = useCareer(state.career);
  const second = useCareer(state.career ? state.with : null);
  const overlay: AtlasOverlay | null = useMemo(() => {
    if (!layout) return null;
    const a = leavesOf(layout, first.data);
    const b = leavesOf(layout, second.data);
    if (!a || (a.size === 0 && (!b || b.size === 0))) return null;
    return { first: a, second: b };
  }, [layout, first.data, second.data]);

  // A seeker's own skills, in the product's one mark. Nobody else has marks.
  const viewer = useViewer();
  const mine = useMySkills(viewer.signedIn && viewer.seeker);
  const marks: AtlasMarks | null = useMemo(() => {
    if (!layout || !viewer.seeker || !mine.data) return null;
    const found = new Map<number, 'held' | 'learning'>();
    for (const skill of mine.data) {
      const at = layout.leafById.get(skill.skillId);
      if (at) found.set(at.index, skill.status);
    }
    return found;
  }, [layout, viewer.seeker, mine.data]);

  const [preview, setPreview] = useState<AtlasTarget | null>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => setPicking(false), [state.career, state.with]);

  const choose = useCallback(
    (target: AtlasTarget) => {
      setPreview(null);
      navigate(
        atlasHref({
          career: state.career,
          with: state.with,
          ...(target.leaf ? { skill: target.leaf.id } : target.group ? { group: target.group.slug } : { domain: target.domain.slug }),
        })
      );
    },
    [navigate, state.career, state.with]
  );

  const title = leaf?.name ?? group?.name ?? domain?.name;
  useEffect(() => {
    document.title = title ? `${title} · Atlas · Archangel` : 'Atlas of Manufacturing · Archangel';
  }, [title]);

  const open = { domain: domain?.slug, group: group?.slug, skill: leaf?.id };
  const facts = useMemo(() => {
    if (!layout || !overlay) return { first: null, second: null, both: null };
    const a = overlay.first;
    const b = overlay.second;
    const count = (leaves: ReadonlySet<number>) =>
      leaves.size === 0 ? 'no skills recorded' : `${plural(leaves.size, 'skill', 'skills')} across ${plural(domainsOf(layout, leaves), 'domain', 'domains')}`;
    if (!b) return { first: count(a), second: null, both: null };
    let shared = 0;
    for (const index of a) if (b.has(index)) shared += 1;
    return {
      first: plural(a.size, 'skill', 'skills'),
      second: plural(b.size, 'skill', 'skills'),
      both: { shared, first: a.size - shared, second: b.size - shared },
    };
  }, [layout, overlay]);

  const label = layout
    ? `The Atlas of Manufacturing: ${layout.leaves.length} skills in ${layout.groups.length} skill groups and ${layout.domains.length} domains, drawn as a radial tree. The same tree follows as a list.`
    : 'The Atlas of Manufacturing';

  return (
    <div data-atlas>
      <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-x-6 sm:mt-4">
        <SkillsViewSwitch current="atlas" domain={domain?.slug} group={group?.slug} />
        {!state.with && (
          <button type="button" aria-expanded={picking} onClick={() => setPicking((on) => !on)} className={TEXT_BUTTON} data-atlas-lay>
            {state.career ? 'Compare with another career' : 'Lay a career over the atlas'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="relative order-2 min-w-0 lg:order-1">
          {taxonomy.isError && !layout ? (
            <LoadError error={taxonomy.error} onRetry={() => void taxonomy.refetch()} retrying={taxonomy.isFetching} className="mt-4" />
          ) : !layout ? (
            <PlateSkeleton className="atlas-frame mx-auto" />
          ) : layout.leaves.length === 0 ? (
            <p className="py-16 text-center text-sm text-fg-muted">None yet.</p>
          ) : (
            <div className="atlas-frame relative mx-auto">
              <AtlasDrawing
                layout={layout}
                domain={domain}
                group={group}
                leaf={leaf}
                overlay={overlay}
                marks={marks}
                preview={preview}
                onPreview={setPreview}
                onChoose={choose}
                label={label}
              />
              {domain && (
                <Link
                  to={atlasHref({ career: state.career, with: state.with })}
                  data-atlas-whole
                  className={cn(
                    'absolute left-0 top-0 inline-flex h-11 items-center gap-1.5 rounded-lg bg-bg-base/85 pr-3 text-sm text-fg-muted transition-colors hover:text-fg-default',
                    focusRing
                  )}
                >
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                  Whole atlas
                </Link>
              )}
              {!domain && !overlay && (
                <p className="mx-auto mt-1 max-w-md text-center text-xs leading-relaxed text-fg-soft [text-wrap:balance]" data-atlas-key>
                  Fundamentals sit nearest the centre, Advanced at the rim. A stronger mark is a skill more careers use.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Beside the drawing on a wide screen. On a phone its two parts sit above and below the drawing. */}
        <div className="contents lg:order-2 lg:block">
        {(picking || state.career) && (
          <div className="order-1 mb-3 min-w-0 lg:mb-5" data-atlas-careers>
            {state.career && (
              <CareerLine
                sign="first"
                id={state.career}
                career={first}
                facts={facts.first}
                removeTo={atlasHref({ ...open, career: state.with })}
              />
            )}
            {state.career && state.with && (
              <CareerLine sign="second" id={state.with} career={second} facts={facts.second} removeTo={atlasHref({ ...open, career: state.career })} />
            )}
            {facts.both && (
              <p className="flex flex-wrap items-center gap-x-2 pb-1 pt-0.5 text-sm text-fg-muted" data-atlas-shared>
                <LitSign kind="shared" />
                <span>
                  {facts.both.shared === 0 ? 'No skill in common' : `${plural(facts.both.shared, 'skill', 'skills')} in common`}
                  {` · ${facts.both.first} and ${facts.both.second} of their own`}
                </span>
              </p>
            )}
            {picking && (
              <div className="pb-1 pt-1.5">
                <label htmlFor="atlas-career" className="sr-only">
                  {state.career ? 'Compare with another career' : 'Lay a career over the atlas'}
                </label>
                <CareerPicker
                  id="atlas-career"
                  value={null}
                  onChange={(career) => {
                    if (!career) return;
                    navigate(atlasHref({ ...open, career: state.career ?? career.id, with: state.career ? career.id : null }));
                  }}
                />
              </div>
            )}
          </div>
        )}

        {layout && layout.leaves.length > 0 && (
          <AtlasPanel
            layout={layout}
            domain={domain}
            group={group}
            leaf={leaf}
            state={state}
            overlay={overlay}
            marks={marks}
            onPreview={setPreview}
            className="order-3 mt-5 lg:mt-0"
          />
        )}
        </div>
      </div>
    </div>
  );
}
