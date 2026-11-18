import { Eye, X } from 'lucide-react';
import { useAccount } from '../../lib/account';
import { setViewAs, useViewer } from '../../lib/viewer';

/**
 * The one sign that an admin is looking at the product as someone else. It
 * takes the wordmark's place in the header, so it is on every page and costs
 * the page no room, and one press of it goes back to the admin's own view.
 * Nothing is drawn for anyone else, or for an admin in their own view.
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
      className="flex h-11 min-w-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-info transition-colors
        hover:bg-info/10 sm:h-9 sm:border sm:border-info/40 sm:px-3 sm:text-sm"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
      {/* The narrowest phones have room for the mark alone. */}
      <span className="hidden min-w-0 truncate xs:inline">
        <span className="hidden sm:inline">Viewing as </span>
        <span className="capitalize sm:normal-case">{viewingAs}</span>
      </span>
      <X className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true" />
    </button>
  );
}
