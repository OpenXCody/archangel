import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, focusRing, plural } from '@/lib/utils';
import { LEVELS, LEVEL_NAME } from '../../lib/stages';
import { SkillHeldToggle, SkillMark } from '../account/SkillStatusButton';
import type { SkillMarks } from '../path/model';
import type { AtlasMarks, AtlasOverlay, AtlasTarget } from './AtlasDrawing';
import type { AtlasDomain, AtlasGroup, AtlasLayout, AtlasLeaf } from './layout';
import { atlasHref, skillsListHref, type AtlasState } from './state';

/**
 * The Atlas as a list. Beside the drawing on a wide screen and under it on a
 * phone, this is the tree itself in words, opened one branch at a time: the
 * sixteen domains; a domain's groups; a group's skills as tags, by level; a
 * skill's level, how many careers use it and the way to its page. Every row
 * is a link to the same address the drawing leads to, so it is what the
 * keyboard and a screen reader use, and what a finger uses where a leaf is
 * too small to press. What it points at is shown on the drawing.
 */

interface AtlasPanelProps {
  layout: AtlasLayout;
  domain: AtlasDomain | null;
  group: AtlasGroup | null;
  leaf: AtlasLeaf | null;
  /** The address as it is: links keep the careers laid over the atlas. */
  state: AtlasState;
  overlay: AtlasOverlay | null;
  marks: AtlasMarks | null;
  /** A seeker's marks to change, when a career is laid over the atlas: its skills' tags then carry the mark. */
  marking?: SkillMarks | null;
  onPreview: (target: AtlasTarget | null) => void;
  className?: string;
}

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft';
const ROW = cn(
  'group flex min-h-11 items-baseline justify-between gap-3 py-2.5 text-[15px] leading-snug sm:min-h-0 sm:py-[7px]',
  focusRing
);

/** How a skill stands in the careers laid over the atlas. */
type Lit = 'first' | 'second' | 'shared' | null;

function litOf(overlay: AtlasOverlay | null, index: number): Lit {
  if (!overlay) return null;
  const first = overlay.first.has(index);
  const second = overlay.second?.has(index) ?? false;
  return first && second ? 'shared' : first ? 'first' : second ? 'second' : null;
}

function litCount(overlay: AtlasOverlay | null, first: number, last: number): number {
  if (!overlay) return 0;
  let count = 0;
  for (let i = first; i <= last; i++) if (overlay.first.has(i) || overlay.second?.has(i)) count += 1;
  return count;
}

/**
 * The sign a career's skills carry, the same on the drawing and in words: a
 * disc for the first career, a ring for the second, the disc inside the ring
 * for a skill both have.
 */
export function LitSign({ kind, className }: { kind: Exclude<Lit, null>; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" data-lit-sign={kind} className={cn('h-3 w-3 shrink-0 text-info', className)}>
      {kind === 'second' ? (
        <circle cx="8" cy="8" r="4.25" fill="none" stroke="currentColor" strokeWidth="2" />
      ) : (
        <>
          <circle cx="8" cy="8" r={kind === 'shared' ? 3.25 : 4.75} fill="currentColor" />
          {kind === 'shared' && <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />}
        </>
      )}
    </svg>
  );
}

/** The rows of a list: a name and a figure, the whole row a link. */
function Rows({ children, columns }: { children: ReactNode; columns?: boolean }) {
  return <ul className={cn('grid grid-cols-1', columns && 'grid-cols-2 gap-x-6 lg:grid-cols-1')}>{children}</ul>;
}

interface RowProps {
  to: string;
  name: string;
  /** The figure at the row's end. */
  figure: number;
  /** A career is laid over the atlas and none of its skills is here. */
  quiet: boolean;
  onPreview: (on: boolean) => void;
  data: Record<string, string>;
}

function Row({ to, name, figure, quiet, onPreview, data }: RowProps) {
  return (
    <li className="min-w-0 border-b border-border-subtle">
      <Link
        to={to}
        className={ROW}
        onMouseEnter={() => onPreview(true)}
        onMouseLeave={() => onPreview(false)}
        onFocus={() => onPreview(true)}
        onBlur={() => onPreview(false)}
        {...data}
      >
        <span className={cn('min-w-0 underline-offset-4 group-hover:underline', quiet ? 'text-fg-soft' : 'text-fg-default')}>{name}</span>
        {!quiet && <span className="shrink-0 text-sm tabular-nums text-fg-soft">{figure}</span>}
      </Link>
    </li>
  );
}

/** What the figures at the ends of the rows count. */
function RowsHeading({ left, overlay }: { left: string; overlay: AtlasOverlay | null }) {
  return (
    <div className={cn(EYEBROW, 'flex items-baseline justify-between gap-3 border-b border-border-subtle pb-2')}>
      <h3>{left}</h3>
      <span aria-hidden="true">{overlay ? (overlay.second ? 'Of these careers' : 'Of this career') : 'Skills'}</span>
    </div>
  );
}

/** A skill as a tag, drawn like the tags of a career's path. It can carry a second, quieter line (the make of a machine). */
function SkillTag({
  to,
  leaf,
  detail,
  chosen,
  lit,
  sign,
  mark,
  marking,
  onPreview,
}: {
  to: string;
  leaf: AtlasLeaf;
  detail?: string;
  chosen: boolean;
  lit: Lit;
  /** Whether the career's sign is shown: with two careers it tells them apart; with one, the mark alone says the skill is the career's. */
  sign: boolean;
  mark: 'held' | 'learning' | null;
  /** Given for a skill of a career laid over the atlas, to a seeker: the tag starts with the mark that sets it held or clears it. */
  marking: SkillMarks | null;
  onPreview: (on: boolean) => void;
}) {
  return (
    // The same tag a career's path uses (`.skill-tag`), here a link that opens the skill on the atlas.
    <li className={cn('skill-tag', chosen && 'ring-1 ring-inset ring-info')} data-status={mark ?? undefined} data-atlas-markable={marking ? leaf.id : undefined}>
      {marking && (
        <SkillHeldToggle
          label={leaf.name}
          value={mark ?? 'none'}
          disabled={marking.pending}
          onChange={(next) => marking.mark({ id: leaf.id, name: leaf.name }, next)}
          className="rounded-lg focus-visible:[outline-offset:-2px]"
        />
      )}
      <Link
        to={to}
        aria-current={chosen ? 'true' : undefined}
        data-atlas-tag={leaf.id}
        onMouseEnter={() => onPreview(true)}
        onMouseLeave={() => onPreview(false)}
        onFocus={() => onPreview(true)}
        onBlur={() => onPreview(false)}
        className={cn(
          'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-3 text-sm leading-snug underline-offset-4 hover:underline focus-visible:[outline-offset:-2px]',
          marking ? 'pl-0' : 'pl-3',
          focusRing
        )}
      >
        {!marking && mark && <SkillMark status={mark} className="h-4 w-4" />}
        {lit && sign && <LitSign kind={lit} />}
        <span className="flex min-w-0 flex-col">
          <span className="min-w-0 [overflow-wrap:anywhere]">{leaf.name}</span>
          {detail && <span className="min-w-0 text-xs text-fg-soft [overflow-wrap:anywhere]">{detail}</span>}
        </span>
      </Link>
    </li>
  );
}

function Crumbs({ domain, group, leaf, state }: { domain: AtlasDomain; group: AtlasGroup | null; leaf: AtlasLeaf | null; state: AtlasState }) {
  const base = { career: state.career, with: state.with };
  const crumb = cn('inline-flex min-h-11 items-center text-fg-muted underline-offset-4 hover:text-fg-default hover:underline sm:min-h-8', focusRing);
  const here = 'inline-flex min-h-11 items-center text-fg-default sm:min-h-8';
  const divider = <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-soft" />;
  return (
    <nav aria-label="Atlas" data-atlas-crumbs className="-mt-1 mb-1 text-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5">
        <li>
          <Link to={atlasHref(base)} className={crumb}>
            Atlas
          </Link>
        </li>
        <li className="flex items-center gap-x-1.5">
          {divider}
          {group ? (
            <Link to={atlasHref({ ...base, domain: domain.slug })} className={crumb}>
              {domain.name}
            </Link>
          ) : (
            <span aria-current="page" className={here}>
              {domain.name}
            </span>
          )}
        </li>
        {group && (
          <li className="flex min-w-0 items-center gap-x-1.5">
            {divider}
            {leaf ? (
              <Link to={atlasHref({ ...base, group: group.slug })} className={crumb}>
                {group.name}
              </Link>
            ) : (
              <span aria-current="page" className={here}>
                {group.name}
              </span>
            )}
          </li>
        )}
      </ol>
    </nav>
  );
}

export default function AtlasPanel({ layout, domain, group, leaf, state, overlay, marks, marking, onPreview, className }: AtlasPanelProps) {
  const base = { career: state.career, with: state.with };
  const point = (target: AtlasTarget) => (on: boolean) => onPreview(on ? target : null);

  let body: ReactNode;
  if (!domain) {
    body = (
      <>
        <RowsHeading left="Domains" overlay={overlay} />
        <Rows columns>
          {layout.domains.map((d) => {
            const lit = litCount(overlay, d.first, d.last);
            return (
              <Row
                key={d.slug}
                to={atlasHref({ ...base, domain: d.slug })}
                name={d.name}
                figure={overlay ? lit : d.last - d.first + 1}
                quiet={Boolean(overlay) && lit === 0}
                onPreview={point({ domain: d })}
                data={{ 'data-atlas-row': d.slug }}
              />
            );
          })}
        </Rows>
      </>
    );
  } else if (!group) {
    body = (
      <>
        <h2 className="text-xl font-semibold leading-tight text-fg-default" data-atlas-heading>
          {domain.name}
        </h2>
        {domain.description && <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{domain.description}</p>}
        <div className="mt-5">
          <RowsHeading left="Skill groups" overlay={overlay} />
          <Rows>
            {layout.groups.slice(domain.firstGroup, domain.lastGroup + 1).map((g) => {
              const lit = litCount(overlay, g.first, g.last);
              return (
                <Row
                  key={g.slug}
                  to={atlasHref({ ...base, group: g.slug })}
                  name={g.name}
                  figure={overlay ? lit : g.last - g.first + 1}
                  quiet={Boolean(overlay) && lit === 0}
                  onPreview={point({ domain, group: g })}
                  data={{ 'data-atlas-row': g.slug }}
                />
              );
            })}
          </Rows>
        </div>
        <ListLink to={skillsListHref(domain.slug)}>{domain.name} as a list</ListLink>
      </>
    );
  } else {
    const leaves = layout.leaves.slice(group.first, group.last + 1);
    const lit = leaf ? litOf(overlay, leaf.index) : null;
    const mark = leaf ? (marks?.get(leaf.index) ?? null) : null;
    body = (
      <>
        {leaf ? (
          <div data-atlas-skill={leaf.id} className="mb-5 border-b border-border-subtle pb-5">
            <p className={EYEBROW}>Skill</p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-fg-default" data-atlas-heading>
              {leaf.name}
            </h2>
            <p className="mt-1.5 text-sm text-fg-muted">
              <span data-atlas-level>{LEVEL_NAME[leaf.level]}</span>
              {' · '}
              {leaf.careers > 0 ? `Used by ${plural(leaf.careers, 'career', 'careers')}` : 'No career uses it yet'}
            </p>
            {(mark || lit) && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                {mark && (
                  <span className="inline-flex items-center gap-1.5">
                    <SkillMark status={mark} className="h-4 w-4" />
                    {mark === 'held' ? 'Held' : 'Learning'}
                  </span>
                )}
                {lit && (
                  <span className="inline-flex items-center gap-1.5">
                    <LitSign kind={lit} />
                    {lit === 'shared' ? 'In both careers' : overlay?.second ? (lit === 'first' ? 'In the first career' : 'In the second career') : 'In this career'}
                  </span>
                )}
              </p>
            )}
            <Link
              to={`/skills/${leaf.id}`}
              data-atlas-open
              className={cn(
                'mt-4 inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-strong px-4 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated sm:h-10',
                focusRing
              )}
            >
              Open skill
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-fg-soft" />
            </Link>
          </div>
        ) : null}
        {leaf ? (
          <h3 className="text-base font-semibold text-fg-default">{group.name}</h3>
        ) : (
          <h2 className="text-xl font-semibold leading-tight text-fg-default" data-atlas-heading>
            {group.name}
          </h2>
        )}
        {group.description && <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{group.description}</p>}
        {LEVELS.map((level) => {
          const atLevel = leaves.filter((l) => l.level === level.id);
          if (atLevel.length === 0) return null;
          return (
            <div key={level.id} className="mt-5" data-atlas-level-block={level.id}>
              <h4 className={cn(EYEBROW, 'mb-2')}>{level.name}</h4>
              <ul className="skill-tags">
                {atLevel.map((l) => (
                  <SkillTag
                    key={l.id}
                    to={atlasHref({ ...base, skill: l.id })}
                    leaf={l}
                    chosen={leaf?.index === l.index}
                    lit={litOf(overlay, l.index)}
                    sign={!marking || Boolean(overlay?.second)}
                    mark={marks?.get(l.index) ?? null}
                    marking={marking && litOf(overlay, l.index) ? marking : null}
                    onPreview={point({ domain, group, leaf: l })}
                  />
                ))}
              </ul>
            </div>
          );
        })}
        <ListLink to={skillsListHref(domain.slug, group.slug)}>{group.name} as a list</ListLink>
      </>
    );
  }

  return (
    <section aria-label="The atlas as a list" data-atlas-panel className={cn('min-w-0', className)}>
      {domain && <Crumbs domain={domain} group={group} leaf={leaf} state={state} />}
      {body}
    </section>
  );
}

function ListLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <p className="mt-4">
      <Link
        to={to}
        className={cn('inline-flex min-h-11 items-center text-sm text-fg-muted underline underline-offset-4 transition-colors hover:text-fg-default', focusRing)}
      >
        {children}
      </Link>
    </p>
  );
}
