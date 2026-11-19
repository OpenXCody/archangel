import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminCompany } from '../../lib/admin';
import { useAdminCompanyRequests, useAnswerCompanyRequest, type AdminCompanyRequest } from '../../lib/employerCompanies';
import { ErrorNote, busyButtonClass, cardClass, outlineButtonClass, rowClass, Dot } from '../account/parts';
import { formatOnDay } from '../../lib/dates';
import { PageSection } from '../layout/Page';
import CompanyPicker from './CompanyPicker';

/**
 * Requests to add what is not in the data: a company (from someone who could
 * not find theirs on the employer page), or a plant of a company (from one of
 * its members). Shown on the Access tab under the requests to join, and only
 * when there is one.
 *
 * A company is added under Data (company, then its plant), then chosen here:
 * that gives the person access to it. A plant is added under Data and the
 * request marked added. Either can be declined. The person is told by email.
 */
export default function CompanyRequests() {
  const requests = useAdminCompanyRequests();
  if (!requests.data || requests.data.length === 0) return null;
  return (
    <PageSection
      title="Companies and plants to add"
      description={
        <>
          Asked for by people who could not find them. Add the record under{' '}
          <Link to="/admin?tab=data" className="font-medium text-text-1 underline underline-offset-4 hover:no-underline">
            Data
          </Link>
          , then answer the request here.
        </>
      }
    >
      <ul className={cardClass} data-company-requests>
        {requests.data.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </ul>
    </PageSection>
  );
}

function RequestRow({ request }: { request: AdminCompanyRequest }) {
  const answer = useAnswerCompanyRequest();
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const plant = request.companyId !== null;
  const pickerId = `company-request-${request.id}`;
  const doing = (decision: 'add' | 'decline') => answer.isPending && answer.variables?.decision === decision;

  const add = () => {
    if (answer.isPending || (!plant && !company)) return;
    answer.mutate({ id: request.id, decision: 'add', companyId: company?.id });
  };

  return (
    <li className={cn(rowClass, 'space-y-3 py-4')} data-company-request-email={request.userEmail}>
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-text-1">
          {plant ? (
            <>
              Plant for{' '}
              <Link to={`/companies/${request.companyId}`} className="underline-offset-4 hover:underline">
                {request.companyName ?? request.name}
              </Link>
            </>
          ) : (
            request.name
          )}
        </p>
        <p className="mt-0.5 break-words text-sm text-text-2">
          {request.place}
          {request.website && (
            <>
              <Dot />
              <a href={`https://${request.website}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:no-underline">
                {request.website}
              </a>
            </>
          )}
        </p>
        <p className="mt-1 break-words text-xs text-text-2">
          {request.userName}
          <Dot />
          <span className="break-all">{request.userEmail}</span>
          <Dot />
          Asked {formatOnDay(request.createdAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!plant && (
          <div className="min-w-0 flex-1 basis-56">
            <label htmlFor={pickerId} className="sr-only">
              The company, once it is in the data
            </label>
            <CompanyPicker id={pickerId} value={company} onChange={setCompany} disabled={answer.isPending} />
          </div>
        )}
        <Button
          type="button"
          size="sm"
          aria-busy={doing('add')}
          aria-disabled={answer.isPending || (!plant && !company)}
          onClick={add}
          aria-label={plant ? `Mark the plant for ${request.name} as added` : `Give ${request.userName} access to the chosen company`}
          className={cn('h-[42px] px-4', busyButtonClass)}
        >
          {doing('add') && <Loader2 className="animate-spin" />}
          {plant ? 'Mark added' : 'Give access'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-busy={doing('decline')}
          aria-disabled={answer.isPending}
          onClick={() => {
            if (!answer.isPending) answer.mutate({ id: request.id, decision: 'decline' });
          }}
          aria-label={`Decline the request from ${request.userName}`}
          className={cn('h-[42px] px-4', outlineButtonClass, busyButtonClass)}
        >
          {doing('decline') && <Loader2 className="animate-spin" />}
          Decline
        </Button>
      </div>
      <ErrorNote error={answer.error} />
    </li>
  );
}
