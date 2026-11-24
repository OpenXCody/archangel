import { useSyncExternalStore } from 'react';
import { readViewAs, storedViewAs, toolsFor, type Tools, type ViewAs } from '@shared/purpose';
import { useAccount } from './account';
import { readStored, removeStored, writeStored } from './storage';

/**
 * Who the interface is drawn for.
 *
 * Roles are relationships on the server (any signed-in person can keep skills
 * and apply; a company's members manage its jobs; an admin has `isAdmin`), and
 * nothing here changes what a person may do. This decides only which tools are
 * put in front of them:
 *
 * - a visitor (signed out) explores, and is offered a way in;
 * - a seeker (an account for finding work) gets their page, skill marks, goals and Apply;
 * - an employer (an account for hiring) gets their companies, jobs and applicants;
 * - an admin gets Admin Tools and Edit on records, with the tools of their own account's purpose.
 *
 * An admin can also look at the product as a user or as an employer ("View
 * as", in settings). That is kept in this browser only, changes only what is
 * drawn, and no request is made any differently because of it.
 */

export { VIEW_AS, type ViewAs } from '@shared/purpose';

/** Who the interface is drawn for: see `toolsFor` in shared/purpose.ts. */
export type Viewer = Tools;

const STORAGE_KEY = 'archangel.viewAs';

const listeners = new Set<() => void>();
/** The stored value as last read or written here: what `useSyncExternalStore` compares. */
let stored: string | null = readStored(STORAGE_KEY);

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  // Changed in another tab of this browser: this tab follows.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    stored = readStored(STORAGE_KEY);
    notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

/** An admin chooses how to see the product. `admin` goes back to their own view and forgets the choice. */
export function setViewAs(userId: string, view: ViewAs): void {
  stored = storedViewAs(userId, view);
  // With storage unavailable (private mode) the choice lasts for this page only.
  if (stored) writeStored(STORAGE_KEY, stored);
  else removeStored(STORAGE_KEY);
  for (const notify of listeners) notify();
}

/** Who the interface is drawn for. Signed out, and while the account is loading, nobody's tools are drawn. */
export function useViewer(): Viewer {
  const { data } = useAccount();
  const value = useSyncExternalStore(subscribe, () => stored, () => null);
  const user = data?.user ?? null;
  if (!user) return toolsFor(null);
  return toolsFor(
    {
      isAdmin: user.isAdmin,
      // An answer cached from before accounts said what they are for reads as a seeker's.
      purpose: user.purpose === 'hire' ? 'hire' : 'work',
      companyIds: (data?.memberships ?? []).filter((membership) => membership.status === 'active').map((membership) => membership.companyId),
    },
    readViewAs(value, user.id)
  );
}

/**
 * Whether the seeker's tools belong on the page: the marks and progress a
 * path shows (read on a career's page, changed on Profile), Apply. True for a seeker and
 * for a visitor (to whom they are the way in); false for someone here to hire.
 * One answer for every such control, so they appear and disappear together.
 */
export function useSeekerTools(): boolean {
  const viewer = useViewer();
  return !viewer.signedIn || viewer.seeker;
}

/**
 * Where "Post a job" leads for whoever is looking, or null when it is not
 * theirs to see. A visitor is asked ("Hiring?") and taken to the employer
 * page by way of signing in; someone here to hire goes straight to the form;
 * a seeker is not offered it at all.
 */
export function usePostJobLink(): { to: string; visitor: boolean } | null {
  const viewer = useViewer();
  if (!viewer.signedIn) return { to: '/employer', visitor: true };
  return viewer.employer ? { to: '/employer?post=1', visitor: false } : null;
}
