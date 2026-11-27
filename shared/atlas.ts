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
