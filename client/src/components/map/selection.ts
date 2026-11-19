/**
 * What the map has selected, with its record. The panel draws from this and
 * the page takes its tab title from it; both read the same queries, so each
 * record is fetched once.
 */
import { useQuery } from '@tanstack/react-query';
import { companiesApi, factoriesApi, mapApi, occupationsApi, skillsApi } from '../../lib/api';
import { useMapStore } from '../../stores/mapStore';
import { focusArea } from '@shared/scope';
import { stateName } from '../../lib/places';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { publicKeys } from '../../lib/queryKeys';

/** True when a failed request means "there is no such thing", not "the request failed". */
export function isNotFound(error: unknown): boolean {
  return error instanceof Error && /not found|invalid id/i.test(error.message);
}

export function useSelection() {
  const type = useMapStore((s) => s.selectedEntityType);
  const id = useMapStore((s) => s.selectedEntityId);
  const place = useMapStore((s) => s.selectedPlace);
  const on = (kind: typeof type) => type === kind && !!id;
  // A missing record is an answer, not a failure to retry.
  const retry = (failures: number, error: unknown) => !isNotFound(error) && failures < 2;

  const factory = useQuery({ queryKey: ['factory', id], queryFn: () => factoriesApi.get(id as string), enabled: on('factory'), retry });
  const company = useQuery({ queryKey: ['company', id], queryFn: () => companiesApi.get(id as string), enabled: on('company'), retry });
  const occupation = useQuery({ queryKey: ['occupation', id], queryFn: () => occupationsApi.get(id as string), enabled: on('occupation'), retry });
  const skill = useQuery({ queryKey: ['skill', id], queryFn: () => skillsApi.get(id as string), enabled: on('skill'), retry });
  const state = useQuery({ queryKey: publicKeys.stateOverview(id), queryFn: () => mapApi.stateOverview(id as string), enabled: on('state'), retry });
  const area = useQuery({ queryKey: publicKeys.areaOverview(id), queryFn: () => mapApi.areaOverview(id as string), enabled: on('area'), retry });
  const placeOverview = useQuery({
    queryKey: publicKeys.boundsOverview(id),
    queryFn: () => mapApi.boundsOverview((place as NonNullable<typeof place>).bounds),
    enabled: on('place') && !!place,
    retry,
  });

  const current =
    type === 'factory' ? factory
    : type === 'company' ? company
    : type === 'occupation' ? occupation
    : type === 'skill' ? skill
    : type === 'state' ? state
    : type === 'area' ? area
    : type === 'place' ? placeOverview
    : null;

  // The name, as soon as it is known. A state, an area and a place are named
  // before their record arrives.
  let name: string | null = null;
  if (type === 'factory') name = factory.data ? formatFactoryName(factory.data.name) : null;
  else if (type === 'company') name = company.data ? formatCompanyName(company.data.name) : null;
  else if (type === 'occupation') name = occupation.data?.title ?? null;
  else if (type === 'skill') name = skill.data?.name ?? null;
  else if (type === 'state' && id) name = stateName(id);
  else if (type === 'area' && id) name = focusArea(id)?.name ?? null;
  else if (type === 'place') name = place?.name ?? null;

  return {
    type,
    id,
    place,
    name,
    factory: factory.data,
    company: company.data,
    occupation: occupation.data,
    skill: skill.data,
    state: state.data,
    area: area.data,
    placeOverview: placeOverview.data,
    isLoading: current?.isLoading ?? false,
    error: current?.error ?? null,
    retry: () => {
      void current?.refetch();
    },
  };
}
