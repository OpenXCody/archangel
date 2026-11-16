import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminMemberships, useDecideMembership, type AdminMembership, type MembershipDecision } from '../../lib/account';
import { formatAgo } from '../../lib/jobFormat';
import { CardNote, ErrorNote, LoadError, RowsSkeleton, cardClass, outlineButtonClass, rowClass } from '../account/parts';
import { PageSection } from '../layout/Page';

/** Requests to join a company. Approving makes the person an employer for it. */
export default function AccessTab() {
  const requests = useAdminMemberships('requested');
  const decide = useDecideMembership();

  const isBusy = (request: AdminMembership, decision: MembershipDecision) =>
    decide.isPending &&
    decide.variables?.companyId === request.companyId &&
    decide.variables?.userId === request.userId &&
    decide.variables?.decision === decision;

  return (
    <PageSection title="Access requests" description="Approval lets the person post jobs for the company and read its applicants.">
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
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  Requested {formatAgo(request.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ companyId: request.companyId, userId: request.userId, decision: 'approve' })}
                  aria-label={`Approve ${request.userName} for ${request.companyName}`}
                  className="h-9"
                >
                  {isBusy(request, 'approve') && <Loader2 className="animate-spin" />}
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ companyId: request.companyId, userId: request.userId, decision: 'remove' })}
                  aria-label={`Decline ${request.userName} for ${request.companyName}`}
                  className={cn('h-9', outlineButtonClass)}
                >
                  {isBusy(request, 'remove') && <Loader2 className="animate-spin" />}
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={decide.error} className="mt-2" />
    </PageSection>
  );
}
