import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminPaths } from '../../lib/admin';
import { editPath, useSavePath, type FoundRecord, type PathSkill, type RecordView } from '../../lib/records';
import { ErrorNote, busyButtonClass, cardClass, outlineButtonClass, textButtonClass } from '../account/parts';
import Panel from './Panel';
import { useAdminNotice } from './AdminNotice';
import RecordPicker from './RecordPicker';
import { LEVELS } from '../../lib/stages';

/** The columns of a path: the three levels, then skills that have none (a database no taxonomy was loaded into). */
const COLUMNS: { level: number | null; label: string }[] = [...LEVELS.map(({ id, name }) => ({ level: id, label: name })), { level: null, label: 'Not yet placed' }];

function samePath(a: PathSkill[], b: PathSkill[]): boolean {
  const key = (list: PathSkill[]) =>
    list
      .map((skill) => skill.id)
      .sort()
      .join('|');
  return key(a) === key(b);
}

/**
 * A career's path, where it is reviewed: its skills, each under its own
 * level, removable; a skill added by name; then Save and Approve. A skill's
 * level is the skill's, the same in every career: it is changed on the
 * skill's record, not here. Approving says so with an Undo, and offers the
 * next draft.
 */
export default function PathEditor({ record, onChanged }: { record: RecordView; onChanged: () => Promise<unknown> }) {
  const notice = useAdminNotice();
  const save = useSavePath(record.id);
  const drafts = useAdminPaths('draft');
  const saved = record.path ?? [];
  const status = typeof record.fields.pathStatus === 'string' ? record.fields.pathStatus : null;
  const [skills, setSkills] = useState<PathSkill[]>(saved);
  const [adding, setAdding] = useState<FoundRecord | null>(null);
  const dirty = !samePath(skills, saved);

  // The draft after this one by title, or the first of the others.
  const others = (drafts.data ?? []).filter((path) => path.id !== record.id);
  const next = others.find((path) => path.title.localeCompare(record.name) > 0) ?? others[0];

  const send = (nextStatus: 'draft' | 'approved' | undefined, said: string, undo?: () => void) => {
    if (save.isPending) return;
    save.mutate(
      {
        skills: skills.map((skill) => ({ skillId: skill.id })),
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
      // It goes where it will sit once saved: under its own level.
      setSkills([...skills, { id: adding.id, name: adding.name, level: adding.level ?? null, group: null }]);
    }
    setAdding(null);
    window.setTimeout(() => document.getElementById('path-add')?.focus(), 0);
  };

  // A skill's level is read from the saved path where it is there: it may have changed on the skill's record.
  const savedLevel = new Map(saved.map((skill) => [skill.id, skill.level]));
  const levelOf = (skill: PathSkill) => (savedLevel.has(skill.id) ? savedLevel.get(skill.id) : skill.level) ?? null;
  const groups = COLUMNS.map((group) => ({
    ...group,
    items: skills.filter((skill) => levelOf(skill) === group.level).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.level !== null || group.items.length > 0);

  const total = skills.length;
  const statusWord = status === 'approved' ? 'Approved' : status === 'draft' ? 'Draft, not yet reviewed' : 'No path yet';

  return (
    <Panel
      title="Path"
      description={`${statusWord}. ${total.toLocaleString('en-US')} ${total === 1 ? 'skill' : 'skills'}, each under its own level.`}
      className="scroll-mt-20"
    >
      <div id="path" className={cardClass} data-path-editor data-path-status={status ?? 'none'}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.label} className={cn('min-w-0', group.level === null && 'lg:col-span-3')} data-path-level={group.level ?? 'none'}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-2">
                {group.label} <span className="tabular-nums">{group.items.length}</span>
              </p>
              {group.items.length === 0 ? (
                <p className="mt-2 text-sm text-text-2">None yet.</p>
              ) : (
                <ul className="mt-1">
                  {group.items.map((skill) => (
                    <li key={skill.id} className="flex items-center gap-2 border-t border-line py-1.5 first:border-t-0" data-path-skill={skill.id}>
                      <span className="min-w-0 flex-1 break-words text-sm text-text-1">{skill.name}</span>
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

        <div className="mt-5 border-t border-line pt-4">
          <label htmlFor="path-add" className="mb-1.5 block text-sm font-medium text-text-2">
            Add a skill
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,24rem)_auto]">
            <RecordPicker id="path-add" kind="skill" value={adding} onChange={setAdding} />
            <Button type="button" variant="outline" aria-disabled={!adding} onClick={add} className={cn('h-[42px] justify-self-start', outlineButtonClass, busyButtonClass)}>
              Add
            </Button>
          </div>
          {adding && skills.some((skill) => skill.id === adding.id) && <p className="mt-1.5 text-xs text-text-3">Already on the path.</p>}
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
    </Panel>
  );
}
