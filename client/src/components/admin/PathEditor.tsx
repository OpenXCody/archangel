import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminPaths } from '../../lib/admin';
import { editPath, useSavePath, type FoundRecord, type PathSkill, type RecordView } from '../../lib/records';
import { ErrorNote, busyButtonClass, cardClass, outlineButtonClass, textButtonClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';
import { RecordPicker } from './CompanyPicker';

const STAGES: { stage: number | null; label: string }[] = [
  { stage: 1, label: 'Introduction' },
  { stage: 2, label: 'Fundamentals' },
  { stage: 3, label: 'Advanced' },
  { stage: null, label: 'No stage' },
];

const stageSelectClass =
  'h-9 min-w-0 rounded-md border border-solid border-border-strong bg-bg-elevated px-2 text-sm text-fg-default focus:border-[color:var(--color-fg-muted)] focus:outline-none';

/** The quiet control on each row that moves a skill to another stage. */
const moveSelectClass =
  'h-9 w-[4.75rem] shrink-0 rounded-md border border-solid border-border-subtle bg-transparent px-1.5 text-sm text-fg-muted ' +
  'hover:text-fg-default focus:border-[color:var(--color-fg-muted)] focus:outline-none';

function stageOf(value: string): number | null {
  return value === '' || value === 'none' ? null : Number(value);
}

function samePath(a: PathSkill[], b: PathSkill[]): boolean {
  const key = (list: PathSkill[]) =>
    list
      .map((skill) => `${skill.id}:${skill.stage ?? ''}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

/**
 * A career's path, where it is reviewed: its skills in their stages, each
 * movable to another stage or removable, a skill added by name, then Save
 * and Approve. Approving says so with an Undo, and offers the next draft.
 */
export default function PathEditor({ record, onChanged }: { record: RecordView; onChanged: () => Promise<unknown> }) {
  const notice = useAdminNotice();
  const save = useSavePath(record.id);
  const drafts = useAdminPaths('draft');
  const saved = record.path ?? [];
  const status = typeof record.fields.pathStatus === 'string' ? record.fields.pathStatus : null;
  const [skills, setSkills] = useState<PathSkill[]>(saved);
  const [adding, setAdding] = useState<FoundRecord | null>(null);
  const [addStage, setAddStage] = useState<number | null>(1);
  const dirty = !samePath(skills, saved);

  // The draft after this one by title, or the first of the others.
  const others = (drafts.data ?? []).filter((path) => path.id !== record.id);
  const next = others.find((path) => path.title.localeCompare(record.name) > 0) ?? others[0];

  const send = (nextStatus: 'draft' | 'approved' | undefined, said: string, undo?: () => void) => {
    if (save.isPending) return;
    save.mutate(
      {
        skills: skills.map((skill) => ({ skillId: skill.id, stage: skill.stage })),
        replace: true,
        // A path written here for a career that had none starts as a draft.
        status: nextStatus ?? (status === null && skills.length > 0 ? 'draft' : undefined),
      },
      {
        onSuccess: async () => {
          await onChanged();
          notice.say(said, { undo });
        },
      }
    );
  };
  const backToDraft = (said: string) => {
    save.mutate({ skills: [], status: 'draft' }, { onSuccess: async () => { await onChanged(); notice.say(said); } });
  };

  const add = () => {
    if (!adding) return;
    if (!skills.some((skill) => skill.id === adding.id)) {
      setSkills([...skills, { id: adding.id, name: adding.name, category: adding.detail, stage: addStage }]);
    }
    setAdding(null);
    window.setTimeout(() => document.getElementById('path-add')?.focus(), 0);
  };

  const groups = STAGES.map((group) => ({
    ...group,
    items: skills.filter((skill) => (skill.stage ?? null) === group.stage).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.stage !== null || group.items.length > 0);

  const total = skills.length;
  const statusWord = status === 'approved' ? 'Approved' : status === 'draft' ? 'Draft, not yet reviewed' : 'No path yet';

  return (
    <PageSection
      title="Path"
      description={`${statusWord}. ${total.toLocaleString('en-US')} ${total === 1 ? 'skill' : 'skills'}.`}
      className="scroll-mt-20"
    >
      <div id="path" className={cn(cardClass, 'p-4 sm:p-5')} data-path-editor data-path-status={status ?? 'none'}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.label} className={cn('min-w-0', group.stage === null && 'lg:col-span-3')} data-path-stage={group.stage ?? 'none'}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">
                {group.label} <span className="tabular-nums">{group.items.length}</span>
              </p>
              {group.items.length === 0 ? (
                <p className="mt-2 text-sm text-fg-muted">None yet.</p>
              ) : (
                <ul className="mt-1">
                  {group.items.map((skill) => (
                    <li key={skill.id} className="flex items-center gap-2 border-t border-border-subtle py-1.5 first:border-t-0" data-path-skill={skill.id}>
                      <span className="min-w-0 flex-1 break-words text-sm text-fg-default">{skill.name}</span>
                      {/* Reads "Move": choosing a stage moves the skill there at once. */}
                      <select
                        aria-label={`Move ${skill.name} to another stage`}
                        value=""
                        onChange={(event) =>
                          setSkills(skills.map((item) => (item.id === skill.id ? { ...item, stage: stageOf(event.target.value) } : item)))
                        }
                        className={moveSelectClass}
                      >
                        <option value="" disabled hidden>
                          Move
                        </option>
                        {STAGES.filter((option) => option.stage !== (skill.stage ?? null)).map((option) => (
                          <option key={option.label} value={option.stage ?? 'none'}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setSkills(skills.filter((item) => item.id !== skill.id))}
                        aria-label={`Remove ${skill.name} from the path`}
                        className={cn(textButtonClass, 'flex min-h-9 shrink-0 items-center')}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-border-subtle pt-4">
          <label htmlFor="path-add" className="mb-1.5 block text-sm font-medium text-fg-muted">
            Add a skill
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,24rem)_10rem_auto]">
            <RecordPicker id="path-add" kind="skill" value={adding} onChange={setAdding} />
            <select
              aria-label="Stage for the skill being added"
              value={addStage ?? 'none'}
              onChange={(event) => setAddStage(stageOf(event.target.value))}
              className={cn(stageSelectClass, 'h-[42px]')}
            >
              {STAGES.map((option) => (
                <option key={option.label} value={option.stage ?? 'none'}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" aria-disabled={!adding} onClick={add} className={cn('h-[42px] justify-self-start', outlineButtonClass, busyButtonClass)}>
              Add
            </Button>
          </div>
          {adding && skills.some((skill) => skill.id === adding.id) && <p className="mt-1.5 text-xs text-fg-muted">Already on the path.</p>}
        </div>

        <ErrorNote error={save.error} className="mt-4" />
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="outline"
            aria-disabled={!dirty || save.isPending}
            aria-busy={save.isPending}
            onClick={() => {
              if (dirty) send(undefined, `Saved the path for ${record.name}.`);
            }}
            className={cn('h-10', outlineButtonClass, busyButtonClass)}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            Save path
          </Button>
          {status === 'approved' ? (
            <Button
              type="button"
              variant="outline"
              aria-disabled={save.isPending}
              onClick={() => {
                if (!save.isPending) backToDraft(`Returned the path for ${record.name} to draft.`);
              }}
              className={cn('h-10', outlineButtonClass, busyButtonClass)}
            >
              Return to draft
            </Button>
          ) : (
            <Button
              type="button"
              aria-disabled={total === 0 || save.isPending}
              onClick={() => {
                if (total > 0)
                  send('approved', `Approved the path for ${record.name}.`, () => backToDraft(`Returned the path for ${record.name} to draft.`));
              }}
              className={cn('h-10', busyButtonClass)}
              data-approve-path
            >
              {dirty ? 'Save and approve' : 'Approve'}
            </Button>
          )}
          {next && (
            <Link to={`${editPath('career', next.id)}#path`} className={cn(textButtonClass, 'ml-auto flex min-h-10 items-center')} data-next-draft>
              Next draft: {next.title}
            </Link>
          )}
        </div>
      </div>
    </PageSection>
  );
}
