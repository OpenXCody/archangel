# Global Search Specification

## Overview

**Trigger**: Keyboard shortcut ⌘K (Mac) / Ctrl+K (Windows), or click Search in TopNav

**Purpose**: Provide fast, unified search across all entity types in the Archangel database. Users can quickly find companies, factories, occupations, or skills without knowing which tab or page to look in. Search results link directly to entity detail views or map locations.

**Access Control**: Public read-only.

---

## Design Principles

| Principle | Implementation |
|-----------|----------------|
| Instant access | Global keyboard shortcut opens search from anywhere |
| Fast results | Results appear as user types (typeahead) |
| Type-aware | Results grouped by entity type with visual differentiation |
| Action-oriented | Each result has clear actions (view details, show on map) |
| Non-disruptive | Opens as modal overlay, closes easily, remembers recent searches |

---

## Search Modal

The global search appears as a command palette-style modal overlay centered on screen.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍  Search Archangel...                                    ⌘K │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Recent Searches                                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🕐  boeing                                                  ││
│  │ 🕐  CNC machinist                                           ││
│  │ 🕐  washington state                                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Quick Links                                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🏢  Browse all companies                                    ││
│  │ 🏭  Browse all factories                                    ││
│  │ 👔  Browse all occupations                                  ││
│  │ 🔧  Browse all skills                                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  ↑↓ Navigate  ⏎ Select  esc Close                              │
└─────────────────────────────────────────────────────────────────┘
```

### With Active Search Query

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍  boeing                                                  ✕  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Companies                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🏢  The Boeing Company                                      ││
│  │     Aerospace · 3 factories                                 ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ 🏢  Boeing Defense, Space & Security                        ││
│  │     Defense · 2 factories                                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Factories                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🏭  Boeing Everett Factory                                  ││
│  │     Washington · 30,000 workers                             ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ 🏭  Boeing Renton Factory                                   ││
│  │     Washington · 12,000 workers                             ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ 🏭  Boeing Charleston                                       ││
│  │     South Carolina · 3,000 workers                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Occupations                                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │     No matching occupations                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  ↑↓ Navigate  ⏎ Select  tab Next section  esc Close            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### Component: SearchModal

**Purpose**: Container for global search interface.

**Inputs**: Open/closed state, initial query (optional)

**Outputs**: Selected result, close event

**Behavior**:
- Opens via ⌘K/Ctrl+K keyboard shortcut from anywhere in app
- Opens via click on Search button in TopNav
- Closes via Escape key, click outside modal, or selecting a result
- Autofocuses search input when opened
- Preserves query if reopened within same session

**Dimensions**:
- Width: 600px (desktop), 100% minus padding (mobile)
- Max height: 70vh
- Position: Centered horizontally, offset from top by 15vh

**Animation**:
- Opens: Fade in backdrop, scale up modal from 95% to 100%
- Closes: Reverse animation, 150ms duration

### Component: SearchInput

**Purpose**: Text input for search query.

**Inputs**: Current query, placeholder text

**Outputs**: Query changes

**Layout**: 
Full-width input with search icon on left, clear button (X) on right when query present, keyboard shortcut hint on far right.

**Behavior**:
- Debounce input by 200ms before triggering search
- Clear button resets query and refocuses input
- Down arrow moves focus to first result
- Escape when input focused closes modal

### Component: SearchResults

**Purpose**: Display search results grouped by entity type.

**Inputs**: Search query, results from API

**Outputs**: Selected result

**Layout**:
Vertical sections, one per entity type that has results. Each section has header (entity type name) and list of result items. Sections with no results show "No matching [entity type]" in muted text.

**Result grouping order**: Companies, Factories, Occupations, Skills, States

**Max results per section**: 5 (with "View all X results" link if more exist)

**Keyboard navigation**:
- Up/Down arrows navigate between results
- Tab moves to next section
- Enter selects highlighted result
- Current selection has visible highlight

### Component: SearchResultItem

**Purpose**: Display a single search result.

**Inputs**: Entity data, entity type, highlight state

**Outputs**: Click/select event

**Layout by entity type**:

**Company result**:
```
🏢  [Company Name]
    [Industry] · [X] factories
```

**Factory result**:
```
🏭  [Factory Name]
    [State] · [Workforce] workers
```

**Occupation result**:
```
👔  [Occupation Title]
    [X] skills · Found in [Y] factories
```

**Skill result**:
```
🔧  [Skill Name]
    [Category] · Required by [X] occupations
```

**State result**:
```
📍  [State Name]
    [X] factories · [Y] total workforce
```

**Hover/focus state**: Background highlight, subtle scale effect

**Actions on select**:
- Default: Navigate to entity detail page in Node Explorer
- Holding ⌘/Ctrl: Open in new tab
- For factories/states: Option to "Show on Map" appears on hover

### Component: RecentSearches

**Purpose**: Show user's recent search queries for quick re-access.

**Inputs**: Recent searches array (from localStorage)

**Outputs**: Selected recent search (populates query)

**Layout**: Simple list of recent query strings with clock icon prefix.

**Behavior**:
- Stores last 10 unique searches in localStorage
- Click on recent search populates input and triggers search
- Clear individual items via X button on hover
- "Clear all" link at bottom of section

**Display condition**: Only shown when search input is empty.

### Component: QuickLinks

**Purpose**: Provide shortcuts to browse all entities of each type.

**Inputs**: None

**Outputs**: Navigation event

**Layout**: Four buttons/links, one for each entity type.

**Behavior**: Click navigates to Node Explorer with corresponding tab selected.

**Display condition**: Only shown when search input is empty.

---

## Search Behavior

### Search Algorithm

The search endpoint performs full-text search across multiple fields per entity type.

| Entity Type | Searched Fields | Boost Weights |
|-------------|-----------------|---------------|
| Companies | name, industry, description | name: 3x, industry: 2x, description: 1x |
| Factories | name, specialization, description, company_name | name: 3x, company_name: 2x, specialization: 1.5x |
| Occupations | title, description | title: 3x, description: 1x |
| Skills | name, category, description | name: 3x, category: 2x |
| States | name, code | name: 3x, code: 2x |

### Matching Rules

- Case-insensitive matching
- Partial word matching (prefix): "boe" matches "Boeing"
- Multiple terms use AND logic: "boeing washington" matches factories with both terms
- Quoted phrases match exactly: "CNC machinist" matches that exact phrase

### Ranking

Results ranked by:
1. Match quality (how well query matches boosted fields)
2. Entity importance (companies and factories ranked higher for ambiguous queries)
3. Data richness (entities with more relationships ranked higher)

---

## API Endpoint

### GET /api/search

**Query params**:
- `q` (required): Search query string
- `types` (optional): Comma-separated entity types to include (default: all)
- `limit` (optional): Max results per type (default: 5, max: 20)

**Response**:
```json
{
  "query": "boeing",
  "results": {
    "companies": {
      "count": 2,
      "items": [
        {
          "id": "uuid",
          "name": "The Boeing Company",
          "industry": "Aerospace",
          "factory_count": 3,
          "match_score": 0.95
        }
      ]
    },
    "factories": {
      "count": 5,
      "items": [
        {
          "id": "uuid",
          "name": "Boeing Everett Factory",
          "company_name": "The Boeing Company",
          "state": "WA",
          "workforce_size": 30000,
          "match_score": 0.92
        }
      ]
    },
    "occupations": {
      "count": 0,
      "items": []
    },
    "skills": {
      "count": 0,
      "items": []
    },
    "states": {
      "count": 0,
      "items": []
    }
  },
  "total_count": 7,
  "search_time_ms": 45
}
```

---

## State Management

### SearchStore (Zustand)

```typescript
interface SearchStore {
  // Modal state
  isOpen: boolean;
  
  // Search state
  query: string;
  results: SearchResults | null;
  isLoading: boolean;
  error: string | null;
  
  // History
  recentSearches: string[];
  
  // Selection
  selectedIndex: number;  // For keyboard navigation
  selectedSection: string;  // Which entity type section
  
  // Actions
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  selectResult: (type: string, id: string) => void;
  navigateResults: (direction: 'up' | 'down' | 'nextSection' | 'prevSection') => void;
  addToRecentSearches: (query: string) => void;
  clearRecentSearches: () => void;
}
```

### Recent Searches Persistence

Recent searches stored in localStorage under key `archangel_recent_searches`.

```typescript
// On search execution
const saveRecentSearch = (query: string) => {
  const recent = JSON.parse(localStorage.getItem('archangel_recent_searches') || '[]');
  const updated = [query, ...recent.filter(q => q !== query)].slice(0, 10);
  localStorage.setItem('archangel_recent_searches', JSON.stringify(updated));
};
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl+K | Open search modal (global) |
| Escape | Close search modal |
| ↓ / ↑ | Navigate between results |
| Tab / Shift+Tab | Navigate between sections |
| Enter | Select highlighted result |
| ⌘+Enter / Ctrl+Enter | Open result in new tab |

---

## Accessibility

- Modal has `role="dialog"` and `aria-modal="true"`
- Search input has `role="combobox"` with proper ARIA attributes
- Results list has `role="listbox"` with items having `role="option"`
- Focus trapped within modal when open
- Screen reader announces result count: "5 results for boeing"
- Keyboard navigation fully supported

---

## Mobile Considerations

### Layout
- Full-screen modal on mobile
- Search input at top with larger touch target
- Results take remaining space with scroll
- Sticky header with input while scrolling results

### Interactions
- Tap result to navigate
- Swipe down on modal to close
- No keyboard shortcut indicators (not applicable on mobile)

### Performance
- Larger debounce on mobile (300ms) to avoid excessive typing triggers
- Limit visible results to 3 per section on smaller screens

---

## Empty and Loading States

### No Query (Initial State)
Show recent searches and quick links.

### Loading
Show skeleton placeholders in result sections while fetching.

### No Results
```
┌─────────────────────────────────────────────────────────────────┐
│  🔍  xyznonexistent                                          ✕  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│            😕                                                   │
│                                                                 │
│     No results found for "xyznonexistent"                       │
│                                                                 │
│     Suggestions:                                                │
│     · Check your spelling                                       │
│     · Try more general terms                                    │
│     · Browse all entities instead                               │
│                                                                 │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ Browse Companies  │ Browse Factories │ Browse All       │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Error State
Show error message with retry button.

---

## Integration with Other Features

### From Map View
- Search results for factories/states include "Show on Map" action
- Selecting a factory from search can navigate to map with that factory selected

### From Node Explorer
- Search can be opened from any page
- Selecting a result navigates to appropriate tab with entity modal open

### URL Support
Search modal state is not reflected in URL (it's ephemeral). However, after selecting a result, the URL updates to the destination page.

---

## Future Enhancements (Out of Scope for MVP)

- Saved searches / search alerts
- Search filters (limit to specific entity types, states, industries)
- Search suggestions as user types (autocomplete)
- Search analytics (track popular searches)
- Natural language queries ("factories near Seattle with open positions")
- Fuzzy matching for typo tolerance
