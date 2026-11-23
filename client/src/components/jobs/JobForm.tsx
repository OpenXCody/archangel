import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, optionDetailClass, optionTileClass, optionTitleClass } from '@/lib/utils';
import { factoriesApi, occupationsApi } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { EMPLOYMENT_TYPES, useCreateJob, type EmploymentType, type JobDetailResponse, type PayPeriod } from '../../lib/jobs';
import type { EmployerFactory } from '../../lib/employer';
import { DESCRIPTION_MAX, DESCRIPTION_WARN, checkPay, normalizeLink, payInputText, useEditJob } from '../../lib/employerJobs';
import { clearDraft, draftKey, draftWhen, readDraft, writeDraft, type JobDraft, type JobDraftFields } from '../../lib/jobDraft';
import { employmentLabel } from '../../lib/jobFormat';
import CareerPicker, { type CareerOption } from '../account/CareerPicker';
import JobSkillTags, { type JobSkillTag } from './JobSkillTags';
import PlantPicker, { plantName, plantWhere } from './PlantPicker';
import {
  ErrorNote,
  Field,
  LoadError,
  busyButtonClass,
  fieldClass,
  outlineButtonClass,
  selectContentClass,
  selectTriggerClass,
  textButtonClass,
  FieldError,
  SegmentedChoice,
} from '../account/parts';
import { arrowKeyChoice } from '../../lib/roving';
import { publicKeys } from '../../lib/queryKeys';
import { useCompanyVersions, versionsApi } from '../../lib/versions';

const PAY_PERIODS: readonly { value: PayPeriod; label: string }[] = [
  { value: 'hour', label: 'Per hour' },
  { value: 'year', label: 'Per year' },
];

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
 *
 * What is typed is kept in this browser as it is typed (lib/jobDraft.ts), so
 * a refresh, Back, a stray click or a session that ended brings it back. The
 * form says when it has done so and offers to start over.
 */
export default function JobForm(props: JobFormProps) {
  const account = useAccount();
  const key = draftKey(
    account.data?.user?.id ?? 'nobody',
    props.mode === 'post' || !props.source ? `post:${props.company.companyId}` : `${props.mode}:${props.source.job.id}`
  );
  // Read once per start: the fields below begin from it. Starting over begins again without it.
  const [start, setStart] = useState(() => ({ count: 0, draft: readDraft(key) }));
  return (
    <JobFormFields
      key={start.count}
      {...props}
      draftStore={key}
      draft={start.draft}
      onStartOver={() => {
        clearDraft(key);
        setStart((current) => ({ count: current.count + 1, draft: null }));
      }}
    />
  );
}

interface JobFormFieldsProps extends JobFormProps {
  /** Where this form's draft is kept. */
  draftStore: string;
  /** What was typed here before, when there is any. */
  draft: JobDraft | null;
  onStartOver: () => void;
}

function JobFormFields({ company, mode, source, onCancel, draftStore, draft, onStartOver }: JobFormFieldsProps) {
  const navigate = useNavigate();
  const createJob = useCreateJob();
  const editJob = useEditJob(source?.job.id ?? '');
  const editing = mode === 'edit' && Boolean(source);
  const from = source?.job;

  const [factoryId, setFactoryId] = useState(() => {
    const wanted = draft?.factoryId ?? from?.factoryId;
    if (wanted !== undefined) return company.factories.some((factory) => factory.id === wanted) ? wanted : '';
    return company.factories.length === 1 ? company.factories[0].id : '';
  });
  const [career, setCareer] = useState<CareerOption | null>(
    draft ? draft.career : from ? { id: from.occupationId, title: from.occupationTitle } : null
  );
  const [skills, setSkills] = useState<JobSkillTag[]>(
    () => draft?.skills ?? source?.skills.map((skill) => ({ id: skill.id, name: skill.name, required: skill.required })) ?? []
  );
  // The career whose skills the tags started from. Null until those have loaded.
  // A job being copied or edited brings its own tags.
  const [seededFor, setSeededFor] = useState<string | null>(draft ? draft.seededFor : (from?.occupationId ?? null));
  const [title, setTitle] = useState(draft?.title ?? from?.title ?? '');
  const [titleEdited, setTitleEdited] = useState(draft?.titleEdited ?? Boolean(from && from.title !== from.occupationTitle));
  const [payMin, setPayMin] = useState(draft?.payMin ?? payInputText(from?.payMin ?? null));
  const [payMax, setPayMax] = useState(draft?.payMax ?? payInputText(from?.payMax ?? null));
  const [payPeriod, setPayPeriod] = useState<PayPeriod>(draft?.payPeriod ?? from?.payPeriod ?? 'hour');
  // The pay the person has said is right, odd as it looks for its period.
  const [payConfirmed, setPayConfirmed] = useState<string | null>(null);
  const [employmentType, setEmploymentType] = useState<EmploymentType>(draft?.employmentType ?? from?.employmentType ?? 'full-time');
  const [shift, setShift] = useState(draft?.shift ?? from?.shift ?? '');
  const [description, setDescription] = useState(draft?.description ?? from?.description ?? '');
  const [applyIn, setApplyIn] = useState<'app' | 'link'>(draft?.applyIn ?? (from?.applyUrl ? 'link' : 'app'));
  const [applyUrl, setApplyUrl] = useState(draft?.applyUrl ?? from?.applyUrl ?? '');
  // Problems show once the person has tried to send the form.
  const [attempted, setAttempted] = useState(false);
  // Set the moment a post is sent, so a double click cannot send it twice
  // (the mutation's own pending flag only changes on the next render).
  const sending = useRef(false);
  // Tags as the person left them, by career: going back to a career brings
  // the edits back, not the defaults.
  const editedTags = useRef(new Map<string, JobSkillTag[]>());

  // Kept as it is typed. A form nobody has touched leaves nothing behind, and
  // one that was posted or saved has nothing left to keep.
  const fields: JobDraftFields = {
    factoryId, career, skills, seededFor, title, titleEdited, payMin, payMax, payPeriod, employmentType, shift, description, applyIn, applyUrl,
  };
  const typed = JSON.stringify(fields);
  const untouched = useRef(typed);
  const finished = useRef(false);
  useEffect(() => {
    if (finished.current) return;
    if (!draft && typed === untouched.current) clearDraft(draftStore);
    else writeDraft(draftStore, JSON.parse(typed) as JobDraftFields);
  }, [typed, draft, draftStore]);

  // Careers already recorded at the chosen factory are the likeliest picks;
  // where none are, the careers typical of its industry.
  const factoryCareers = useQuery({
    queryKey: publicKeys.picker('factory-careers', factoryId),
    queryFn: () => factoriesApi.get(factoryId),
    enabled: Boolean(factoryId) && !editing,
    staleTime: 5 * 60_000,
  });
  const recorded = factoryCareers.data?.occupations ?? [];
  const suggestions: CareerOption[] = (recorded.length > 0 ? recorded : (factoryCareers.data?.typicalCareers ?? []))
    .slice(0, 8)
    .map((o) => ({ id: o.id, title: o.title }));

  // The career's own skills are the default tags: Advanced optional, the rest required. Where the
  // company has its own version of the career, that version's skills are the start instead.
  const careerId = career?.id ?? '';
  const versions = useCompanyVersions(company.companyId, !editing);
  const fromVersion = Boolean(careerId) && (versions.data ?? []).some((version) => version.occupation.id === careerId);
  const careerSkills = useQuery({
    queryKey: publicKeys.picker(fromVersion ? 'version-skills' : 'career-skills', fromVersion ? `${company.companyId}:${careerId}` : careerId),
    queryFn: (): Promise<{ skills: { id: string; name: string; level: number | null }[] }> =>
      fromVersion ? versionsApi.get(company.companyId, careerId) : occupationsApi.get(careerId),
    // Not before the company's versions are known: the tags are set once, from the right list.
    enabled: Boolean(careerId) && (editing || !versions.isPending),
    staleTime: 5 * 60_000,
    // Asked even when the browser says it is offline, so the form says so rather than waiting.
    networkMode: 'always',
  });
  const seeded = Boolean(careerId) && seededFor === careerId;
  if (careerId && careerSkills.data && !seeded) {
    // Set while rendering, so tags the client already has never flash a loader.
    const defaults = careerSkills.data.skills.map((skill) => ({ id: skill.id, name: skill.name, required: skill.level !== 3 }));
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

    const sent = {
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
    // Posted or saved: what was typed is the job now.
    const done = () => {
      finished.current = true;
      clearDraft(draftStore);
    };

    sending.current = true;
    if (editing && from) {
      editJob.mutate(
        { ...sent, skills: tags },
        {
          onSuccess: () => {
            done();
            navigate(`/jobs/${from.id}`);
          },
          onSettled: settled,
        }
      );
    } else {
      createJob.mutate(
        {
          companyId: company.companyId,
          factoryId,
          occupationId: career.id,
          ...sent,
          // Without the career's defaults and with nothing added, the server applies the defaults.
          skills: seeded || skills.length > 0 ? tags : undefined,
        },
        {
          onSuccess: (created) => {
            done();
            navigate(`/jobs/${created.id}`);
          },
          onSettled: settled,
        }
      );
    }
  };

  const otherPeriod: PayPeriod = payPeriod === 'hour' ? 'year' : 'hour';

  return (
    <form onSubmit={submit} noValidate className="space-y-5" data-job-form={mode}>
      {draft && (
        <p role="status" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-text-2" data-draft-restored>
          Restored what you typed {draftWhen(draft.savedAt)}.
          <button type="button" onClick={onStartOver} className={textButtonClass}>
            Start over
          </button>
        </p>
      )}
      {editing && from ? (
        <div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Fixed label="Factory">{[plantName({ name: from.factoryName }), plantWhere({ city: from.city, state: from.state })].filter(Boolean).join(' · ')}</Fixed>
            <Fixed label="Career">{from.occupationTitle}</Fixed>
          </dl>
          <p className="mt-1.5 text-xs text-text-3">Fixed once posted. For another factory or career, post another like this.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Factory" htmlFor="job-factory">
            <PlantPicker
              id="job-factory"
              factories={company.factories}
              value={factoryId}
              onChange={setFactoryId}
              invalid={Boolean(shown('factory'))}
              describedBy={shown('factory') ? 'job-factory-error' : undefined}
            />
            <FieldError id="job-factory-error" message={shown('factory')} />
          </Field>
          <Field label="Career" htmlFor="job-career" hint={shown('career') ? undefined : 'Sets the default skills.'}>
            <CareerPicker
              id="job-career"
              value={career}
              onChange={pickCareer}
              suggestions={suggestions}
              suggestionsLabel={recorded.length > 0 ? 'Careers at this factory' : 'Careers in this industry'}
            />
            <FieldError id="job-career-error" message={shown('career')} />
          </Field>
        </div>
      )}

      {career && (
        <fieldset className="min-w-0" data-job-skills>
          <legend className="mb-1.5 text-sm font-medium text-text-2">Skills</legend>
          {!seeded && careerSkills.isPending ? (
            <p className="flex min-h-[42px] items-center gap-2 text-sm text-text-2">
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
              {skills.length > 0 && (
                <p className="text-xs text-text-3">
                  {/* Said only where it is so: the list began as the company's own version, not the standard. */}
                  {fromVersion && seeded && !draft && career && <span data-skills-from-version>Started from your version of {career.title}. </span>}
                  Applicants are ranked by required skills held.
                </p>
              )}
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
        <legend className="mb-1.5 text-sm font-medium text-text-2">Pay range</legend>
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <DollarInput
            id="job-pay-min"
            label="Lowest"
            value={payMin}
            onChange={setPayMin}
            placeholder={payPeriod === 'hour' ? '24.00' : '52,000'}
            invalid={Boolean(attempted ? (pay.minError ?? pay.rangeError) : pay.rangeError)}
          />
          <DollarInput
            id="job-pay-max"
            label="Highest"
            value={payMax}
            onChange={setPayMax}
            placeholder={payPeriod === 'hour' ? '29.00' : '60,000'}
            invalid={Boolean(attempted ? (pay.maxError ?? pay.rangeError) : pay.rangeError)}
          />
          <SegmentedChoice
            label="Pay is per"
            options={PAY_PERIODS}
            value={payPeriod}
            onChange={setPayPeriod}
            className="grid-cols-2 xs:col-span-2 sm:col-span-1 sm:w-48"
          />
        </div>
        <FieldError id="job-pay-error" message={payProblem ?? undefined} />
        {!payProblem && !payQuestion && <p className="mt-1.5 text-xs text-text-3">Every job shows its pay.</p>}
        {!payProblem && payQuestion && (
          <div
            role="group"
            aria-labelledby="job-pay-question"
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"
            data-pay-question
          >
            <p id="job-pay-question" role={attempted ? 'alert' : 'status'} className="min-w-0 flex-1 basis-48 text-sm text-text-1">
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
            className={cn('mt-1.5 text-xs tabular-nums', descriptionOver > 0 ? 'text-danger' : 'text-text-2')}
          >
            {descriptionLength.toLocaleString('en-US')} of {DESCRIPTION_MAX.toLocaleString('en-US')} characters.
            {descriptionOver > 0 && ` Shorten it by ${descriptionOver.toLocaleString('en-US')}.`}
          </p>
        )}
      </Field>

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium text-text-2">Applications</legend>
        <div
          role="radiogroup"
          aria-label="Applications"
          onKeyDown={arrowKeyChoice(['app', 'link'] as const, applyIn, setApplyIn)}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          <ApplyChoice
            selected={applyIn === 'app'}
            onSelect={() => setApplyIn('app')}
            title="In the app"
            detail="Applicants are listed on the job page, ranked by skills held."
          />
          <ApplyChoice
            selected={applyIn === 'link'}
            onSelect={() => setApplyIn('link')}
            title="Company website"
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
/** A value that cannot be changed here, set out like the fields around it. */
function Fixed({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1.5 text-sm font-medium text-text-2">{label}</dt>
      <dd className="break-words text-sm text-text-1">{children}</dd>
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
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-2" aria-hidden="true">
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
      <span className="mt-1 block text-xs text-text-3">{label}</span>
    </div>
  );
}

function ApplyChoice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 p-3',
        optionTileClass(selected)
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-text-1' : 'border-text-3'
        )}
        aria-hidden="true"
      >
        {selected && <span className="h-2 w-2 rounded-full bg-text-1" />}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium', optionTitleClass(selected))}>{title}</span>
        <span className={cn('mt-0.5 block text-xs', optionDetailClass(selected))}>{detail}</span>
      </span>
    </button>
  );
}
