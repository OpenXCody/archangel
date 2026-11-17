import { unpackPins, type PinsPayload } from '@shared/pins';

// Always the same origin: production serves /api beside the page, and in dev
// Vite proxies /api to the Express server (which also makes the dev build
// reachable from a phone on the same network).
export const API_BASE = '/api';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
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

/** A public read. Anything that changes data, or is a person's own, goes through lib/account.ts. */
async function apiFetch<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
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
export type SearchEntityType = 'companies' | 'factories' | 'occupations' | 'skills' | 'states' | 'jobs';

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
    /** Open jobs. Absent from an answer that was asked for other kinds only. */
    jobs?: { count: number; items: SearchResultItem[] };
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
  /** How many jobs are open at the plants here. */
  openJobs?: number;
  /** The newest of them: a short list, not all. */
  jobs?: CareerJob[];
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

/** A plant in a place's panel. */
export interface PlacePlant {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: string;
  longitude: string;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
}

/** What a box on the map holds: a place found by search. */
export interface BoundsOverview extends RegionOverview {
  bounds: [[number, number], [number, number]];
  /** The plants inside, the best-known companies' first; a short list, not all of them. */
  plants: PlacePlant[];
}

// Map API
export const mapApi = {
  /** Factory count per 2-letter state code — drives the choropleth. */
  stateCounts: () =>
    apiFetch<Record<string, number>>('/map/state-counts'),
  /** Panel data for a selected state. */
  stateOverview: (code: string) =>
    apiFetch<StateOverview>(`/map/states/${encodeURIComponent(code)}/overview`),
  /** Panel data for a selected focus area. */
  areaOverview: (id: string) =>
    apiFetch<AreaOverview>(`/map/areas/${encodeURIComponent(id)}/overview`),
  /** Panel data for any box: [[west, south], [east, north]]. */
  boundsOverview: ([[west, south], [east, north]]: [[number, number], [number, number]]) =>
    apiFetch<BoundsOverview>(`/map/bounds/overview${buildQueryString({ west, south, east, north })}`),
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
