import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError } from '../../lib/http';
import { useAddVersion, useCompanyVersions, versionLine } from '../../lib/versions';
import CareerPicker from '../account/CareerPicker';
import { CardNote, ErrorNote, LoadError, RowsSkeleton, cardClass, outlineButtonClass, rowClass, textButtonClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { versionEditorPath } from '../entity/CareerVersionView';

/**
 * A company's careers, on Your jobs: the careers it has its own version of,
 * each opening its editor, and the way to add one (choosing a career is all
 * it takes: the version starts as the standard and is changed from there).
 */
export default function CompanyCareers({ company, showCompanyName }: { company: { companyId: string; companyName: string }; showCompanyName: boolean }) {
  const navigate = useNavigate();
  const versions = useCompanyVersions(company.companyId);
  const add = useAddVersion(company.companyId);
  const [adding, setAdding] = useState(false);
  const list = versions.data ?? [];

  const choose = (career: { id: string; title: string } | null) => {
    if (!career || add.isPending) return;
    const open = () => navigate(versionEditorPath(company.companyId, career.id));
    // A career the company already has a version of simply opens.
    if (list.some((version) => version.occupation.id === career.id)) return open();
    add.mutate(career.id, {
      onSuccess: open,
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) open();
      },
    });
  };

  return (
    <PageSection
      title={showCompanyName ? `${company.companyName} careers` : 'Careers'}
      description="How a career is done here: the skills it takes and the makes you run. Shown with your company on the career's page."
    >
      <div data-company-careers={company.companyId}>
        {versions.isPending ? (
          <RowsSkeleton rows={2} />
        ) : versions.isError ? (
          <LoadError error={versions.error} onRetry={() => void versions.refetch()} retrying={versions.isFetching} />
        ) : list.length === 0 ? (
          <CardNote>None yet.</CardNote>
        ) : (
          <ul className={cardClass}>
            {list.map((version) => (
              <li key={version.occupation.id} className={rowClass} data-version-row={version.occupation.id}>
                <Link
                  to={versionEditorPath(company.companyId, version.occupation.id)}
                  className="group flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-elevated"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-fg-default">{version.occupation.title}</span>
                    <span className="mt-0.5 block break-words text-sm text-fg-muted">{versionLine(version) ?? 'The standard path'}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3">
          {adding ? (
            <div className="max-w-md">
              <label htmlFor={`add-career-${company.companyId}`} className="mb-1.5 block text-sm font-medium text-fg-muted">
                Career
              </label>
              <CareerPicker id={`add-career-${company.companyId}`} value={null} onChange={choose} disabled={add.isPending} />
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                {add.isPending ? (
                  <span className="inline-flex items-center gap-1.5" role="status">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Adding
                  </span>
                ) : (
                  <span>It starts as the standard path. You change it from there.</span>
                )}
                <button type="button" onClick={() => setAdding(false)} className={cn(textButtonClass, 'text-xs')}>
                  Cancel
                </button>
              </p>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                add.reset();
                setAdding(true);
              }}
              className={cn('h-10 rounded-lg', outlineButtonClass)}
              data-add-career
            >
              Add a career
            </Button>
          )}
          {add.error && !(add.error instanceof ApiError && add.error.status === 409) && <ErrorNote error={add.error} className="mt-2" />}
        </div>
      </div>
    </PageSection>
  );
}
