/**
 * The Atlas's structure (data/skills/atlas.json), typed. The file is keyed by
 * the skill taxonomy's group slugs: a group's name and its skills come from
 * the taxonomy, its place on the wheel from here. Groups are in the order they
 * stand round the wheel, each one before the groups built on it.
 */
import structure from '../data/skills/atlas.json' with { type: 'json' };

/** Where one skill group stands on the wheel. */
export interface AtlasPlace {
  /** The group's slug in the skill taxonomy. */
  slug: string;
  /** 1 for a core group at the centre, out to 5. */
  ring: number;
  /** The slug of the group it is built on; null for a core group. */
  on: string | null;
  /** Its field's slug; null for a core group. */
  field: string | null;
  /** The careers its line inward was read from, as "18 of 22 civilian careers". */
  basedOn?: string;
}

export interface AtlasField {
  slug: string;
  name: string;
}

export interface AtlasStructure {
  /** The core groups' slugs, in wheel order. */
  core: string[];
  fields: AtlasField[];
  groups: AtlasPlace[];
}

export const ATLAS: AtlasStructure = structure;

/** The word for the Atlas's centre, the twelve core groups together. */
export const FUNDAMENTALS_NAME = 'Fundamentals';

/** One part of a set of skill groups as the Atlas places them: Fundamentals, or one field. */
export interface AtlasSection<G> {
  /** `fundamentals`, a field's slug, or `other` for groups the Atlas does not place. */
  key: string;
  /** "Fundamentals", the field's name, or null for `other` (nothing to call it). */
  name: string | null;
  groups: G[];
}

const PLACE = new Map(ATLAS.groups.map((place, at) => [place.slug, { place, at }] as const));
const FIELD_AT = new Map(ATLAS.fields.map((field, at) => [field.slug, at] as const));
const FIELD_NAME = new Map(ATLAS.fields.map((field) => [field.slug, field.name] as const));

/**
 * Skill groups laid out as the Atlas lays them: the core groups first, together
 * as Fundamentals, then each field the groups reach, in the wheel's order, its
 * groups in the wheel's order too (so a group stands before the groups built on
 * it). The Atlas is the one source of where a group stands: a career's page, a
 * company's version and a job's page draw this cut of it, as the wheel draws a
 * career laid over it. A group the Atlas does not place (a skill no taxonomy
 * placed) comes last, in the order given.
 */
export function atlasSections<G extends { key: string }>(groups: readonly G[]): AtlasSection<G>[] {
  const core: { group: G; at: number }[] = [];
  const fields = new Map<string, { group: G; at: number }[]>();
  const other: G[] = [];
  for (const group of groups) {
    const found = PLACE.get(group.key);
    if (!found) other.push(group);
    else if (!found.place.field) core.push({ group, at: found.at });
    else fields.set(found.place.field, [...(fields.get(found.place.field) ?? []), { group, at: found.at }]);
  }
  const inOrder = (rows: { group: G; at: number }[]) => rows.sort((a, b) => a.at - b.at).map((row) => row.group);
  const sections: AtlasSection<G>[] = [];
  if (core.length > 0) sections.push({ key: 'fundamentals', name: FUNDAMENTALS_NAME, groups: inOrder(core) });
  for (const slug of [...fields.keys()].sort((a, b) => (FIELD_AT.get(a) ?? 0) - (FIELD_AT.get(b) ?? 0))) {
    sections.push({ key: slug, name: FIELD_NAME.get(slug) ?? slug, groups: inOrder(fields.get(slug)!) });
  }
  if (other.length > 0) sections.push({ key: 'other', name: null, groups: other });
  return sections;
}
