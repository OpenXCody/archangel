import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { occupationsApi } from '../../lib/api';
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
import AddRecord from './AddRecord';
import CompanyPicker from './CompanyPicker';

/** Counts, a company's profile, adding a record by hand, and career paths waiting for review. */
export default function DataTab() {
  return (
    <>
      <CountsSection />
      <CompanyProfileSection />
      <AddRecord />
      <PathsSection />
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

const PATHS_SHOWN = 12;
const STAGES: { stage: number; label: string }[] = [
  { stage: 1, label: 'Introduction' },
  { stage: 2, label: 'Fundamentals' },
  { stage: 3, label: 'Advanced' },
];

function PathsSection() {
  const paths = useDraftPaths();
  const approve = useApprovePath();
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const wanted = filter.trim().toLowerCase();
  const matching = (paths.data ?? []).filter((path) => !wanted || path.title.toLowerCase().includes(wanted));
  const shown = showAll || wanted ? matching : matching.slice(0, PATHS_SHOWN);
  const total = paths.data?.length ?? 0;

  return (
    <PageSection
      title="Career paths awaiting review"
      description={
        total > 0
          ? `${total.toLocaleString('en-US')} ${total === 1 ? 'draft' : 'drafts'}. Open one to read its skills by stage, then approve it.`
          : 'Drafts. Approval marks the path as reviewed; its skills stay as they are.'
      }
    >
      {paths.isPending ? (
        <RowsSkeleton rows={3} />
      ) : paths.isError ? (
        <LoadError error={paths.error} onRetry={() => void paths.refetch()} retrying={paths.isFetching} />
      ) : total === 0 ? (
        <CardNote>None.</CardNote>
      ) : (
        <>
          {total > PATHS_SHOWN && (
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by career"
              aria-label="Filter draft paths by career"
              className={cn(fieldClass, 'mb-3 sm:max-w-xs')}
            />
          )}
          {matching.length === 0 ? (
            <CardNote>No draft matches.</CardNote>
          ) : (
            <ul className={cardClass}>
              {shown.map((path) => {
                const busy = approve.isPending && approve.variables === path.id;
                const expanded = open === path.id;
                return (
                  <li key={path.id} className={rowClass} data-draft-path={path.id}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : path.id)}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 basis-48 items-center gap-2 text-left"
                      >
                        <ChevronRight
                          className={cn('h-4 w-4 shrink-0 text-fg-muted transition-transform', expanded && 'rotate-90')}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-medium text-fg-default">{path.title}</span>
                          <span className="block text-xs tabular-nums text-fg-muted">
                            {path.skillCount} {path.skillCount === 1 ? 'skill' : 'skills'}
                          </span>
                        </span>
                      </button>
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
                    </div>
                    {expanded && <PathReview occupationId={path.id} />}
                  </li>
                );
              })}
            </ul>
          )}
          {!showAll && !wanted && matching.length > PATHS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
            >
              Show all {matching.length.toLocaleString('en-US')}
            </button>
          )}
        </>
      )}
      <ErrorNote error={approve.error} className="mt-2" />
    </PageSection>
  );
}

/** A draft path's skills, stage by stage, so it can be read before it is approved. */
function PathReview({ occupationId }: { occupationId: string }) {
  const career = useQuery({
    queryKey: ['admin', 'path-review', occupationId],
    queryFn: () => occupationsApi.get(occupationId),
    staleTime: 60_000,
  });

  if (career.isPending) return <div className="px-4 pb-4"><RowsSkeleton rows={2} /></div>;
  if (career.isError) {
    return (
      <div className="px-4 pb-4">
        <LoadError error={career.error} onRetry={() => void career.refetch()} retrying={career.isFetching} />
      </div>
    );
  }

  const skills = career.data.skills ?? [];
  const groups = [
    ...STAGES.map(({ stage, label }) => ({ label, items: skills.filter((skill) => skill.stage === stage) })),
    { label: 'No stage', items: skills.filter((skill) => ![1, 2, 3].includes(skill.stage ?? 0)) },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="border-t border-border-subtle bg-bg-base px-4 py-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.label} className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-fg-soft">
              {group.label} <span className="tabular-nums">{group.items.length}</span>
            </p>
            <ul className="mt-2 space-y-1">
              {group.items.map((skill) => (
                <li key={skill.id} className="break-words text-sm text-fg-default">
                  {skill.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Link
        to={`/occupations/${occupationId}`}
        className="mt-4 inline-block text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
      >
        Career page
      </Link>
    </div>
  );
}

function CompanyProfileSection() {
  const [company, setCompany] = useState<AdminCompany | null>(null);
  return (
    <PageSection title="Company profile" description="Logo domain, featured, industry and description.">
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
  const [industry, setIndustry] = useState(company.industry ?? '');
  const [description, setDescription] = useState(company.description ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const cleaned = domain.trim().toLowerCase();
  const changed =
    cleaned !== (company.domain ?? '') ||
    featured !== company.featured ||
    industry.trim() !== (company.industry ?? '') ||
    description.trim() !== (company.description ?? '');
  // The preview follows the draft once it reads as a domain, a beat after typing stops.
  const previewDomain = useDebouncedValue(HOSTNAME.test(cleaned) ? cleaned : null, 400);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending || !changed) return;
    update.reset();
    if (cleaned && !HOSTNAME.test(cleaned)) return setProblem('Bare domain only, such as tesla.com. No scheme or path.');
    setProblem(null);
    update.mutate(
      {
        companyId: company.id,
        patch: { domain: cleaned || null, featured, industry: industry.trim() || null, description: description.trim() || null },
      },
      {
        onSuccess: (result) => {
          setDomain(result.domain ?? '');
          setIndustry(result.industry ?? '');
          setDescription(result.description ?? '');
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
          <p className="text-sm text-fg-muted">{previewDomain ? `Logo from ${previewDomain}` : 'No domain: monogram'}</p>
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

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Field label="Industry" htmlFor="profile-industry" optional>
          <input
            id="profile-industry"
            type="text"
            autoComplete="off"
            maxLength={80}
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
          />
        </Field>
        <Field label="Description" htmlFor="profile-description" optional hint="One line on what the company makes.">
          <textarea
            id="profile-description"
            rows={2}
            maxLength={600}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setSaved(false);
            }}
            className={cn(fieldClass, 'resize-y')}
          />
        </Field>
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
