import { Link, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminOverview, type AccountUser } from '../lib/account';
import { AccountGate } from '../components/account/parts';
import { PageContainer, PageHeader } from '../components/layout/Page';
import AccessTab from '../components/admin/AccessTab';
import DataTab from '../components/admin/DataTab';
import InvitesTab from '../components/admin/InvitesTab';
import PeopleTab from '../components/admin/PeopleTab';
import NotFound from './NotFound';

type TabValue = 'people' | 'access' | 'invites' | 'data';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'people', label: 'People' },
  { value: 'access', label: 'Access requests' },
  { value: 'invites', label: 'Invites' },
  { value: 'data', label: 'Data' },
];

/**
 * Admin Tools: people, company access, invites and data upkeep, for a
 * signed-in admin. Signed out, the gate sends the person to sign in. Signed
 * in without the role, the page is the same as one that does not exist. The
 * API enforces the same rule on every /api/admin route.
 */
export default function Admin() {
  return <AccountGate>{({ user }) => (user.isAdmin ? <AdminTools me={user} /> : <NotFound />)}</AccountGate>;
}

const waitingLinkClass = 'font-medium text-fg-default underline underline-offset-4 hover:no-underline';

/**
 * What is waiting for an admin, above the tabs: access requests and career
 * paths not yet reviewed. Each links to where it is dealt with. Nothing is
 * drawn when nothing waits, or before the counts are known.
 */
function Waiting() {
  const overview = useAdminOverview();
  const requests = overview.data?.pendingMemberships ?? 0;
  const paths = overview.data?.draftPaths ?? 0;
  if (requests === 0 && paths === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm sm:mb-8" data-admin-waiting>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">Waiting</span>
      {requests > 0 && (
        <Link to="/admin?tab=access" className={waitingLinkClass}>
          {requests.toLocaleString('en-US')} access {requests === 1 ? 'request' : 'requests'}
        </Link>
      )}
      {paths > 0 && (
        <Link to="/admin?tab=data" className={waitingLinkClass}>
          {paths.toLocaleString('en-US')} draft {paths === 1 ? 'path' : 'paths'}
        </Link>
      )}
    </div>
  );
}

function AdminTools({ me }: { me: AccountUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: TabValue = TABS.find((t) => t.value === requested)?.value ?? 'people';

  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === 'people') params.delete('tab');
    else params.set('tab', value);
    // A tab is a place: Back returns to the one before.
    setSearchParams(params);
  };

  return (
    <PageContainer>
      <PageHeader title="Admin Tools" />
      <Waiting />
      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="mb-6 flex h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border-subtle bg-transparent p-0 text-fg-muted sm:mb-8">
          {TABS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="-mb-px rounded-none border-b-2 border-transparent px-0 pb-3 pt-1 text-sm font-medium text-fg-muted shadow-none transition-colors
                hover:text-fg-default data-[state=active]:border-[color:var(--color-fg-default)] data-[state=active]:bg-transparent
                data-[state=active]:text-fg-default data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
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
      </Tabs>
    </PageContainer>
  );
}
