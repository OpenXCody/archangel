/**
 * The pages of Admin Tools and their addresses. Pure: no request is made here.
 */

export type AdminPage = 'add' | 'records' | 'review' | 'people' | 'access' | 'invites' | 'activity';

/** Each page of Admin Tools is one thing a person comes to do: its address (`/admin/<slug>`), its name and the line that says what it is for. */
export const ADMIN_PAGES: readonly { slug: AdminPage; label: string; says: string }[] = [
  { slug: 'add', label: 'Add', says: 'Add a company, a factory, a career or a skill.' },
  { slug: 'records', label: 'Records', says: 'Find a company, a factory, a career or a skill, and correct it.' },
  { slug: 'review', label: 'Review', says: 'Decide what waits: draft career paths, factories listed twice, postings with no factory, uncertain matches.' },
  { slug: 'people', label: 'People', says: 'Everyone with an account: their roles, their company access, help signing in.' },
  { slug: 'access', label: 'Access', says: 'Answer requests to join a company, and requests to add one.' },
  { slug: 'invites', label: 'Invites', says: 'Invite a person by link, as a user, an employer or an admin.' },
  { slug: 'activity', label: 'Activity', says: 'What changed and what came in: history, sources, postings, data quality.' },
];

export function adminPath(page: AdminPage): string {
  return `/admin/${page}`;
}

/**
 * Where an address from before the pages (`/admin?tab=data&kind=company&id=…`)
 * leads now, or null when the address names no tab. Every old link, in an
 * email, a bookmark or the history, lands on the page that does what its tab
 * did. `hash` is the address's fragment, with its `#`.
 */
export function fromOldAdminAddress(search: string, hash = ''): string | null {
  const old = new URLSearchParams(search);
  const tab = old.get('tab');
  if (tab === null) return null;
  const keep = (names: string[], extra: Record<string, string> = {}) => {
    const next = new URLSearchParams(extra);
    for (const name of names) {
      const value = old.get(name);
      if (value) next.set(name, value);
    }
    const query = next.toString();
    return query ? `?${query}` : '';
  };
  if (tab === 'people') return `/admin/people${keep(['q', 'role', 'open'])}`;
  if (tab === 'access') return '/admin/access';
  if (tab === 'invites') return '/admin/invites';
  if (tab === 'history') return `/admin/activity${keep(['show'])}`;
  if (tab === 'data') {
    if (old.get('kind') && old.get('id')) return `/admin/records${keep(['kind', 'id'])}${hash}`;
    if (old.get('pairs')) return `/admin/review${keep(['pairs', 'state', 'at'])}`;
    if (old.get('postings')) return `/admin/review${keep(['postings'])}`;
    if (hash === '#matches') return '/admin/review?list=matches';
    return '/admin/records';
  }
  return '/admin';
}
