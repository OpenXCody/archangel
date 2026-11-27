import type { Taxonomy } from '../../lib/api';
import { NOTHING, type Selection } from './camera';
import { isCore, type AtlasModel } from './model';
import type { AtlasState } from './state';

/**
 * An address read against the wheel, and a choice on the wheel written as an
 * address. Pure: no DOM, no React.
 *
 * What the address names is looked up in the model. Anything it does not hold
 * (a slug nothing has, a skill that is not on the wheel, a word from an older
 * Atlas) is left out of `address`, which is the address as it should be
 * written: the page replaces its own with it.
 */

/** Which of an address's careers turned out not to exist: each is left out of the address. */
export interface Gone {
  career?: boolean;
  at?: boolean;
  from?: boolean;
}

export interface AtlasView {
  /** What the wheel is told. */
  selection: Selection;
  /** The address as it should be written. */
  address: AtlasState;
}

/** What is chosen, as the words the address keeps for it. */
export function addressOf(model: AtlasModel, selection: Selection): Pick<AtlasState, 'fundamentals' | 'field' | 'group' | 'skill'> {
  const { core, field, group, skill } = selection;
  // A core group reached from inside an open field keeps the field beside it: the list stays on that field.
  const beside = group >= 0 && isCore(model, group) && field >= 0 ? model.F[field].slug : null;
  if (skill >= 0) return { skill: model.S[skill].id, field: beside };
  if (group >= 0) return { group: model.G[group].slug, field: beside };
  if (field >= 0) return { field: model.F[field].slug };
  return core ? { fundamentals: true } : {};
}

/**
 * Where an older address's domain is now: the field that holds most of that
 * domain's groups (the first round the wheel, of equals), or Fundamentals for
 * a domain whose groups all stand on the centre ring.
 */
export function domainSelection(model: AtlasModel, taxonomy: Taxonomy, slug: string): Selection | null {
  const domain = taxonomy.domains.find((each) => each.slug === slug);
  if (!domain) return null;
  const per = new Map<number, number>();
  let onWheel = 0;
  for (const group of domain.groups) {
    const g = model.groupBySlug.get(group.slug);
    if (g === undefined) continue;
    onWheel += 1;
    const f = model.G[g].field;
    if (f >= 0) per.set(f, (per.get(f) ?? 0) + 1);
  }
  if (onWheel === 0) return null;
  let best = -1;
  for (const f of model.order) if (per.has(f) && (best < 0 || (per.get(f) as number) > (per.get(best) as number))) best = f;
  return best >= 0 ? { ...NOTHING, field: best } : { ...NOTHING, core: true };
}

export function viewOf(model: AtlasModel, taxonomy: Taxonomy, state: AtlasState, gone: Gone = {}): AtlasView {
  const skill = state.skill ? (model.skillById.get(state.skill) ?? -1) : -1;
  const group = skill >= 0 ? model.skillGroup[skill] : state.group ? (model.groupBySlug.get(state.group) ?? -1) : -1;
  const field = state.field ? (model.fieldBySlug.get(state.field) ?? -1) : -1;

  let selection: Selection = NOTHING;
  if (group >= 0) {
    if (!isCore(model, group)) selection = { core: false, field: model.G[group].field, group, skill };
    // A core group is in Fundamentals, unless the address keeps the open field it was reached from.
    else if (field >= 0 && model.fields[field].roots.includes(group)) selection = { core: false, field, group, skill };
    else selection = { core: true, field: -1, group, skill };
  } else if (field >= 0) selection = { ...NOTHING, field };
  else if (state.fundamentals) selection = { ...NOTHING, core: true };
  else if (state.domain) selection = domainSelection(model, taxonomy, state.domain) ?? NOTHING;

  const career = state.career && !gone.career ? state.career : null;
  return {
    selection,
    address: {
      ...addressOf(model, selection),
      career,
      at: career && !gone.at ? (state.at ?? null) : null,
      from: career && !gone.from ? (state.from ?? null) : null,
    },
  };
}

/** The field that holds most of a career's skills (the first round the wheel, of equals), -1 when it reaches none. */
export function leadingField(fields: readonly { f: number; n: number }[]): number {
  let best: { f: number; n: number } | null = null;
  for (const each of fields) if (!best || each.n > best.n) best = each;
  return best ? best.f : -1;
}

/** Whether two selections differ only in the skill chosen: such a change replaces the address, any other is a step Back returns from. */
export const onlySkillMoved = (a: Selection, b: Selection): boolean => a.core === b.core && a.field === b.field && a.group === b.group && a.skill !== b.skill;
