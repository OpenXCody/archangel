/**
 * Who the interface is drawn for. Pure rules, shared by the API (which keeps
 * what an account is for) and the page (which decides what to draw).
 *
 * None of this is permission. What a person may do is decided on the server
 * by their relationships: any signed-in person can keep skills and apply, a
 * company's members manage its jobs, an admin has `isAdmin`.
 */

/** What an account is for: finding work, or hiring. */
export type Purpose = 'work' | 'hire';

export function isPurpose(value: unknown): value is Purpose {
  return value === 'work' || value === 'hire';
}

/**
 * The purpose in force: what the person chose (at sign-up, or in settings),
 * or, when they have not said, what their ties to a company say. Anyone with
 * a company membership, a request to join a company or a request to have one
 * added is hiring; everyone else is finding work.
 */
export function purposeFrom(chosen: string | null | undefined, hasCompanyTie: boolean): Purpose {
  if (isPurpose(chosen)) return chosen;
  return hasCompanyTie ? 'hire' : 'work';
}

/** What an admin has chosen to see the product as. `admin` is their own view. */
export type ViewAs = 'admin' | 'employer' | 'user';

export const VIEW_AS: ViewAs[] = ['admin', 'employer', 'user'];

/** The person looking, as far as the tools are concerned. Null when signed out. */
export interface ToolsFor {
  isAdmin: boolean;
  purpose: Purpose;
  /** Companies the person is an active member of. */
  companyIds: readonly string[];
}

export interface Tools {
  signedIn: boolean;
  /** Draw the seeker's tools: their page, goals, skill marks, Apply. */
  seeker: boolean;
  /** Draw the employer's tools: their companies, jobs and applicants, posting. */
  employer: boolean;
  /** Draw the admin's tools: Admin Tools, Edit on records. False while an admin views as someone else. */
  admin: boolean;
  /** Set while an admin is looking at the product as a user or an employer. */
  viewingAs: 'user' | 'employer' | null;
  /**
   * Whether the company's own view of its jobs is drawn for this person, given
   * that the server says they can manage one (`canManage`). An admin can manage
   * every company's jobs: viewing as an employer they see that only for the
   * companies they belong to, and viewing as a user for none.
   */
  manages: (companyId: string) => boolean;
}

/**
 * Which tools are drawn. A visitor gets nobody's (and is offered a way in);
 * an account gets the tools of its purpose, one set at a time; an admin gets
 * the admin's as well. `viewAs` is honoured for an admin only, and replaces
 * all of that with exactly what a user or an employer would be shown.
 */
export function toolsFor(person: ToolsFor | null, viewAs: ViewAs = 'admin'): Tools {
  if (!person) return { signedIn: false, seeker: false, employer: false, admin: false, viewingAs: null, manages: () => false };
  const viewingAs = person.isAdmin && viewAs !== 'admin' ? viewAs : null;
  const employer = viewingAs ? viewingAs === 'employer' : person.purpose === 'hire';
  return {
    signedIn: true,
    seeker: !employer,
    employer,
    admin: person.isAdmin && !viewingAs,
    viewingAs,
    manages: (companyId) => (viewingAs === 'user' ? false : viewingAs === 'employer' ? person.companyIds.includes(companyId) : true),
  };
}

/**
 * "View as" is kept in the browser as "<user id>:<view>", so a choice made by
 * one admin never carries over to another account in the same browser.
 */
export function storedViewAs(userId: string, view: ViewAs): string | null {
  return view === 'admin' ? null : `${userId}:${view}`;
}

/** The view a stored value asks for, for this person. Anything else, or someone else's, is the person's own view. */
export function readViewAs(stored: string | null | undefined, userId: string): ViewAs {
  if (!stored) return 'admin';
  const at = stored.lastIndexOf(':');
  const view = stored.slice(at + 1);
  return stored.slice(0, at) === userId && (view === 'employer' || view === 'user') ? view : 'admin';
}
