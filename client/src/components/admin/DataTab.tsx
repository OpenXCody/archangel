import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  useAdminOverview,
  useApprovePath,
  useDraftPaths,
  useUpdateCompany,
  type AdminCompany,
} from '../../lib/account';
import CompanyLogo from '../CompanyLogo';
import {
  CardNote,
  ErrorNote,
  Field,
  LoadError,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  useDebouncedValue,
} from '../account/parts';
import { PageSection } from '../layout/Page';
import CompanyPicker from './CompanyPicker';

/** Counts, the import tools, career paths waiting for review, and a company's profile. */
export default function DataTab() {
  return (
    <>
      <CountsSection />
      <ImportSection />
      <PathsSection />
      <CompanyProfileSection />
    </>
  );
}

function CountsSection() {
  const overview = useAdminOverview();
  const tiles: { label: string; value: number | undefined }[] = [
    { label: 'People', value: overview.data?.users },
    { label: 'Access requests', value: overview.data?.pendingMemberships },
    { label: 'Open jobs', value: overview.data?.openJobs },
    { label: 'Applications', value: overview.data?.applications },
  ];
  return (
    <PageSection title="Counts">
      {overview.isError ? (
        <LoadError error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      ) : (
        <dl className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className={cn(cardClass, 'min-w-0 p-4')}>
              <dt className="truncate text-sm text-fg-muted">{tile.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-fg-default">
                {tile.value === undefined ? <Skeleton className="h-8 w-12" /> : tile.value.toLocaleString('en-US')}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </PageSection>
  );
}

const IMPORT_TOOLS: { to: string; label: string; detail: string }[] = [
  { to: '/import', label: 'Import', detail: 'Companies, factories, careers, skills. Review queue.' },
  { to: '/import/bulk', label: 'Bulk import', detail: 'One spreadsheet, columns mapped to records.' },
];

function ImportSection() {
  return (
    <PageSection title="Import">
      <ul className={cardClass}>
        {IMPORT_TOOLS.map((tool) => (
          <li key={tool.to} className={rowClass}>
            <Link to={tool.to} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-elevated">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg-default">{tool.label}</p>
                <p className="text-xs text-fg-muted">{tool.detail}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

function PathsSection() {
  const paths = useDraftPaths();
  const approve = useApprovePath();

  return (
    <PageSection title="Career paths awaiting review" description="Drafts. Approval marks the path as reviewed; its skills stay as they are.">
      {paths.isPending ? (
        <RowsSkeleton rows={3} />
      ) : paths.isError ? (
        <LoadError error={paths.error} onRetry={() => void paths.refetch()} retrying={paths.isFetching} />
      ) : paths.data.length === 0 ? (
        <CardNote>None.</CardNote>
      ) : (
        <ul className={cardClass}>
          {paths.data.map((path) => {
            const busy = approve.isPending && approve.variables === path.id;
            return (
              <li key={path.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3')} data-draft-path={path.id}>
                <div className="min-w-0 flex-1 basis-48">
                  <Link to={`/occupations/${path.id}`} className="break-words text-sm font-medium text-fg-default underline-offset-4 hover:underline">
                    {path.title}
                  </Link>
                  <p className="text-xs tabular-nums text-fg-muted">
                    {path.skillCount} {path.skillCount === 1 ? 'skill' : 'skills'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(path.id)}
                  aria-label={`Approve the path for ${path.title}`}
                  className={cn('h-9 shrink-0', outlineButtonClass)}
                >
                  {busy && <Loader2 className="animate-spin" />}
                  Approve
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ErrorNote error={approve.error} className="mt-2" />
    </PageSection>
  );
}

function CompanyProfileSection() {
  const [company, setCompany] = useState<AdminCompany | null>(null);
  return (
    <PageSection title="Company profile" description="Domain (the logo is looked up from it) and featured.">
      <div className={cn(cardClass, 'p-4 sm:p-5')}>
        <Field label="Company" htmlFor="profile-company">
          <CompanyPicker id="profile-company" value={company} onChange={setCompany} />
        </Field>
        {/* A fresh form per company. */}
        {company && <CompanyProfileForm key={company.id} company={company} onSaved={setCompany} />}
      </div>
    </PageSection>
  );
}

/** Mirrors the server's rule: a bare hostname, no scheme or path. */
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function CompanyProfileForm({ company, onSaved }: { company: AdminCompany; onSaved: (company: AdminCompany) => void }) {
  const update = useUpdateCompany();
  const [domain, setDomain] = useState(company.domain ?? '');
  const [featured, setFeatured] = useState(company.featured);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const cleaned = domain.trim().toLowerCase();
  const changed = cleaned !== (company.domain ?? '') || featured !== company.featured;
  // The preview follows the draft once it reads as a domain, a beat after typing stops.
  const previewDomain = useDebouncedValue(HOSTNAME.test(cleaned) ? cleaned : null, 400);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending || !changed) return;
    update.reset();
    if (cleaned && !HOSTNAME.test(cleaned)) return setProblem('Bare domain only, such as tesla.com. No scheme or path.');
    setProblem(null);
    update.mutate(
      { companyId: company.id, patch: { domain: cleaned || null, featured } },
      {
        onSuccess: (result) => {
          setDomain(result.domain ?? '');
          setSaved(true);
          onSaved(result);
        },
      }
    );
  };

  return (
    <form onSubmit={submit} noValidate className="mt-4 border-t border-border-subtle pt-4">
      <div className="flex items-center gap-3">
        <CompanyLogo name={company.name} domain={previewDomain} size={48} />
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-fg-default">{company.name}</p>
          <Link to={`/companies/${company.slug ?? company.id}`} className="text-xs text-fg-muted underline underline-offset-4 hover:text-fg-default">
            Company page
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <Field label="Domain" htmlFor="profile-domain" hint="Bare hostname, such as tesla.com. Empty for none.">
          <input
            id="profile-domain"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={253}
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
          />
        </Field>
        <div className="min-w-0">
          <label htmlFor="profile-featured" className="mb-1.5 block text-sm font-medium text-fg-muted">
            Featured
          </label>
          <div className="flex min-h-[42px] items-center">
            <Switch
              id="profile-featured"
              checked={featured}
              onCheckedChange={(value) => {
                setFeatured(value);
                setSaved(false);
              }}
            />
          </div>
        </div>
      </div>

      <ErrorNote error={problem ?? update.error} className="mt-4" />
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={!changed || update.isPending} className={cn('h-10', outlineButtonClass)}>
          {update.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {saved && !changed && (
          <p role="status" className="text-xs text-fg-muted">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
