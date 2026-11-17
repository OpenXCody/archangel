import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDashed, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signInPath, useAccount, useMySkills, useRemoveSkill, useSetSkillStatus, type SkillStatus } from '../../lib/account';
import { onGroupArrowKeys } from '../../lib/roving';
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

/**
 * The segmented choice itself, without any data fetching. A radio group: Tab
 * reaches it once, arrow keys move between the choices. While `disabled` (the
 * answer is loading or saving) it keeps the focus and ignores presses.
 */
export function SkillStatusControl({ value, onChange, disabled, hideNone, label, className }: SkillStatusControlProps) {
  const choices = hideNone ? CHOICES.filter((choice) => choice.value !== 'none') : CHOICES;
  const values = choices.map((choice) => choice.value);
  const choose = (next: Choice) => {
    if (!disabled && next !== value) onChange(next);
  };
  // With nothing chosen that is on offer, Tab lands on the first choice.
  const tabStop = values.includes(value) ? value : values[0];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={disabled || undefined}
      onKeyDown={(event) => onGroupArrowKeys(event, values, value, choose)}
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
            aria-disabled={disabled || undefined}
            tabIndex={choice.value === tabStop ? 0 : -1}
            onClick={() => choose(choice.value)}
            className={cn(
              'h-8 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors aria-disabled:cursor-default',
              selected
                ? choice.value === 'held'
                  ? 'bg-success/15 text-success'
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

interface SkillHeldToggleProps {
  /** The current answer; 'none' when the skill is not on the person's list. */
  value: Choice;
  /** 'held' when it was not held, 'none' when it was. */
  onChange: (next: Choice) => void;
  disabled?: boolean;
  /** The skill's name, for screen readers. */
  label: string;
  className?: string;
}

/**
 * The compact form of the control, for a skill in a list: one mark that reads
 * as the skill's status (open circle, dashed while learning, checked when
 * held) and, pressed, sets it held or clears it. Learning is set on the
 * skill's own page. The mark is small; the button around it is a full touch
 * target.
 */
export function SkillHeldToggle({ value, onChange, disabled, label, className }: SkillHeldToggleProps) {
  const held = value === 'held';
  const Icon = held ? CheckCircle2 : value === 'learning' ? CircleDashed : Circle;
  const state = held ? 'Held' : value === 'learning' ? 'Learning' : 'Not held';
  return (
    <button
      type="button"
      aria-pressed={held}
      aria-label={`${label}: ${state}`}
      title={held ? 'Held' : value === 'learning' ? 'Learning. Mark as held' : 'Mark as held'}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onChange(held ? 'none' : 'held');
      }}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors',
        'aria-disabled:cursor-default aria-disabled:opacity-60',
        held ? 'text-success' : 'text-fg-muted hover:text-fg-default',
        className
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
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
