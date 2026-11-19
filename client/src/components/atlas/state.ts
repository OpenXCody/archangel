/**
 * The Atlas's address. Everything the page shows is in it, so any view can be
 * linked to and Back steps through what was opened:
 *
 *   /atlas                      the whole atlas
 *   /atlas?domain=quality       one domain, turned to and enlarged
 *   /atlas?group=calibration    one skill group, open in its domain
 *   /atlas?skill=<id>           one skill, in its group
 *   …&career=<id>               a career laid over it
 *   …&career=<id>&with=<id>     and a second career over the first
 *
 * One of `domain`, `group` and `skill` is written, the most specific: a
 * skill's group and a group's domain are known from the taxonomy.
 */
export interface AtlasState {
  domain?: string | null;
  group?: string | null;
  skill?: string | null;
  career?: string | null;
  with?: string | null;
}

export function readAtlasState(params: URLSearchParams): AtlasState {
  return {
    domain: params.get('domain'),
    group: params.get('group'),
    skill: params.get('skill'),
    career: params.get('career'),
    with: params.get('with'),
  };
}

export function atlasHref(state: AtlasState): string {
  const params = new URLSearchParams();
  if (state.skill) params.set('skill', state.skill);
  else if (state.group) params.set('group', state.group);
  else if (state.domain) params.set('domain', state.domain);
  if (state.career) {
    params.set('career', state.career);
    if (state.with && state.with !== state.career) params.set('with', state.with);
  } else if (state.with) {
    params.set('career', state.with);
  }
  const query = params.toString();
  return query ? `/atlas?${query}` : '/atlas';
}

/** The Skills list, narrowed to the same domain and group: the atlas as a list. */
export function skillsListHref(domain?: string | null, group?: string | null): string {
  const params = new URLSearchParams({ tab: 'skills' });
  if (domain) params.set('domain', domain);
  if (domain && group) params.set('group', group);
  return `/explore?${params.toString()}`;
}
