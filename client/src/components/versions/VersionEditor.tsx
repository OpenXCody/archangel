import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, plural } from '@/lib/utils';
import { versionPath } from '@shared/versions';
import type { Skill } from '../../lib/api';
import { isNoVersion, useDeleteVersion, useSaveVersion, useVersion, type Version } from '../../lib/versions';
import { addSkill, changesOf, draftFromVersion, isOn, mergeSaved, sameChanges, toggleMake, toggleSkill, type DraftSkill, type VersionDraft } from '../../lib/versionDraft';
import { ErrorNote, LoadError, PageLoading, busyButtonClass, outlineButtonClass, textButtonClass } from '../account/parts';
import { SkillAdder } from '../jobs/JobSkillTags';
import ConfirmDialog from '../layout/ConfirmDialog';
import { EmptyState, PageContainer, PageHeader } from '../layout/Page';
import { PathFlow } from '../path/PathFlow';
import { SkillGroupBox } from '../path/SkillGroupBox';
import { buildPath, type PathSkillItem } from '../path/model';

/**
 * The editor of a company's version of a career, for the company's own
 * people: the path itself, not a form. Every skill of the standard is a tag
 * to tap (left out, or put back); a search adds a skill; under a skill that
 * has makes, its makes are chips to tap. Each tap is saved as it is made, so
 * there is nothing to send at the end and nothing to lose by leaving.
 */
export default function VersionEditor({ companyId, occupationId }: { companyId: string; occupationId: string }) {
  const version = useVersion(companyId, occupationId);
  // The editor starts from the version as it was when the page opened. A
  // refetch while the person is tapping must not start it again.
  const [source, setSource] = useState<Version | null>(null);
  useEffect(() => {
    if (version.data) setSource((current) => current ?? version.data);
  }, [version.data]);

  if (version.isError && !source) {
    return (
      <PageContainer size="narrow">
        {isNoVersion(version.error) ? (
          <EmptyState
            icon={SearchX}
            title="No version of this career here"
            description="It may have been deleted. Add the career again from Your jobs."
            action={
              <Button asChild className="h-10 rounded-lg">
                <Link to="/employer">Your jobs</Link>
              </Button>
            }
          />
        ) : (
          <LoadError error={version.error} onRetry={() => void version.refetch()} retrying={version.isFetching} />
        )}
      </PageContainer>
    );
  }
  if (!source) return <PageLoading label="Loading career" />;
  return <Editor key={source.updatedAt} companyId={companyId} occupationId={occupationId} source={source} onReload={() => void version.refetch().then((next) => next.data && setSource(next.data))} />;
}

function Editor({ companyId, occupationId, source, onReload }: { companyId: string; occupationId: string; source: Version; onReload: () => void }) {
  const navigate = useNavigate();
  const save = useSaveVersion(companyId, occupationId);
  const remove = useDeleteVersion(companyId);
  const [draft, setDraft] = useState<VersionDraft>(() => draftFromVersion(source));
  const [deleting, setDeleting] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // One save at a time, always of the draft as it stands: taps made while a
  // save is on its way are sent when it comes back, as one more save.
  const latest = useRef(draft);
  const sent = useRef(changesOf(draft));
  const busy = useRef(false);
  const { mutate } = save;
  const push = useCallback(() => {
    if (busy.current) return;
    const changes = changesOf(latest.current);
    if (sameChanges(changes, sent.current)) return;
    busy.current = true;
    mutate(changes, {
      onSuccess: (saved) => {
        sent.current = changes;
        latest.current = mergeSaved(latest.current, saved);
        setDraft(latest.current);
      },
      onSettled: (_saved, error) => {
        busy.current = false;
        // After a refusal the draft waits for the person; otherwise whatever was tapped meanwhile goes now.
        if (!error) push();
      },
    });
  }, [mutate]);

  const change = (next: VersionDraft, said: string) => {
    latest.current = next;
    setDraft(next);
    setAnnouncement(said);
    push();
  };

  const tapSkill = (skill: DraftSkill) => {
    const on = isOn(draft, skill);
    change(toggleSkill(latest.current, skill.id), `${skill.name} ${on ? (skill.standard ? 'left out' : 'taken off') : skill.standard ? 'put back' : 'added'}.`);
  };
  const tapMake = (skill: DraftSkill, make: { id: string; name: string }) => {
    const runs = draft.runs.includes(make.id);
    change(toggleMake(latest.current, make.id), `${make.name} ${runs ? 'not run' : 'run'} for ${skill.name}.`);
  };
  const add = (skill: Skill) => change(addSkill(latest.current, skill), `${skill.name} added.`);

  const byId = useMemo(() => new Map(draft.skills.map((skill) => [skill.id, skill])), [draft.skills]);
  const path = useMemo(() => buildPath(draft.skills), [draft.skills]);
  const on = draft.skills.filter((skill) => isOn(draft, skill));
  const addedCount = on.filter((skill) => !skill.standard).length;
  const outCount = draft.skills.filter((skill) => skill.standard && !isOn(draft, skill)).length;
  const pageOf = versionPath(occupationId, source.company);

  const renderSkill = (item: PathSkillItem) => {
    const skill = byId.get(item.id);
    if (!skill) return null;
    return <EditTag key={skill.id} skill={skill} on={isOn(draft, skill)} runs={draft.runs} onTap={() => tapSkill(skill)} onMake={(make) => tapMake(skill, make)} />;
  };

  return (
    <PageContainer size="narrow">
      <PageHeader
        backTo={{ to: '/employer', label: 'Your jobs' }}
        eyebrow="Career"
        title={source.title}
        description="Tap a skill to leave it out or put it back. Under a skill, tap the makes you run. Each change is saved as you make it."
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" data-version-status>
        <p className="min-w-0 flex-1 basis-56 text-sm text-text-2">
          <span className="tabular-nums text-text-1">{plural(on.length, 'skill', 'skills')}</span>
          {addedCount > 0 && ` · ${addedCount} added`}
          {outCount > 0 && ` · ${outCount} left out`}
          <span className="ml-3 text-text-3" role="status" data-version-saved>
            {save.isPending ? 'Saving' : save.isError ? '' : 'Saved'}
          </span>
        </p>
        <Link to={pageOf} className={textButtonClass} data-version-page>
          See the page
        </Link>
      </div>

      <div className="mb-5">
        <SkillAdder id="version-skill-add" taken={on} onAdd={add} />
      </div>

      {draft.skills.length === 0 ? (
        <p className="text-sm text-text-2">The standard path has no skills yet. Add the ones this career needs here.</p>
      ) : (
        <div data-version-editor>
          <PathFlow path={path} renderSkill={renderSkill} />
          {path.unplaced.length > 0 && <SkillGroupBox name="Not yet placed" skills={path.unplaced} renderSkill={renderSkill} className="mt-4" />}
        </div>
      )}

      {/* A save that was refused stays in view until it is put right. */}
      {save.isError && (
        <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong bg-surface p-3" data-version-error>
          <ErrorNote error={save.error} className="min-w-0 flex-1 basis-56" />
          <button
            type="button"
            className={textButtonClass}
            onClick={() => {
              save.reset();
              push();
            }}
          >
            Try again
          </button>
          <button
            type="button"
            className={textButtonClass}
            onClick={() => {
              save.reset();
              onReload();
            }}
          >
            Reload
          </button>
        </div>
      )}

      <div className="mt-10 border-t border-line pt-5">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            remove.reset();
            setDeleting(true);
          }}
          className={cn('h-10 rounded-lg', outlineButtonClass, busyButtonClass)}
          data-version-delete
        >
          Delete this version
        </Button>
      </div>

      <ConfirmDialog
        open={deleting}
        title="Delete this version?"
        description={
          <p>
            {source.title} is removed for good, with what it adds, leaves out and runs. The standard {source.occupation.title} stays as it is.
          </p>
        }
        confirmLabel="Delete version"
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate(occupationId, { onSuccess: () => navigate('/employer') })}
        onCancel={() => setDeleting(false)}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </PageContainer>
  );
}

/** The box of a tag that is a switch: filled with a tick when the skill is on the path, empty when it is not. */
function Box({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={cn('h-5 w-5 shrink-0', on ? 'text-text-1' : 'text-text-3')}>
      {on ? (
        <>
          <rect x="2" y="2" width="16" height="16" rx="4" fill="currentColor" />
          <path d="M6.2 10.3l2.5 2.5 5-5.3" stroke="var(--bg)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="3.25" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}

const chipClass =
  'inline-flex min-h-9 max-w-full items-center rounded-full border px-3 text-sm leading-tight transition-colors [overflow-wrap:anywhere] [@media(pointer:coarse)]:min-h-11';

interface EditTagProps {
  skill: DraftSkill;
  on: boolean;
  runs: string[];
  onTap: () => void;
  onMake: (make: { id: string; name: string }) => void;
}

/**
 * One skill in the editor: the whole tag is a switch, a full finger tall.
 * On, it is lit and its makes stand under it as chips; off, it is quiet, a
 * standard skill struck through and said to be left out.
 */
function EditTag({ skill, on, runs, onTap, onMake }: EditTagProps) {
  const second = skill.standard ? (on ? null : 'Left out') : on ? 'Added' : 'Not added';
  return (
    <li data-edit-skill={skill.id} data-on={on} data-status={on ? undefined : 'none'} className="skill-tag flex-col">
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={onTap}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm leading-snug focus-visible:[outline-offset:-2px]"
      >
        <Box on={on} />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <span className={cn('block', !on && skill.standard && 'line-through decoration-text-3')}>{skill.name}</span>
          {second && <span className="block text-xs font-normal text-text-3">{second}</span>}
        </span>
      </button>
      {on && skill.makes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pb-2.5 pl-[42px] pr-3" aria-label={`Makes run for ${skill.name}`} data-edit-makes>
          {skill.makes.map((make) => {
            const pressed = runs.includes(make.id);
            return (
              <li key={make.id} className="max-w-full">
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onMake(make)}
                  data-make={make.id}
                  className={cn(
                    chipClass,
                    pressed ? 'border-line-strong bg-surface font-medium text-text-1' : 'border-line text-text-2 hover:border-line-strong hover:text-text-1'
                  )}
                >
                  {make.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
