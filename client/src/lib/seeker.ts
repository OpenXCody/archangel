import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, SERVER_FAILED, request, retryUnlessClientError } from './http';
import type { ApplicationStatus, JobStatus } from './jobs';
import { accountKeys, invalidate } from './queryKeys';

/**
 * A career seeker's own records and what they turn into: their skills
 * (learning or held), their goals and their applications; marking a skill
 * where it is listed, optimistically; the careers those skills already point
 * at, and the skills worth picking up next.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillStatus = 'learning' | 'held';

export interface MySkill {
  skillId: string;
  name: string;
  status: SkillStatus;
  updatedAt: string;
}

export interface MyGoal {
  occupationId: string;
  title: string;
  createdAt: string;
  totalSkills: number;
  heldSkills: number;
}

/** One step in an application's history: the stage it reached, and when. */
export interface ApplicationEvent {
  status: ApplicationStatus;
  at: string;
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  createdAt: string;
  statusChangedAt: string;
  /** The company moved it since the person last opened their page. */
  changed: boolean;
  /** Its history, oldest first. */
  events: ApplicationEvent[];
  jobId: string;
  jobSerial: number;
  jobTitle: string;
  jobStatus: JobStatus;
  companyId: string;
  companyName: string;
  city: string | null;
  state: string | null;
}

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
// API functions
// ---------------------------------------------------------------------------

const seekerApi = {
  skills: () => request<{ skills: MySkill[] }>('/me/skills').then((r) => r.skills),
  setSkill: (skillId: string, status: SkillStatus) =>
    request<{ skillId: string; status: SkillStatus }>(`/me/skills/${skillId}`, { method: 'PUT', body: { status } }),
  removeSkill: (skillId: string) => request<{ ok: true }>(`/me/skills/${skillId}`, { method: 'DELETE' }),
  goals: () => request<{ goals: MyGoal[] }>('/me/goals').then((r) => r.goals),
  addGoal: (occupationId: string) =>
    request<{ occupationId: string }>(`/me/goals/${occupationId}`, { method: 'PUT' }),
  removeGoal: (occupationId: string) => request<{ ok: true }>(`/me/goals/${occupationId}`, { method: 'DELETE' }),
  applications: () => request<{ applications: MyApplication[] }>('/me/applications').then((r) => r.applications),
};

// ---------------------------------------------------------------------------
// My skills, goals and applications
// ---------------------------------------------------------------------------

export function useMySkills(enabled = true) {
  return useQuery({ queryKey: accountKeys.skills, queryFn: seekerApi.skills, enabled, retry: retryUnlessClientError });
}

/** Which skills count as held changes goal progress and the marks on job pages. */
function skillsChanged(queryClient: QueryClient): Promise<void> {
  return invalidate(queryClient, accountKeys.skills, accountKeys.goals, accountKeys.jobDetails, accountKeys.jobApplicants);
}

export function useSetSkillStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, status }: { skillId: string; status: SkillStatus }) => seekerApi.setSkill(skillId, status),
    onSuccess: () => skillsChanged(queryClient),
  });
}

export function useRemoveSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) => seekerApi.removeSkill(skillId),
    onSuccess: () => skillsChanged(queryClient),
  });
}

export function useMyGoals(enabled = true) {
  return useQuery({ queryKey: accountKeys.goals, queryFn: seekerApi.goals, enabled, retry: retryUnlessClientError });
}

export function useAddGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occupationId: string) => seekerApi.addGoal(occupationId),
    onSuccess: () => invalidate(queryClient, accountKeys.goals),
  });
}

export function useRemoveGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occupationId: string) => seekerApi.removeGoal(occupationId),
    onSuccess: () => invalidate(queryClient, accountKeys.goals),
  });
}

export function useMyApplications(enabled = true) {
  return useQuery({
    queryKey: accountKeys.applications,
    queryFn: seekerApi.applications,
    enabled,
    // Stages move on the company's side, so do not sit on an old answer.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

// ---------------------------------------------------------------------------
// Careers within reach
// ---------------------------------------------------------------------------

async function fetchReach(): Promise<ReachCareer[]> {
  // A 401 in the server's words, as this list has always shown it.
  const payload = await request<{ careers?: ReachCareer[] } | null>('/me/careers/reach', { plain401: true });
  if (!payload?.careers) throw new ApiError(SERVER_FAILED, 200);
  return payload.careers;
}

/**
 * Careers ranked by the share of their path the person holds; the ones they
 * already aim at are left out. Empty until at least one skill is held.
 */
export function useCareersInReach(enabled = true) {
  return useQuery({
    queryKey: accountKeys.reach,
    queryFn: fetchReach,
    enabled,
    // Keep the list on screen while it is worked out again after a change.
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
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

async function fetchSuggestedSkills(): Promise<SuggestedSkill[]> {
  const payload = await request<{ skills?: SuggestedSkill[] } | null>('/me/skills/suggested');
  if (!payload?.skills) throw new ApiError(SERVER_FAILED, 200);
  return payload.skills;
}

/**
 * Skills of the person's goal careers, then of the careers within reach, none
 * of them on their list yet. Empty for a person with no goal and no held skill.
 *
 * Its key is not under the skills key, on purpose: marking a suggestion must
 * not reshuffle the list under the finger. It is read when the page opens,
 * when the person's goals change, and when they ask for more.
 */
export function useSuggestedSkills(enabled = true) {
  return useQuery({
    queryKey: accountKeys.suggestedSkills,
    queryFn: fetchSuggestedSkills,
    enabled,
    staleTime: Infinity,
    // A fresh list each time the page is opened.
    refetchOnMount: 'always',
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
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
      mark === 'none' ? seekerApi.removeSkill(skillId) : seekerApi.setSkill(skillId, mark),
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
      // The same things `skillsChanged` refreshes; the reach list sits under skills.
      for (const queryKey of [accountKeys.skills, accountKeys.goals, accountKeys.jobDetails, accountKeys.jobApplicants]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
