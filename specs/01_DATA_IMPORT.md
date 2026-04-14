# Data Import Page Specification

## Overview

**Route**: `/data/import`

**Purpose**: Enable administrators to upload raw data files from various sources (BLS, O*NET, state workforce databases, company scrapers) and transform them into clean, linked records in the Archangel database. The system handles messy inputs, suggests corrections, flags errors for manual resolution, and allows users to confirm before committing data.

**Access Control**: This page resides under the `/data/*` route group, which will be restricted to admin users in production. For MVP, accessible to all users but architecturally isolated from the read-only user-facing application.

**Principle**: This is a write-path tool. The user-facing application (`/map`, `/explore`, `/search`) will be read-only with no CRUD operations exposed.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Industry classification | Free-text only (MVP) | Avoid premature complexity; NAICS/SIC can be added as reference data later |
| Alias dictionary | Empty at start | Build organically through imports; avoid scope creep |
| Unlinked entities | Flag as error, require manual resolution | Maintains data integrity; no auto-creation of parent records |
| Batch size | 100,000 entities | Sufficient for state-level data; reasonable for browser performance |
| Error handling | Non-blocking; highlight and continue | Errors flagged for manual action; import proceeds with valid records |

---

## Import Pipeline

The import process consists of five sequential stages. Users cannot skip stages but can return to previous stages to adjust settings.

### Stage 1: Upload & Parse

The user selects a file via drag-drop or file picker. The system parses the file and extracts column headers and sample rows.

**Supported formats**: CSV, XLSX (Excel), JSON

**Output**: Column list, first 100 rows as preview, total row count

**Constraints**: Maximum file size 50MB. Accepted extensions: `.csv`, `.xlsx`, `.xls`, `.json`

### Stage 2: Entity Type Selection

The user specifies what entity type this file contains. This determines which fields are required and what validation rules apply.

**Options**: Companies, Factories, Occupations, Skills

**Note**: Mixed files (e.g., factories with embedded company data) will be handled in a future "Linked Import" workflow. For MVP, each file contains one entity type.

### Stage 3: Column Mapping

The system displays detected columns alongside target database fields. Auto-suggestions appear based on fuzzy header matching. The user confirms or overrides each mapping.

**Required fields by entity type**:

| Entity Type | Required Fields | Optional Fields |
|-------------|-----------------|-----------------|
| Companies | name | industry, description, headquarters_location |
| Factories | name, location | company_link, specialization, description, workforce_size, open_positions |
| Occupations | title | description, onet_code |
| Skills | name | category, description |

**Auto-mapping hints**:

| Target Field | Source Header Matches |
|--------------|----------------------|
| name | name, company_name, company, factory_name, facility, title |
| industry | industry, sector, naics, sic, business_type |
| description | description, desc, about, summary |
| location | location, address, lat/lng, latitude/longitude, coordinates |
| workforce_size | workforce, employees, headcount, num_employees, worker_count |
| open_positions | openings, positions, jobs, open_positions, vacancies |
| company_link | company, parent, parent_company, owner |
| category | category, type, group, classification |

### Stage 4: Validation & Error Flagging

The system scans all rows and flags issues without blocking the import. Flagged records are collected into an error queue for manual resolution.

**Error types**:

| Error Type | Description | Severity |
|------------|-------------|----------|
| missing_required | Required field is empty or null | Error (skip record) |
| duplicate_exact | Exact match on name within same entity type | Warning (needs review) |
| potential_alias | Fuzzy match to existing record, confidence > 80% | Warning (needs review) |
| unlinked_relationship | Factory with no matching company | Error (skip record) |
| invalid_format | Malformed coordinates, non-numeric workforce count | Error (skip record) |
| out_of_range | Value outside acceptable bounds (e.g., negative workforce) | Warning (auto-correct if possible) |

Each error record includes: row number, field name, current value, error type, suggested action.

### Stage 5: Review & Commit

The user reviews a summary showing:

- Total records in file
- Valid records (ready to import)
- Records with warnings (will import, flagged for review)
- Records with errors (will skip, added to error queue)

Upon confirmation, valid records are inserted/updated using upsert logic (update if exists based on name match). Error queue is persisted for later resolution via the Data Management interface.

---

## Component Specifications

### Component: FileDropzone

**Purpose**: Accept file upload via drag-drop or click-to-browse.

**Inputs**: None (user action)

**Outputs**: Parsed file object containing columns array, rows array, file metadata (name, size, row count)

**States**:

| State | Visual Treatment |
|-------|------------------|
| Idle | Dashed border, upload icon, "Drag & drop your file here or click to browse" text, supported formats listed below |
| Hover | Border color changes to primary, background tint applied |
| Processing | Spinner replaces icon, "Parsing file..." text, progress indicator if file is large |
| Success | Checkmark icon, file name displayed, row count shown, "Change file" link |
| Error | Red border, error icon, error message (invalid format, file too large, parse failure) |

**Behavior**:
- Accepts single file only
- Validates file extension before parsing
- For Excel files with multiple sheets, prompts user to select which sheet to import
- Large files (>10MB) show progress indicator during parse

### Component: EntityTypeSelector

**Purpose**: User declares what entity type the file contains.

**Inputs**: None (user selection)

**Outputs**: Selected entity type string (companies | factories | occupations | skills)

**Presentation**: Four cards arranged in a 2x2 grid (or single row on wide screens). Each card displays:
- Icon representing entity type
- Entity name as heading
- Brief description of what this entity represents
- Example fields that will be available

**Behavior**:
- Only one card can be selected at a time
- Selected card shows highlight border and checkmark
- Selection triggers column mapping suggestions to update

### Component: ColumnMapper

**Purpose**: Map source file columns to target database fields.

**Inputs**: 
- Column list from parsed file
- Entity type from selector
- Sample data (first 5 rows) for each column

**Outputs**: Mapping configuration object mapping source column names to target field names

**Layout**: 
Two-column table layout. Left side shows source column header with sample values displayed below in muted text. Right side shows dropdown selector for target field. Required target fields marked with red asterisk. Unmapped source columns collected at bottom in "Ignored Columns" section.

**Behavior**:
- On load, auto-populate mappings using fuzzy matching against known aliases
- User can override any mapping via dropdown
- User can mark columns as "Ignore" to exclude from import
- Validation indicator shows green checkmark when all required fields are mapped
- "Reset to Suggested" button restores auto-detected mappings

### Component: ValidationPanel

**Purpose**: Display validation results and error summary after scanning mapped data.

**Inputs**: Mapped data rows, validation rules for selected entity type

**Outputs**: Categorized record counts, error queue entries

**Layout**: Accordion-style panel with three expandable sections.

**Section 1 — Summary Statistics**:
Visual summary bar showing proportions of valid/warning/error records. Below the bar, three stat cards showing counts:
- Valid records (green): Ready to import
- Warning records (yellow): Will import but flagged for review
- Error records (red): Will be skipped

**Section 2 — Error Queue**:
Sortable, filterable table showing flagged records. Columns: Row Number, Error Type, Field, Current Value, Suggested Fix. Each row has action buttons: "Fix Now" (opens inline editor), "Skip Record" (removes from import), "Review Later" (keeps in queue).

Filters available: By error type, by field, by severity.

**Section 3 — Duplicate & Alias Detection**:
List of potential duplicates showing side-by-side comparison. For each potential match:
- Left side: Incoming record from file
- Right side: Existing record in database
- Confidence score as percentage
- Action buttons: "Merge as Alias" (link incoming to existing), "Keep Both" (treat as distinct), "Skip Incoming" (do not import)

### Component: ImportPreview

**Purpose**: Final review of transformed data before commit.

**Inputs**: Validated and cleaned data ready for import

**Outputs**: User confirmation to proceed with import

**Layout**: 
Header showing final counts: "Ready to import X records (Y new, Z updates)". Below, paginated data table showing records as they will appear in database. Transformed or corrected values highlighted with subtle background color. Pagination controls at bottom (show 50 records per page).

**Action buttons**:
- Primary: "Import [X] Records" — initiates commit
- Secondary: "Back to Validation" — return to previous stage
- Tertiary: "Cancel Import" — discard all and return to upload

### Component: ImportProgress

**Purpose**: Show real-time progress during database commit operation.

**Inputs**: Total record count to import

**Outputs**: Completion status and summary

**Layout**:
Modal overlay preventing other interactions. Progress bar showing percentage complete. Below bar, text showing "Importing record X of Y..." with current record name. Estimated time remaining displayed if import exceeds 5 seconds.

**On completion**:
Progress bar reaches 100%, modal content transitions to summary view showing:
- Records created: X
- Records updated: Y
- Records skipped (errors): Z
- Time elapsed

Action buttons: "View Imported Data" (navigate to Node Explorer filtered to new records), "View Error Queue" (navigate to error resolution interface), "Import Another File" (reset to Stage 1).

---

## Error Queue System

Errors flagged during import are stored in a dedicated queue table for later resolution. This queue is accessible via a separate interface at `/data/errors`.

### Queue Record Schema

```
error_queue {
  id: UUID (primary key)
  import_batch_id: UUID (links errors to specific import session)
  entity_type: ENUM (companies, factories, occupations, skills)
  source_row_number: INTEGER
  source_row_data: JSONB (full original row for reference)
  error_type: ENUM (missing_required, duplicate_exact, potential_alias, unlinked_relationship, invalid_format, out_of_range)
  field_name: TEXT
  original_value: TEXT
  suggested_value: TEXT (nullable)
  status: ENUM (pending, resolved, skipped) DEFAULT 'pending'
  created_at: TIMESTAMP
  resolved_at: TIMESTAMP (nullable)
  resolved_by: TEXT (nullable, admin identifier)
  resolution_notes: TEXT (nullable)
}
```

### Error Resolution Interface

Located at `/data/errors`. Displays queue records grouped by import batch. Admin can:
- Filter by status, error type, entity type
- Bulk resolve similar errors
- Export unresolved errors to CSV for offline review
- View original import file metadata

---

## API Endpoints

### POST /api/import/parse

**Purpose**: Upload and parse file, return column structure and sample data.

**Request**: Multipart form data with file

**Response**:
```json
{
  "file_id": "uuid",
  "file_name": "companies.csv",
  "row_count": 50000,
  "columns": ["company_name", "industry", "address", "description"],
  "sample_rows": [
    {"company_name": "Acme Corp", "industry": "Manufacturing", ...},
    ...
  ],
  "sheets": ["Sheet1", "Sheet2"]  // Only for Excel files
}
```

### POST /api/import/map

**Purpose**: Submit column mapping, receive auto-suggestions.

**Request**:
```json
{
  "file_id": "uuid",
  "entity_type": "companies",
  "sheet_name": "Sheet1"  // Optional, for Excel
}
```

**Response**:
```json
{
  "suggested_mappings": {
    "company_name": "name",
    "industry": "industry",
    "address": "headquarters_location",
    "description": "description"
  },
  "unmapped_columns": [],
  "missing_required": []
}
```

### POST /api/import/validate

**Purpose**: Run validation on mapped data, return error summary.

**Request**:
```json
{
  "file_id": "uuid",
  "entity_type": "companies",
  "mappings": {
    "company_name": "name",
    ...
  }
}
```

**Response**:
```json
{
  "total_rows": 50000,
  "valid_count": 48500,
  "warning_count": 1200,
  "error_count": 300,
  "errors": [
    {
      "row": 145,
      "error_type": "missing_required",
      "field": "name",
      "value": null,
      "suggestion": null
    },
    ...
  ],
  "potential_duplicates": [
    {
      "incoming_row": 203,
      "incoming_value": "Boeing Corp",
      "existing_id": "uuid",
      "existing_value": "The Boeing Company",
      "confidence": 0.87
    },
    ...
  ]
}
```

### POST /api/import/execute

**Purpose**: Commit validated data to database.

**Request**:
```json
{
  "file_id": "uuid",
  "entity_type": "companies",
  "mappings": {...},
  "skip_rows": [145, 302, 445],  // Rows user chose to skip
  "duplicate_resolutions": [
    {"incoming_row": 203, "action": "merge", "existing_id": "uuid"},
    ...
  ]
}
```

**Response**:
```json
{
  "batch_id": "uuid",
  "created": 45000,
  "updated": 3500,
  "skipped": 300,
  "errors_queued": 300,
  "duration_ms": 12500
}
```

### GET /api/import/errors

**Purpose**: Retrieve error queue records.

**Query params**: `batch_id`, `status`, `error_type`, `page`, `limit`

**Response**: Paginated list of error queue records.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA IMPORT PIPELINE                        │
└─────────────────────────────────────────────────────────────────────┘

[User uploads file]
        │
        ▼
┌───────────────┐
│  FileDropzone │ ──── POST /api/import/parse ────▶ file_id, columns, samples
└───────────────┘
        │
        ▼
┌────────────────────┐
│ EntityTypeSelector │ ──── User selects: companies | factories | occupations | skills
└────────────────────┘
        │
        ▼
┌──────────────┐
│ ColumnMapper │ ──── POST /api/import/map ────▶ suggested mappings
└──────────────┘
        │
        ▼
┌──────────────────┐
│ ValidationPanel  │ ──── POST /api/import/validate ────▶ error summary, duplicates
└──────────────────┘
        │
        ├─── valid records ───▶ [ImportPreview]
        │                              │
        │                              ▼
        │                    ┌─────────────────┐
        │                    │ ImportProgress  │ ──── POST /api/import/execute
        │                    └─────────────────┘
        │                              │
        │                              ├─── success ───▶ [Database Tables]
        │                              │
        └─── error records ────────────┴─── errors ────▶ [Error Queue Table]
```

---

## File Dependencies

This specification requires the following to be implemented:

**Database tables**: companies, factories, occupations, skills, error_queue, import_batches

**Shared types**: Entity types, error types, mapping configuration, validation result

**Libraries**: 
- File parsing: papaparse (CSV), xlsx (Excel), native JSON.parse
- Fuzzy matching: fuse.js or similar for column name suggestions and duplicate detection

---

## Future Enhancements (Out of Scope for MVP)

- Linked Import workflow for files containing multiple entity types with relationships
- Scheduled/automated imports from external APIs
- Import templates that remember column mappings for recurring file formats
- Rollback capability to undo an import batch
- NAICS/SIC code reference data for enhanced filtering
