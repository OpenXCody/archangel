import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminMemberships, useDecideMembership, type AdminMembership, type MembershipDecision } from '../../lib/account';
import { formatAgo, formatDate } from '../../lib/jobFormat';
import { CardNote, ErrorNote, LoadError, RowsSkeleton, busyButtonClass, cardClass, outlineButtonClass, rowClass } from '../account/parts';
import { PageSection } from '../layout/Page';

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
 * company's own domain, and how many people already have access.
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

  const isBusy = (request: AdminMembership, decision: MembershipDecision) =>
    decide.isPending &&
    decide.variables?.companyId === request.companyId &&
    decide.variables?.userId === request.userId &&
    decide.variables?.decision === decision;
  const act = (request: AdminMembership, decision: MembershipDecision) => {
    if (!decide.isPending) decide.mutate({ companyId: request.companyId, userId: request.userId, decision });
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
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    aria-busy={isBusy(request, 'approve')}
                    aria-disabled={decide.isPending}
                    onClick={() => act(request, 'approve')}
                    aria-label={`Approve ${request.userName} for ${request.companyName}`}
                    className={cn('h-9', busyButtonClass)}
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
                    className={cn('h-9', outlineButtonClass, busyButtonClass)}
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

      {/* Only when there is one: an empty "Declined" heading says nothing. */}
      {declined.data && declined.data.length > 0 && (
        <PageSection title="Declined" description="In the last 30 days. The person can ask again a week after a decline.">
          <ul className={cardClass}>
            {declined.data.map((request) => (
              <li
                key={`${request.companyId}:${request.userId}`}
                className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')}
                data-declined-email={request.userEmail}
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
