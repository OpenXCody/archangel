# Node Explorer Page Specification

## Overview

**Route**: `/explore`

**Purpose**: Provide a structured, searchable interface for browsing all entities in the Archangel database. While the Map View enables geographic discovery, the Node Explorer enables systematic exploration of the data hierarchy: Companies → Factories → Occupations → Skills. Users can search, filter, and drill down through the node hierarchy.

**Access Control**: Public read-only. No write operations exposed.

---

## Design Principles

| Principle | Implementation |
|-----------|----------------|
| Hierarchy-aware | Navigation reflects Company → Factory → Occupation → Skill structure |
| Cross-referenced | Every entity shows its relationships to other entity types |
| Searchable | Fast full-text search within each entity type |
| Filterable | Narrow results by industry, state, company, etc. |
| Linkable | Every view state has a unique URL for sharing |

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Map] [Nodes] [Input] [Search ⌘K]              ARCHANGEL           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Node Explorer                                                      │
│  Browse and explore all data nodes in the system.                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ◎ All  │ 🏢 Companies │ 🏭 Factories │ 👔 Occupations │ 🔧 Skills││
│  │  818   │      45      │      44      │       18       │    711  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  🏢 Companies (45 nodes)                           [Search...] 🔍  │
│  Strategic company overview with linked manufacturing facilities.   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🏢 The Boeing Company               [Company]              →    ││
│  │    The Boeing Company designs, engineers, and manufactures...   ││
│  │    Industry: Aerospace                                          ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ 🏢 Tesla                            [Company]              →    ││
│  │    Accelerating the advent of sustainable energy                ││
│  │    Industry: Automotive                                         ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ 🏢 General Motors                   [Company]              →    ││
│  │    General Motors Company (GM) is most known for owning...      ││
│  │    Industry: Automotive                                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  [Load More]                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tab Structure

The Node Explorer uses a tabbed interface where each tab displays a different entity type. The "All" tab shows a mixed feed of all entity types.

### Tab: All

**Content**: Combined feed showing recently added or most relevant entities across all types. Each item shows its entity type badge.

**Sort options**: Recently added, alphabetical, relevance (if search active)

**Use case**: General browsing, discovering what data exists in the system.

### Tab: Companies

**Content**: List of all company nodes.

**Display per item**: Company name, industry, description preview, factory count badge.

**Sort options**: Alphabetical, by factory count, by total workforce.

**Filter options**: Industry.

**Color accent**: Amber (#F59E0B)

### Tab: Factories

**Content**: List of all factory nodes.

**Display per item**: Factory name, parent company, specialization, state, workforce size.

**Sort options**: Alphabetical, by workforce size, by open positions.

**Filter options**: Industry, state, company, has open positions.

**Color accent**: Light Blue (#60A5FA)

### Tab: Occupations

**Content**: List of all occupation nodes.

**Display per item**: Occupation title, description preview, skill count badge, factory count (how many factories have this occupation).

**Sort options**: Alphabetical, by factory count, by skill count.

**Filter options**: Skill category (if filtering by related skills).

**Color accent**: Dark Blue (#1E40AF)

### Tab: Skills

**Content**: List of all skill nodes.

**Display per item**: Skill name, category, occupation count (how many occupations require this skill).

**Sort options**: Alphabetical, by occupation count, by category.

**Filter options**: Category.

**Color accent**: Emerald (#10B981)

---

## Component Specifications

### Component: TabSelector

**Purpose**: Allow users to switch between entity types.

**Inputs**: Current tab, counts per entity type

**Outputs**: Tab selection change

**Layout**: Horizontal tab bar with icon, label, and count badge for each tab. Active tab has underline highlight in that entity type's accent color.

**Behavior**:
- Clicking a tab switches the list view below
- Tab counts update based on active filters
- URL updates to reflect selected tab: `/explore?tab=companies`
- On mobile, tabs may scroll horizontally if screen is narrow

### Component: NodeList

**Purpose**: Display paginated, searchable list of entities for the selected tab.

**Inputs**: 
- Entity type (from selected tab)
- Search query
- Active filters
- Sort option
- Page number

**Outputs**:
- Selected entity (on item click)
- Search query changes
- Filter changes
- Sort changes
- Page changes

**Layout**: 
Header section with search input and sort dropdown. Below, vertical list of NodeListItem components. At bottom, "Load More" button or pagination controls.

**Pagination strategy**: Infinite scroll with "Load More" button. Initial load: 20 items. Each "Load More" fetches 20 more. Show total count in header.

**Empty state**: When no results match filters/search, show friendly message with suggestions to broaden search.

### Component: NodeListItem

**Purpose**: Display a single entity in the list with summary information.

**Inputs**: Entity data object, entity type

**Outputs**: Click event (opens detail modal)

**Layout by entity type**:

**Company item**:
```
┌──────────────────────────────────────────────────────────────┐
│ 🏢  The Boeing Company                    [Company]      →   │
│     The Boeing Company designs, engineers, and manufactures  │
│     Commercial Aircraft, Defense, and Space Vehicles.        │
│     Industry: Aerospace                     3 factories      │
└──────────────────────────────────────────────────────────────┘
```

**Factory item**:
```
┌──────────────────────────────────────────────────────────────┐
│ 🏭  Boeing Everett Factory                [Factory]      →   │
│     Wide-body commercial aircraft assembly                   │
│     📍 Washington  │  🏢 The Boeing Company  │  👥 30,000    │
└──────────────────────────────────────────────────────────────┘
```

**Occupation item**:
```
┌──────────────────────────────────────────────────────────────┐
│ 👔  CNC Machinist                         [Occupation]   →   │
│     Operates computer numerical control machines to          │
│     fabricate precision metal parts.                         │
│     🔧 24 skills required  │  🏭 Found in 156 factories      │
└──────────────────────────────────────────────────────────────┘
```

**Skill item**:
```
┌──────────────────────────────────────────────────────────────┐
│ 🔧  Blueprint Reading                     [Skill]        →   │
│     Category: Technical                                      │
│     👔 Required by 42 occupations                            │
└──────────────────────────────────────────────────────────────┘
```

**Hover state**: Subtle background highlight, arrow icon becomes more prominent.

**Click behavior**: Opens NodeDetailModal with full entity details.

### Component: NodeDetailModal

**Purpose**: Display comprehensive information about a single entity without navigating away from the list.

**Inputs**: Entity ID, entity type

**Outputs**: Close event, navigation to full page, navigation to related entity

**Trigger**: Click on any NodeListItem

**Layout**: Modal overlay (or slide-in panel on mobile) showing:

**Header section**:
- Entity type icon and badge
- Entity name (large)
- Close button (X)

**Content section** (varies by entity type):

**Company detail**:
```
┌─────────────────────────────────────────────────────────────────┐
│ 🏢 The Boeing Company                              [Company]  X │
├─────────────────────────────────────────────────────────────────┤
│ DESCRIPTION                                                     │
│ The Boeing Company designs, engineers, and manufactures         │
│ Commercial Aircraft, Defense, and Space Vehicles.               │
├─────────────────────────────────────────────────────────────────┤
│ INDUSTRY                          LOCATION                      │
│ Aerospace                         41.8781, -87.6298            │
├─────────────────────────────────────────────────────────────────┤
│ 🏭 FACTORIES (3)                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🏭 The Boeing Company - Commercial Aircraft              →  │ │
│ │ 🏭 The Boeing Company - Commercial Aircraft              →  │ │
│ │ 🏭 The Boeing Company - Factory 17                       →  │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [View Full Company Page →]                    [Show on Map →]   │
└─────────────────────────────────────────────────────────────────┘
```

**Factory detail**:
```
┌─────────────────────────────────────────────────────────────────┐
│ 🏭 Lockheed Martin                                [Factory]   X │
├─────────────────────────────────────────────────────────────────┤
│ SPECIALIZATION                    STATUS                        │
│ USAF Plant 4                      ✓ Active                      │
├─────────────────────────────────────────────────────────────────┤
│ DESCRIPTION                                                     │
│ Fighter aircraft production with stealth technology and avionics│
├─────────────────────────────────────────────────────────────────┤
│ ┌────────────────────┐ ┌────────────────────┐                   │
│ │ Workforce          │ │ Open Positions     │                   │
│ │      12,990        │ │        1,200       │                   │
│ └────────────────────┘ └────────────────────┘                   │
├─────────────────────────────────────────────────────────────────┤
│ CONNECTED NODES                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🏢 Parent Company: Lockheed Martin Corporation           →  │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 👔 Occupations                                          31  │ │
│ │    Click to expand...                                       │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 🔧 Skills                                              221  │ │
│ │    Click to expand...                                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ 📍 LOCATION                                                     │
│ 32.76°, -97.33°                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [View Full Factory Page →]                    [Show on Map →]   │
└─────────────────────────────────────────────────────────────────┘
```

**Occupation detail**:
```
┌─────────────────────────────────────────────────────────────────┐
│ 👔 CNC Machinist                              [Occupation]    X │
├─────────────────────────────────────────────────────────────────┤
│ DESCRIPTION                                                     │
│ Operates computer numerical control machines to fabricate       │
│ precision metal parts according to specifications.              │
├─────────────────────────────────────────────────────────────────┤
│ O*NET CODE                                                      │
│ 51-4041.00                                                      │
├─────────────────────────────────────────────────────────────────┤
│ 🔧 REQUIRED SKILLS (24)                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔧 Blueprint Reading                    [Required]        → │ │
│ │ 🔧 G-Code Programming                   [Required]        → │ │
│ │ 🔧 Precision Measurement                [Required]        → │ │
│ │ 🔧 CAD/CAM Software                     [Preferred]       → │ │
│ │ ... show more                                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ 🏭 FACTORIES WITH THIS OCCUPATION (156)                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🏭 Boeing Everett Factory               WA  │  500 workers → │ │
│ │ 🏭 Tesla Gigafactory                    TX  │  320 workers → │ │
│ │ ... show more                                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [View Full Occupation Page →]                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Skill detail**:
```
┌─────────────────────────────────────────────────────────────────┐
│ 🔧 Blueprint Reading                              [Skill]     X │
├─────────────────────────────────────────────────────────────────┤
│ CATEGORY                                                        │
│ Technical                                                       │
├─────────────────────────────────────────────────────────────────┤
│ DESCRIPTION                                                     │
│ Ability to read and interpret technical drawings, schematics,   │
│ and engineering blueprints.                                     │
├─────────────────────────────────────────────────────────────────┤
│ 👔 OCCUPATIONS REQUIRING THIS SKILL (42)                        │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👔 CNC Machinist                        [Required]        → │ │
│ │ 👔 Quality Inspector                    [Required]        → │ │
│ │ 👔 Maintenance Technician               [Preferred]       → │ │
│ │ ... show more                                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [View Full Skill Page →]                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Interactions**:
- Click related entity → Close current modal, open new modal for that entity
- Click "View Full Page" → Navigate to dedicated entity page
- Click "Show on Map" → Navigate to Map View with entity selected
- Click outside modal or X → Close modal
- Escape key → Close modal

### Component: SearchInput

**Purpose**: Filter the current list by text search.

**Inputs**: Current query, placeholder text based on entity type

**Outputs**: Query changes (debounced)

**Layout**: Text input with search icon, clear button when query present.

**Behavior**:
- Debounce input by 300ms before triggering search
- Search is scoped to current tab's entity type
- Search fields vary by entity type:
  - Companies: name, industry, description
  - Factories: name, specialization, description, company name
  - Occupations: title, description
  - Skills: name, category, description
- URL updates with search query: `/explore?tab=companies&q=boeing`

### Component: FilterPanel

**Purpose**: Allow users to narrow results by specific criteria.

**Inputs**: Available filter options (fetched from API), current filter state

**Outputs**: Filter changes

**Layout**: 
- Desktop: Horizontal bar below tabs with dropdown selectors
- Mobile: "Filters" button opens bottom sheet with filter list

**Filter types**:

| Entity Type | Available Filters |
|-------------|-------------------|
| Companies | Industry |
| Factories | Industry, State, Company, Has Open Positions |
| Occupations | (none for MVP) |
| Skills | Category |

**Behavior**:
- Multiple filters combine with AND logic
- Active filter count shown as badge on "Filters" button
- "Clear All" resets filters
- URL updates to reflect filters: `/explore?tab=factories&state=WA&industry=aerospace`

### Component: SortDropdown

**Purpose**: Allow users to change the sort order of results.

**Inputs**: Current sort option, available sort options for entity type

**Outputs**: Sort selection change

**Layout**: Dropdown with label showing current sort: "Sort: Alphabetical ▼"

**Sort options by entity type**:

| Entity Type | Sort Options |
|-------------|--------------|
| All | Recently added, Alphabetical |
| Companies | Alphabetical, Factory count, Total workforce |
| Factories | Alphabetical, Workforce size, Open positions |
| Occupations | Alphabetical, Factory count, Skill count |
| Skills | Alphabetical, Occupation count, Category |

---

## Entity Detail Pages

Each entity type has a dedicated full-page view accessible via "View Full Page" from the modal or direct URL.

### Route: /companies/:id

**Purpose**: Comprehensive view of a single company.

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│ [← Back to Explorer]                            ARCHANGEL       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 🏢 The Boeing Company                                           │
│ [Company]  Industry: Aerospace                                  │
│                                                                 │
│ ┌───────────────────────────────────┬───────────────────────────┤
│ │                                   │                           │
│ │ About                             │      [Mini Map]           │
│ │ The Boeing Company designs...     │   All factory locations   │
│ │                                   │                           │
│ │ Key Statistics                    │                           │
│ │ ┌─────────┐ ┌─────────┐ ┌───────┐ │                           │
│ │ │Factories│ │Workforce│ │Open   │ │                           │
│ │ │    3    │ │  45,000 │ │1,200  │ │                           │
│ │ └─────────┘ └─────────┘ └───────┘ │                           │
│ │                                   │                           │
│ ├───────────────────────────────────┴───────────────────────────┤
│ │                                                               │
│ │ Factories (3)                                      [Search]   │
│ │ ┌───────────────────────────────────────────────────────────┐ │
│ │ │ 🏭 Boeing Everett Factory     │ WA │ 30,000 │ View →     │ │
│ │ │ 🏭 Boeing Renton Factory      │ WA │ 12,000 │ View →     │ │
│ │ │ 🏭 Boeing Charleston          │ SC │  3,000 │ View →     │ │
│ │ └───────────────────────────────────────────────────────────┘ │
│ │                                                               │
│ │ Top Occupations Across All Factories                          │
│ │ ┌───────────────────────────────────────────────────────────┐ │
│ │ │ 👔 Aircraft Assembler         │ 8,500 workers │ View →   │ │
│ │ │ 👔 Quality Inspector          │ 2,200 workers │ View →   │ │
│ │ └───────────────────────────────────────────────────────────┘ │
│ │                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Route: /factories/:id

**Purpose**: Comprehensive view of a single factory.

**Layout**: Similar to company page with factory-specific information, parent company link, occupation list, and minimap showing factory location.

### Route: /occupations/:id

**Purpose**: Comprehensive view of a single occupation.

**Layout**: Occupation description, O*NET code, required/preferred skills list with importance levels, factories that employ this occupation with worker counts.

### Route: /skills/:id

**Purpose**: Comprehensive view of a single skill.

**Layout**: Skill description, category, occupations that require this skill with importance levels.

---

## State Management

### ExplorerStore (Zustand)

```typescript
interface ExplorerStore {
  // Tab state
  activeTab: 'all' | 'companies' | 'factories' | 'occupations' | 'skills';
  
  // List state
  searchQuery: string;
  filters: {
    industry: string | null;
    state: string | null;
    company: string | null;
    hasOpenPositions: boolean;
    category: string | null;
  };
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  
  // Modal state
  selectedEntityType: string | null;
  selectedEntityId: string | null;
  modalOpen: boolean;
  
  // Actions
  setTab: (tab: string) => void;
  setSearch: (query: string) => void;
  setFilter: (name: string, value: any) => void;
  clearFilters: () => void;
  setSort: (sortBy: string, order: 'asc' | 'desc') => void;
  openEntityModal: (type: string, id: string) => void;
  closeModal: () => void;
}
```

### URL Synchronization

All explorer state should sync to URL for shareable links:

```
/explore                                    # Default view (All tab)
/explore?tab=factories                      # Factories tab
/explore?tab=factories&q=boeing             # With search
/explore?tab=factories&state=WA&industry=aerospace  # With filters
/explore?tab=companies&sort=workforce&order=desc    # With sort
/explore?tab=factories&modal=factory-uuid   # With modal open
```

---

## API Endpoints

### GET /api/companies

**Query params**: `q` (search), `industry`, `sort`, `order`, `page`, `limit`

**Response**:
```json
{
  "total": 45,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id": "uuid",
      "name": "The Boeing Company",
      "industry": "Aerospace",
      "description": "The Boeing Company designs...",
      "factory_count": 3,
      "total_workforce": 45000,
      "headquarters_location": { "lat": 41.8781, "lng": -87.6298 }
    }
  ]
}
```

### GET /api/factories

**Query params**: `q`, `industry`, `state`, `company`, `has_positions`, `sort`, `order`, `page`, `limit`

**Response**:
```json
{
  "total": 44,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id": "uuid",
      "name": "Boeing Everett Factory",
      "company_id": "uuid",
      "company_name": "The Boeing Company",
      "specialization": "Wide-body commercial aircraft",
      "state": "WA",
      "workforce_size": 30000,
      "open_positions": 500,
      "occupation_count": 85
    }
  ]
}
```

### GET /api/occupations

**Query params**: `q`, `sort`, `order`, `page`, `limit`

**Response**:
```json
{
  "total": 18,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id": "uuid",
      "title": "CNC Machinist",
      "description": "Operates computer numerical control...",
      "onet_code": "51-4041.00",
      "skill_count": 24,
      "factory_count": 156
    }
  ]
}
```

### GET /api/skills

**Query params**: `q`, `category`, `sort`, `order`, `page`, `limit`

**Response**:
```json
{
  "total": 711,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id": "uuid",
      "name": "Blueprint Reading",
      "category": "Technical",
      "description": "Ability to read and interpret...",
      "occupation_count": 42
    }
  ]
}
```

### GET /api/entities/:type/:id

**Purpose**: Fetch full details for modal/detail page.

**Response**: Full entity object with all relationships populated.

---

## Accessibility

- Keyboard navigation: Tab through list items, Enter to open modal, Escape to close
- Screen reader: List items announce entity type, name, and key stats
- Focus management: Focus trapped in modal when open, returns to trigger on close
- ARIA: Proper roles for tabs, list, modal, and interactive elements

---

## Mobile Considerations

### Tab Bar
- Scrollable horizontally if tabs don't fit
- Active tab always scrolled into view

### List Items
- Slightly larger touch targets (minimum 48px height)
- Swipe actions considered for future (swipe to add to favorites, etc.)

### Modal
- Full-screen on mobile devices
- Slide up from bottom animation
- Close via swipe down or X button

### Filters
- Open as bottom sheet instead of dropdown
- Full list of options visible without scrolling when possible

---

## Future Enhancements (Out of Scope for MVP)

- Favorites/bookmarks system for saving entities
- Comparison mode (select multiple entities to compare side-by-side)
- Export list to CSV
- Advanced filtering (workforce range slider, geographic radius search)
- Occupation-to-skill pathway visualization
- Related entities suggestions ("Users who viewed this also viewed...")
