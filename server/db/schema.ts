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

export const entityTypeEnum = pgEnum('entity_type', [
  'companies',
  'factories',
  'occupations',
  'skills',
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
    // Migration 0030. The company this one is part of (Bell is part of Textron), and where its headquarters are.
    parentCompanyId: uuid('parent_company_id'),
    headquartersCity: text('headquarters_city'),
    headquartersState: text('headquarters_state'),
    headquartersCountry: text('headquarters_country'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('companies_name_idx').on(table.name),
    // Partial indexes, as migrations 0012 and 0014 made them.
    featuredIdx: index('companies_featured_idx').on(table.featured).where(sql`${table.featured}`),
    slugKey: uniqueIndex('companies_slug_key').on(table.slug).where(sql`${table.slug} IS NOT NULL`),
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
    // Migration 0030. workforceSize is the people working at the site; these say what
    // year that figure is for, where it is stated, and anything to know about it
    // ("includes contractors").
    workforceYear: smallint('workforce_year'),
    workforceSource: text('workforce_source'),
    workforceNote: text('workforce_note'),
    // One line on what is made there.
    products: text('products'),
    // The year production started.
    openedYear: smallint('opened_year'),
    // 'operating' | 'under construction'
    status: text('status').default('operating').notNull(),
    // The plant's facts were written from sources (a research file, or an admin), not only a facility list.
    curated: boolean('curated').default(false).notNull(),
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
    // The name of the skill's domain, written by the taxonomy migration (0042).
    // Kept for a deployment that still reads it; nothing here does. A skill's
    // place is `groupSlug`.
    category: text('category'),
    // The skill group it is in, which fixes its domain (skill_groups).
    groupSlug: text('group_slug').references(() => skillGroups.slug, { onUpdate: 'cascade' }),
    // 1 Fundamentals, 2 Intermediate, 3 Advanced (shared/skillLevels.ts): one
    // level, the same in every career that uses the skill.
    level: smallint('level'),
    // Its place in its group as data/skills/taxonomy.json orders it; a skill
    // added by hand has none and sorts after the rest of its level.
    groupPosition: integer('group_position'),
    // What the skill is and what a person who has it can do.
    description: text('description'),
    // How it is usually learned or shown (on the job, a course, a named credential).
    howLearned: text('how_learned'),
    // The tools, machines or software it is done with: a short list.
    tools: text('tools').array(),
    // A parent skill, from the skill tree the product no longer shows. Merges
    // and cleanups keep it consistent, and GET /api/skills still returns it.
    parentSkillId: uuid('parent_skill_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('skills_name_idx').on(table.name),
    nameTrgmIdx: index('skills_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
    categoryIdx: index('skills_category_idx').on(table.category),
    parentIdx: index('skills_parent_idx').on(table.parentSkillId),
    groupIdx: index('skills_group_idx').on(table.groupSlug),
  })
);

// ============================================
// SKILL DOMAINS AND GROUPS (the taxonomy)
// ============================================
// Curated in data/skills/taxonomy.json and loaded by a generated migration
// (scripts/build-taxonomy-sql.mjs, 0042). A domain is a department a large
// manufacturer has; a group is a named set of skills inside one domain.
// `position` is the order they are shown in.

export const skillDomains = pgTable('skill_domains', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  position: integer('position').notNull(),
});

export const skillGroups = pgTable(
  'skill_groups',
  {
    slug: text('slug').primaryKey(),
    domainSlug: text('domain_slug')
      .notNull()
      .references(() => skillDomains.slug, { onUpdate: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    position: integer('position').notNull(),
  },
  (table) => ({
    domainIdx: index('skill_groups_domain_idx').on(table.domainSlug),
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
    // Always the skill's level (skills.level). The database keeps it so: a
    // trigger sets it on every write to this table, and another moves it when
    // a skill's level changes (migration 0042). Whatever is written here is
    // replaced.
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

/**
 * A skill's makes: the named equipment and software it is run on ("Haas",
 * "Studio 5000"), in the order they are shown (migration 0050, loaded from
 * data/skills/makes.json). One name per skill in any letter case. A make is a
 * leaf beyond the skill and never replaces it.
 */
export const skillMakes = pgTable(
  'skill_makes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // In the database the index is on lower(name); (skill_id, id) is unique too, for user_skill_makes.
    nameIdx: uniqueIndex('skill_makes_name_idx').on(table.skillId, sql`lower(${table.name})`),
  })
);

// ============================================
// EXTERNAL REFERENCES (Flexible Key-Value)
// Where a record came from. A plant from the EPA's registry has source
// 'EPA_ECHO' and the registry id as externalId. A curated company or plant has
// one row per source address: source 'CURATED', externalId the research file's
// name (or 'admin'), url the address; kept once per record (migration 0030).
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
// COMPANY HEADCOUNT BY STATE (migration 0030)
// How many people a company employs in one state, when a source says so.
// ============================================

export const companyStateHeadcounts = pgTable(
  'company_state_headcounts',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    people: integer('people').notNull(),
    year: smallint('year'),
    source: text('source'),
    note: text('note'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.companyId, table.state] }),
  })
);

// What a bulk load decided, one line per decision (migration 0030). Written by
// the migrations scripts/build-employers-sql.mjs generates; read in SQL.
export const loadLog = pgTable('load_log', {
  id: serial('id').primaryKey(),
  runAt: timestamp('run_at', { withTimezone: true }).defaultNow().notNull(),
  load: text('load').notNull(),
  kind: text('kind').notNull(),
  action: text('action').notNull(),
  look: boolean('look').default(false).notNull(),
  company: text('company'),
  plant: text('plant'),
  detail: text('detail'),
  metres: integer('metres'),
});

// ============================================
// FACTORY_REVIEW (written by scripts/enrich-naics.mjs)
// A factory lands here when EPA has no NAICS for it, or only a
// non-manufacturing one. Resolution: 'keep' | 'quarantine' | 'not_a_factory'.
// There is no screen for it: rows are read and resolved in SQL.
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
    // Migration 0024. Notice emails (applications, company access) can be turned off;
    // the *_seen_at columns are when the person last opened the page that shows that news.
    emailNotices: boolean('email_notices').default(true).notNull(),
    applicationsSeenAt: timestamp('applications_seen_at', { withTimezone: true }),
    applicantsSeenAt: timestamp('applicants_seen_at', { withTimezone: true }),
    accessSeenAt: timestamp('access_seen_at', { withTimezone: true }),
    // Migration 0025. When the person became an admin; the longest-standing admin is the first admin.
    adminSince: timestamp('admin_since', { withTimezone: true }),
    // Migration 0034. What the person said the account is for: 'work' or 'hire'; null when they have not said (server/lib/purpose.ts).
    purpose: text('purpose'),
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
    status: text('status').default('requested').notNull(), // 'requested' | 'active' | 'declined'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Migration 0024: when an admin approved or declined the request, and who.
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
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
    skillIdx: index('job_skills_skill_idx').on(table.skillId),
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
    skillIdx: index('user_skills_skill_idx').on(table.skillId),
  })
);

/**
 * The makes a person marked for a skill on their list (migration 0050). The
 * database ties each row to the person's holding of the skill, (user_id,
 * skill_id) in user_skills, and to a make of that skill, (skill_id, make_id)
 * in skill_makes, both ON DELETE CASCADE: taking the skill off the list takes
 * its makes with it, and a mark can only be for one of that skill's makes.
 */
export const userSkillMakes = pgTable(
  'user_skill_makes',
  {
    userId: uuid('user_id').notNull(),
    skillId: uuid('skill_id').notNull(),
    makeId: uuid('make_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.makeId] }),
    holdingIdx: index('user_skill_makes_holding_idx').on(table.userId, table.skillId),
    makeIdx: index('user_skill_makes_make_idx').on(table.skillId, table.makeId),
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
    occupationIdx: index('user_goals_occupation_idx').on(table.occupationId),
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

// ============================================
// NOTICES (migration 0024)
// ============================================

// The history of an application: one row when it is made, one for every stage
// the company moves it to, one when the applicant withdraws.
export const applicationEvents = pgTable(
  'application_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
    // Who did it; null when that is not known or the person is gone.
    byUser: uuid('by_user').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    applicationIdx: index('application_events_application_idx').on(table.applicationId, table.at),
  })
);

// Keeps notice emails from flooding anyone: one row per thing being limited,
// with when its current window began and how many were sent in it
// (see server/lib/notices.ts).
export const noticeLog = pgTable('notice_log', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
  count: integer('count').default(1).notNull(),
  // Only so the row goes when the person or the job does.
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
});

// ============================================
// COMPANY REQUESTS (migration 0026)
// ============================================

// A person asks for a company that is not in the data to be added, or a member
// asks for a missing plant of their company (`companyId` is then set). An
// admin answers it (see server/routes/companyRequests.ts).
export const companyRequests = pgTable(
  'company_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Set when the request is for a plant of a company already in the data.
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    website: text('website'),
    place: text('place').notNull(),
    status: text('status').default('requested').notNull(), // 'requested' | 'added' | 'declined'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    // The company the person was given access to when the request was met.
    addedCompanyId: uuid('added_company_id').references(() => companies.id, { onDelete: 'set null' }),
  },
  (table) => ({
    userIdx: index('company_requests_user_idx').on(table.userId),
    statusIdx: index('company_requests_status_idx').on(table.status),
  })
);

// ============================================
// AUDIT LOG (migration 0025)
// ============================================

// One row for every change an admin makes. `kind` is what was changed
// ('company' | 'factory' | 'career' | 'skill' | 'person' | 'access' |
// 'invite') and `recordId` which one; both names are kept as text so a line
// still reads after the record or the admin is gone. `detail` holds a short
// before and after (see server/lib/audit.ts).
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    kind: text('kind').notNull(),
    recordId: uuid('record_id'),
    recordName: text('record_name').notNull(),
    action: text('action').notNull(),
    detail: jsonb('detail'),
  },
  (table) => ({
    atIdx: index('audit_log_at_idx').on(table.at),
    recordIdx: index('audit_log_record_idx').on(table.kind, table.recordId, table.at),
  })
);

// ============================================
// INDUSTRIES (migrations 0035, 0036)
// ============================================

// What each of the 21 manufacturing industries makes, in one sentence.
// Curated in data/industries/industries.json. `name` is the title a plant
// carries in factories.primary_naics_description; the page address (slug)
// lives with the list in shared/industry.ts.
export const industryProfiles = pgTable(
  'industry_profiles',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    summary: text('summary').notNull(),
  },
  (table) => ({
    nameKey: uniqueIndex('industry_profiles_name_key').on(table.name),
  })
);

// Official statistics by industry and place (scripts/ingest/qcew.mjs), one
// row per year. `state` is 'US' for the nation or a two-letter code;
// `industryCode` is a NAICS subsector, or '31-33' for manufacturing as a
// whole. A figure the source withheld is null, never zero.
export const industryStats = pgTable(
  'industry_stats',
  {
    state: text('state').notNull(),
    industryCode: text('industry_code').notNull(),
    year: integer('year').notNull(),
    establishments: integer('establishments'),
    employment: integer('employment'),
    avgAnnualPay: integer('avg_annual_pay'),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.state, table.industryCode, table.year] }),
    industryIdx: index('industry_stats_industry_idx').on(table.industryCode, table.year),
  })
);
