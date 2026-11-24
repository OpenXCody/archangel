/*
 * The career page's two views of a path: drawn as a route, or on the Atlas.
 * The view is in the address (`?path=atlas`, and `&domain=` for a domain
 * opened on the plate), and the one last shown is kept for the visit, so the
 * next career opens the same way. Pure functions; no React and none of the
 * Atlas's own code, so the career page can read them without loading it.
 */

export type PathView = 'route' | 'atlas';

/**
 * A view as an address or the browser's memory names it. The route was the
 * flow before it: `flow`, in an old link or kept from earlier in a visit, is
 * read as the route.
 */
export function namedPathView(word: string | null): PathView | null {
  if (word === 'atlas') return 'atlas';
  return word === 'route' || word === 'flow' ? 'route' : null;
}

/** The address's word for the view, then the one chosen earlier in the visit, then the route. */
export function readPathView(param: string | null, stored: string | null): PathView {
  return namedPathView(param) ?? namedPathView(stored) ?? 'route';
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
