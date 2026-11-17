import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { factoriesApi, occupationsApi } from '../../lib/api';
import {
  EMPLOYMENT_TYPES,
  useCreateJob,
  type EmployerFactory,
  type EmploymentType,
  type JobDetailResponse,
  type PayPeriod,
} from '../../lib/account';
import { DESCRIPTION_MAX, DESCRIPTION_WARN, checkPay, normalizeLink, payInputText, useEditJob } from '../../lib/employerJobs';
import { employmentLabel, formatPlace } from '../../lib/jobFormat';
import CareerPicker, { type CareerOption } from './CareerPicker';
import JobSkillTags, { type JobSkillTag } from './JobSkillTags';
import { ErrorNote, Field, LoadError, busyButtonClass, fieldClass, outlineButtonClass, selectContentClass, selectTriggerClass } from './parts';

// These three live with the other shared form pieces; exported from here too for the files that import them from the job form.
export { busyButtonClass, selectContentClass, selectTriggerClass };

/** The company a job is posted for, and where it can be. */
export interface JobFormCompany {
  companyId: string;
  companyName: string;
  factories: EmployerFactory[];
}

interface JobFormProps {
  company: JobFormCompany;
  /**
   * `post` starts empty. `copy` starts from `source` and posts a new job.
   * `edit` changes `source` in place; its factory and career stay as posted.
   */
  mode: 'post' | 'copy' | 'edit';
  source?: JobDetailResponse;
  onCancel?: () => void;
}

type FieldName = 'factory' | 'career' | 'title' | 'pay' | 'payPeriod' | 'description' | 'link';

/** The control to put focus on for each field with a problem, in form order. */
const FIELD_FOCUS: [FieldName, string][] = [
  ['factory', 'job-factory'],
  ['career', 'job-career'],
  ['title', 'job-title'],
  ['pay', 'job-pay-min'],
  ['payPeriod', 'job-pay-keep'],
  ['description', 'job-description'],
  ['link', 'job-apply-url'],
];

/**
 * The job form: post a job, post another like an existing one, or edit one.
 * Each problem is named beside the field it belongs to; nothing is sent until
 * there are none. On success the person lands on the job.
 */
export default function JobForm({ company, mode, source, onCancel }: JobFormProps) {
  const navigate = useNavigate();
  const createJob = useCreateJob();
  const editJob = useEditJob(source?.job.id ?? '');
  const editing = mode === 'edit' && Boolean(source);
  const from = source?.job;

  const [factoryId, setFactoryId] = useState(() => {
    if (from) return company.factories.some((factory) => factory.id === from.factoryId) ? from.factoryId : '';
    return company.factories.length === 1 ? company.factories[0].id : '';
  });
  const [career, setCareer] = useState<CareerOption | null>(from ? { id: from.occupationId, title: from.occupationTitle } : null);
  const [skills, setSkills] = useState<JobSkillTag[]>(
    () => source?.skills.map((skill) => ({ id: skill.id, name: skill.name, required: skill.required })) ?? []
  );
  // The career whose skills the tags started from. Null until those have loaded.
  // A job being copied or edited brings its own tags.
  const [seededFor, setSeededFor] = useState<string | null>(from?.occupationId ?? null);
  const [title, setTitle] = useState(from?.title ?? '');
  const [titleEdited, setTitleEdited] = useState(Boolean(from && from.title !== from.occupationTitle));
  const [payMin, setPayMin] = useState(payInputText(from?.payMin ?? null));
  const [payMax, setPayMax] = useState(payInputText(from?.payMax ?? null));
  const [payPeriod, setPayPeriod] = useState<PayPeriod>(from?.payPeriod ?? 'hour');
  // The pay the person has said is right, odd as it looks for its period.
  const [payConfirmed, setPayConfirmed] = useState<string | null>(null);
  const [employmentType, setEmploymentType] = useState<EmploymentType>(from?.employmentType ?? 'full-time');
  const [shift, setShift] = useState(from?.shift ?? '');
  const [description, setDescription] = useState(from?.description ?? '');
  const [applyIn, setApplyIn] = useState<'app' | 'link'>(from?.applyUrl ? 'link' : 'app');
  const [applyUrl, setApplyUrl] = useState(from?.applyUrl ?? '');
  // Problems show once the person has tried to send the form.
  const [attempted, setAttempted] = useState(false);
  // Set the moment a post is sent, so a double click cannot send it twice
  // (the mutation's own pending flag only changes on the next render).
  const sending = useRef(false);
  // Tags as the person left them, by career: going back to a career brings
  // the edits back, not the defaults.
  const editedTags = useRef(new Map<string, JobSkillTag[]>());

  // Careers already recorded at the chosen factory are the likeliest picks.
  const factoryCareers = useQuery({
    queryKey: ['picker', 'factory-careers', factoryId],
    queryFn: () => factoriesApi.get(factoryId),
    enabled: Boolean(factoryId) && !editing,
    staleTime: 5 * 60_000,
  });
  const suggestions: CareerOption[] = (factoryCareers.data?.occupations ?? []).map((o) => ({ id: o.id, title: o.title }));

  // The career's own skills are the default tags: stage 3 optional, the rest required.
  const careerId = career?.id ?? '';
  const careerSkills = useQuery({
    queryKey: ['picker', 'career-skills', careerId],
    queryFn: () => occupationsApi.get(careerId),
    enabled: Boolean(careerId),
    staleTime: 5 * 60_000,
  });
  const seeded = Boolean(careerId) && seededFor === careerId;
  if (careerId && careerSkills.data && !seeded) {
    // Set while rendering, so tags the client already has never flash a loader.
    const defaults = careerSkills.data.skills.map((skill) => ({ id: skill.id, name: skill.name, required: skill.stage !== 3 }));
    setSeededFor(careerId);
    // Tags edited for this career earlier in the form come back as they were;
    // otherwise the defaults, plus anything added while they were unavailable.
    setSkills(
      editedTags.current.get(careerId) ??
        [...defaults, ...skills.filter((tag) => !defaults.some((skill) => skill.id === tag.id))]
    );
  }

  const pickCareer = (next: CareerOption | null) => {
    setCareer(next);
    if (next?.id !== career?.id) {
      if (career && seeded) editedTags.current.set(career.id, skills);
      setSkills([]);
      setSeededFor(null);
    }
    // The title follows the career until the person writes their own.
    if (!titleEdited || !title.trim()) {
      setTitle(next?.title ?? '');
      setTitleEdited(false);
    }
  };

  // --- Checks ---------------------------------------------------------------
  const pay = checkPay(payMin, payMax, payPeriod);
  const payKey = `${payPeriod}|${pay.min}|${pay.max}`;
  const payQuestion = pay.question && payConfirmed !== payKey ? pay.question : null;
  const descriptionLength = description.trim().length;
  const descriptionOver = descriptionLength - DESCRIPTION_MAX;
  const link = applyIn === 'link' ? normalizeLink(applyUrl) : null;

  const problems: Partial<Record<FieldName, string>> = {};
  if (!editing && !factoryId) problems.factory = 'Choose a factory.';
  if (!career) problems.career = 'Choose a career.';
  if (title.trim().length === 1) problems.title = 'Use at least two characters, or leave it empty for the career name.';
  const payError = pay.minError ?? pay.maxError ?? pay.rangeError;
  if (payError) problems.pay = payError;
  else if (payQuestion) problems.payPeriod = payQuestion;
  if (descriptionOver > 0) problems.description = `Shorten the description by ${descriptionOver.toLocaleString('en-US')} characters.`;
  if (applyIn === 'link' && !link) {
    problems.link = applyUrl.trim() ? 'Enter a web address, such as careers.example.com/apply.' : 'Enter the application link.';
  }
  const shown = (field: FieldName) => (attempted ? problems[field] : undefined);
  // Lowest above highest is plain as soon as both are typed.
  const payProblem = attempted ? payError : pay.rangeError;

  const mutation = editing ? editJob : createJob;
  const busy = mutation.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || sending.current) return;
    mutation.reset();
    setAttempted(true);

    const first = FIELD_FOCUS.find(([field]) => problems[field]);
    if (first || !career || pay.min === null || pay.max === null) {
      if (first) window.setTimeout(() => document.getElementById(first[1])?.focus(), 0);
      return;
    }

    const fields = {
      title: title.trim() || career.title,
      description: description.trim(),
      employmentType,
      shift: shift.trim(),
      payMin: pay.min,
      payMax: pay.max,
      payPeriod,
      applyUrl: applyIn === 'link' ? link : null,
    };
    const tags = skills.map((skill) => ({ skillId: skill.id, required: skill.required }));
    const settled = () => {
      sending.current = false;
    };

    sending.current = true;
    if (editing && from) {
      editJob.mutate({ ...fields, skills: tags }, { onSuccess: () => navigate(`/jobs/${from.id}`), onSettled: settled });
    } else {
      createJob.mutate(
        {
          companyId: company.companyId,
          factoryId,
          occupationId: career.id,
          ...fields,
          // Without the career's defaults and with nothing added, the server applies the defaults.
          skills: seeded || skills.length > 0 ? tags : undefined,
        },
        { onSuccess: (created) => navigate(`/jobs/${created.id}`), onSettled: settled }
      );
    }
  };

  const per = payPeriod === 'hour' ? 'per hour' : 'per year';
  const otherPeriod: PayPeriod = payPeriod === 'hour' ? 'year' : 'hour';

  return (
    <form onSubmit={submit} noValidate className="space-y-5" data-job-form={mode}>
      {editing && from ? (
        <div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Fixed label="Factory">{[from.factoryName, formatPlace(from.city, from.state)].filter(Boolean).join(' · ')}</Fixed>
            <Fixed label="Career">{from.occupationTitle}</Fixed>
          </dl>
          <p className="mt-1.5 text-xs text-fg-muted">Fixed once posted. For another factory or career, post another like this.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Factory" htmlFor="job-factory">
            <Select value={factoryId} onValueChange={setFactoryId}>
              <SelectTrigger
                id="job-factory"
                aria-invalid={shown('factory') ? true : undefined}
                aria-describedby={shown('factory') ? 'job-factory-error' : undefined}
                className={selectTriggerClass}
              >
                <SelectValue placeholder="Choose a factory" />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {company.factories.map((factory) => (
                  <SelectItem key={factory.id} value={factory.id} className="py-2.5">
                    {[factory.name, formatPlace(factory.city, factory.state)].filter(Boolean).join(' · ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="job-factory-error" message={shown('factory')} />
          </Field>
          <Field label="Career" htmlFor="job-career" hint={shown('career') ? undefined : 'Sets the default skills.'}>
            <CareerPicker
              id="job-career"
              value={career}
              onChange={pickCareer}
              suggestions={suggestions}
              suggestionsLabel="Careers at this factory"
            />
            <FieldError id="job-career-error" message={shown('career')} />
          </Field>
        </div>
      )}

      {career && (
        <fieldset className="min-w-0" data-job-skills>
          <legend className="mb-1.5 text-sm font-medium text-fg-muted">Skills</legend>
          {!seeded && careerSkills.isPending ? (
            <p className="flex min-h-[42px] items-center gap-2 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading skills
            </p>
          ) : (
            <div className="space-y-3">
              {!seeded && careerSkills.isError && (
                <LoadError error={careerSkills.error} onRetry={() => void careerSkills.refetch()} retrying={careerSkills.isFetching} />
              )}
              <JobSkillTags
                id="job-skill-add"
                value={skills}
                onChange={setSkills}
                emptyNote={
                  !seeded
                    ? "Unless skills are added, the job uses the career's defaults."
                    : !editing && careerSkills.data?.skills.length === 0
                      ? 'No skills on record for this career.'
                      : 'No skills tagged.'
                }
              />
              {skills.length > 0 && <p className="text-xs text-fg-muted">Applicants are ranked by required skills held.</p>}
            </div>
          )}
        </fieldset>
      )}

      <Field label="Job title" htmlFor="job-title" hint={shown('title') ? undefined : 'Defaults to the career name.'}>
        <input
          id="job-title"
          type="text"
          maxLength={120}
          value={title}
          aria-invalid={shown('title') ? true : undefined}
          aria-describedby={shown('title') ? 'job-title-error' : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleEdited(true);
          }}
          className={fieldClass}
        />
        <FieldError id="job-title-error" message={shown('title')} />
      </Field>

      <fieldset className="min-w-0" aria-describedby={payProblem ? 'job-pay-error' : undefined}>
        <legend className="mb-1.5 text-sm font-medium text-fg-muted">Pay range, in dollars</legend>
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <DollarInput
            id="job-pay-min"
            label={`Lowest ${per}`}
            value={payMin}
            onChange={setPayMin}
            placeholder={payPeriod === 'hour' ? '24.00' : '52,000'}
            invalid={Boolean(attempted ? (pay.minError ?? pay.rangeError) : pay.rangeError)}
          />
          <DollarInput
            id="job-pay-max"
            label={`Highest ${per}`}
            value={payMax}
            onChange={setPayMax}
            placeholder={payPeriod === 'hour' ? '29.00' : '60,000'}
            invalid={Boolean(attempted ? (pay.maxError ?? pay.rangeError) : pay.rangeError)}
          />
          <div
            role="radiogroup"
            aria-label="Pay is per"
            className="grid h-[42px] grid-cols-2 gap-1 rounded-lg border border-border-strong bg-bg-elevated p-1 xs:col-span-2 sm:col-span-1 sm:w-48"
          >
            {(['hour', 'year'] as const).map((period) => (
              <button
                key={period}
                type="button"
                role="radio"
                aria-checked={payPeriod === period}
                onClick={() => setPayPeriod(period)}
                className={cn(
                  'rounded-md text-sm font-medium transition-colors',
                  payPeriod === period ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
                )}
              >
                Per {period}
              </button>
            ))}
          </div>
        </div>
        <FieldError id="job-pay-error" message={payProblem ?? undefined} />
        {!payProblem && payQuestion && (
          <div
            role="group"
            aria-labelledby="job-pay-question"
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border-strong px-3 py-2.5"
            data-pay-question
          >
            <p id="job-pay-question" role={attempted ? 'alert' : 'status'} className="min-w-0 flex-1 basis-48 text-sm text-fg-default">
              {payQuestion} Per hour or per year?
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                id="job-pay-keep"
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPayConfirmed(payKey)}
                className={cn('h-9', outlineButtonClass)}
              >
                Per {payPeriod}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPayPeriod(otherPeriod)} className={cn('h-9', outlineButtonClass)}>
                Per {otherPeriod}
              </Button>
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="job-type">
          <Select value={employmentType} onValueChange={(value) => setEmploymentType(value as EmploymentType)}>
            <SelectTrigger id="job-type" className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {EMPLOYMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="py-2.5">
                  {employmentLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Shift" htmlFor="job-shift" optional>
          <input
            id="job-shift"
            type="text"
            maxLength={40}
            placeholder="Days, 2nd shift, rotating"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor="job-description"
        optional
        hint={descriptionOver > 0 ? undefined : 'The work, the schedule, and anything an applicant should know.'}
      >
        {/* No maxLength: a long paste is counted and named, not cut. */}
        <textarea
          id="job-description"
          rows={5}
          value={description}
          aria-invalid={descriptionOver > 0 ? true : undefined}
          aria-describedby={descriptionLength >= DESCRIPTION_MAX - DESCRIPTION_WARN ? 'job-description-count' : undefined}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(fieldClass, 'resize-y')}
        />
        {descriptionLength >= DESCRIPTION_MAX - DESCRIPTION_WARN && (
          <p
            id="job-description-count"
            role="status"
            className={cn('mt-1.5 text-xs tabular-nums', descriptionOver > 0 ? 'text-danger' : 'text-fg-muted')}
          >
            {descriptionLength.toLocaleString('en-US')} of {DESCRIPTION_MAX.toLocaleString('en-US')} characters.
            {descriptionOver > 0 && ` Shorten it by ${descriptionOver.toLocaleString('en-US')}.`}
          </p>
        )}
      </Field>

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium text-fg-muted">Applications</legend>
        <div role="radiogroup" aria-label="Applications" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ApplyChoice
            selected={applyIn === 'app'}
            onSelect={() => setApplyIn('app')}
            title="In the app"
            detail="Applicants are listed on the job page, ranked by skills held."
          />
          <ApplyChoice
            selected={applyIn === 'link'}
            onSelect={() => setApplyIn('link')}
            title="Company site"
            detail="The job links to an external application page."
          />
        </div>
        {applyIn === 'link' && (
          <Field label="Application link" htmlFor="job-apply-url" className="mt-3">
            <input
              id="job-apply-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={500}
              placeholder="careers.example.com/apply"
              value={applyUrl}
              aria-invalid={shown('link') ? true : undefined}
              aria-describedby={shown('link') ? 'job-apply-url-error' : undefined}
              onChange={(e) => setApplyUrl(e.target.value)}
              // Shown as it will be stored: an address typed without https:// gets it.
              onBlur={() => {
                const stored = normalizeLink(applyUrl);
                if (stored) setApplyUrl(stored);
              }}
              className={fieldClass}
            />
            <FieldError id="job-apply-url-error" message={shown('link')} />
          </Field>
        )}
      </fieldset>

      <ErrorNote error={mutation.error} />

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          aria-disabled={busy}
          aria-busy={busy}
          className={cn('h-11 w-full rounded-lg sm:w-auto sm:px-8', busyButtonClass)}
        >
          {busy && <Loader2 className="animate-spin" />}
          {editing ? 'Save changes' : 'Post job'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className={cn('h-11 w-full rounded-lg sm:w-auto sm:px-6', outlineButtonClass)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** A problem with one field, said beside it. */
function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-danger">
      {message}
    </p>
  );
}

/** A value that cannot be changed here, set out like the fields around it. */
function Fixed({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1.5 text-sm font-medium text-fg-muted">{label}</dt>
      <dd className="break-words text-sm text-fg-default">{children}</dd>
    </div>
  );
}

interface DollarInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid: boolean;
}

function DollarInput({ id, label, value, onChange, placeholder, invalid }: DollarInputProps) {
  return (
    <div className="min-w-0">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-muted" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          aria-invalid={invalid ? true : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldClass, 'pl-7', invalid && 'border-danger/60')}
        />
      </div>
      <span className="mt-1 block text-xs text-fg-muted">{label}</span>
    </div>
  );
}

function ApplyChoice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-[color:var(--color-fg-muted)] bg-bg-elevated' : 'border-border-subtle hover:border-border-strong'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-[color:var(--color-fg-default)]' : 'border-[color:var(--color-fg-soft)]'
        )}
        aria-hidden="true"
      >
        {selected && <span className="h-2 w-2 rounded-full bg-[color:var(--color-fg-default)]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg-default">{title}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">{detail}</span>
      </span>
    </button>
  );
}
