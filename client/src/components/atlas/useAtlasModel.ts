import { ATLAS } from '@shared/atlas';
import type { Taxonomy } from '../../lib/api';
import { useTaxonomy } from '../../lib/queries';
import { buildAtlas, type AtlasModel } from './model';

/*
 * The wheel's arithmetic, worked out once per taxonomy answer however many
 * things draw from it: the Atlas and a small plate per goal on Profile.
 */
const models = new WeakMap<Taxonomy, AtlasModel>();

export function atlasModelOf(taxonomy: Taxonomy): AtlasModel {
  let model = models.get(taxonomy);
  if (!model) {
    model = buildAtlas(taxonomy, ATLAS);
    models.set(taxonomy, model);
  }
  return model;
}

/** The wheel of the taxonomy the visit holds; null until it has arrived. */
export function useAtlasModel(enabled = true) {
  const taxonomy = useTaxonomy(enabled);
  return { taxonomy, model: taxonomy.data ? atlasModelOf(taxonomy.data) : null };
}
