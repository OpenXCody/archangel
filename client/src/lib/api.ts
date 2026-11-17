import { unpackPins, type PinsPayload } from '@shared/pins';

// Relative by default: production serves /api on the same origin, and in dev
// Vite proxies /api to the Express server — which also makes the dev build
// reachable from a phone on the same network. Override with VITE_API_URL for
// a native shell or a split deployment.
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ---------------------------------------------------------------------------
// Admin access. Writes and the import pipeline are gated server-side by an
// ADMIN_SECRET; the key is entered once in the Data page and kept in this
// browser only.
// ---------------------------------------------------------------------------
const ADMIN_SECRET_STORAGE_KEY = 'archangel.adminSecret';
export const ADMIN_HEADER = 'x-admin-secret';

export function getAdminSecret(): string | null {
  try { return window.localStorage.getItem(ADMIN_SECRET_STORAGE_KEY); } catch { return null; }
}
export function setAdminSecret(secret: string): void {
  try { window.localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, secret); } catch { /* private mode */ }
}
export function clearAdminSecret(): void {
  try { window.localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY); } catch { /* ignore */ }
}
/** Headers to spread into any request that changes data. */
export function adminHeaders(): Record<string, string> {
  const secret = getAdminSecret();
  return secret ? { [ADMIN_HEADER]: secret } : {};
}

/** Thrown when the server wants an admin key we don't have (or have wrong). */
export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
  }
}

/**
 * `fetch` that carries the admin key. Use for uploads (FormData) and any
 * hand-built request that can't go through apiFetch. Content-Type is left
 * to the caller so multipart bodies keep their boundary.
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(adminHeaders())) headers.set(k, v);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 || response.status === 503) {
    const body = await response.clone().json().catch(() => ({}));
    if (body && typeof body.error === 'string' && /admin/i.test(body.error)) {
      throw new AdminAuthError(body.error, response.status);
    }
  }
  return response;
}

export interface ImportStatus { authRequired: boolean; authorized: boolean }

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  // Legacy cursor support for backwards compatibility
  nextCursor?: string | null;
}

// Related entity types
export interface RelatedFactory {
  id: string;
  name: string;
  specialization: string | null;
  /** What the site makes, from its industry classification. */
  industry?: string | null;
  city?: string | null;
  state: string | null;
  workforceSize: number | null;
  openPositions: number | null;
  latitude?: string | null;
  longitude?: string | null;
}

export interface RelatedCompany {
  id: string;
  name: string;
  industry: string | null;
}

export interface RelatedOccupation {
  id: string;
  title: string;
  onetCode: string | null;
  headcount: number | null;
  avgSalaryMin: number | null;
  avgSalaryMax: number | null;
}

export interface RelatedOccupationWithImportance {
  id: string;
  title: string;
  onetCode: string | null;
  importance: 'required' | 'preferred' | 'nice_to_have';
}

export interface RelatedSkill {
  id: string;
  name: string;
  category: string | null;
  importance?: 'required' | 'preferred' | 'nice_to_have';
  /** Where the skill sits on a career's path: 1 Introduction, 2 Fundamentals, 3 Advanced. */
  stage?: 1 | 2 | 3 | null;
}

/** An open job listed on its career's page. Pay is in cents. */
export interface CareerJob {
  id: string;
  serial: number;
  title: string;
  payMin: number | null;
  payMax: number | null;
  payPeriod: 'hour' | 'year';
  companyName: string;
  factoryName: string;
  city: string | null;
  occupationId?: string;
  occupationTitle?: string;
}

export interface RelatedFactoryWithHeadcount {
  id: string;
  name: string;
  state: string | null;
  companyId: string | null;
  companyName: string | null;
  headcount: number | null;
  avgSalaryMin: number | null;
  avgSalaryMax: number | null;
  latitude?: string | null;
  longitude?: string | null;
}

// Base entity types
export interface Company {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  headquartersLat: string | null;
  headquartersLng: string | null;
  /** Website domain (e.g. "micron.com"); the logo is looked up from it. */
  domain?: string | null;
  /** Short name for the company's page (/companies/tesla), when it has one. */
  slug?: string | null;
  /** A featured employer: shown first and marked on the map. */
  featured?: boolean;
  createdAt: string;
  factoryCount?: number;
  totalWorkforce?: number;
  occupationCount?: number;
}

// Company with relations
export interface CompanyOccupation {
  id: string;
  title: string;
  onetCode: string | null;
  /** How many of the company's factories employ this occupation. */
  factoryCount: number;
  headcount: number;
}

export interface CompanyDetail extends Company {
  /** Open jobs here, newest first. */
  jobs?: CareerJob[];
  factories: RelatedFactory[];
  occupations?: CompanyOccupation[];
}

export interface Factory {
  id: string;
  name: string;
  companyId: string | null;
  companyName?: string;
  specialization: string | null;
  description: string | null;
  latitude: string;
  longitude: string;
  address?: string | null;
  city?: string | null;
  state: string | null;
  /** What the site makes, from its industry classification. */
  industry?: string | null;
  workforceSize: number | null;
  openPositions: number | null;
  createdAt: string;
  occupationCount?: number;
  /** The company's website domain, for its logo, where a response carries it. */
  companyDomain?: string | null;
}

// Factory with relations
/** The company behind a factory, with enough of its profile to introduce it. */
export interface FactoryCompany extends RelatedCompany {
  slug?: string | null;
  domain?: string | null;
  featured?: boolean;
  description?: string | null;
  /** How many sites the company has, and across how many states. */
  siteCount?: number;
  stateCount?: number;
}

/** Another site of the same company. */
export interface SisterSite {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: string;
  longitude: string;
}

export interface FactoryDetail extends Factory {
  /** Open jobs here, newest first. */
  jobs?: CareerJob[];
  company: FactoryCompany | null;
  /** The company's other sites, closest first (up to five). */
  nearby?: SisterSite[];
  /** Careers typical of this plant's industry, when none are recorded for the plant itself. */
  typicalCareers?: { id: string; title: string }[];
  occupations: RelatedOccupation[];
}

export interface Occupation {
  id: string;
  title: string;
  description: string | null;
  onetCode: string | null;
  /** null: no path yet. 'draft': written, not reviewed. 'approved': reviewed by a person. */
  pathStatus?: 'draft' | 'approved' | null;
  createdAt: string;
  skillCount?: number;
  factoryCount?: number;
  /** Skills at each stage of the path (Introduction, Fundamentals, Advanced), where a response carries it. */
  stageCounts?: [number, number, number] | null;
}

// Occupation with relations
export interface OccupationDetail extends Occupation {
  skills: RelatedSkill[];
  factories: RelatedFactoryWithHeadcount[];
  jobs?: CareerJob[];
  /** Industries where this work is typically done, with their factory counts. */
  industries?: { name: string; factoryCount: number }[];
  /** True when the career is found in plants of every industry rather than a few. */
  everywhere?: boolean;
  /** True when it is listed for some industries and found in the others as well. */
  elsewhereToo?: boolean;
  /** States with the most factories in those industries. */
  topStates?: { code: string; factoryCount: number }[];
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  createdAt: string;
  occupationCount?: number;
  childCount?: number;
}

// Skill tree relations
export interface SkillTreeNode {
  id: string;
  name: string;
  category: string | null;
  childCount?: number;
}

// Skill with relations
export interface SkillDetail extends Skill {
  parent: SkillTreeNode | null;
  children: SkillTreeNode[];
  occupations: RelatedOccupationWithImportance[];
  relatedSkills: RelatedSkill[];
}

export type EntityType = 'companies' | 'factories' | 'occupations' | 'skills';

interface FetchOptions {
  offset?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  state?: string;
  company?: string;
  category?: string;
  [key: string]: string | number | boolean | undefined;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const isWrite = method !== 'GET' && method !== 'HEAD';
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(isWrite ? adminHeaders() : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    const message: string = error.error || error.message || `HTTP ${response.status}`;
    if ((response.status === 401 || response.status === 503) && /admin/i.test(message)) {
      throw new AdminAuthError(message, response.status);
    }
    throw new Error(message);
  }

  return response.json();
}

function buildQueryString(params: FetchOptions): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

// Companies API
export const companiesApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Company>>(`/companies${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<CompanyDetail>(`/companies/${id}`),
};

// Which factories the map's pins cover
export interface PinFilters {
  states?: string[];
  company?: string;
  industry?: string;
}

// Factories API
export const factoriesApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Factory>>(`/factories${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<FactoryDetail>(`/factories/${id}`),

  /** Every factory the filters allow, as the GeoJSON the map's source takes. */
  pins: async (filters?: PinFilters) => {
    const params: FetchOptions = {};
    if (filters?.states?.length) params.states = filters.states.join(',');
    if (filters?.company) params.company = filters.company;
    if (filters?.industry) params.industry = filters.industry;
    return unpackPins(await apiFetch<PinsPayload>(`/factories/pins${buildQueryString(params)}`));
  },
};

// Occupations API
export const occupationsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Occupation>>(`/occupations${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<OccupationDetail>(`/occupations/${id}`),
};

// Skills API
export const skillsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Skill>>(`/skills${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<SkillDetail>(`/skills/${id}`),
};

// Entity counts for tabs
export interface EntityCounts {
  companies: number;
  factories: number;
  occupations: number;
  skills: number;
  total: number;
}

export const statsApi = {
  counts: () =>
    apiFetch<EntityCounts>('/stats/counts'),
};

// Search types
export type SearchEntityType = 'companies' | 'factories' | 'occupations' | 'skills' | 'states';

export interface SearchResultItem {
  id: string;
  name: string;
  type: SearchEntityType;
  subtitle?: string;
  meta?: string;
  /** Companies only: the web domain their logo is looked up from. */
  domain?: string | null;
}

export interface SearchResults {
  query: string;
  results: {
    companies: { count: number; items: SearchResultItem[] };
    factories: { count: number; items: SearchResultItem[] };
    occupations: { count: number; items: SearchResultItem[] };
    skills: { count: number; items: SearchResultItem[] };
    states: { count: number; items: SearchResultItem[] };
  };
  totalCount: number;
}

export interface SearchOptions {
  types?: SearchEntityType[];
  limit?: number;
}

export const searchApi = {
  search: (query: string, options: SearchOptions = {}) => {
    const params: FetchOptions = { q: query };
    if (options.types?.length) {
      params.types = options.types.join(',');
    }
    if (options.limit) {
      params.limit = options.limit;
    }
    return apiFetch<SearchResults>(`/search${buildQueryString(params)}`);
  },
};

// Map API types
export interface StateSummary {
  code: string;
  name: string;
  factoryCount: number;
  totalWorkforce: number;
  totalOpenPositions: number;
}

export interface StatesSummaryResponse {
  states: StateSummary[];
}

/** A company in an overview's Top Companies list. */
export interface TopCompany {
  id: string;
  name: string;
  /** Website domain for the logo, when known. */
  domain: string | null;
  featured: boolean;
  /** Factories inside the state or area. */
  count: number;
  /** Factories nationwide. */
  sites: number;
}

/** The totals and rankings the panel shows for a region. */
export interface RegionOverview {
  totalFactories: number;
  totalCompanies: number;
  totalWorkforce: number;
  topCompanies: TopCompany[];
  topIndustries: { label: string; count: number }[];
  /** Careers typical of the industries found here, the most characteristic first. */
  careers?: { id: string; title: string }[];
}

export interface StateOverview extends RegionOverview {
  code: string;
}

export interface AreaOverview extends RegionOverview {
  id: string;
  name: string;
  description: string;
  bounds: [[number, number], [number, number]];
}

// Map API
export const mapApi = {
  statesSummary: () =>
    apiFetch<StatesSummaryResponse>('/map/states/summary'),
  /** Factory count per 2-letter state code — drives the choropleth. */
  stateCounts: () =>
    apiFetch<Record<string, number>>('/map/state-counts'),
  /** Panel data for a selected state. */
  stateOverview: (code: string) =>
    apiFetch<StateOverview>(`/map/states/${encodeURIComponent(code)}/overview`),
  /** Panel data for a selected focus area. */
  areaOverview: (id: string) =>
    apiFetch<AreaOverview>(`/map/areas/${encodeURIComponent(id)}/overview`),
};

// Explore overview: what /explore opens on, in one response.

/** A featured employer on the overview. */
export interface ExploreEmployer {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  industry: string | null;
  siteCount: number;
  stateCount: number;
}

/** One stage of a career's path: how many skills it holds and the first few by name. */
export interface ExploreCareerStage {
  stage: 1 | 2 | 3;
  count: number;
  skills: string[];
}

/** A career that has a path, with the path's shape. */
export interface ExploreCareer {
  id: string;
  title: string;
  description: string | null;
  stages: ExploreCareerStage[];
}

/** The most connected skills of one category. */
export interface ExploreSkillGroup {
  category: string;
  skills: { id: string; name: string; careerCount: number }[];
}

export interface ExploreArea {
  id: string;
  name: string;
  description: string;
  factoryCount: number;
}

export interface ExploreState {
  code: string;
  name: string;
  factoryCount: number;
}

export interface ExploreOverview {
  employers: ExploreEmployer[];
  careers: ExploreCareer[];
  skillGroups: ExploreSkillGroup[];
  areas: ExploreArea[];
  states: ExploreState[];
}

/** What the browse lists can be filtered by, from every row. */
export interface ExploreFacets {
  companyIndustries: string[];
  factoryIndustries: string[];
  skillCategories: string[];
}

export const exploreApi = {
  overview: () =>
    apiFetch<ExploreOverview>('/explore/overview'),
  facets: () =>
    apiFetch<ExploreFacets>('/explore/facets'),
};
