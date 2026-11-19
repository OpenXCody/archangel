import type { Taxonomy } from '../../lib/api';
import { useTaxonomy } from '../../lib/queries';
import { layoutAtlas, type AtlasLayout } from './layout';

/*
 * The plate's arithmetic, worked out once per taxonomy answer however many
 * things draw from it: the Atlas, a career's path on it, a small plate per
 * goal on Profile.
 */
const layouts = new WeakMap<Taxonomy, AtlasLayout>();

export function atlasLayoutOf(taxonomy: Taxonomy): AtlasLayout {
  let layout = layouts.get(taxonomy);
  if (!layout) {
    layout = layoutAtlas(taxonomy);
    layouts.set(taxonomy, layout);
  }
  return layout;
}

/** The layout of the taxonomy the visit holds; null until it has arrived. */
export function useAtlasLayout(enabled = true) {
  const taxonomy = useTaxonomy(enabled);
  return { taxonomy, layout: taxonomy.data ? atlasLayoutOf(taxonomy.data) : null };
}
