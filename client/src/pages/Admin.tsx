import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type AccountUser } from '../lib/account';
import { accountKeys } from '../lib/queryKeys';
import { useAdminOverview } from '../lib/admin';
import { ApiError } from '../lib/http';
import { useAdminCompanyRequests } from '../lib/employerCompanies';
import { AccountGate } from '../components/account/parts';
import { PageContainer, PageHeader } from '../components/layout/Page';
import AccessTab from '../components/admin/AccessTab';
import { AdminNoticeLine, AdminNoticeProvider, useAdminNotice } from '../components/admin/AdminNotice';
import DataTab from '../components/admin/DataTab';
import HistoryTab from '../components/admin/HistoryTab';
import InvitesTab from '../components/admin/InvitesTab';
import PeopleTab from '../components/admin/PeopleTab';
import NotFound from './NotFound';

type TabValue = 'people' | 'access' | 'invites' | 'data' | 'history';

/** One name each, at every width: five short words fit across a phone. */
const TABS: { value: TabValue; label: string }[] = [
  { value: 'people', label: 'People' },
  { value: 'access', label: 'Access' },
  { value: 'invites', label: 'Invites' },
  { value: 'data', label: 'Data' },
  { value: 'history', label: 'History' },
];

/** What belongs to one tab only, dropped from the address when another is chosen. */
const TAB_PARAMS = ['q', 'role', 'open', 'kind', 'id', 'show'];

/**
 * Admin Tools: people, company access, invites, data upkeep and the history
 * of what admins changed, for a signed-in admin. Signed out, the gate sends
 * the person to sign in. Signed in without the role, the page is the same as
 * one that does not exist. The API enforces the same rule on every
 * /api/admin route.
 */
export default function Admin() {
  return (
    <AccountGate>
      {({ user }) =>
        user.isAdmin ? (
          <AdminNoticeProvider>
            <AdminTools me={user} />
          </AdminNoticeProvider>
        ) : (
          <NotFound />
        )
      }
    </AccountGate>
  );
}

const waitingLinkClass = 'font-medium text-fg-default underline underline-offset-4 hover:no-underline';

/**
 * What a person is waiting on an admin for, above the tabs: requests to join
 * a company, and requests to add a company or a plant. Each links to where
 * it is answered. Nothing is drawn when nobody waits, or before the counts
 * are known, so the line means something when it is there. (Draft career
 * paths are work, not someone waiting: they are counted where they are
 * reviewed, under Data.)
 */
function Waiting() {
  const overview = useAdminOverview();
  const queryClient = useQueryClient();
  // The role was taken away while this page was open: ask again who is signed in, and the page goes with the role.
  const refused = overview.error instanceof ApiError && overview.error.status === 403;
  useEffect(() => {
    if (refused) void queryClient.invalidateQueries({ queryKey: accountKeys.account });
  }, [refused, queryClient]);

  const requests = overview.data?.pendingMemberships ?? 0;
  // Companies and plants people asked to have added: answered on the Access tab too.
  const toAdd = useAdminCompanyRequests().data?.length ?? 0;
  if (requests === 0 && toAdd === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm sm:mb-8" data-admin-waiting>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">Waiting</span>
      {requests > 0 && (
        <Link to="/admin?tab=access" className={waitingLinkClass}>
          {requests.toLocaleString('en-US')} access {requests === 1 ? 'request' : 'requests'}
        </Link>
      )}
      {toAdd > 0 && (
        <Link to="/admin?tab=access" className={waitingLinkClass} data-waiting-to-add>
          {toAdd.toLocaleString('en-US')} {toAdd === 1 ? 'request' : 'requests'} to add a company or plant
        </Link>
      )}
    </div>
  );
}

function AdminTools({ me }: { me: AccountUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const notice = useAdminNotice();
  const requested = searchParams.get('tab');
  const tab: TabValue = TABS.find((t) => t.value === requested)?.value ?? 'people';

  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    for (const name of TAB_PARAMS) params.delete(name);
    if (value === 'people') params.delete('tab');
    else params.set('tab', value);
    notice.clear();
    // A tab is a place: Back returns to the one before.
    setSearchParams(params);
  };

  // The browser tab names the place: "Admin Tools · Invites".
  const label = TABS.find((t) => t.value === tab)?.label ?? 'People';
  useEffect(() => {
    // After the layout has named the page, which it does on arrival.
    const timer = window.setTimeout(() => {
      document.title = `Admin Tools · ${label} · Archangel`;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [label]);

  return (
    <PageContainer>
      <PageHeader title="Admin Tools" />
      <Waiting />
      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="flex h-auto w-full justify-start gap-4 overflow-x-auto rounded-none border-b border-border-subtle bg-transparent p-0 text-fg-muted sm:gap-6">
          {TABS.map(({ value, label: tabLabel }) => (
            <TabsTrigger
              key={value}
              value={value}
              // The ring is drawn inside the tab: the scrolling list would clip one drawn outside.
              className="-mb-px rounded-none border-b-2 border-transparent px-1 pb-3 pt-1.5 text-sm font-medium text-fg-muted shadow-none transition-colors
                hover:text-fg-default focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-offset-0
                data-[state=active]:border-[color:var(--color-fg-default)] data-[state=active]:bg-transparent
                data-[state=active]:text-fg-default data-[state=active]:shadow-none"
            >
              {tabLabel}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* What the last action did, between the tabs and what they show. */}
        <AdminNoticeLine />
        <TabsContent value="people" className="mt-0">
          <PeopleTab me={me} />
        </TabsContent>
        <TabsContent value="access" className="mt-0">
          <AccessTab />
        </TabsContent>
        <TabsContent value="invites" className="mt-0">
          <InvitesTab />
        </TabsContent>
        <TabsContent value="data" className="mt-0">
          <DataTab />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
