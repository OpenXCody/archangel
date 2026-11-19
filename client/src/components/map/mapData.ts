import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FOCUS_AREAS } from '@shared/scope';
import { mapApi } from '../../lib/api';
import { STATE_CODE_BY_NAME } from '../../lib/places';
import { useStatesOutline } from '../../lib/queries';
import { publicKeys } from '../../lib/queryKeys';

/*
 * What the map draws besides its pins, read apart from the map itself: none
 * of it touches the map instance. (The pins are `usePins` in lib/queries.ts.)
 */

/**
 * The states' outline with each state's code and plant count on it, so the
 * fill layer can key off `properties.factoryCount`. The upstream GeoJSON uses
 * full names on `properties.name`; STATE_CODE_BY_NAME gives each its
 * 2-letter code. The shapes do not wait for the counts: a slow or failed
 * count request must not leave the map without its states.
 */
export function useStatesWithCounts(): GeoJSON.FeatureCollection | null {
  // State-level factory counts (shade the states)
  const { data: stateCounts } = useQuery<Record<string, number>>({
    queryKey: publicKeys.stateCounts,
    queryFn: () => mapApi.stateCounts(),
    staleTime: 5 * 60 * 1000,
  });

  // Raw US states GeoJSON geometry
  const { data: statesGeoJSONRaw } = useStatesOutline();

  return useMemo(() => {
    if (!statesGeoJSONRaw) return null;
    return {
      ...statesGeoJSONRaw,
      features: statesGeoJSONRaw.features.map((f) => {
        const name = f.properties?.name as string | undefined;
        const code = name ? STATE_CODE_BY_NAME[name] : undefined;
        const count = code ? (stateCounts?.[code] ?? 0) : 0;
        return { ...f, properties: { ...(f.properties ?? {}), stateCode: code, factoryCount: count } };
      }),
    } as GeoJSON.FeatureCollection;
  }, [statesGeoJSONRaw, stateCounts]);
}

/**
 * Boundaries of the focus areas, each feature tagged with its area's id.
 * An area whose boundary fails to load is simply not outlined; its label
 * and chip still work, because they frame the area by its bounds.
 */
export function useAreaBoundaries() {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: publicKeys.areaBoundaries,
    queryFn: async () => {
      const loaded = await Promise.all(
        FOCUS_AREAS.map(async (area): Promise<GeoJSON.Feature[]> => {
          try {
            const res = await fetch(area.boundaryUrl);
            if (!res.ok) return [];
            const collection = (await res.json()) as GeoJSON.FeatureCollection;
            return collection.features.map((f) => ({ ...f, properties: { id: area.id, name: area.name } }));
          } catch {
            return [];
          }
        })
      );
      return { type: 'FeatureCollection', features: loaded.flat() };
    },
    staleTime: Infinity,
  });
}
