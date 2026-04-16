# Archangel Session Context

Use this document to bootstrap a new Claude Code session for the Archangel project.

## Project Overview

**Archangel** is a US Manufacturing Workforce Intelligence Platform at o-10.com. It visualizes the manufacturing ecosystem through an interactive map and node explorer, allowing users to explore relationships between Companies, Factories, Occupations, Skills, and the recently added Refs (Elements), Schools, and Programs.

## Current State (April 2026)

The platform is fully functional with:
- **142 companies** (including Top 50 US Manufacturing companies)
- **457 factories** with geographic coordinates
- **938 occupations** (O*NET-aligned)
- **1,463 skills** with parent-child tree structure
- **88 refs** (materials, machines, standards, processes, certifications)
- **15 schools** (technical colleges, universities, apprenticeship programs)
- **15 programs** with skill mappings

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | Zustand (UI), TanStack Query (server) |
| Backend | Express.js, TypeScript, Drizzle ORM |
| Database | PostgreSQL + PostGIS (Neon) |
| Maps | MapLibre GL JS + MapTiler |
| Mobile | Capacitor (iOS/Android wrapper) |

## Entity Model (7 browsable entities)

```
Companies ──┬── Factories ──── Occupations ──── Skills
            │                                    │
            │                                    ├── parent_skill_id (tree)
            │                                    │
            └── industry relationships           └── skill_refs ── Refs
                                                      │
Schools ──── Programs ──── program_skills ────────────┘
```

### Entity Types
- **companies**: Manufacturing companies with industry associations
- **factories**: Physical locations with lat/lng, workforce size, occupations
- **occupations**: Job roles with O*NET codes, skill requirements
- **skills**: Capabilities with category, parent-child hierarchy, ref associations
- **refs**: Elements library (materials, machines, standards, processes, certifications)
- **schools**: Educational institutions with location and type
- **programs**: Training programs with duration, credential type, skill mappings

## Key Files

### Database
- `server/db/schema.ts` - Drizzle schema with all 26 tables
- `server/scripts/seed.ts` - Main seed (companies, factories, occupations, skills)
- `server/scripts/seed-elements.ts` - Elements seed (refs, schools, programs)

### API
- `server/routes/*.ts` - REST endpoints for each entity type
- `client/src/lib/api.ts` - Frontend API client with types

### Frontend Pages
- `client/src/pages/MapView.tsx` - Interactive US map with factory markers
- `client/src/pages/Explore.tsx` - Node explorer with tabs and filters
- `client/src/pages/EntityDetail.tsx` - Detail views for all entity types

### Key Components
- `client/src/components/map/Map.tsx` - MapLibre map with US bounds
- `client/src/components/explorer/EntityCard.tsx` - Cards for all 7 entity types
- `client/src/components/explorer/FilterBar.tsx` - Sort/filter controls
- `client/src/components/search/GlobalSearch.tsx` - Cmd+K search modal

## Recent Implementation (This Session)

### Schema Expansion
- Added `refs` table with type enum (material, machine, standard, process, certification)
- Added `schools` and `programs` tables with relationships
- Added `skill_refs` junction table (skills ↔ refs)
- Added `program_skills` junction table (programs ↔ skills)
- Added `parent_skill_id` to skills for tree structure
- Added `persons` and `person_skill_refs` for future talent tracking

### Frontend Updates
- Added VirtualizedSection components for grouped "All" tab display
- Created entity cards for refs, schools, programs
- Added detail views for new entity types
- Integrated FilterBar with sort options per entity type
- Added left border accents to EntityCard for visual hierarchy
- Updated map bounds to include Alaska: `[[-180, 15], [-60, 73]]`

### Type System
- Created `ImportableEntityType` (companies, factories, occupations, skills only)
- Created `BrowsableEntityType` (all 7 entities minus persons)
- Created `MapSearchableEntityType` (entities with lat/lng)

## Common Commands

```bash
npm run dev              # Start dev server (client + server)
npm run build            # Production build
npm run db:push          # Push schema to database
npm run db:seed          # Seed main data (142 companies, 457 factories, etc.)
npm run db:seed-elements # Seed refs, schools, programs
npm run typecheck        # TypeScript validation
```

## Database Connection

Uses Neon PostgreSQL with PostGIS. Connection via `DATABASE_URL` in `.env`.

When running `db:push`, the drizzle config filters out PostGIS system tables:
```typescript
tablesFilter: ['!geography_columns', '!geometry_columns', '!spatial_ref_sys'],
extensionsFilters: ['postgis'],
```

## Design System

Entity colors (use for badges, borders, icons):
| Entity | Color | Tailwind |
|--------|-------|----------|
| Company | Amber | amber-500 |
| Factory | Sky | sky-400 |
| Occupation | Violet | violet-400 |
| Skill | Emerald | emerald-500 |
| Ref | Teal | teal-500 |
| School | Indigo | indigo-500 |
| Program | Fuchsia | fuchsia-500 |

## Specs Directory

Detailed specifications are in `specs/`:
- `01_DATA_IMPORT.md` - Import pipeline
- `02_MAP_VIEW.md` - Map visualization
- `03_NODE_EXPLORER.md` - Entity browsing
- `04_GLOBAL_SEARCH.md` - Search modal
- `05_DATABASE_SCHEMA.md` - Schema details
- `06_APP_DEPLOYMENT.md` - Deployment
- `07_DESIGN_SYSTEM.md` - UI components

## What's Ready for Next Steps

1. **Talent/Person Management** - Schema exists (`persons`, `person_skill_refs`) but no UI yet
2. **Advanced Skill Tree Navigation** - Parent-child relationships seeded, could add tree visualization
3. **Program Discovery** - Show which programs teach skills needed for occupations
4. **Supply Chain Analysis** - Which companies use which materials/machines
5. **Workforce Gap Analysis** - Compare factory needs vs available training programs

## Testing the Application

1. Start dev server: `npm run dev`
2. Open http://localhost:5173
3. Navigate to `/explore` - should see 7 tabs with grouped entities
4. Use Cmd+K for global search
5. Click any entity to see detail view with relationships
