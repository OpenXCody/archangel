import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  varchar,
  jsonb,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
// NEW ENUMS FOR SCHEMA EXPANSION
// ============================================

export const refTypeEnum = pgEnum('ref_type', [
  'material',
  'machine',
  'standard',
  'process',
  'certification',
]);

export const proficiencyLevelEnum = pgEnum('proficiency_level', [
  'awareness',
  'novice',
  'competent',
  'proficient',
  'expert',
]);

// ============================================
// STATES (Reference Table)
// ============================================

export const states = pgTable(
  'states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 2 }).notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: uniqueIndex('states_code_idx').on(table.code),
    nameIdx: uniqueIndex('states_name_idx').on(table.name),
  })
);

export const statesRelations = relations(states, ({ many }) => ({
  factories: many(factories),
  schools: many(schools),
}));

// ============================================
// INDUSTRIES (Controlled Vocabulary)
// ============================================

export const industries = pgTable(
  'industries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('industries_name_idx').on(table.name),
  })
);

export const industriesRelations = relations(industries, ({ many }) => ({
  companyIndustries: many(companyIndustries),
}));

// ============================================
// SKILL CATEGORIES (Controlled Vocabulary)
// ============================================

export const skillCategories = pgTable(
  'skill_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('skill_categories_name_idx').on(table.name),
  })
);

export const skillCategoriesRelations = relations(skillCategories, ({ many }) => ({
  skills: many(skills),
}));

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
    industry: text('industry'), // Legacy field, kept for backward compatibility
    description: text('description'),
    headquartersLat: text('headquarters_lat'),
    headquartersLng: text('headquarters_lng'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('companies_name_idx').on(table.name),
    industryIdx: index('companies_industry_idx').on(table.industry),
  })
);

export const companiesRelations = relations(companies, ({ many }) => ({
  factories: many(factories),
  companyIndustries: many(companyIndustries),
  employees: many(persons),
}));

// ============================================
// COMPANY_INDUSTRIES (Junction Table)
// ============================================

export const companyIndustries = pgTable(
  'company_industries',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    industryId: uuid('industry_id')
      .notNull()
      .references(() => industries.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.companyId, table.industryId] }),
    companyIdx: index('company_industries_company_idx').on(table.companyId),
    industryIdx: index('company_industries_industry_idx').on(table.industryId),
  })
);

export const companyIndustriesRelations = relations(companyIndustries, ({ one }) => ({
  company: one(companies, {
    fields: [companyIndustries.companyId],
    references: [companies.id],
  }),
  industry: one(industries, {
    fields: [companyIndustries.industryId],
    references: [industries.id],
  }),
}));

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
    stateId: uuid('state_id').references(() => states.id),
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
    stateIdIdx: index('factories_state_id_idx').on(table.stateId),
    cityIdx: index('factories_city_idx').on(table.city),
    nameIdx: index('factories_name_idx').on(table.name),
    specializationIdx: index('factories_specialization_idx').on(table.specialization),
    primaryNaicsIdx: index('factories_primary_naics_idx').on(table.primaryNaics),
  })
);

export const factoriesRelations = relations(factories, ({ one, many }) => ({
  company: one(companies, {
    fields: [factories.companyId],
    references: [companies.id],
  }),
  stateRef: one(states, {
    fields: [factories.stateId],
    references: [states.id],
  }),
  factoryOccupations: many(factoryOccupations),
}));

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
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    titleIdx: uniqueIndex('occupations_title_idx').on(table.title),
    onetIdx: index('occupations_onet_idx').on(table.onetCode),
  })
);

export const occupationsRelations = relations(occupations, ({ many }) => ({
  factoryOccupations: many(factoryOccupations),
  occupationSkills: many(occupationSkills),
  aliases: many(occupationAliases),
}));

// ============================================
// SKILLS
// ============================================

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    category: text('category'), // Legacy field - do not touch
    categoryId: uuid('category_id').references(() => skillCategories.id), // Legacy - do not touch
    description: text('description'),
    // Skill tree: self-referential parent for adjacency list pattern
    parentSkillId: uuid('parent_skill_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('skills_name_idx').on(table.name),
    categoryIdx: index('skills_category_idx').on(table.category),
    categoryIdIdx: index('skills_category_id_idx').on(table.categoryId),
    parentIdx: index('skills_parent_idx').on(table.parentSkillId),
  })
);

export const skillsRelations = relations(skills, ({ one, many }) => ({
  categoryRef: one(skillCategories, {
    fields: [skills.categoryId],
    references: [skillCategories.id],
  }),
  // Skill tree self-references
  parent: one(skills, {
    fields: [skills.parentSkillId],
    references: [skills.id],
    relationName: 'skillTree',
  }),
  children: many(skills, { relationName: 'skillTree' }),
  // Existing relations
  occupationSkills: many(occupationSkills),
  aliases: many(skillAliases),
  // New relations for schema expansion
  programSkills: many(programSkills),
  skillRefs: many(skillRefs),
}));

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

export const factoryOccupationsRelations = relations(
  factoryOccupations,
  ({ one }) => ({
    factory: one(factories, {
      fields: [factoryOccupations.factoryId],
      references: [factories.id],
    }),
    occupation: one(occupations, {
      fields: [factoryOccupations.occupationId],
      references: [occupations.id],
    }),
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
  },
  (table) => ({
    pk: primaryKey({ columns: [table.occupationId, table.skillId] }),
    occupationIdx: index('occupation_skills_occupation_idx').on(
      table.occupationId
    ),
    skillIdx: index('occupation_skills_skill_idx').on(table.skillId),
  })
);

export const occupationSkillsRelations = relations(
  occupationSkills,
  ({ one }) => ({
    occupation: one(occupations, {
      fields: [occupationSkills.occupationId],
      references: [occupations.id],
    }),
    skill: one(skills, {
      fields: [occupationSkills.skillId],
      references: [skills.id],
    }),
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

export const occupationAliasesRelations = relations(
  occupationAliases,
  ({ one }) => ({
    occupation: one(occupations, {
      fields: [occupationAliases.canonicalOccupationId],
      references: [occupations.id],
    }),
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

export const skillAliasesRelations = relations(skillAliases, ({ one }) => ({
  skill: one(skills, {
    fields: [skillAliases.canonicalSkillId],
    references: [skills.id],
  }),
}));

// ============================================
// JUNCTION: SKILL_RELATIONS (Related Skills)
// ============================================

export const skillRelations = pgTable(
  'skill_relations',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    relatedSkillId: uuid('related_skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.skillId, table.relatedSkillId] }),
    skillIdx: index('skill_relations_skill_idx').on(table.skillId),
    relatedIdx: index('skill_relations_related_idx').on(table.relatedSkillId),
  })
);

export const skillRelationsRelations = relations(skillRelations, ({ one }) => ({
  skill: one(skills, {
    fields: [skillRelations.skillId],
    references: [skills.id],
  }),
  relatedSkill: one(skills, {
    fields: [skillRelations.relatedSkillId],
    references: [skills.id],
  }),
}));

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

export const importBatchesRelations = relations(importBatches, ({ many }) => ({
  errors: many(errorQueue),
}));

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

export const errorQueueRelations = relations(errorQueue, ({ one }) => ({
  importBatch: one(importBatches, {
    fields: [errorQueue.importBatchId],
    references: [importBatches.id],
  }),
}));

// ============================================
// REFS (Elements Library)
// ============================================

export const refs = pgTable(
  'refs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: refTypeEnum('type').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    properties: jsonb('properties'), // Type-dependent key/value spec table
    manufacturer: text('manufacturer'), // For machines; null for other types
    tags: text('tags').array(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    typeNameIdx: uniqueIndex('refs_type_name_idx').on(table.type, table.name),
    typeIdx: index('refs_type_idx').on(table.type),
    nameIdx: index('refs_name_idx').on(table.name),
  })
);

export const refsRelations = relations(refs, ({ many }) => ({
  aliases: many(refAliases),
  skillRefs: many(skillRefs),
}));

// ============================================
// REF_ALIASES
// ============================================

export const refAliases = pgTable(
  'ref_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aliasText: text('alias_text').notNull(),
    canonicalRefId: uuid('canonical_ref_id')
      .notNull()
      .references(() => refs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    aliasIdx: uniqueIndex('ref_aliases_text_idx').on(table.aliasText),
  })
);

export const refAliasesRelations = relations(refAliases, ({ one }) => ({
  ref: one(refs, {
    fields: [refAliases.canonicalRefId],
    references: [refs.id],
  }),
}));

// ============================================
// JUNCTION: SKILL_REFS (M:N skills ↔ refs)
// ============================================

export const skillRefs = pgTable(
  'skill_refs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    refId: uuid('ref_id')
      .notNull()
      .references(() => refs.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.skillId, table.refId] }),
    skillIdx: index('skill_refs_skill_idx').on(table.skillId),
    refIdx: index('skill_refs_ref_idx').on(table.refId),
  })
);

export const skillRefsRelations = relations(skillRefs, ({ one }) => ({
  skill: one(skills, {
    fields: [skillRefs.skillId],
    references: [skills.id],
  }),
  ref: one(refs, {
    fields: [skillRefs.refId],
    references: [refs.id],
  }),
}));

// ============================================
// SCHOOLS (mirrors Companies)
// ============================================

export const schools = pgTable(
  'schools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    headquartersLat: text('headquarters_lat'),
    headquartersLng: text('headquarters_lng'),
    state: text('state'),
    stateId: uuid('state_id').references(() => states.id),
    schoolType: text('school_type'), // 'university' | 'community_college' | 'technical' | 'apprenticeship' | 'online' | 'other'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('schools_name_idx').on(table.name),
    stateIdx: index('schools_state_idx').on(table.state),
  })
);

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  stateRef: one(states, {
    fields: [schools.stateId],
    references: [states.id],
  }),
  programs: many(programs),
}));

// ============================================
// PROGRAMS (mirrors Occupations)
// ============================================

export const programs = pgTable(
  'programs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
    title: text('title').notNull(), // 'title' to mirror occupations
    description: text('description'),
    cipCode: text('cip_code'), // Classification of Instructional Programs code
    credentialType: text('credential_type'), // 'degree' | 'certificate' | 'apprenticeship' | 'bootcamp' | 'course' | 'other'
    durationHours: integer('duration_hours'), // Nominal program length
    isOpenSource: boolean('is_open_source').default(false), // Flag for open-source/public curricula
    curriculumUrl: text('curriculum_url'), // Link to syllabus or curriculum doc
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    schoolIdx: index('programs_school_idx').on(table.schoolId),
    cipIdx: index('programs_cip_idx').on(table.cipCode),
    titleIdx: index('programs_title_idx').on(table.title),
  })
);

export const programsRelations = relations(programs, ({ one, many }) => ({
  school: one(schools, {
    fields: [programs.schoolId],
    references: [schools.id],
  }),
  programSkills: many(programSkills),
  aliases: many(programAliases),
}));

// ============================================
// JUNCTION: PROGRAM_SKILLS (structurally identical to occupation_skills)
// ============================================

export const programSkills = pgTable(
  'program_skills',
  {
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    importance: importanceEnum('importance').default('required'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.programId, table.skillId] }),
    programIdx: index('program_skills_program_idx').on(table.programId),
    skillIdx: index('program_skills_skill_idx').on(table.skillId),
  })
);

export const programSkillsRelations = relations(programSkills, ({ one }) => ({
  program: one(programs, {
    fields: [programSkills.programId],
    references: [programs.id],
  }),
  skill: one(skills, {
    fields: [programSkills.skillId],
    references: [skills.id],
  }),
}));

// ============================================
// PROGRAM_ALIASES (mirrors occupation_aliases)
// ============================================

export const programAliases = pgTable(
  'program_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aliasText: text('alias_text').notNull(),
    canonicalProgramId: uuid('canonical_program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    aliasIdx: uniqueIndex('program_aliases_text_idx').on(table.aliasText),
  })
);

export const programAliasesRelations = relations(programAliases, ({ one }) => ({
  program: one(programs, {
    fields: [programAliases.canonicalProgramId],
    references: [programs.id],
  }),
}));

// ============================================
// PERSONS (schema only, no UI this pass)
// ============================================

export const persons = pgTable(
  'persons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    linkedinUrl: text('linkedin_url'),
    currentTitle: text('current_title'),
    currentEmployerId: uuid('current_employer_id').references(() => companies.id),
    locationState: text('location_state'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }
);

export const personsRelations = relations(persons, ({ one, many }) => ({
  currentEmployer: one(companies, {
    fields: [persons.currentEmployerId],
    references: [companies.id],
  }),
  proficiencies: many(personSkillRefs),
}));

// ============================================
// PERSON_SKILL_REFS (proficiency records, schema only)
// ============================================

export const personSkillRefs = pgTable(
  'person_skill_refs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    machineRefId: uuid('machine_ref_id').references(() => refs.id, { onDelete: 'set null' }),
    materialRefId: uuid('material_ref_id').references(() => refs.id, { onDelete: 'set null' }),
    level: proficiencyLevelEnum('level').default('competent'),
    yearsExperience: integer('years_experience'),
    verifiedAt: timestamp('verified_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    personIdx: index('person_skill_refs_person_idx').on(table.personId),
    skillIdx: index('person_skill_refs_skill_idx').on(table.skillId),
    machineIdx: index('person_skill_refs_machine_idx').on(table.machineRefId),
  })
);

export const personSkillRefsRelations = relations(personSkillRefs, ({ one }) => ({
  person: one(persons, {
    fields: [personSkillRefs.personId],
    references: [persons.id],
  }),
  skill: one(skills, {
    fields: [personSkillRefs.skillId],
    references: [skills.id],
  }),
  machineRef: one(refs, {
    fields: [personSkillRefs.machineRefId],
    references: [refs.id],
  }),
  materialRef: one(refs, {
    fields: [personSkillRefs.materialRefId],
    references: [refs.id],
  }),
}));

// ============================================
// ENTITY_LINKS (polymorphic external links)
// ============================================

export const entityLinks = pgTable(
  'entity_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    label: text('label').notNull(), // "Datasheet", "Wikipedia", "YouTube Tutorial"
    url: text('url').notNull(),
    linkType: text('link_type'), // 'documentation' | 'reference' | 'video' | 'course' | 'official' | 'other'
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    entityIdx: index('entity_links_entity_idx').on(table.entityType, table.entityId),
  })
);
