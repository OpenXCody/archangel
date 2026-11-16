import { Link, useLocation } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signInPath, useAccount, useMySkills, useRemoveSkill, useSetSkillStatus, type SkillStatus } from '../../lib/account';
import { ErrorNote, outlineButtonClass } from './parts';

type Choice = SkillStatus | 'none';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'none', label: 'Not held' },
  { value: 'learning', label: 'Learning' },
  { value: 'held', label: 'Held' },
];

interface SkillStatusControlProps {
  /** The current answer; 'none' when the skill is not on the person's list. */
  value: Choice;
  onChange: (next: Choice) => void;
  disabled?: boolean;
  /** Leave out "Not held" where the row has its own remove action. */
  hideNone?: boolean;
  /** Names the group for screen readers, e.g. the skill's name. */
  label: string;
  className?: string;
}

/** The segmented choice itself, without any data fetching. */
export function SkillStatusControl({ value, onChange, disabled, hideNone, label, className }: SkillStatusControlProps) {
  const choices = hideNone ? CHOICES.filter((choice) => choice.value !== 'none') : CHOICES;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex shrink-0 rounded-lg border border-border-strong bg-bg-elevated p-0.5', disabled && 'opacity-60', className)}
    >
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => {
              if (!selected) onChange(choice.value);
            }}
            className={cn(
              'h-8 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed',
              selected
                ? choice.value === 'held'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-bg-surface text-fg-default'
                : 'text-fg-muted hover:text-fg-default'
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

interface SkillStatusButtonProps {
  skillId: string;
  className?: string;
}

/**
 * Set a skill as learning, held or not held for the signed-in person.
 * Signed out, it is a link to sign in that returns to this page.
 */
export default function SkillStatusButton({ skillId, className }: SkillStatusButtonProps) {
  const location = useLocation();
  const account = useAccount();
  const signedIn = Boolean(account.data?.user);
  const skills = useMySkills(signedIn);
  const setStatus = useSetSkillStatus();
  const removeSkill = useRemoveSkill();

  if (account.isPending) {
    // Hold the control's place until we know who is signed in.
    return <SkillStatusControl label="Do you have this skill?" value="none" onChange={() => undefined} disabled className={className} />;
  }

  if (!signedIn) {
    return (
      <Button asChild variant="outline" className={cn('h-10', outlineButtonClass, className)}>
        <Link to={signInPath(`${location.pathname}${location.search}`)}>
          <Wrench />
          Sign in to track this skill
        </Link>
      </Button>
    );
  }

  const current: Choice = skills.data?.find((skill) => skill.skillId === skillId)?.status ?? 'none';
  const error = setStatus.error ?? removeSkill.error ?? skills.error;

  const change = (next: Choice) => {
    setStatus.reset();
    removeSkill.reset();
    if (next === 'none') removeSkill.mutate(skillId);
    else setStatus.mutate({ skillId, status: next });
  };

  return (
    <div className={cn('inline-flex max-w-full flex-col gap-1.5', className)}>
      <SkillStatusControl
        label="Do you have this skill?"
        value={current}
        onChange={change}
        disabled={skills.isPending || setStatus.isPending || removeSkill.isPending}
      />
      <ErrorNote error={error} />
    </div>
  );
}
