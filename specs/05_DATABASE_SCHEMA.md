# Database Schema & Shared Types Specification

## Overview

This document defines the database schema, TypeScript types, and data relationships for the Archangel platform. These definitions serve as the source of truth for both backend (Drizzle ORM) and frontend (TypeScript interfaces) implementations.

---

## Entity Relationship Diagram

```
┌─────────────────┐
│    companies    │
├─────────────────┤
│ id              │───────────────────────┐
│ name            │                       │
│ industry        │                       │ 1:many
│ description     │                       │
│ hq_location     │                       ▼
│ created_at      │              ┌─────────────────┐
│ updated_at      │              │    factories    │
└─────────────────┘              ├─────────────────┤
                                 │ id              │
                                 │ company_id (FK) │
                                 │ name            │
                                 │ specialization  │
                                 │ description     │
                                 │ location        │──── PostGIS Point
                                 │ state           │
                                 │ workforce_size  │
                                 │ open_positions  │
                                 │ created_at      │
                                 │ updated_at      │
                                 └────────┬────────┘
                                          │
                                          │ many:many
                                          ▼
┌─────────────────┐              ┌─────────────────────────┐
│   occupations   │◄─────────────│  factory_occupations    │
├─────────────────┤              ├─────────────────────────┤
│ id              │              │ factory_id (FK)         │
│ title           │              │ occupation_id (FK)      │
│ description     │              │ headcount               │
│ onet_code       │              │ avg_salary_min          │
│ created_at      │              │ avg_salary_max          │
└────────┬────────┘              └─────────────────────────┘
         │
         │ many:many
         ▼
┌─────────────────────────┐
│    occupation_skills    │
├─────────────────────────┤
│ occupation_id (FK)      │
│ skill_id (FK)           │
│ importance              │──── 'required' | 'preferred' | 'nice_to_have'
└─────────────────────────┘
         │
         │
         ▼
┌─────────────────┐
│     skills      │
├─────────────────┤
│ id              │
│ name            │
│ category        │
│ description     │
│ created_at      │
└─────────────────┘


┌─────────────────┐              ┌─────────────────────────┐
│  import_batches │              │     error_queue         │
├─────────────────┤              ├─────────────────────────┤
│ id              │──────────────│ import_batch_id (FK)    │
│ file_name       │              │ entity_type             │
│ entity_type     │              │ source_row_number       │
│ total_rows      │              │ source_row_data         │
│ created_count   │              │ error_type              │
│ updated_count   │              │ field_name              │
│ skipped_count   │              │ original_value          │
│ status          │              │ suggested_value         │
│ created_at      │              │ status                  │
│ completed_at    │              │ resolved_at             │
└─────────────────┘              │ resolution_notes        │
                                 └─────────────────────────┘


┌─────────────────────────┐      ┌─────────────────────────┐
│    occupation_aliases   │      │      skill_aliases      │
├─────────────────────────┤      ├─────────────────────────┤
│ id                      │      │ id                      │
│ alias_text              │      │ alias_text              │
│ canonical_occupation_id │      │ canonical_skill_id      │
│ created_at              │      │ created_at              │
└─────────────────────────┘      └─────────────────────────┘
```

---

## Drizzle Schema Definitions

### Core Entity Tables

```typescript
// server/db/schema.ts

import { pgTable, uuid, text, integer, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

export const importanceEnum = pgEnum('importance', ['required', 'preferred', 'nice_to_have']);
export const importStatusEnum = pgEnum('import_status', ['pending', 'processing', 'completed', 'failed']);
export const errorStatusEnum = pgEnum('error_status', ['pending', 'resolved', 'skipped']);
export const errorTypeEnum = pgEnum('error_type', [
  'missing_required',
  'duplicate_exact',
  'potential_alias',
  'unlinked_relationship',
  'invalid_format',
  'out_of_range'
]);
export const entityTypeEnum = pgEnum('entity_type', ['companies', 'factories', 'occupations', 'skills']);

// ============================================
// COMPANIES
// ============================================

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  industry: text('industry'),
  description: text('description'),
  headquartersLat: text('headquarters_lat'),  // Stored as text, converted to number in app
  headquartersLng: text('headquarters_lng'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('companies_name_idx').on(table.name),
  industryIdx: index('companies_industry_idx').on(table.industry),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  factories: many(factories),
}));

// ============================================
// FACTORIES
// ============================================

export const factories = pgTable('factories', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  specialization: text('specialization'),
  description: text('description'),
  latitude: text('latitude').notNull(),  // Stored as text, converted to number in app
  longitude: text('longitude').notNull(),
  state: text('state'),  // Two-letter state code
  workforceSize: integer('workforce_size'),
  openPositions: integer('open_positions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('factories_company_idx').on(table.companyId),
  stateIdx: index('factories_state_idx').on(table.state),
  nameIdx: index('factories_name_idx').on(table.name),
  // Note: For PostGIS, add spatial index via raw SQL migration
}));

export const factoriesRelations = relations(factories, ({ one, many }) => ({
  company: one(companies, {
    fields: [factories.companyId],
    references: [companies.id],
  }),
  factoryOccupations: many(factoryOccupations),
}));

// ============================================
// OCCUPATIONS
// ============================================

export const occupations = pgTable('occupations', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  onetCode: text('onet_code'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  titleIdx: uniqueIndex('occupations_title_idx').on(table.title),
  onetIdx: index('occupations_onet_idx').on(table.onetCode),
}));

export const occupationsRelations = relations(occupations, ({ many }) => ({
  factoryOccupations: many(factoryOccupations),
  occupationSkills: many(occupationSkills),
  aliases: many(occupationAliases),
}));

// ============================================
// SKILLS
// ============================================

export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex('skills_name_idx').on(table.name),
  categoryIdx: index('skills_category_idx').on(table.category),
}));

export const skillsRelations = relations(skills, ({ many }) => ({
  occupationSkills: many(occupationSkills),
  aliases: many(skillAliases),
}));

// ============================================
// JUNCTION: FACTORY_OCCUPATIONS
// ============================================

export const factoryOccupations = pgTable('factory_occupations', {
  factoryId: uuid('factory_id').notNull().references(() => factories.id, { onDelete: 'cascade' }),
  occupationId: uuid('occupation_id').notNull().references(() => occupations.id, { onDelete: 'cascade' }),
  headcount: integer('headcount'),
  avgSalaryMin: integer('avg_salary_min'),
  avgSalaryMax: integer('avg_salary_max'),
}, (table) => ({
  pk: primaryKey({ columns: [table.factoryId, table.occupationId] }),
  factoryIdx: index('factory_occupations_factory_idx').on(table.factoryId),
  occupationIdx: index('factory_occupations_occupation_idx').on(table.occupationId),
}));

export const factoryOccupationsRelations = relations(factoryOccupations, ({ one }) => ({
  factory: one(factories, {
    fields: [factoryOccupations.factoryId],
    references: [factories.id],
  }),
  occupation: one(occupations, {
    fields: [factoryOccupations.occupationId],
    references: [occupations.id],
  }),
}));

// ============================================
// JUNCTION: OCCUPATION_SKILLS
// ============================================

export const occupationSkills = pgTable('occupation_skills', {
  occupationId: uuid('occupation_id').notNull().references(() => occupations.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  importance: importanceEnum('importance').default('required'),
}, (table) => ({
  pk: primaryKey({ columns: [table.occupationId, table.skillId] }),
  occupationIdx: index('occupation_skills_occupation_idx').on(table.occupationId),
  skillIdx: index('occupation_skills_skill_idx').on(table.skillId),
}));

export const occupationSkillsRelations = relations(occupationSkills, ({ one }) => ({
  occupation: one(occupations, {
    fields: [occupationSkills.occupationId],
    references: [occupations.id],
  }),
  skill: one(skills, {
    fields: [occupationSkills.skillId],
    references: [skills.id],
  }),
}));

// ============================================
// ALIAS TABLES
// ============================================

export const occupationAliases = pgTable('occupation_aliases', {
  id: uuid('id').defaultRandom().primaryKey(),
  aliasText: text('alias_text').notNull(),
  canonicalOccupationId: uuid('canonical_occupation_id').notNull().references(() => occupations.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  aliasIdx: uniqueIndex('occupation_aliases_text_idx').on(table.aliasText),
}));

export const skillAliases = pgTable('skill_aliases', {
  id: uuid('id').defaultRandom().primaryKey(),
  aliasText: text('alias_text').notNull(),
  canonicalSkillId: uuid('canonical_skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  aliasIdx: uniqueIndex('skill_aliases_text_idx').on(table.aliasText),
}));

// ============================================
// IMPORT TRACKING
// ============================================

export const importBatches = pgTable('import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileName: text('file_name').notNull(),
  entityType: entityTypeEnum('entity_type').notNull(),
  totalRows: integer('total_rows').notNull(),
  createdCount: integer('created_count').default(0),
  updatedCount: integer('updated_count').default(0),
  skippedCount: integer('skipped_count').default(0),
  status: importStatusEnum('status').default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const errorQueue = pgTable('error_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'cascade' }),
  entityType: entityTypeEnum('entity_type').notNull(),
  sourceRowNumber: integer('source_row_number').notNull(),
  sourceRowData: text('source_row_data'),  // JSON string of original row
  errorType: errorTypeEnum('error_type').notNull(),
  fieldName: text('field_name'),
  originalValue: text('original_value'),
  suggestedValue: text('suggested_value'),
  status: errorStatusEnum('status').default('pending'),
  resolvedAt: timestamp('resolved_at'),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  batchIdx: index('error_queue_batch_idx').on(table.importBatchId),
  statusIdx: index('error_queue_status_idx').on(table.status),
}));
```

---

## TypeScript Type Definitions

### Shared Types (Frontend & Backend)

```typescript
// shared/types.ts

// ============================================
// ENTITY TYPES
// ============================================

export type EntityType = 'companies' | 'factories' | 'occupations' | 'skills';

export type Importance = 'required' | 'preferred' | 'nice_to_have';

// ============================================
// COMPANY
// ============================================

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  headquartersLat: number | null;
  headquartersLng: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyWithRelations extends Company {
  factories: FactorySummary[];
  factoryCount: number;
  totalWorkforce: number;
  totalOpenPositions: number;
}

export interface CompanySummary {
  id: string;
  name: string;
  industry: string | null;
  factoryCount: number;
  totalWorkforce: number;
}

// ============================================
// FACTORY
// ============================================

export interface Factory {
  id: string;
  companyId: string | null;
  name: string;
  specialization: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  state: string | null;
  workforceSize: number | null;
  openPositions: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FactoryWithRelations extends Factory {
  company: CompanySummary | null;
  occupations: OccupationAtFactory[];
  occupationCount: number;
  skillCount: number;
}

export interface FactorySummary {
  id: string;
  name: string;
  companyName: string | null;
  state: string | null;
  workforceSize: number | null;
  openPositions: number | null;
}

export interface OccupationAtFactory {
  id: string;
  title: string;
  headcount: number | null;
  avgSalaryMin: number | null;
  avgSalaryMax: number | null;
}

// ============================================
// OCCUPATION
// ============================================

export interface Occupation {
  id: string;
  title: string;
  description: string | null;
  onetCode: string | null;
  createdAt: Date;
}

export interface OccupationWithRelations extends Occupation {
  skills: SkillForOccupation[];
  factories: FactoryWithOccupation[];
  skillCount: number;
  factoryCount: number;
}

export interface OccupationSummary {
  id: string;
  title: string;
  skillCount: number;
  factoryCount: number;
}

export interface FactoryWithOccupation {
  id: string;
  name: string;
  companyName: string | null;
  state: string | null;
  headcount: number | null;
}

// ============================================
// SKILL
// ============================================

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  createdAt: Date;
}

export interface SkillWithRelations extends Skill {
  occupations: OccupationWithSkill[];
  occupationCount: number;
}

export interface SkillSummary {
  id: string;
  name: string;
  category: string | null;
  occupationCount: number;
}

export interface SkillForOccupation {
  id: string;
  name: string;
  category: string | null;
  importance: Importance;
}

export interface OccupationWithSkill {
  id: string;
  title: string;
  importance: Importance;
}

// ============================================
// STATE AGGREGATIONS
// ============================================

export interface StateSummary {
  code: string;
  name: string;
  factoryCount: number;
  totalWorkforce: number;
  totalOpenPositions: number;
}

export interface StateDetail extends StateSummary {
  topEmployers: FactorySummary[];
  largestFactories: FactorySummary[];
  industries: IndustryBreakdown[];
}

export interface IndustryBreakdown {
  name: string;
  factoryCount: number;
  workforce: number;
}

// ============================================
// GEOJSON
// ============================================

export interface FactoryGeoJSON {
  type: 'FeatureCollection';
  features: FactoryFeature[];
}

export interface FactoryFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];  // [longitude, latitude]
  };
  properties: {
    id: string;
    name: string;
    companyId: string | null;
    companyName: string | null;
    industry: string | null;
    state: string | null;
    workforceSize: number | null;
    openPositions: number | null;
  };
}

// ============================================
// SEARCH
// ============================================

export interface SearchResults {
  query: string;
  results: {
    companies: SearchResultSet<CompanySummary>;
    factories: SearchResultSet<FactorySummary>;
    occupations: SearchResultSet<OccupationSummary>;
    skills: SearchResultSet<SkillSummary>;
    states: SearchResultSet<StateSummary>;
  };
  totalCount: number;
  searchTimeMs: number;
}

export interface SearchResultSet<T> {
  count: number;
  items: (T & { matchScore: number })[];
}

// ============================================
// IMPORT
// ============================================

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ErrorStatus = 'pending' | 'resolved' | 'skipped';
export type ErrorType = 
  | 'missing_required'
  | 'duplicate_exact'
  | 'potential_alias'
  | 'unlinked_relationship'
  | 'invalid_format'
  | 'out_of_range';

export interface ParsedFile {
  fileId: string;
  fileName: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, unknown>[];
  sheets?: string[];  // For Excel files
}

export interface ColumnMapping {
  [sourceColumn: string]: string | null;  // null means ignore
}

export interface SuggestedMappings {
  mappings: ColumnMapping;
  unmappedColumns: string[];
  missingRequired: string[];
}

export interface ValidationResult {
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  errors: ValidationError[];
  potentialDuplicates: PotentialDuplicate[];
}

export interface ValidationError {
  row: number;
  errorType: ErrorType;
  field: string;
  value: unknown;
  suggestion: string | null;
}

export interface PotentialDuplicate {
  incomingRow: number;
  incomingValue: string;
  existingId: string;
  existingValue: string;
  confidence: number;
}

export interface ImportResult {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
  errorsQueued: number;
  durationMs: number;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  entityType: EntityType;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  status: ImportStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export interface ErrorQueueItem {
  id: string;
  importBatchId: string | null;
  entityType: EntityType;
  sourceRowNumber: number;
  sourceRowData: Record<string, unknown>;
  errorType: ErrorType;
  fieldName: string | null;
  originalValue: string | null;
  suggestedValue: string | null;
  status: ErrorStatus;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
}

// ============================================
// API RESPONSES
// ============================================

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  data: T[];
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// FILTER & SORT OPTIONS
// ============================================

export interface FactoryFilters {
  companies?: string[];
  industries?: string[];
  states?: string[];
  workforceMin?: number;
  workforceMax?: number;
  hasOpenPositions?: boolean;
}

export type CompanySortField = 'name' | 'factoryCount' | 'totalWorkforce';
export type FactorySortField = 'name' | 'workforceSize' | 'openPositions';
export type OccupationSortField = 'title' | 'factoryCount' | 'skillCount';
export type SkillSortField = 'name' | 'occupationCount' | 'category';

export type SortOrder = 'asc' | 'desc';
```

---

## State Reference Data

US state codes and names for the application.

```typescript
// shared/states.ts

export interface USState {
  code: string;
  name: string;
}

export const US_STATES: USState[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'PR', name: 'Puerto Rico' },
];

export const STATE_BY_CODE = Object.fromEntries(
  US_STATES.map(state => [state.code, state])
);

export const STATE_BY_NAME = Object.fromEntries(
  US_STATES.map(state => [state.name.toLowerCase(), state])
);
```

---

## Color Constants

Consistent color coding for entity types across the application.

```typescript
// shared/colors.ts

export const ENTITY_COLORS = {
  company: {
    primary: '#F59E0B',    // Amber-500
    light: '#FCD34D',      // Amber-300
    dark: '#B45309',       // Amber-700
    bg: 'rgba(245, 158, 11, 0.1)',
  },
  factory: {
    primary: '#60A5FA',    // Blue-400
    light: '#93C5FD',      // Blue-300
    dark: '#2563EB',       // Blue-600
    bg: 'rgba(96, 165, 250, 0.1)',
  },
  occupation: {
    primary: '#1E40AF',    // Blue-800
    light: '#3B82F6',      // Blue-500
    dark: '#1E3A8A',       // Blue-900
    bg: 'rgba(30, 64, 175, 0.1)',
  },
  skill: {
    primary: '#10B981',    // Emerald-500
    light: '#34D399',      // Emerald-400
    dark: '#047857',       // Emerald-700
    bg: 'rgba(16, 185, 129, 0.1)',
  },
  state: {
    primary: '#6366F1',    // Indigo-500
    light: '#818CF8',      // Indigo-400
    dark: '#4338CA',       // Indigo-700
    bg: 'rgba(99, 102, 241, 0.1)',
  },
} as const;

export const ENTITY_ICONS = {
  company: '🏢',
  factory: '🏭',
  occupation: '👔',
  skill: '🔧',
  state: '📍',
} as const;
```

---

## Validation Constants

```typescript
// shared/validation.ts

export const FIELD_LIMITS = {
  name: { min: 1, max: 255 },
  description: { max: 5000 },
  industry: { max: 100 },
  specialization: { max: 255 },
  onetCode: { pattern: /^\d{2}-\d{4}\.\d{2}$/ },  // e.g., "51-4041.00"
  stateCode: { pattern: /^[A-Z]{2}$/ },
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
  workforceSize: { min: 0, max: 10000000 },
  openPositions: { min: 0, max: 100000 },
} as const;

export const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  companies: ['name'],
  factories: ['name', 'latitude', 'longitude'],
  occupations: ['title'],
  skills: ['name'],
};

export const COLUMN_MAPPING_HINTS: Record<string, string[]> = {
  name: ['name', 'company_name', 'company', 'factory_name', 'facility', 'title', 'skill_name'],
  industry: ['industry', 'sector', 'naics', 'sic', 'business_type', 'type'],
  description: ['description', 'desc', 'about', 'summary', 'notes'],
  latitude: ['lat', 'latitude', 'y', 'lat_dd'],
  longitude: ['lng', 'lon', 'long', 'longitude', 'x', 'long_dd'],
  state: ['state', 'st', 'state_code', 'region'],
  workforceSize: ['workforce', 'employees', 'headcount', 'num_employees', 'worker_count', 'emp_count'],
  openPositions: ['openings', 'positions', 'jobs', 'open_positions', 'vacancies', 'hiring'],
  companyLink: ['company', 'parent', 'parent_company', 'owner', 'employer'],
  specialization: ['specialization', 'specialty', 'focus', 'product', 'product_line'],
  category: ['category', 'type', 'group', 'classification', 'skill_type'],
  onetCode: ['onet', 'onet_code', 'o_net', 'soc', 'soc_code'],
  title: ['title', 'job_title', 'occupation', 'position', 'role'],
};
```

---

## Migration Notes

### Initial Migration

The initial migration should create all tables, enums, and indexes defined above. For PostGIS support, include:

```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add spatial index on factories (after table creation)
CREATE INDEX factories_location_idx ON factories USING GIST (
  ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)
);
```

### Seed Data Requirements

For development and testing, seed data should include:

- 50+ companies across various industries
- 200+ factories spread across US states  
- 100+ occupations with realistic titles
- 300+ skills across categories (Technical, Safety, Soft Skills, Certifications)
- Realistic relationships between entities

See separate seed script specification for details.
