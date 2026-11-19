import { useQuery } from '@tanstack/react-query';
import {
  companiesApi,
  exploreApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  type CompanyDetail,
  type EntityType,
  type FactoryDetail,
  type OccupationDetail,
  type SkillDetail,
} from './api';
import { publicKeys } from './queryKeys';

/**
 * Public reads that more than one component makes. Each is declared once
 * here, so the components that ask share one cached answer and nothing is
 * fetched twice because two files spelled a key differently.
 */

/** What each kind of record's own endpoint answers with. */
export interface RecordOf {
  companies: CompanyDetail;
  factories: FactoryDetail;
  occupations: OccupationDetail;
  skills: SkillDetail;
}

const GET_RECORD: { [E in EntityType]: (id: string) => Promise<RecordOf[E]> } = {
  companies: companiesApi.get,
  factories: factoriesApi.get,
  occupations: occupationsApi.get,
  skills: skillsApi.get,
};

/**
 * One company, plant, career or skill, by id (or a company's slug). Spread
 * into `useQuery` or `prefetchQuery`; the caller adds what is its own
 * (`enabled`, `retry`, `staleTime`).
 */
export function recordQuery<E extends EntityType>(entity: E, id: string | null | undefined) {
  return {
    queryKey: publicKeys.record(entity, id),
    queryFn: (): Promise<RecordOf[E]> => GET_RECORD[entity](id as string),
  };
}

/** Every plant in the country as the map's pins. Loaded once; filters never refetch it. */
export function usePins() {
  return useQuery({
    queryKey: publicKeys.pins,
    queryFn: () => factoriesApi.pins(),
    staleTime: 5 * 60_000,
  });
}

/**
 * The skill taxonomy: every domain with its groups and their skills, each
 * skill with its level and how many careers use it. One answer, shared by
 * whatever draws it. It changes only with a deploy or an admin's edit, so it
 * is kept for the visit; an admin's change to a skill refreshes it
 * (`recordsChanged` in lib/records.ts).
 */
export function useTaxonomy(enabled = true) {
  return useQuery({ ...taxonomyQuery, enabled });
}

/** The taxonomy's read, for `prefetchQuery`: the Atlas asks for it before its own code has arrived (App.tsx). */
export const taxonomyQuery = {
  queryKey: publicKeys.taxonomy,
  queryFn: skillsApi.taxonomy,
  staleTime: 60 * 60_000,
  gcTime: Infinity,
};

/** The industries, and the skill domains and groups, in use: what the browse lists filter by. */
export function useExploreFacets(enabled = true) {
  return useQuery({
    queryKey: publicKeys.exploreFacets,
    queryFn: exploreApi.facets,
    staleTime: 10 * 60_000,
    enabled,
  });
}

/** Everything the Explore overview shows, in one answer. */
export function useExploreOverview() {
  return useQuery({
    queryKey: publicKeys.exploreOverview,
    queryFn: exploreApi.overview,
    staleTime: 5 * 60_000,
  });
}

const STATES_OUTLINE_URL = '/data/us-states.geojson';

/** The outline of the states: a static file the map and a company's footprint both draw from. */
export function useStatesOutline() {
  return useQuery({
    queryKey: publicKeys.statesOutline,
    queryFn: async (): Promise<GeoJSON.FeatureCollection> => {
      const response = await fetch(STATES_OUTLINE_URL);
      if (!response.ok) throw new Error(`States outline failed to load (${response.status})`);
      return (await response.json()) as GeoJSON.FeatureCollection;
    },
    staleTime: Infinity,
  });
}
