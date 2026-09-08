CREATE TABLE IF NOT EXISTS "import_uploads" (
  "id" uuid PRIMARY KEY,
  "file_name" text NOT NULL,
  "row_count" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
