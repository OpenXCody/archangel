import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE, ApiError } from './http';
import { accountKeys, meApi, type MyGoal, type MySkill, type SkillStatus } from './account';

/**
 * What a career seeker's skills turn into: marking a skill where it is
 * listed, and the careers those skills already point at.
 *
 * Everything here reads and writes the same records as `account.ts` (the
 * person's skills and goals); it adds an optimistic way to set one, and the
 * list that is worked out from them.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A skill on a career's path that the person does not hold yet. */
export interface NextSkill {
  id: string;
  name: string;
  /** 1 Introduction, 2 Fundamentals, 3 Advanced; null when not placed on the path. */
  stage: 1 | 2 | 3 | null;
}

/** A career the person's held skills already cover part of. */
export interface ReachCareer {
  id: string;
  title: string;
  /** Skills of the career the person holds. Learning does not count. */
  held: number;
  total: number;
  /** Up to three skills not yet held, earliest stage first. */
  next: NextSkill[];
}

/** A skill's answer for the signed-in person; 'none' takes it off their list. */
export type SkillMark = SkillStatus | 'none';

// ---------------------------------------------------------------------------
// Careers within reach
// ---------------------------------------------------------------------------

/**
 * Under the skills key on purpose: whatever changes the person's skills
 * (here or in `account.ts`) refreshes this list with them.
 */
export const reachKey = [...accountKeys.skills, 'reach'] as const;

async function fetchReach(): Promise<ReachCareer[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/me/careers/reach`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const payload = (await response.json().catch(() => null)) as { careers?: ReachCareer[]; error?: unknown } | null;
  if (!response.ok || !payload?.careers) {
    const message = response.status < 500 && typeof payload?.error === 'string' ? payload.error : '';
    throw new ApiError(message || 'Something went wrong on our side. Please try again.', response.status);
  }
  return payload.careers;
}

/**
 * Careers ranked by the share of their path the person holds; the ones they
 * already aim at are left out. Empty until at least one skill is held.
 */
export function useCareersInReach(enabled = true) {
  return useQuery({
    queryKey: reachKey,
    queryFn: fetchReach,
    enabled,
    // Keep the list on screen while it is worked out again after a change.
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
}

/** The next skills of a chosen career, as `GET /api/me/goals` sends them. */
export function goalNextSkills(goal: MyGoal): NextSkill[] {
  const next: unknown = (goal as MyGoal & { next?: unknown }).next;
  return Array.isArray(next) ? (next as NextSkill[]) : [];
}

/** "Blueprint Reading, Chemical Safety, Inspection Record Keeping" */
export function nextSkillNames(next: NextSkill[]): string {
  return next.map((skill) => skill.name).join(', ');
}

// ---------------------------------------------------------------------------
// Suggested skills
// ---------------------------------------------------------------------------

/** A skill of one of the person's careers that is not on their list yet. */
export interface SuggestedSkill {
  id: string;
  name: string;
  stage: 1 | 2 | 3 | null;
  /** One career it is for: a goal first, else the closest career within reach. */
  career: string;
  /** How many of those careers call for it. */
  careers: number;
}

/**
 * Not under the skills key, on purpose: marking a suggestion must not reshuffle
 * the list under the finger. It is read when the page opens, when the person's
 * goals change (`refreshSuggestedSkills`), and when they ask for more.
 */
export const suggestedSkillsKey = [...accountKeys.me, 'suggested-skills'] as const;

async function fetchSuggestedSkills(): Promise<SuggestedSkill[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/me/skills/suggested`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const payload = (await response.json().catch(() => null)) as { skills?: SuggestedSkill[] } | null;
  if (!response.ok || !payload?.skills) throw new ApiError('Something went wrong on our side. Please try again.', response.status);
  return payload.skills;
}

/**
 * Skills of the person's goal careers, then of the careers within reach, none
 * of them on their list yet. Empty for a person with no goal and no held skill.
 */
export function useSuggestedSkills(enabled = true) {
  return useQuery({
    queryKey: suggestedSkillsKey,
    queryFn: fetchSuggestedSkills,
    enabled,
    staleTime: Infinity,
    // A fresh list each time the page is opened.
    refetchOnMount: 'always',
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
}

// ---------------------------------------------------------------------------
// Marking a skill
// ---------------------------------------------------------------------------

interface MarkInput {
  skillId: string;
  /** Shown at once in the person's list, before the server answers. */
  name: string;
  mark: SkillMark;
}

const markKey = ['me', 'mark-skill'] as const;

function withMark(list: MySkill[], skillId: string, name: string, mark: SkillMark): MySkill[] {
  const rest = list.filter((skill) => skill.skillId !== skillId);
  if (mark === 'none') return rest;
  const entry: MySkill = { skillId, name, status: mark, updatedAt: new Date().toISOString() };
  return [...rest, entry].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Set one skill as held, learning or neither, showing the change at once.
 *
 * The person's skill list is updated before the request goes out, so every
 * figure worked out from it ("You have 9 of 14") follows immediately. If the
 * server refuses, that one skill goes back to what it was. Several marks can
 * be in flight together; the list is re-read once, after the last one lands.
 */
export function useMarkSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: markKey,
    mutationFn: ({ skillId, mark }: MarkInput): Promise<unknown> =>
      mark === 'none' ? meApi.removeSkill(skillId) : meApi.setSkill(skillId, mark),
    onMutate: async ({ skillId, name, mark }) => {
      // A read already on its way would put the old answer back.
      await queryClient.cancelQueries({ queryKey: accountKeys.skills, exact: true });
      const before = queryClient.getQueryData<MySkill[]>(accountKeys.skills)?.find((skill) => skill.skillId === skillId);
      queryClient.setQueryData<MySkill[]>(accountKeys.skills, (list) => withMark(list ?? [], skillId, name, mark));
      return { before };
    },
    onError: (_error, { skillId, name }, context) => {
      queryClient.setQueryData<MySkill[]>(accountKeys.skills, (list) =>
        withMark(list ?? [], skillId, name, context?.before?.status ?? 'none')
      );
    },
    onSettled: () => {
      // This mutation still counts as running here: 1 means it is the last.
      if (queryClient.isMutating({ mutationKey: markKey }) > 1) return;
      // The same things `account.ts` refreshes when a skill changes; the reach list sits under skills.
      for (const queryKey of [accountKeys.skills, accountKeys.goals, accountKeys.jobDetails, accountKeys.jobApplicants]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
