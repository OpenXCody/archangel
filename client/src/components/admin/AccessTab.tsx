import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminMemberships, useDecideMembership, type AdminMembership, type MembershipDecision } from '../../lib/account';
import { formatAgo, formatDate } from '../../lib/jobFormat';
import { CardNote, ErrorNote, LoadError, RowsSkeleton, busyButtonClass, cardClass, outlineButtonClass, rowClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import CompanyRequests from './CompanyRequests';
import { useAdminNotice } from './AdminNotice';

/** The waiting list is read again this often while it is on screen, and whenever the tab comes back into view. */
const REFRESH_MS = 60_000;

function Dot() {
  return (
    <span className="mx-1.5" aria-hidden="true">
      ·
    </span>
  );
}

/**
 * What helps decide a request: where the person's address is, set beside the
 * company's own domain; how many people already have access; how long the
 * person has had an account, and the companies they already act for.
 */
function DecisionHelp({ request }: { request: AdminMembership }) {
  const members =
    request.activeMembers === 0
      ? 'Nobody has access yet'
      : `${request.activeMembers.toLocaleString('en-US')} ${request.activeMembers === 1 ? 'person has' : 'people have'} access`;
  return (
    <p className="mt-1 break-words text-xs text-fg-muted" data-decision-help>
      {request.domainMatches === true ? (
        <span className="text-fg-default" data-domain-match>
          Address at the company's domain, {request.companyDomain}
        </span>
      ) : (
        <>
          Address at {request.emailDomain}
          <Dot />
          {request.companyDomain ? `Company domain ${request.companyDomain}` : 'No company domain on record'}
        </>
      )}
      <Dot />
      {members}
      <span className="block" data-decision-person>
        Account made {formatAgo(request.userCreatedAt)}
        <Dot />
        {request.otherCompanies.length > 0 ? `Already has access to ${request.otherCompanies.join(', ')}` : 'No other company'}
      </span>
    </p>
  );
}

/**
 * Requests to join a company. Approving makes the person an employer for it;
 * declining keeps the request on record, tells the person, and holds a new
 * request for the same company for a week. Recent declines are listed below
 * and can be approved after all.
 */
export default function AccessTab() {
  const requests = useAdminMemberships('requested', { everyMs: REFRESH_MS });
  const declined = useAdminMemberships('declined');
  const decide = useDecideMembership();
  const notice = useAdminNotice();

  const isBusy = (request: AdminMembership, decision: MembershipDecision) =>
    decide.isPending &&
    decide.variables?.companyId === request.companyId &&
    decide.variables?.userId === request.userId &&
    decide.variables?.decision === decision;
  const said: Record<MembershipDecision, (request: AdminMembership) => string> = {
    approve: (request) => `Approved ${request.userName} for ${request.companyName}.`,
    decline: (request) => `Declined ${request.userName} for ${request.companyName}.`,
    reopen: (request) => `Taken back. ${request.userName}’s request for ${request.companyName} is waiting again.`,
    remove: (request) => `Cleared ${request.userName}’s request for ${request.companyName}.`,
  };
  const act = (request: AdminMembership, decision: MembershipDecision) => {
    if (decide.isPending) return;
    // The row leaves the list: focus goes to the row that takes its place, the one after it.
    const rows = (decision === 'approve' && request.status === 'declined' ? declined.data : requests.data) ?? [];
    const next = rows[rows.findIndex((row) => row.userId === request.userId && row.companyId === request.companyId) + 1];
    decide.mutate(
      { companyId: request.companyId, userId: request.userId, decision },
      {
        onSuccess: () =>
          notice.say(said[decision](request), {
            // An approval or a decline made by mistake goes back to waiting.
            undo: decision === 'approve' || decision === 'decline' ? () => act(request, 'reopen') : undefined,
            focus: next ? `[data-request-row="${next.companyId}:${next.userId}"] button` : undefined,
          }),
      }
    );
  };

  return (
    <>
      <PageSection>
        <p className="mb-3 text-sm text-fg-muted">Requests to join a company. Approval lets the person post its jobs and read its applicants.</p>
        {requests.isPending ? (
          <RowsSkeleton rows={2} />
        ) : requests.isError ? (
          <LoadError error={requests.error} onRetry={() => void requests.refetch()} retrying={requests.isFetching} />
        ) : requests.data.length === 0 ? (
          <CardNote>None.</CardNote>
        ) : (
          <ul className={cardClass}>
            {requests.data.map((request) => (
              <li
                key={`${request.companyId}:${request.userId}`}
                className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')}
                data-request-email={request.userEmail}
                data-request-row={`${request.companyId}:${request.userId}`}
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="break-words text-sm font-medium text-fg-default">{request.userName}</p>
                  <p className="break-all text-sm text-fg-muted">{request.userEmail}</p>
                  <p className="mt-1 break-words text-xs text-fg-muted">
                    <Link to={`/companies/${request.companyId}`} className="font-medium text-fg-default underline-offset-4 hover:underline">
                      {request.companyName}
                    </Link>
                    <Dot />
                    Requested {formatAgo(request.createdAt)}
                  </p>
                  <DecisionHelp request={request} />
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    aria-busy={isBusy(request, 'approve')}
                    aria-disabled={decide.isPending}
                    onClick={() => act(request, 'approve')}
                    aria-label={`Approve ${request.userName} for ${request.companyName}`}
                    className={cn('h-10 px-4 sm:h-9', busyButtonClass)}
                  >
                    {isBusy(request, 'approve') && <Loader2 className="animate-spin" />}
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-busy={isBusy(request, 'decline')}
                    aria-disabled={decide.isPending}
                    onClick={() => act(request, 'decline')}
                    aria-label={`Decline ${request.userName} for ${request.companyName}`}
                    className={cn('h-10 px-4 sm:h-9', outlineButtonClass, busyButtonClass)}
                  >
                    {isBusy(request, 'decline') && <Loader2 className="animate-spin" />}
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={decide.error} className="mt-2" />
      </PageSection>

      {/* Companies and plants people asked to have added (its own component and API). */}
      <CompanyRequests />

      {/* Only when there is one: an empty "Declined" heading says nothing. */}
      {declined.data && declined.data.length > 0 && (
        <PageSection title="Declined" description="In the last 30 days. The person can ask again a week after a decline.">
          <ul className={cardClass}>
            {declined.data.map((request) => (
              <li
                key={`${request.companyId}:${request.userId}`}
                className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')}
                data-declined-email={request.userEmail}
                data-request-row={`${request.companyId}:${request.userId}`}
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="break-words text-sm font-medium text-fg-default">{request.userName}</p>
                  <p className="break-all text-sm text-fg-muted">{request.userEmail}</p>
                  <p className="mt-1 break-words text-xs text-fg-muted">
                    <Link to={`/companies/${request.companyId}`} className="font-medium text-fg-default underline-offset-4 hover:underline">
                      {request.companyName}
                    </Link>
                    {request.decidedAt && (
                      <>
                        <Dot />
                        Declined {formatDate(request.decidedAt)}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-busy={isBusy(request, 'approve')}
                  aria-disabled={decide.isPending}
                  onClick={() => act(request, 'approve')}
                  aria-label={`Approve ${request.userName} for ${request.companyName} after all`}
                  className={cn('h-9 shrink-0', outlineButtonClass, busyButtonClass)}
                >
                  {isBusy(request, 'approve') && <Loader2 className="animate-spin" />}
                  Approve after all
                </Button>
              </li>
            ))}
          </ul>
        </PageSection>
      )}
    </>
  );
}
