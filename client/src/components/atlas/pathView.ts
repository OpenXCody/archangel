/*
 * The career page's two views of a path: drawn as a flow, or on the Atlas.
 * The view is in the address (`?path=atlas`, and `&domain=` for a domain
 * opened on the plate), and the one last shown is kept for the visit, so the
 * next career opens the same way. Pure functions; no React and none of the
 * Atlas's own code, so the career page can read them without loading it.
 */

export type PathView = 'flow' | 'atlas';

/** The address's word for the view, then the one chosen earlier in the visit, then the flow. */
export function readPathView(param: string | null, stored: string | null): PathView {
  if (param === 'atlas' || param === 'flow') return param;
  return stored === 'atlas' ? 'atlas' : 'flow';
}

/**
 * The career page's address with a view (and, on the atlas, an open domain)
 * written into it. Whatever else the address carries is kept.
 */
export function pathViewSearch(search: string, view: PathView, domain?: string | null): string {
  const params = new URLSearchParams(search);
  params.set('path', view);
  if (view === 'atlas' && domain) params.set('domain', domain);
  else params.delete('domain');
  return `?${params.toString()}`;
}

/** A career's page, open on its path drawn on the atlas. */
export const careerAtlasHref = (careerId: string): string => `/occupations/${careerId}?path=atlas#skills`;
