import { pgTable, uuid, text, integer, timestamp, pgEnum, index, uniqueIndex, primaryKey, varchar, jsonb, boolean, serial, smallint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

export const importanceEnum = pgEnum('importance', [
  'required',
  'preferred',
  'nice_to_have',
]);

export const importStatusEnum = pgEnum('import_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const errorStatusEnum = pgEnum('error_status', [
  'pending',
  'resolved',
  'skipped',
]);

export const errorTypeEnum = pgEnum('error_type', [
  'missing_required',
  'duplicate_exact',
  'potential_alias',
  'unlinked_relationship',
  'invalid_format',
  'out_of_range',
]);

export const entityTypeEnum = pgEnum('entity_type', [
  'companies',
  'factories',
  'occupations',
  'skills',
  'refs',
  'schools',
  'programs',
  'persons',
]);

// ============================================
// COMPANIES
// ============================================

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // Aliases: alternate names, DBAs, abbreviations (e.g., ["SpaceX", "Space Exploration Technologies"])
    aliases: text('aliases').array(),
    // What the company makes, in a few words; shown on its page and filtered on.
    industry: text('industry'),
    description: text('description'),
    headquartersLat: text('headquarters_lat'),
    headquartersLng: text('headquarters_lng'),
    // Web domain (e.g. "ti.com"), used to show the company's logo.
    domain: text('domain'),
    // A curated employer: lists and the map put these first.
    featured: boolean('featured').default(false).notNull(),
    // Short name for the company's page (/companies/tesla); unique when set.
    slug: text('slug'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('companies_name_idx').on(table.name),
    industryIdx: index('companies_industry_idx').on(table.industry),
    nameTrgmIdx: index('companies_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
    industryTrgmIdx: index('companies_industry_trgm_idx').using('gin', table.industry.op('gin_trgm_ops')),
  })
);

// ============================================
// FACTORIES
// ============================================

export const factories = pgTable(
  'factories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    specialization: text('specialization'),
    description: text('description'),
    latitude: text('latitude').notNull(),
    longitude: text('longitude').notNull(),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zipCode: varchar('zip_code', { length: 10 }),
    country: text('country'),
    workforceSize: integer('workforce_size'),
    openPositions: integer('open_positions'),
    // Industry classification: NAICS is a reference taxonomy, not primary UI
    primaryNaics: varchar('primary_naics', { length: 6 }),
    primaryNaicsDescription: text('primary_naics_description'),
    // Data provenance: how many sources attest this factory (denormalized for perf)
    sourceCount: integer('source_count').default(1).notNull(),
    // Pillar's match confidence at export time, 0-100
    confidence: integer('confidence').default(50).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('factories_company_idx').on(table.companyId),
    stateIdx: index('factories_state_idx').on(table.state),
    cityIdx: index('factories_city_idx').on(table.city),
    nameIdx: index('factories_name_idx').on(table.name),
    nameTrgmIdx: index('factories_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
    specializationIdx: index('factories_specialization_idx').on(table.specialization),
    specializationTrgmIdx: index('factories_specialization_trgm_idx').using('gin', table.specialization.op('gin_trgm_ops')),
    primaryNaicsIdx: index('factories_primary_naics_idx').on(table.primaryNaics),
  })
);

// ============================================
// OCCUPATIONS
// ============================================

export const occupations = pgTable(
  'occupations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    onetCode: text('onet_code'),
    // Whether the career's path of staged skills has been reviewed by a person:
    // null (no path yet), 'draft' (written, not reviewed) or 'approved'.
    pathStatus: text('path_status'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    titleIdx: uniqueIndex('occupations_title_idx').on(table.title),
    onetIdx: index('occupations_onet_idx').on(table.onetCode),
    titleTrgmIdx: index('occupations_title_trgm_idx').using('gin', table.title.op('gin_trgm_ops')),
  })
);

// ============================================
// SKILLS
// ============================================

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // The skill's group as shown and filtered on ("Welding & Fabrication").
    category: text('category'),
    description: text('description'),
    // Skill tree: self-referential parent for adjacency list pattern
    parentSkillId: uuid('parent_skill_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('skills_name_idx').on(table.name),
    nameTrgmIdx: index('skills_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
    categoryIdx: index('skills_category_idx').on(table.category),
    parentIdx: index('skills_parent_idx').on(table.parentSkillId),
  })
);

// ============================================
// JUNCTION: FACTORY_OCCUPATIONS
// ============================================

export const factoryOccupations = pgTable(
  'factory_occupations',
  {
    factoryId: uuid('factory_id')
      .notNull()
      .references(() => factories.id, { onDelete: 'cascade' }),
    occupationId: uuid('occupation_id')
      .notNull()
      .references(() => occupations.id, { onDelete: 'cascade' }),
    headcount: integer('headcount'),
    avgSalaryMin: integer('avg_salary_min'),
    avgSalaryMax: integer('avg_salary_max'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.factoryId, table.occupationId] }),
    factoryIdx: index('factory_occupations_factory_idx').on(table.factoryId),
    occupationIdx: index('factory_occupations_occupation_idx').on(
      table.occupationId
    ),
  })
);

// ============================================
// JUNCTION: OCCUPATION_SKILLS
// ============================================

export const occupationSkills = pgTable(
  'occupation_skills',
  {
    occupationId: uuid('occupation_id')
      .notNull()
      .references(() => occupations.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    importance: importanceEnum('importance').default('required'),
    // Where the skill sits on the career's path: 1 Introduction, 2 Fundamentals, 3 Advanced.
    stage: smallint('stage'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.occupationId, table.skillId] }),
    occupationIdx: index('occupation_skills_occupation_idx').on(
      table.occupationId
    ),
    skillIdx: index('occupation_skills_skill_idx').on(table.skillId),
  })
);

// ============================================
// ALIAS TABLES
// ============================================

export const occupationAliases = pgTable(
  'occupation_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aliasText: text('alias_text').notNull(),
    canonicalOccupationId: uuid('canonical_occupation_id')
      .notNull()
      .references(() => occupations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    aliasIdx: uniqueIndex('occupation_aliases_text_idx').on(table.aliasText),
  })
);

export const skillAliases = pgTable(
  'skill_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aliasText: text('alias_text').notNull(),
    canonicalSkillId: uuid('canonical_skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    aliasIdx: uniqueIndex('skill_aliases_text_idx').on(table.aliasText),
  })
);

// ============================================
// EXTERNAL REFERENCES (Flexible Key-Value)
// ============================================

export const externalReferences = pgTable(
  'external_references',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    source: text('source').notNull(), // e.g., "O*NET", "NAICS", "BLS", "LinkedIn"
    externalId: text('external_id').notNull(), // e.g., "51-4011.00", "332911"
    url: text('url'), // Optional URL to the source
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    entityIdx: index('external_refs_entity_idx').on(table.entityType, table.entityId),
    sourceIdx: index('external_refs_source_idx').on(table.source),
    externalIdIdx: index('external_refs_external_id_idx').on(table.externalId),
  })
);

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

export const errorQueue = pgTable(
  'error_queue',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'cascade',
    }),
    entityType: entityTypeEnum('entity_type').notNull(),
    sourceRowNumber: integer('source_row_number').notNull(),
    sourceRowData: text('source_row_data'),
    errorType: errorTypeEnum('error_type').notNull(),
    fieldName: text('field_name'),
    originalValue: text('original_value'),
    suggestedValue: text('suggested_value'),
    status: errorStatusEnum('status').default('pending'),
    resolvedAt: timestamp('resolved_at'),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    batchIdx: index('error_queue_batch_idx').on(table.importBatchId),
    statusIdx: index('error_queue_status_idx').on(table.status),
  })
);

// ============================================
// IMPORT_UPLOADS (parsed upload payloads awaiting validate/execute)
// Replaces the old in-process Map so the multi-step import flow survives
// serverless instances that don't share memory. Rows are short-lived.
// ============================================

export const importUploads = pgTable('import_uploads', {
  id: uuid('id').primaryKey(),
  fileName: text('file_name').notNull(),
  rowCount: integer('row_count').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================
// FACTORY_REVIEW (manual review queue fed by scripts/enrich-naics.mjs)
// A factory lands here when EPA has no NAICS for it, or only a
// non-manufacturing one. Resolution: 'keep' | 'quarantine' | 'not_a_factory'.
// ============================================

export const factoryReview = pgTable('factory_review', {
  factoryId: uuid('factory_id').primaryKey().references(() => factories.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  naics: text('naics'),
  naicsAll: text('naics_all'),
  sicAll: text('sic_all'),
  epaName: text('epa_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  resolution: text('resolution'),
});

// Factories removed from the live table but kept for audit/restore.
export const factoriesQuarantine = pgTable('factories_quarantine', {
  id: uuid('id').primaryKey(),
  reason: text('reason').notNull(),
  quarantinedAt: timestamp('quarantined_at').defaultNow().notNull(),
  row: jsonb('row').notNull(),
  externalRefs: jsonb('external_refs'),
  occupationLinks: jsonb('occupation_links'),
});

// ============================================
// ACCOUNTS (migration 0010)
// A user is one account. Roles are relationships, not account types:
// an employer is a user with an active company membership; an admin has isAdmin.
// ============================================

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(), // stored lower-cased
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    homeZip: varchar('home_zip', { length: 10 }),
    about: text('about'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
  })
);

export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(), // sha256 of the cookie value
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => ({
    userIdx: index('sessions_user_idx').on(table.userId),
  })
);

export const companyMembers = pgTable(
  'company_members',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(), // 'owner' | 'member'
    status: text('status').default('requested').notNull(), // 'requested' | 'active'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.companyId, table.userId] }),
    userIdx: index('company_members_user_idx').on(table.userId),
  })
);

// ============================================
// JOBS AND APPLICATIONS (migration 0010)
// A job is one opening for one career (occupation) at one factory.
// ============================================

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serial: serial('serial').notNull(), // human-readable job number
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    factoryId: uuid('factory_id')
      .notNull()
      .references(() => factories.id, { onDelete: 'cascade' }),
    occupationId: uuid('occupation_id')
      .notNull()
      .references(() => occupations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    employmentType: text('employment_type').default('full-time').notNull(),
    shift: text('shift'),
    payMin: integer('pay_min'), // cents
    payMax: integer('pay_max'), // cents
    payPeriod: text('pay_period').default('hour').notNull(), // 'hour' | 'year'
    applyUrl: text('apply_url'), // set = apply on the company's own site
    status: text('status').default('open').notNull(), // 'draft' | 'open' | 'closed'
    closedReason: text('closed_reason'),
    postedAt: timestamp('posted_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    serialIdx: uniqueIndex('jobs_serial_idx').on(table.serial),
    companyIdx: index('jobs_company_idx').on(table.companyId),
    factoryIdx: index('jobs_factory_idx').on(table.factoryId),
    occupationIdx: index('jobs_occupation_idx').on(table.occupationId),
    statusIdx: index('jobs_status_idx').on(table.status),
  })
);

export const jobSkills = pgTable(
  'job_skills',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    required: boolean('required').default(true).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.jobId, table.skillId] }),
  })
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // applied | reviewing | interview | offer | hired | declined | withdrawn
    status: text('status').default('applied').notNull(),
    note: text('note'),
    employerNote: text('employer_note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    statusChangedAt: timestamp('status_changed_at').defaultNow().notNull(),
  },
  (table) => ({
    jobUserIdx: uniqueIndex('applications_job_user_idx').on(table.jobId, table.userId),
    userIdx: index('applications_user_idx').on(table.userId),
  })
);

// ============================================
// A PERSON'S OWN SKILLS AND GOALS (migration 0010)
// ============================================

export const userSkills = pgTable(
  'user_skills',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    status: text('status').default('held').notNull(), // 'learning' | 'held'
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.skillId] }),
  })
);

export const userGoals = pgTable(
  'user_goals',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    occupationId: uuid('occupation_id')
      .notNull()
      .references(() => occupations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.occupationId] }),
  })
);

// ============================================
// INVITES (migration 0015)
// ============================================

// A one-time sign-up link for an email address. `role` is 'user' | 'employer'
// | 'admin'; an employer invite names its company. Only the token's sha256 is
// stored. Pending means not accepted and not expired; one pending per email.
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(), // stored lower-cased
    role: text('role').notNull(), // 'user' | 'employer' | 'admin' (checked in SQL)
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    pendingEmailIdx: uniqueIndex('invites_pending_email_idx')
      .on(table.email)
      .where(sql`${table.acceptedAt} IS NULL`),
  })
);

// ============================================
// PASSWORD RESETS (migration 0020)
// ============================================

// A one-time link an admin creates for a person who cannot sign in. Using it
// sets a new password and ends all of that person's sessions. Only the
// token's sha256 is stored. Usable means not used and not expired; a new link
// replaces the person's unused one.
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('password_resets_user_idx').on(table.userId),
  })
);

// Careers typical of an industry (a NAICS manufacturing subsector, named as
// factories.primary_naics_description names it). Curated in
// data/careers/industries.json. It says what kind of work an industry has; it
// does not say that a given plant employs it (factory_occupations says that).
export const industryOccupations = pgTable(
  'industry_occupations',
  {
    industry: text('industry').notNull(),
    occupationId: uuid('occupation_id')
      .notNull()
      .references(() => occupations.id, { onDelete: 'cascade' }),
    // Order within the industry: its own careers first, then those found everywhere.
    rank: integer('rank').notNull(),
    // True for careers found in plants of every industry (maintenance, controls, quality).
    common: boolean('common').default(false).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.industry, table.occupationId] }),
    occupationIdx: index('industry_occupations_occupation_idx').on(table.occupationId),
  })
);
