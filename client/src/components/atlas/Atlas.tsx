import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { kindLine } from '@shared/military';
import type { Occupation } from '../../lib/api';
import { recordQuery } from '../../lib/queries';
import { isNoVersion, useVersion } from '../../lib/versions';
import { LoadError } from '../account/parts';
import SkillsViewSwitch from '../explorer/SkillsViewSwitch';
import { useSkillMarks } from '../path/useSkillMarks';
import AtlasList, { type AtlasListHandle, type CareerBlock } from './AtlasList';
import CareerSheet from './CareerSheet';
import { EDGE, FUNDAMENTALS, HEAD, RIM, RR, chosen, modeOf, wordsOf, type Hit, type Mode, type Selection } from './camera';
import { layOver, type AtlasModel } from './model';
import { ATLAS_BUTTON, BAR_WIDTH, careerName } from './parts';
import { atlasHref, readAtlasState } from './state';
import { useAtlasModel } from './useAtlasModel';
import { addressOf, leadingField, onlySkillMoved, viewOf } from './view';
import { createWheel, type Overlay, type ShownName, type Wheel } from './wheel';

/**
 * The Atlas of Manufacturing: one screen. The wheel is a display (a canvas:
 * wheel.ts); the list beside it, under it on a phone, is the control, and
 * whatever is chosen in the list is named on the wheel in the same words.
 *
 * Everything the page shows is in its address (state.ts), read against the
 * wheel (view.ts): what is open, the career laid over it, a company's version
 * of that career, a military career under it. The wheel changes nothing by
 * itself: a press on it becomes an address, and the address comes back as
 * what the wheel is told. The drawing waits for one request, the taxonomy; a
 * career is one more.
 */

/** What a script can ask the page: the wheel as it stands, and the model it draws. */
export interface AtlasHandle {
  model: AtlasModel;
  shown: () => ShownName[];
  line: (skill: number) => [number, number, number, number];
  size: () => { W: number; H: number; dpr: number };
  mode: () => Mode;
  cam: () => { cx: number; cy: number; R: number; core: number };
  geom: { RR: readonly number[]; RIM: number; HEAD: number; EDGE: number };
}

declare global {
  interface Window {
    __atlas?: AtlasHandle;
  }
}

/** True when a failed read means "there is no such career", not "the request failed". */
const isMissing = (error: unknown): boolean => error instanceof Error && /not found|invalid id/i.test(error.message);

function useCareer(id: string | null | undefined) {
  return useQuery({ ...recordQuery('occupations', id), enabled: Boolean(id), staleTime: 5 * 60_000, retry: false });
}

/** A career's skills as places on the wheel. A skill the wheel does not hold has no line to light. */
function placesOf(model: AtlasModel, skills: readonly { id: string }[]): number[] {
  const out: number[] = [];
  for (const skill of skills) {
    const s = model.skillById.get(skill.id);
    if (s !== undefined && !out.includes(s)) out.push(s);
  }
  return out;
}

export default function Atlas() {
  const { taxonomy, model } = useAtlasModel();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = useMemo(() => readAtlasState(params), [params]);

  // ---- the careers the address names -------------------------------------------------------------------------------
  // The career itself, or with `at` a company's version of it: the same skills with the company's changes.
  const career = useCareer(state.at ? null : state.career);
  const version = useVersion(state.at, state.career, Boolean(state.at));
  const rating = useCareer(state.career ? state.from : null);
  const careerGone = !state.at && career.isError && isMissing(career.error);
  const atGone = Boolean(state.at) && version.isError && isNoVersion(version.error);
  // Only a military career lies under another.
  const fromGone = (rating.isError && isMissing(rating.error)) || Boolean(rating.data && !rating.data.service);

  // ---- the address, read against the wheel ---------------------------------------------------------------------------
  const view = useMemo(
    () => (model && taxonomy.data ? viewOf(model, taxonomy.data, state, { career: careerGone, at: atGone, from: fromGone }) : null),
    [model, taxonomy.data, state, careerGone, atGone, fromGone]
  );
  // Anything the address names that is not there (or a word from an older Atlas) is cleaned from it.
  const here = location.pathname + location.search;
  const proper = view ? atlasHref(view.address) : null;
  useEffect(() => {
    if (proper && proper !== here) navigate(proper, { replace: true });
  }, [proper, here, navigate]);

  const { core, field, group, skill } = view?.selection ?? { core: false, field: -1, group: -1, skill: -1 };
  const selection: Selection = useMemo(() => ({ core, field, group, skill }), [core, field, group, skill]);
  const mode: Mode = model ? modeOf(model, selection) : 'rest';

  // ---- what is laid over the wheel -----------------------------------------------------------------------------------
  const first = state.at ? version.data : career.data;
  const under = state.from && !fromGone ? rating.data : undefined;
  const need = useMemo(() => (model && first ? placesOf(model, first.skills) : null), [model, first]);
  const have = useMemo(() => (model && need && under ? new Set(placesOf(model, under.skills)) : null), [model, need, under]);
  // A seeker fills the one career in here: bright is the person, the accent is the career. Nobody else has marks.
  const { marks } = useSkillMarks();
  const walking = marks !== null && need !== null && !state.from;
  const heldKey = walking && model ? need.filter((s) => marks.statusOf(model.S[s].id) === 'held').join(',') : null;
  const held = useMemo(() => (heldKey === null ? null : new Set(heldKey ? heldKey.split(',').map(Number) : [])), [heldKey]);
  const overlay: Overlay | null = useMemo(() => (need ? { need, have, held } : null), [need, have, held]);
  const laid = useMemo(() => (model ? layOver(model, need, have) : null), [model, need, have]);

  const block: CareerBlock | null = useMemo(() => {
    if (!state.career || !first || !need) return null;
    const title = 'company' in first ? first.title : careerName(first);
    const kind = 'company' in first ? null : kindLine(first.kind, first.code);
    const total = need.length;
    let eyebrow = kind ?? 'Career';
    if (have && under) eyebrow = `${need.filter((s) => have.has(s)).length} of ${total} carry over from ${careerName(under)}`;
    else if (held && held.size > 0) eyebrow = `${held.size} of ${total} held`;
    return {
      eyebrow,
      name: title,
      to: state.at ? `/occupations/${state.career}?at=${encodeURIComponent(state.at)}` : `/occupations/${state.career}`,
      rated: Boolean(state.from),
    };
  }, [state.career, state.at, state.from, first, need, have, under, held]);

  // ---- choosing ------------------------------------------------------------------------------------------------------
  const list = useRef<AtlasListHandle>(null);
  const laidOver = useMemo(() => ({ career: state.career, at: state.at, from: state.from }), [state.career, state.at, state.from]);
  const go = useCallback(
    (next: Selection, how: { reveal?: boolean } = {}) => {
      if (!model) return;
      const href = atlasHref({ ...addressOf(model, next), ...laidOver });
      if (href === here) {
        if (how.reveal) list.current?.reveal();
        return;
      }
      if (how.reveal) list.current?.reveal('change');
      // Back steps through what was opened; a skill chosen or let go inside its group is no step.
      navigate(href, { replace: onlySkillMoved(selection, next) });
    },
    [model, laidOver, here, navigate, selection]
  );

  // ---- the wheel -----------------------------------------------------------------------------------------------------
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wheel = useRef<Wheel | null>(null);
  const fresh = useRef(true);
  const [hover, setHover] = useState<Hit | null>(null);
  // The wheel is made once for a model; what a press on it does follows the address of the moment.
  const choose = useRef<(hit: Hit) => void>(() => undefined);
  choose.current = (hit) => {
    if (model) go(chosen(model, hit), { reveal: true });
  };
  const drawn = model !== null && model.N > 0;
  useEffect(() => {
    if (!model || !drawn || !canvas.current || !stage.current) return;
    const made = createWheel({ canvas: canvas.current, stage: stage.current, model, onChoose: (hit) => choose.current(hit), onHover: setHover });
    wheel.current = made;
    fresh.current = true;
    window.__atlas = { model, shown: made.shown, line: made.line, size: made.size, mode: made.mode, cam: made.cam, geom: { RR, RIM, HEAD, EDGE } };
    return () => {
      made.destroy();
      wheel.current = null;
      delete window.__atlas;
      setHover(null);
    };
  }, [model, drawn]);
  // On arrival the wheel stands where the address says at once; after that it turns there.
  useEffect(() => {
    if (!wheel.current) return;
    wheel.current.set(selection, overlay, { instant: fresh.current });
    fresh.current = false;
  }, [model, drawn, selection, overlay]);
  const point = useCallback((hit: Hit | null) => wheel.current?.point(hit), []);

  // ---- the careers' sheet --------------------------------------------------------------------------------------------
  const [picking, setPicking] = useState<'career' | 'from' | null>(null);
  const lay = useRef<HTMLButtonElement>(null);
  const pick = (picked: Occupation) => {
    const kind = picking;
    setPicking(null);
    if (!model) return;
    list.current?.toTop();
    if (kind === 'from') {
      // A rating keeps what is open.
      const href = atlasHref({ ...addressOf(model, selection), career: state.career, at: state.at, from: picked.id });
      if (href !== here) navigate(href);
      return;
    }
    // A career opens the field that holds most of its skills.
    const open = (fieldSlug: string | null) => {
      list.current?.toTop();
      navigate(atlasHref({ field: fieldSlug, career: picked.id }));
    };
    queryClient
      .fetchQuery({ ...recordQuery('occupations', picked.id), staleTime: 5 * 60_000 })
      .then((read) => {
        const f = leadingField(layOver(model, placesOf(model, read.skills), null).fields);
        open(f >= 0 ? model.F[f].slug : null);
      })
      .catch(() => open(null));
  };
  const none = () => {
    const kind = picking;
    setPicking(null);
    if (!model) return;
    list.current?.toTop();
    const kept = kind === 'from' ? { career: state.career, at: state.at } : {};
    const href = atlasHref({ ...addressOf(model, selection), ...kept });
    if (href !== here) navigate(href);
  };

  // ---- what the page is called ---------------------------------------------------------------------------------------
  const title = model ? (skill >= 0 ? model.S[skill].name : group >= 0 ? model.G[group].name : field >= 0 ? model.F[field].name : core ? FUNDAMENTALS : null) : null;
  useEffect(() => {
    document.title = title ? `${title} · Atlas · Archangel` : 'Atlas of Manufacturing · Archangel';
  }, [title]);

  // The Skills list narrowed to the group that is chosen here, and its domain.
  const chosenGroup = model && group >= 0 ? model.G[group].slug : null;
  const chosenDomain = useMemo(
    () => (chosenGroup && taxonomy.data ? (taxonomy.data.domains.find((domain) => domain.groups.some((each) => each.slug === chosenGroup))?.slug ?? null) : null),
    [chosenGroup, taxonomy.data]
  );

  const words = model && hover ? wordsOf(model, hover) : null;
  const failed = state.at ? version : career;
  const careerNote =
    state.career && failed.isError && !careerGone && !atGone ? (
      <LoadError error={failed.error} onRetry={() => void failed.refetch()} retrying={failed.isFetching} className="mb-2" />
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-atlas data-atlas-mode={drawn ? mode : undefined}>
      <h1 className="sr-only">Atlas of Manufacturing</h1>
      {/* The bar's hairline runs the screen's width over the stage and the list; what it holds stands in the page's. */}
      <div className="touch-none border-b border-line" data-atlas-bar>
        <div className={cn('flex items-center gap-3 py-2 sm:py-2.5', BAR_WIDTH)}>
          <SkillsViewSwitch current="atlas" domain={chosenDomain} group={chosenGroup} />
          <div className="min-w-0 flex-1" />
          <button ref={lay} type="button" aria-haspopup="dialog" onClick={() => setPicking('career')} className={cn(ATLAS_BUTTON, 'min-w-0')} data-atlas-lay>
            <span className="block truncate leading-[22px] min-[900px]:max-w-[360px]">
              {block ? (under ? `${careerName(under)} → ${block.name}` : block.name) : 'Lay a career over'}
            </span>
          </button>
        </div>
      </div>

      {taxonomy.isError && !model ? (
        <div className="p-4">
          <LoadError error={taxonomy.error} onRetry={() => void taxonomy.refetch()} retrying={taxonomy.isFetching} />
        </div>
      ) : model && !drawn ? (
        <p className="py-16 text-center text-sm text-text-2">None yet.</p>
      ) : (
        <div className="atlas-main flex-1">
          <div ref={stage} className="atlas-stage" data-atlas-stage aria-busy={!model || undefined}>
            <canvas ref={canvas} role="img" aria-label="The Atlas of Manufacturing drawn as a wheel. The list beside it holds the same tree as words." />
            {drawn && mode !== 'rest' && (
              <Link
                to={atlasHref(laidOver)}
                data-atlas-whole
                className={cn(ATLAS_BUTTON, 'absolute left-[max(12px,env(safe-area-inset-left,0px))] top-2 min-h-8 bg-bg px-2.5 py-1')}
              >
                Whole atlas
              </Link>
            )}
            <p
              aria-hidden="true"
              data-atlas-readout
              className="pointer-events-none absolute right-4 top-3 hidden max-w-[60%] truncate text-right text-[12px] tracking-[0.02em] text-text-3 min-[900px]:block"
            >
              {words &&
                [
                  { text: words.where, strong: false },
                  { text: words.group, strong: true },
                  { text: words.skill, strong: false },
                ]
                  .filter((word) => word.text)
                  .map((word, at) => (
                    <span key={at}>
                      {at > 0 && ' · '}
                      <span className={word.strong ? 'font-medium text-text-1' : undefined}>{word.text}</span>
                    </span>
                  ))}
            </p>
          </div>
          {model && laid ? (
            <AtlasList
              ref={list}
              model={model}
              selection={selection}
              laid={laid}
              have={have}
              career={block}
              careerNote={careerNote}
              marks={walking ? marks : null}
              onSelect={go}
              onPoint={point}
              onPickRating={() => setPicking('from')}
            />
          ) : (
            <div className="atlas-panel" aria-busy="true" />
          )}
        </div>
      )}

      <CareerSheet picking={picking} onPick={pick} onNone={none} onClose={() => setPicking(null)} fallback={lay} />
    </div>
  );
}
