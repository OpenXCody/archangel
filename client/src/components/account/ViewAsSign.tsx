import { Eye, X } from 'lucide-react';
import { useAccount } from '../../lib/account';
import { setViewAs, useViewer } from '../../lib/viewer';

/**
 * The one sign that an admin is looking at the product as someone else. It
 * takes the wordmark's place in the header, so it is on every page and costs
 * the page no room, and one press of it goes back to the admin's own view.
 * Nothing is drawn for anyone else, or for an admin in their own view.
 *
 * A phone's header is the three words of the navigation, exactly as the
 * person being viewed as sees them, with room between them and the search
 * for a mark and no more: there the sign is the eye alone, in the accent.
 */
export default function ViewAsSign() {
  const { data } = useAccount();
  const { viewingAs } = useViewer();
  const user = data?.user;
  if (!viewingAs || !user) return null;

  return (
    <button
      type="button"
      data-view-as={viewingAs}
      aria-label={`Viewing as ${viewingAs}. Back to admin view`}
      title="Back to admin view"
      onClick={() => {
        setViewAs(user.id, 'admin');
        // The button goes with the view: hand the keyboard to the page.
        document.getElementById('main')?.focus();
      }}
      className="flex h-11 w-10 min-w-0 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-accent transition-colors
        hover:bg-surface-hover xs:w-11 sm:h-9 sm:w-auto sm:border sm:border-accent sm:px-3"
    >
      <Eye className="h-[18px] w-[18px] shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
      <span className="hidden min-w-0 truncate sm:inline">Viewing as {viewingAs}</span>
      <X className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true" />
    </button>
  );
}
