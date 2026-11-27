import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, type FocusEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn, focusRing } from '@/lib/utils';
import { useMediaQuery } from '../../lib/media';
import { SkillHeldToggle } from '../account/SkillStatusButton';
import type { SkillMarks } from '../path/model';
import { FUNDAMENTALS, modeOf, type Hit, type Selection } from './camera';
import { isCore, statusOf, type AtlasModel, type LaidOver } from './model';

/**
 * The Atlas as a list: the same tree as the wheel, in words, and the control.
 * Under the wheel on a phone and beside it on a wide screen. Fundamentals (the
 * twelve core groups), then the fields in the wheel's order; an open field is
 * its tree, each group hanging by a rail from the group it is built on, with
 * its ring and how many skills it holds; an open group is its skills.
 *
 * It says names, a ring and a count, and nothing else. What is pressed here is
 * named on the wheel in the same words, and the row under the pointer (on a
 * phone, the row the list is scrolled to) is lit there.
 *
 * The list is drawn again on every choice. The row that was pressed is held
 * where it was, and only lifted when what it opened would sit out of sight.
 * It moves by scrolling its own box, never by asking the browser to bring an
 * element into view: that would move the page too.
 */

export interface AtlasListHandle {
  /** Bring the row of what is chosen into view: now, or once the list has been drawn for the choice on its way. */
  reveal(after?: 'change'): void;
  /** Back to the top: a career was laid over, or taken off. */
  toTop(): void;
}

/** The career laid over the wheel, as the block above the list says it. */
export interface CareerBlock {
  /** What stands above the name: its kind, how much is held, or how much carries over. */
  eyebrow: string;
  name: string;
  /** The career's page. */
  to: string;
  /** Whether a military career is named to lie under it. */
  rated: boolean;
}

interface AtlasListProps {
  model: AtlasModel;
  selection: Selection;
  laid: LaidOver;
  /** The skills of the military career laid under the career, as indexes into the model's: what it lacks is the gap. */
  have: ReadonlySet<number> | null;
  career: CareerBlock | null;
  /** In the career's place while it could not be read. */
  careerNote?: ReactNode;
  /** A seeker filling in the one career laid over the wheel: its skills carry the mark. */
  marks: SkillMarks | null;
  onSelect: (next: Selection) => void;
  onPoint: (hit: Hit | null) => void;
  onPickRating: () => void;
}

const EYEBROW = 'text-[11px] font-medium uppercase leading-[14px] tracking-[0.12em] text-text-2';
const ROW = cn('group flex w-full items-stretch text-left', focusRing);
/** A row's words and figure, over the hairline that parts it from the next. */
const BODY = 'flex min-w-0 flex-1 items-center gap-2.5 border-b border-line py-2';
const COUNT = 'whitespace-nowrap text-xs leading-4 tabular-nums text-text-3';

function Chevron() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      strokeWidth={1.6}
      className="h-3 w-3 shrink-0 fill-none stroke-text-3 transition-transform duration-150 group-aria-expanded:rotate-90 motion-reduce:transition-none"
    >
      <path d="M4 2l4 4-4 4" />
    </svg>
  );
}

const attr = (value: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value);

/** What happens to the list's place once it has been drawn for a choice. */
type Intent =
  | { kind: 'hold'; selector: string; top: number; lift: boolean; at: number }
  | { kind: 'reveal'; at: number }
  | { kind: 'top'; at: number };

const AtlasList = forwardRef<AtlasListHandle, AtlasListProps>(function AtlasList(
  { model, selection, laid, have, career, careerNote, marks, onSelect, onPoint, onPickRating },
  ref
) {
  const { G, S, F, fields, order, core } = model;
  const panel = useRef<HTMLDivElement>(null);
  const intent = useRef<Intent | null>(null);
  // While the list slides to a row it has lifted, a press stops it where it is, so the row pressed is the row taken.
  const sliding = useRef(0);
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const rated = have !== null;
  const mode = modeOf(model, selection);

  // ---- the list's own place ----------------------------------------------------------------------------------------
  /**
   * Bring the row of what is chosen into view by moving the list itself and nothing else: a group or a skill only as
   * far as it takes to be seen, a field or Fundamentals to the top. `quiet` is for a choice nobody made here (the
   * page arrived at, Back): at once, and only when the row is out of sight.
   */
  const reveal = useCallback(
    (quiet = false) => {
      const box = panel.current;
      if (!box) return;
      const { core: coreOpen, field, group, skill } = selection;
      const el =
        skill >= 0
          ? box.querySelector(`[data-atlas-skill="${attr(S[skill].id)}"]`)
          : group >= 0
            ? box.querySelector(`[data-atlas-group="${attr(G[group].slug)}"]`)
            : field >= 0
              ? box.querySelector(`[data-atlas-field="${attr(F[field].slug)}"]`)
              : coreOpen
                ? box.querySelector('[data-atlas-fundamentals]')
                : null;
      if (!el) return;
      const pb = box.getBoundingClientRect();
      const eb = el.getBoundingClientRect();
      const hidden = eb.top < pb.top + 8 || eb.bottom > pb.bottom - 8;
      let top: number | null = null;
      if (skill >= 0 || group >= 0) {
        if (eb.top < pb.top + 8) top = box.scrollTop + (eb.top - pb.top) - 8;
        else if (eb.bottom > pb.bottom - 8) top = box.scrollTop + (eb.bottom - pb.bottom) + 8;
      } else if (!quiet || hidden) top = box.scrollTop + (eb.top - pb.top) - 6;
      if (top === null) return;
      top = Math.max(0, Math.round(top));
      if (quiet || matchMedia('(prefers-reduced-motion: reduce)').matches || typeof box.scrollTo !== 'function') box.scrollTop = top;
      else box.scrollTo({ top, behavior: 'smooth' });
    },
    [selection, S, G, F]
  );

  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useImperativeHandle(
    ref,
    () => ({
      reveal: (after) => {
        if (after === 'change') intent.current = { kind: 'reveal', at: performance.now() };
        else revealRef.current();
      },
      toTop: () => {
        intent.current = { kind: 'top', at: performance.now() };
        if (panel.current) panel.current.scrollTop = 0;
      },
    }),
    []
  );

  // Once the list has been drawn for a choice: the row that was pressed goes back where it was, and is lifted only
  // if what it opened would sit out of sight; a choice made on the wheel brings its row into view.
  const chosenKey = `${selection.core}|${selection.field}|${selection.group}|${selection.skill}`;
  useLayoutEffect(() => {
    const box = panel.current;
    const next = intent.current;
    intent.current = null;
    if (!box) return;
    if (!next || performance.now() - next.at > 1500) {
      // Nobody pressed anything here: the page was arrived at, or Back was pressed.
      revealRef.current(true);
      return;
    }
    if (next.kind === 'top') {
      box.scrollTop = 0;
      return;
    }
    if (next.kind === 'reveal') {
      revealRef.current();
      return;
    }
    const el = box.querySelector(next.selector);
    if (el) box.scrollTop += el.getBoundingClientRect().top - next.top;
    if (!next.lift) return;
    if (!el) {
      revealRef.current();
      return;
    }
    const pb = box.getBoundingClientRect();
    if (el.getBoundingClientRect().top - pb.top > pb.height * 0.4) {
      sliding.current = performance.now() + 380;
      revealRef.current();
    }
  }, [chosenKey]);

  /** Press a row: remember where it stands, then choose. `selector` is null for a control that is no row of the list (a chip). */
  const press = (el: HTMLElement, selector: string | null, next: Selection, lift: boolean) => {
    intent.current = selector
      ? { kind: 'hold', selector, top: el.getBoundingClientRect().top, lift, at: performance.now() }
      : lift
        ? { kind: 'reveal', at: performance.now() }
        : null;
    onSelect(next);
  };
  const pressField = (el: HTMLElement, f: number, row: boolean) => {
    const on = selection.field !== f;
    press(el, row ? `[data-atlas-field="${attr(F[f].slug)}"]` : null, { core: false, field: on ? f : -1, group: -1, skill: -1 }, on);
  };
  const pressCore = (el: HTMLElement) => {
    const on = !selection.core;
    press(el, '[data-atlas-fundamentals]', { core: on, field: -1, group: -1, skill: -1 }, on);
  };
  const pressGroup = (el: HTMLElement, g: number) =>
    press(el, `[data-atlas-group="${attr(G[g].slug)}"]`, { ...selection, group: selection.group === g ? -1 : g, skill: -1 }, false);
  const pressSkill = (el: HTMLElement, s: number) =>
    press(el, `[data-atlas-skill="${attr(S[s].id)}"]`, { ...selection, skill: selection.skill === s ? -1 : s }, false);

  // ---- the list points at the wheel --------------------------------------------------------------------------------
  const pointOf = (el: Element | null): Hit | null => {
    if (!(el instanceof HTMLElement)) return null;
    const { atlasGroup, atlasField, atlasChip } = el.dataset;
    if (atlasGroup !== undefined) {
      const g = model.groupBySlug.get(atlasGroup);
      return g === undefined ? null : { f: G[g].field, g, s: -1 };
    }
    if ('atlasFundamentals' in el.dataset) return { f: -1, g: -1, s: -1, core: true };
    const f = model.fieldBySlug.get(atlasField ?? atlasChip ?? '');
    return f === undefined ? null : { f, g: -1, s: -1 };
  };
  const POINTS = '[data-atlas-field],[data-atlas-chip],[data-atlas-group],[data-atlas-fundamentals]';
  const pointAt = (target: EventTarget | null) => onPoint(target instanceof Element ? pointOf(target.closest(POINTS)) : null);
  // On a phone nothing is under a pointer: the row the list has been scrolled to is the one pointed at.
  const onScroll = () => {
    const box = panel.current;
    if (fine || !box) return;
    if (box.scrollTop < 12 || mode === 'coreGroup') return onPoint(null);
    const b = box.getBoundingClientRect();
    const line = b.top + b.height * 0.34;
    let best: Element | null = null;
    const rows = box.querySelectorAll(mode === 'rest' ? '[data-atlas-field],[data-atlas-fundamentals]' : '[data-atlas-open] [data-atlas-group]');
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      if (r.top <= line) best = mode !== 'rest' && r.bottom < b.top ? null : el;
      else break;
    }
    onPoint(pointOf(best));
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target.matches(':focus-visible')) pointAt(event.target);
  };

  // ---- rows ----------------------------------------------------------------------------------------------------------
  const count = (i: number): string => {
    const e = laid.need.get(i);
    const n = G[i].skills.length;
    return e ? (rated ? `${e.got} of ${e.all.length}` : `${e.all.length} of ${n}`) : `${n}`;
  };

  /** Rows that hang by rails from the row they are built on; `depth` says how far in each sits. */
  const treeRows = (ids: readonly number[], depth: (i: number) => number): ReactNode =>
    ids.map((i, k) => {
      const g = G[i];
      const d = depth(i);
      const rails: string[] = [];
      const under: string[] = [];
      for (let l = 0; l < d; l++) {
        let on = false;
        for (let j = k + 1; j < ids.length; j++) {
          const dj = depth(ids[j]);
          if (dj <= l) break;
          if (dj === l + 1) {
            on = true;
            break;
          }
        }
        rails.push(l === d - 1 ? (on ? 'et' : 'e') : on ? 'v' : '');
        under.push(on ? 'v' : '');
      }
      const below = ids[k + 1] !== undefined && depth(ids[k + 1]) > d;
      const root = isCore(model, i);
      const status = statusOf(laid, i, rated);
      const open = selection.group === i;
      const wanted = new Set(laid.need.get(i)?.all ?? []);
      return (
        <div key={g.slug}>
          <button
            type="button"
            aria-expanded={open}
            data-atlas-group={g.slug}
            data-atlas-way={laid.way[i] ? '' : undefined}
            onClick={(event) => pressGroup(event.currentTarget, i)}
            className={cn(ROW, 'min-h-10')}
          >
            {rails.map((rail, l) => (
              <span key={l} className="atlas-rail" data-rail={rail} />
            ))}
            <span className="atlas-dot">
              <span data-dot={status || (root ? 'root' : undefined)} data-core={!status && root ? g.slug : undefined} />
            </span>
            <span className={cn(BODY, 'pl-1.5')}>
              <span data-atlas-name className={cn('min-w-0 flex-1 group-hover:text-text-1 group-aria-expanded:text-text-1', laid.way[i] ? 'text-text-1' : 'text-text-2')}>
                {g.name}
              </span>
              <span className={COUNT}>
                {!root && `Ring ${g.ring} · `}
                {count(i)}
              </span>
              <Chevron />
            </span>
          </button>
          {open && (
            <div className="flex" data-atlas-skills={g.slug}>
              {under.map((rail, l) => (
                <span key={l} className="atlas-rail" data-rail={rail} />
              ))}
              <span className="atlas-rail" data-rail={below ? 'v' : ''} />
              <ul className="min-w-0 flex-1 border-b border-line pb-2 pl-1.5 pt-0.5">
                {g.skills.map((s) => {
                  const skill = S[s];
                  const need = wanted.has(s);
                  const gap = need && have !== null && !have.has(s);
                  const on = selection.skill === s;
                  const marking = need && marks !== null;
                  return (
                    <li key={skill.id} className="flex items-center gap-2.5" data-atlas-need={need ? (gap ? 'gap' : 'have') : undefined}>
                      {marking ? (
                        // The product's own mark in the accent dot's place, centred where the dot stood.
                        <SkillHeldToggle
                          label={skill.name}
                          value={marks.statusOf(skill.id)}
                          disabled={marks.pending}
                          onChange={(next) => marks.mark({ id: skill.id, name: skill.name }, next)}
                          className="-my-1.5 -ml-[18.5px] -mr-[18.5px] [&>svg]:h-3.5 [&>svg]:w-3.5"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className={cn('box-border h-[7px] w-[7px] shrink-0 rounded-full', need && (gap ? 'border-[1.5px] border-accent' : 'bg-accent'))}
                        />
                      )}
                      <button
                        type="button"
                        aria-pressed={on}
                        data-atlas-skill={skill.id}
                        onClick={(event) => pressSkill(event.currentTarget, s)}
                        className={cn(
                          'min-h-8 min-w-0 flex-1 pb-2 pt-1.5 text-left text-[14px] leading-[18px] hover:text-text-1',
                          need || on ? 'text-text-1' : 'text-text-2',
                          on && 'underline',
                          focusRing
                        )}
                      >
                        {skill.name}
                      </button>
                      {on && (
                        <Link to={`/skills/${skill.id}`} data-atlas-skill-page className={cn('shrink-0 whitespace-nowrap py-1.5 text-xs text-text-2 underline hover:text-text-1', focusRing)}>
                          Skill page
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      );
    });

  return (
    <div
      ref={panel}
      className="atlas-panel text-sm"
      data-atlas-list
      onScroll={onScroll}
      onPointerOver={fine ? (event) => pointAt(event.target) : undefined}
      onPointerLeave={fine ? () => onPoint(null) : undefined}
      onFocus={onFocus}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onPoint(null);
      }}
      onPointerDownCapture={() => {
        const box = panel.current;
        if (box && performance.now() < sliding.current) box.scrollTo({ top: box.scrollTop, behavior: 'instant' });
        sliding.current = 0;
      }}
    >
      {careerNote}
      {career && (
        <div className="mb-1 border-b border-line pb-3.5 pt-2" data-atlas-career>
          <p className={EYEBROW} data-atlas-career-eyebrow>
            {career.eyebrow}
          </p>
          <h3 className="mt-[3px] text-[17px] font-semibold leading-[21px]">
            <Link to={career.to} data-atlas-career-link className={cn('hover:underline', focusRing)}>
              {career.name}
            </Link>
          </h3>
          {laid.fields.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {laid.fields.map(({ f, n }) => (
                <button
                  key={F[f].slug}
                  type="button"
                  aria-current={f === selection.field ? 'true' : undefined}
                  data-atlas-chip={F[f].slug}
                  onClick={(event) => pressField(event.currentTarget, f, false)}
                  className={cn(
                    'min-h-8 rounded-lg border px-2.5 py-[5px] text-left text-xs',
                    f === selection.field ? 'border-text-1 text-text-1' : 'border-line-strong text-text-2',
                    focusRing
                  )}
                >
                  {F[f].name}
                  <span className="ml-1.5 tabular-nums text-text-3">{n}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={onPickRating} data-atlas-rating className={cn('mt-2.5 inline-flex min-h-8 items-center text-xs text-text-2 underline', focusRing)}>
            {career.rated ? 'Change military rating' : 'Add a military rating'}
          </button>
        </div>
      )}

      <button
        type="button"
        aria-expanded={selection.core}
        data-atlas-fundamentals=""
        onClick={(event) => pressCore(event.currentTarget)}
        className={cn(ROW, 'min-h-[46px]')}
      >
        <span className={cn(BODY, 'group-aria-expanded:border-transparent')}>
          <span data-atlas-name className="min-w-0 flex-1 text-text-1 group-aria-expanded:text-xl group-aria-expanded:font-semibold">{FUNDAMENTALS}</span>
          <Chevron />
        </span>
      </button>
      {selection.core && (
        <div className="pb-2" data-atlas-open="fundamentals">
          {treeRows(core, () => 1)}
        </div>
      )}

      <p className={cn(EYEBROW, 'mb-0.5 mt-5')}>Fields</p>
      {order.map((f) => {
        const x = fields[f];
        const open = selection.field === f;
        const mine = laid.fields.find((each) => each.f === f);
        return (
          <div key={x.slug}>
            <button
              type="button"
              aria-expanded={open}
              data-atlas-field={x.slug}
              data-atlas-reached={mine ? mine.n : undefined}
              onClick={(event) => pressField(event.currentTarget, f, true)}
              className={cn(ROW, 'min-h-[46px]')}
            >
              <span className={cn(BODY, 'group-aria-expanded:border-transparent')}>
                {mine ? (
                  <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
                ) : (
                  <span aria-hidden="true" className="flex shrink-0 gap-0.5">
                    {x.parts.map((part) => (
                      <span key={part.k} className="atlas-sw" data-core={G[core[part.k]].slug} />
                    ))}
                  </span>
                )}
                <span data-atlas-name className="min-w-0 flex-1 text-text-1 group-aria-expanded:text-xl group-aria-expanded:font-semibold">{x.name}</span>
                {mine && <span className={COUNT}>{mine.n}</span>}
                <Chevron />
              </span>
            </button>
            {open && (
              <div className="pb-2" data-atlas-open={x.slug}>
                {treeRows(
                  [...new Set([...x.groups, ...x.roots])].sort((a, b) => a - b),
                  (i) => G[i].depth
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default AtlasList;
