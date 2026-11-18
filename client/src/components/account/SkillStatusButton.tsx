import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signInPath, useAccount, useMySkills, useRemoveSkill, useSetSkillStatus, type SkillStatus } from '../../lib/account';
import { onGroupArrowKeys } from '../../lib/roving';
import { useSeekerTools } from '../../lib/viewer';
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
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors aria-disabled:cursor-default',
              selected ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
            )}
          >
            {/* The chosen answer carries the same mark the skill has in every list. */}
            {selected && choice.value !== 'none' && <SkillMark status={choice.value} className="h-3.5 w-3.5" />}
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The one mark for a skill's status, wherever a skill is listed: a filled,
 * bright disc with a tick when it is held; a half-filled ring, mid-bright,
 * while it is being learned; an empty, quiet ring when it is neither. Shape
 * and brightness say it; there is no colour for "held".
 */
export function SkillMark({ status, className }: { status: Choice; className?: string }) {
  const tone = status === 'held' ? 'text-fg-default' : status === 'learning' ? 'text-fg-muted' : 'text-fg-soft';
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" data-skill-mark={status} className={cn('h-5 w-5 shrink-0', tone, className)}>
      {status === 'held' ? (
        <>
          <circle cx="10" cy="10" r="8.25" fill="currentColor" />
          <path d="M6.4 10.3l2.4 2.4 4.8-5.1" stroke="var(--color-bg-surface)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
          {status === 'learning' && <path d="M10 2.5a7.5 7.5 0 0 0 0 15z" fill="currentColor" />}
        </>
      )}
    </svg>
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
 * as the skill's status (`SkillMark`) and, pressed, sets it held or clears it. Learning is set on the
 * skill's own page. The mark is small; the button around it is a full touch
 * target.
 */
export function SkillHeldToggle({ value, onChange, disabled, label, className }: SkillHeldToggleProps) {
  const held = value === 'held';
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
        'aria-disabled:cursor-default aria-disabled:opacity-60 [&:hover>svg]:text-fg-default',
        className
      )}
    >
      <SkillMark status={value} />
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
 * Someone here to hire keeps no skills: for them it draws nothing.
 */
export default function SkillStatusButton({ skillId, className }: SkillStatusButtonProps) {
  const location = useLocation();
  const account = useAccount();
  const signedIn = Boolean(account.data?.user);
  const skills = useMySkills(signedIn);
  const setStatus = useSetSkillStatus();
  const removeSkill = useRemoveSkill();
  const seekerTools = useSeekerTools();

  if (!seekerTools) return null;

  if (account.isPending) {
    // Hold the control's place until we know who is signed in.
    return <SkillStatusControl label="Do you have this skill?" value="none" onChange={() => undefined} disabled className={className} />;
  }

  if (!signedIn) {
    return (
      <Button asChild variant="outline" className={cn('h-10', outlineButtonClass, className)}>
        <Link to={signInPath(`${location.pathname}${location.search}`)}>
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
