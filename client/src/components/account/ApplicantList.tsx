import { useId, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { EMPLOYER_STATUSES, useUpdateApplication, useUpdateJob, type ApplicationStatus } from '../../lib/account';
import { applicantsCsv, saveTextFile, type ApplicantSkill, type JobApplicants, type RankedApplicant } from '../../lib/employerJobs';
import { applicationStatusLabel } from '../../lib/jobFormat';
import { busyButtonClass } from './JobForm';
import { ErrorNote, Field, cardClass, fieldClass, formatDayCapital, outlineButtonClass, rowClass, textButtonClass } from './parts';
import { SkillMark } from './SkillStatusButton';

type StageFilter = 'all' | ApplicationStatus;

const STAGE_ORDER: ApplicationStatus[] = ['applied', 'reviewing', 'interview', 'offer', 'hired', 'declined', 'withdrawn'];
/** Stages a Hired or Declined application can be taken back to. */
const WORKING_STATUSES: ApplicationStatus[] = ['applied', 'reviewing', 'interview', 'offer'];

/** Hired and Declined are the company's decisions: confirmed going in, and reversible. */
function isDecision(status: ApplicationStatus): boolean {
  return status === 'hired' || status === 'declined';
}

/** Name, required skills, stage, applied, and the arrow. Phones stack these in two lines. */
const COLUMNS = 'sm:grid-cols-[minmax(0,1fr)_8rem_6.5rem_7rem_1rem]';

/** "Today", "Yesterday", "Nov 2". */
const appliedWhen = formatDayCapital;

/** The job the applicants are for: named in the email to an applicant and in the exported file. */
export interface ApplicantsJob {
  /** With `isOpen`: lets a hire offer to close the job. */
  id?: string;
  isOpen?: boolean;
  title: string;
  serial: number;
  companyName: string;
}

/** Above this many applicants a search by name is offered. */
const SEARCH_FROM = 8;

/**
 * A job's applicants as a compact list, in the server's ranking: one row
 * each, filtered by stage and, once the list is long, searched by name. A row
 * opens to the applicant's skills against the job's, their note and contact,
 * the company's private note and the stage. The list as shown can be saved as
 * a CSV file.
 */
export default function ApplicantList({ data, job }: { data: JobApplicants; job?: ApplicantsJob }) {
  const [filter, setFilter] = useState<StageFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [term, setTerm] = useState('');

  const counts = new Map<ApplicationStatus, number>();
  for (const application of data.applications) counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  const stages = STAGE_ORDER.filter((status) => counts.has(status));
  // A stage that has emptied since it was chosen shows everyone again.
  const active: StageFilter = filter !== 'all' && counts.has(filter) ? filter : 'all';
  const searchable = data.applications.length > SEARCH_FROM;
  const words = searchable ? term.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const named = (a: RankedApplicant) => {
    const text = `${a.applicant.name} ${a.applicant.email}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };
  const matching = data.applications.filter((a) => (active === 'all' || a.status === active) && named(a));
  // The open row stays while its stage is changed, whatever the filter.
  const visible = data.applications.filter((a) => matching.includes(a) || a.id === openId);
  const hasRequired = data.skills.some((skill) => skill.required);

  const exportCsv = () => {
    const day = new Date().toISOString().slice(0, 10);
    saveTextFile(`applicants-${job ? `job-${job.serial}-` : ''}${day}.csv`, applicantsCsv(data, matching));
  };

  return (
    <div data-applicant-list>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {stages.length > 1 && (
          <div role="group" aria-label="Show applicants by stage" className="flex min-w-0 flex-1 basis-64 flex-wrap gap-1">
            <StageTab label="All" count={data.applications.length} selected={active === 'all'} onSelect={() => setFilter('all')} />
            {stages.map((status) => (
              <StageTab
                key={status}
                label={applicationStatusLabel(status)}
                count={counts.get(status) ?? 0}
                selected={active === status}
                onSelect={() => setFilter(status)}
              />
            ))}
          </div>
        )}
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', stages.length <= 1 && 'flex-1 justify-between')}>
          {searchable && (
            <div className="relative w-full xs:w-44">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
              <input
                type="text"
                role="searchbox"
                enterKeyHint="search"
                aria-label="Search applicants by name"
                placeholder="Name"
                autoComplete="off"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && term) {
                    e.stopPropagation();
                    setTerm('');
                  }
                }}
                className={cn(fieldClass, 'min-h-[36px] bg-bg-surface py-1.5 pl-9')}
              />
            </div>
          )}
          <button type="button" onClick={exportCsv} className={cn(textButtonClass, 'ml-auto whitespace-nowrap')} data-export-applicants>
            Export CSV
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <div
          className={cn('hidden items-center gap-x-4 border-b border-border-subtle px-4 py-2 text-xs text-fg-muted sm:grid', COLUMNS)}
          aria-hidden="true"
        >
          <span>Applicant</span>
          <span>Required skills</span>
          <span>Stage</span>
          <span>Applied</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-muted" role="status" data-applicants-none>
            No applicant{active === 'all' ? '' : ` at ${applicationStatusLabel(active).toLowerCase()}`} matches “{term.trim()}”.
          </p>
        ) : (
          <ol>
            {visible.map((applicant) => (
              <ApplicantRow
                key={applicant.id}
                applicant={applicant}
                skills={data.skills}
                hasRequired={hasRequired}
                job={job}
                open={openId === applicant.id}
                onToggle={() => setOpenId((current) => (current === applicant.id ? null : applicant.id))}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function StageTab({ label, count, selected, onSelect }: { label: string; count: number; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors sm:px-3',
        selected ? 'bg-bg-elevated font-medium text-fg-default' : 'text-fg-muted hover:text-fg-default'
      )}
    >
      {label}
      <span className={cn('tabular-nums', selected ? 'text-fg-muted' : 'text-fg-soft')}>{count}</span>
    </button>
  );
}

interface ApplicantRowProps {
  applicant: RankedApplicant;
  skills: ApplicantSkill[];
  hasRequired: boolean;
  job?: ApplicantsJob;
  open: boolean;
  onToggle: () => void;
}

function ApplicantRow({ applicant, skills, hasRequired, job, open, onToggle }: ApplicantRowProps) {
  const panelId = useId();
  const { status } = applicant;
  const quiet = status === 'declined' || status === 'withdrawn';
  const percent = applicant.totalRequired > 0 ? Math.round((applicant.heldRequired / applicant.totalRequired) * 100) : 0;
  const held = hasRequired ? `${applicant.heldRequired} of ${applicant.totalRequired}` : null;

  return (
    <li className={rowClass} data-applicant={applicant.applicant.email} data-stage={status}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-left transition-colors hover:bg-bg-elevated',
          COLUMNS,
          open && 'bg-bg-elevated'
        )}
      >
        <span className={cn('min-w-0 truncate text-sm font-medium', quiet ? 'text-fg-muted' : 'text-fg-default')}>
          {applicant.applicant.name}
        </span>
        <span className="hidden items-center gap-2.5 sm:flex">
          {held ? (
            <>
              <span className={cn('w-16 shrink-0 whitespace-nowrap text-sm tabular-nums', quiet ? 'text-fg-muted' : 'text-fg-default')}>{held}</span>
              <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-tint/10" aria-hidden="true">
                <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${percent}%` }} />
              </span>
            </>
          ) : (
            <span className="text-sm text-fg-soft">None listed</span>
          )}
        </span>
        {/* Open, the stage is the control just below: the word here steps aside and keeps its place. */}
        <span
          className={cn(
            'justify-self-end text-sm sm:justify-self-start',
            status === 'applied' ? 'font-medium text-fg-default' : quiet ? 'text-fg-soft' : 'text-fg-muted',
            open && 'invisible'
          )}
        >
          {applicationStatusLabel(status)}
        </span>
        <span className="hidden text-sm text-fg-muted sm:block">{appliedWhen(applicant.createdAt)}</span>
        <ChevronDown className={cn('hidden h-4 w-4 text-fg-muted transition-transform sm:block', open && 'rotate-180')} aria-hidden="true" />
        <span className="col-span-2 text-xs text-fg-muted sm:hidden">
          {held ? `${held} required skills · ` : ''}
          {appliedWhen(applicant.createdAt)}
        </span>
      </button>
      {open && <ApplicantPanel id={panelId} applicant={applicant} skills={skills} job={job} />}
    </li>
  );
}

interface ApplicantPanelProps {
  id: string;
  applicant: RankedApplicant;
  skills: ApplicantSkill[];
  job?: ApplicantsJob;
}

function ApplicantPanel({ id, applicant, skills, job }: ApplicantPanelProps) {
  const move = useUpdateApplication();
  const saveNote = useUpdateApplication();
  const closeJob = useUpdateJob(job?.id ?? '');
  const stageRef = useRef<HTMLButtonElement>(null);
  const savedNote = applicant.employerNote ?? '';
  const [note, setNote] = useState(savedNote);
  // A decision waiting for its second step.
  const [pending, setPending] = useState<ApplicationStatus | null>(null);
  // The stage a decision made here replaced, so it can be put back in one step.
  const [before, setBefore] = useState<ApplicationStatus | null>(null);
  const { status } = applicant;
  const person = applicant.applicant;
  const noteDirty = note !== savedNote;
  const noteId = `employer-note-${applicant.id}`;
  // While a change is on its way the control shows where it is going.
  const moving = move.isPending ? move.variables?.patch.status : undefined;

  // Focus returns to the stage control when a step that replaced it is done.
  const focusStage = () => window.setTimeout(() => stageRef.current?.focus(), 0);

  const moveTo = (next: ApplicationStatus) => {
    if (move.isPending) return;
    const from = status;
    move.mutate(
      { applicationId: applicant.id, patch: { status: next } },
      {
        onSuccess: () => setBefore(isDecision(next) && !isDecision(from) ? from : null),
        onSettled: () => {
          setPending(null);
          focusStage();
        },
      }
    );
  };

  const chooseStage = (value: string) => {
    const next = value as ApplicationStatus;
    if (next === status || move.isPending) return;
    move.reset();
    // The applicant sees a decision at once, so it takes a second step.
    if (isDecision(next)) setPending(next);
    else {
      setPending(null);
      moveTo(next);
    }
  };

  // A decision goes back to a working stage before it can become the other one.
  const options = isDecision(status) ? [...WORKING_STATUSES, status] : EMPLOYER_STATUSES;
  const heldIds = new Set(applicant.heldSkillIds);
  const learningIds = new Set(applicant.learningSkillIds);
  const required = skills.filter((skill) => skill.required);
  const optional = skills.filter((skill) => !skill.required);

  return (
    <div id={id} className="space-y-4 border-t border-border-subtle px-4 pb-4 pt-3.5" data-applicant-panel>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          {/* The email opens with the job as its subject, so the applicant knows what it is about. */}
          <a
            href={`mailto:${person.email}${job ? `?subject=${encodeURIComponent(`${job.title} at ${job.companyName}`)}` : ''}`}
            className="break-all text-sm text-fg-default underline underline-offset-4 hover:no-underline"
          >
            {person.email}
          </a>
          {/* When they applied is in the row above, once. */}
          {person.homeZip && <p className="mt-0.5 text-xs text-fg-muted">ZIP {person.homeZip}</p>}
        </div>
        <div className="w-full shrink-0 sm:w-44">
          {status === 'withdrawn' ? (
            <p className="text-sm text-fg-muted sm:text-right">Withdrawn by the applicant.</p>
          ) : (
            // Never disabled while it saves: a disabled control drops focus.
            <Select value={moving ?? status} onValueChange={chooseStage}>
              <SelectTrigger
                ref={stageRef}
                aria-label={`Stage for ${person.name}`}
                aria-busy={move.isPending}
                className="h-[42px] rounded-lg border-border-strong bg-bg-surface px-3 text-sm text-fg-default shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border-strong bg-bg-surface">
                {options.map((option) => (
                  <SelectItem key={option} value={option} className="py-2.5">
                    {applicationStatusLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border-strong p-3" role="group" aria-label="Confirm stage">
          <p className="min-w-0 flex-1 basis-48 text-sm text-fg-default">
            Mark {person.name} as {applicationStatusLabel(pending).toLowerCase()}? They see it at once.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              aria-disabled={move.isPending}
              aria-busy={move.isPending}
              onClick={() => moveTo(pending)}
              className={cn('h-9', busyButtonClass)}
            >
              {move.isPending && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (move.isPending) return;
                setPending(null);
                focusStage();
              }}
              className={cn('h-9', outlineButtonClass)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!pending && before && isDecision(status) && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          Marked {applicationStatusLabel(status).toLowerCase()}.
          <button type="button" onClick={() => moveTo(before)} className={textButtonClass}>
            Undo
          </button>
        </p>
      )}
      {/* Someone was hired and the job still takes applications: closing it is one press, not a hunt for the control. */}
      {!pending && status === 'hired' && job?.id && job.isOpen && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted" data-close-after-hire>
          The job is still open.
          <button
            type="button"
            aria-busy={closeJob.isPending}
            onClick={() => {
              if (!closeJob.isPending) closeJob.mutate({ status: 'closed', closedReason: 'Position filled' });
            }}
            className={textButtonClass}
          >
            Close it as filled
          </button>
        </p>
      )}
      <ErrorNote error={move.error ?? closeJob.error} />

      {skills.length === 0 ? (
        <p className="text-sm text-fg-muted">This job lists no skills.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {required.length > 0 && <SkillStanding title="Required skills" skills={required} held={heldIds} learning={learningIds} />}
          {optional.length > 0 && <SkillStanding title="Optional skills" skills={optional} held={heldIds} learning={learningIds} />}
        </div>
      )}

      {applicant.note && (
        <div>
          <p className="text-xs font-medium text-fg-muted">Note from {person.name}</p>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-fg-default">{applicant.note}</p>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!noteDirty || saveNote.isPending) return;
          // The server stores the note trimmed; match it so the form reads as saved.
          saveNote.mutate({ applicationId: applicant.id, patch: { employerNote: note } }, { onSuccess: () => setNote((text) => text.trim()) });
        }}
      >
        <Field label="Private note" htmlFor={noteId} hint="Seen by your company only.">
          <textarea
            id={noteId}
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(fieldClass, 'resize-y bg-bg-surface')}
          />
        </Field>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {/* Marked, not disabled, once saved: the button keeps focus. */}
          <Button
            type="submit"
            variant="outline"
            size="sm"
            aria-disabled={!noteDirty || saveNote.isPending}
            aria-busy={saveNote.isPending}
            className={cn('h-9', outlineButtonClass, busyButtonClass)}
          >
            {saveNote.isPending && <Loader2 className="animate-spin" />}
            Save note
          </Button>
          {saveNote.isSuccess && !noteDirty && (
            <span role="status" className="text-xs text-fg-muted">
              Saved
            </span>
          )}
        </div>
        <ErrorNote error={saveNote.error} className="mt-2" />
      </form>
    </div>
  );
}

interface SkillStandingProps {
  title: string;
  skills: ApplicantSkill[];
  held: Set<string>;
  learning: Set<string>;
}

/**
 * One group of the job's skills, split by where the applicant stands on each.
 * The same marks and brightness a seeker sees on their own skills.
 */
function SkillStanding({ title, skills, held, learning }: SkillStandingProps) {
  const groups: { label: string; mark: 'held' | 'learning' | 'none'; tone: string; skills: ApplicantSkill[] }[] = [
    { label: 'Held', mark: 'held', tone: 'text-fg-default', skills: skills.filter((skill) => held.has(skill.id)) },
    { label: 'Learning', mark: 'learning', tone: 'text-fg-muted', skills: skills.filter((skill) => !held.has(skill.id) && learning.has(skill.id)) },
    { label: 'Missing', mark: 'none', tone: 'text-fg-soft', skills: skills.filter((skill) => !held.has(skill.id) && !learning.has(skill.id)) },
  ];
  return (
    <div className="min-w-0" data-skill-standing={title.split(' ')[0].toLowerCase()}>
      <p className="text-xs font-medium text-fg-muted">{title}</p>
      <dl className="mt-1.5 space-y-2">
        {groups.map(
          ({ label, mark, tone, skills: group }) =>
            group.length > 0 && (
              <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3" data-standing={label.toLowerCase()}>
                <dt className="flex items-start gap-1.5 text-sm text-fg-muted">
                  <SkillMark status={mark} className="mt-0.5 h-4 w-4" />
                  <span>
                    {label} <span className="tabular-nums">{group.length}</span>
                  </span>
                </dt>
                <dd className={cn('break-words text-sm', tone)}>{group.map((skill) => skill.name).join(', ')}</dd>
              </div>
            )
        )}
      </dl>
    </div>
  );
}
