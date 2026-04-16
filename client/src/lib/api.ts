// Use relative URL in production (same domain), localhost in dev
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');

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

export interface RelatedIndustry {
  id: string;
  name: string;
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
  createdAt: string;
  factoryCount?: number;
  totalWorkforce?: number;
}

// Company with relations
export interface CompanyDetail extends Company {
  factories: RelatedFactory[];
  industries: RelatedIndustry[];
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
  state: string | null;
  workforceSize: number | null;
  openPositions: number | null;
  createdAt: string;
  occupationCount?: number;
}

// Factory with relations
export interface FactoryDetail extends Factory {
  company: RelatedCompany | null;
  occupations: RelatedOccupation[];
}

export interface Occupation {
  id: string;
  title: string;
  description: string | null;
  onetCode: string | null;
  createdAt: string;
  skillCount?: number;
  factoryCount?: number;
}

// Occupation with relations
export interface OccupationDetail extends Occupation {
  skills: RelatedSkill[];
  factories: RelatedFactoryWithHeadcount[];
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  createdAt: string;
  occupationCount?: number;
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
  programs: RelatedProgramWithImportance[];
  refs: Record<string, RelatedRef[]>;
  relatedSkills: RelatedSkill[];
}

export interface RelatedProgramWithImportance {
  id: string;
  title: string;
  credentialType: string | null;
  importance: 'required' | 'preferred' | 'nice_to_have';
}

export interface RelatedRef {
  id: string;
  name: string;
  type: RefType;
  manufacturer: string | null;
}

// Ref types
export type RefType = 'material' | 'machine' | 'standard' | 'process' | 'certification';

export interface Ref {
  id: string;
  type: RefType;
  name: string;
  description: string | null;
  manufacturer: string | null;
  tags: string[] | null;
  createdAt: string;
  skillCount?: number;
}

export interface RefDetail extends Ref {
  properties: Record<string, unknown> | null;
  skills: RelatedSkill[];
  aliases: { id: string; aliasText: string }[];
}

// School types
export interface School {
  id: string;
  name: string;
  description: string | null;
  state: string | null;
  schoolType: string | null;
  headquartersLat: string | null;
  headquartersLng: string | null;
  createdAt: string;
  programCount?: number;
}

export interface SchoolDetail extends School {
  programs: {
    id: string;
    title: string;
    credentialType: string | null;
    cipCode: string | null;
    durationHours: number | null;
    skillCount: number;
  }[];
}

// Program types
export interface Program {
  id: string;
  title: string;
  description: string | null;
  schoolId: string | null;
  schoolName?: string | null;
  cipCode: string | null;
  credentialType: string | null;
  durationHours: number | null;
  isOpenSource: boolean;
  createdAt: string;
  skillCount?: number;
}

export interface ProgramDetail extends Program {
  school: {
    id: string;
    name: string;
    schoolType: string | null;
    state: string | null;
  } | null;
  skills: RelatedSkill[];
  aliases: { id: string; aliasText: string }[];
}

// Person types (read-only, no create/update from UI)
export interface Person {
  id: string;
  fullName: string;
  currentTitle: string | null;
  currentEmployerId: string | null;
  employerName?: string | null;
  locationState: string | null;
  createdAt: string;
  skillCount?: number;
}

export interface PersonDetail extends Person {
  employer: RelatedCompany | null;
  proficiencies: {
    id: string;
    skillId: string;
    skillName: string;
    machineRefId: string | null;
    machineRefName: string | null;
    materialRefId: string | null;
    materialRefName: string | null;
    level: 'awareness' | 'novice' | 'competent' | 'proficient' | 'expert';
    yearsExperience: number | null;
    verifiedAt: string | null;
  }[];
}

export type EntityType = 'companies' | 'factories' | 'occupations' | 'skills' | 'refs' | 'schools' | 'programs' | 'persons';
export type Entity = Company | Factory | Occupation | Skill | Ref | School | Program | Person;
export type EntityDetail = CompanyDetail | FactoryDetail | OccupationDetail | SkillDetail | RefDetail | SchoolDetail | ProgramDetail | PersonDetail;

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
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
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

// Factory filter options for geojson
export interface FactoryGeoJSONFilters {
  states?: string[];
  company?: string;
  industry?: string;
  // Viewport bounds: "minLng,minLat,maxLng,maxLat"
  bounds?: string;
}

// Factories API
export const factoriesApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Factory>>(`/factories${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<FactoryDetail>(`/factories/${id}`),

  geojson: (filters?: FactoryGeoJSONFilters) => {
    const params: FetchOptions = {};
    if (filters?.states?.length) params.states = filters.states.join(',');
    if (filters?.company) params.company = filters.company;
    if (filters?.industry) params.industry = filters.industry;
    if (filters?.bounds) params.bounds = filters.bounds;
    return apiFetch<GeoJSON.FeatureCollection>(`/factories/geojson${buildQueryString(params)}`);
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

// Refs API
export const refsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Ref>>(`/refs${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<RefDetail>(`/refs/${id}`),
};

// Schools API
export const schoolsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<School>>(`/schools${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<SchoolDetail>(`/schools/${id}`),
};

// Programs API
export const programsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Program>>(`/programs${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<ProgramDetail>(`/programs/${id}`),
};

// Persons API (read-only)
export const personsApi = {
  list: (options: FetchOptions = {}) =>
    apiFetch<PaginatedResponse<Person>>(`/persons${buildQueryString(options)}`),

  get: (id: string) =>
    apiFetch<PersonDetail>(`/persons/${id}`),
};

// Entity counts for tabs
export interface EntityCounts {
  companies: number;
  factories: number;
  occupations: number;
  skills: number;
  refs: number;
  schools: number;
  programs: number;
  persons: number;
  total: number;
}

export const statsApi = {
  counts: () =>
    apiFetch<EntityCounts>('/stats/counts'),
};

// Search types
export type SearchEntityType = 'companies' | 'factories' | 'occupations' | 'skills' | 'states' | 'refs' | 'schools' | 'programs';

export interface SearchResultItem {
  id: string;
  name: string;
  type: SearchEntityType;
  subtitle?: string;
  meta?: string;
}

export interface SearchResults {
  query: string;
  results: {
    companies: { count: number; items: SearchResultItem[] };
    factories: { count: number; items: SearchResultItem[] };
    occupations: { count: number; items: SearchResultItem[] };
    skills: { count: number; items: SearchResultItem[] };
    states: { count: number; items: SearchResultItem[] };
    refs: { count: number; items: SearchResultItem[] };
    schools: { count: number; items: SearchResultItem[] };
    programs: { count: number; items: SearchResultItem[] };
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

// Unified entity fetcher
export function getEntityApi(type: EntityType) {
  switch (type) {
    case 'companies':
      return companiesApi;
    case 'factories':
      return factoriesApi;
    case 'occupations':
      return occupationsApi;
    case 'skills':
      return skillsApi;
    case 'refs':
      return refsApi;
    case 'schools':
      return schoolsApi;
    case 'programs':
      return programsApi;
    case 'persons':
      return personsApi;
  }
}

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

// Map API
export const mapApi = {
  statesSummary: () =>
    apiFetch<StatesSummaryResponse>('/map/states/summary'),
};
