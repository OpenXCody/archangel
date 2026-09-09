CREATE TABLE IF NOT EXISTS "factories_quarantine" (
  "id" uuid PRIMARY KEY,
  "reason" text NOT NULL,
  "quarantined_at" timestamp DEFAULT now() NOT NULL,
  "row" jsonb NOT NULL,
  "external_refs" jsonb,
  "occupation_links" jsonb
);
CREATE TABLE IF NOT EXISTS "factory_review" (
  "factory_id" uuid PRIMARY KEY REFERENCES "factories"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "naics" text, "naics_all" text, "sic_all" text, "epa_name" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "resolution" text
);
