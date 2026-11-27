/**
 * The Atlas's address. Everything the page shows is in it, so any view can be
 * linked to and Back steps through what was opened:
 *
 *   /atlas                        the whole wheel
 *   /atlas?fundamentals=1         Fundamentals open: the core's own view
 *   /atlas?field=welding          a field open
 *   /atlas?group=arc-welding      a group chosen: inside its field, or, for a core group, inside Fundamentals
 *   /atlas?skill=<id>             a skill chosen, in its group
 *   …&field=welding               beside group= or skill=, only for a core group reached from inside that open field
 *   …&career=<id>                 a career laid over it
 *   …&career=<id>&at=<company>    that company's version of it
 *   …&career=<id>&from=<id>       a military career under it: what carries over is solid, what is missing dashed
 *
 * One of `fundamentals`, `field`, `group` and `skill` is written, the most
 * specific: a skill's group and a group's field are known from the wheel.
 * `domain` is the Skills list's word for where it stands: the Atlas opens the
 * field that holds most of that domain's groups and writes the field in its
 * place (`viewOf` in view.ts, which reads an address against the wheel).
 *
 * This file holds no wheel, so the Skills list links here without carrying it.
 */
export interface AtlasState {
  fundamentals?: boolean | null;
  field?: string | null;
  group?: string | null;
  skill?: string | null;
  /** A domain of the taxonomy, as the Skills list names where it stands. Read, then replaced by a field. */
  domain?: string | null;
  career?: string | null;
  /** A company's id or slug: the career is laid over as that company's version of it. */
  at?: string | null;
  /** A military career laid under the career. */
  from?: string | null;
}

export function readAtlasState(params: URLSearchParams): AtlasState {
  const career = params.get('career');
  return {
    fundamentals: params.get('fundamentals') === '1',
    field: params.get('field'),
    group: params.get('group'),
    skill: params.get('skill'),
    domain: params.get('domain'),
    career,
    at: career ? params.get('at') : null,
    from: career ? params.get('from') : null,
  };
}

/** The one writer of a link to the Atlas. */
export function atlasHref(state: AtlasState): string {
  const params = new URLSearchParams();
  if (state.skill) params.set('skill', state.skill);
  else if (state.group) params.set('group', state.group);
  // Beside a group or a skill the field is the open one a core group was reached from; alone it is the field open.
  if (state.field) params.set('field', state.field);
  else if (!state.skill && !state.group) {
    if (state.fundamentals) params.set('fundamentals', '1');
    else if (state.domain) params.set('domain', state.domain);
  }
  if (state.career) {
    params.set('career', state.career);
    if (state.at) params.set('at', state.at);
    if (state.from && state.from !== state.career) params.set('from', state.from);
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
