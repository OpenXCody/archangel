import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminOverview } from '../../lib/admin';
import { ADMIN_PAGES, adminPath, type AdminPage } from '../../lib/adminPages';
import { useAdminCompanyRequests } from '../../lib/employerCompanies';
import { rowClass, rowHoverClass } from '../account/parts';
import Panel from './Panel';
import { useReviewTotal } from './ReviewPage';

/** How many things wait on each page that can have some. Undefined while a count is on its way; a page with none is left out. */
export function useWaitingCounts(): Partial<Record<AdminPage, number | undefined>> {
  const overview = useAdminOverview();
  // Companies and factories people asked to have added are answered on Access too.
  const toAdd = useAdminCompanyRequests().data?.length;
  const requests = overview.data?.pendingMemberships;
  return {
    review: useReviewTotal(),
    access: requests === undefined || toAdd === undefined ? undefined : requests + toAdd,
  };
}

/**
 * The landing page of Admin Tools: each thing a person comes to do as one
 * row, with a line saying what it is for and, where something waits for a
 * decision, how many.
 */
export default function AdminIndex() {
  const waiting = useWaitingCounts();
  return (
    <Panel data-admin-index>
      <ul>
        {ADMIN_PAGES.map((page) => {
          const count = waiting[page.slug];
          return (
            <li key={page.slug} className={rowClass}>
              <Link to={adminPath(page.slug)} className={cn(rowHoverClass, 'flex items-center gap-4 py-3.5')} data-admin-page={page.slug}>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-text-1">{page.label}</span>
                  <span className="mt-0.5 block text-sm text-text-2">{page.says}</span>
                  {/* On a phone the count is a line of its own: beside the words it would squeeze them. */}
                  {count ? (
                    <span className="mt-1 block text-sm font-semibold tabular-nums text-text-1 sm:hidden">{count.toLocaleString('en-US')} waiting</span>
                  ) : null}
                </span>
                {count ? (
                  <span className="hidden shrink-0 text-right text-sm tabular-nums text-text-1 sm:block" data-admin-waiting={page.slug}>
                    <span className="font-semibold">{count.toLocaleString('en-US')}</span> <span className="text-text-2">waiting</span>
                  </span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-text-3" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
