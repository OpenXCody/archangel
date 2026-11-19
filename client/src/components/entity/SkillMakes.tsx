import { cn } from '@/lib/utils';
import type { Make } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { useMySkills, useSetSkillMakes } from '../../lib/seeker';
import { useSeekerTools } from '../../lib/viewer';
import { ErrorNote } from '../account/parts';
import { DetailSection } from '../layout/Page';

const chipClass = 'inline-flex max-w-full items-center rounded-full border px-3 text-sm leading-tight [overflow-wrap:anywhere]';
const quietChip = 'border-line text-text-2';

/**
 * A skill's makes: the named equipment and software it is run on, as quiet
 * chips in the order they are shown. For a seeker who holds or is learning
 * the skill each chip is a toggle: pressed, it says they have run that make.
 * For everyone else (a visitor, someone here to hire, a seeker without the
 * skill) the chips are plain. Brightness says which are marked; there is no
 * colour, count or icon.
 */
export default function SkillMakes({ skillId, makes }: { skillId: string; makes: Make[] }) {
  const { data: account } = useAccount();
  const seekerTools = useSeekerTools();
  const signedIn = Boolean(account?.user) && seekerTools;
  const { data: mySkills } = useMySkills(signedIn);
  const setMakes = useSetSkillMakes();
  const mine = signedIn ? mySkills?.find((skill) => skill.skillId === skillId) : undefined;
  const marked = new Set((mine?.makes ?? []).map((make) => make.id));

  if (makes.length === 0) return null;

  const toggle = (make: Make) => {
    const next = makes.filter((each) => (each.id === make.id ? !marked.has(each.id) : marked.has(each.id)));
    setMakes.mutate({ skillId, makes: next });
  };

  return (
    <DetailSection
      id="makes"
      title="Makes"
      // Said only to the person who can answer it.
      note={mine ? <span className="text-xs text-text-3">Mark the ones you have run</span> : undefined}
    >
      <ul className="flex flex-wrap gap-2" data-skill-makes data-markable={mine ? '' : undefined}>
        {makes.map((make) =>
          mine ? (
            <li key={make.id} className="max-w-full">
              <button
                type="button"
                aria-pressed={marked.has(make.id)}
                onClick={() => toggle(make)}
                data-make={make.id}
                className={cn(
                  chipClass,
                  // A full finger's size where a finger is what presses it.
                  'min-h-9 transition-colors [@media(pointer:coarse)]:min-h-11',
                  marked.has(make.id) ? 'border-line-strong bg-surface font-medium text-text-1' : cn(quietChip, 'hover:border-line-strong hover:text-text-1')
                )}
              >
                {make.name}
              </button>
            </li>
          ) : (
            <li key={make.id} data-make={make.id} className={cn(chipClass, quietChip, 'min-h-8 py-1')}>
              {make.name}
            </li>
          )
        )}
      </ul>
      <ErrorNote error={setMakes.error} className="mt-2" />
    </DetailSection>
  );
}
