# Map View Page Specification

## Overview

**Route**: `/map` (also serves as home: `/`)

**Purpose**: The primary interface for exploring manufacturing data geographically. Users can discover companies and factories by location, view state-level aggregations, drill down to individual facilities, and filter by various criteria. This is the "hero feature" of Archangel.

**Access Control**: Public read-only. No write operations exposed.

---

## Design Principles

| Principle | Implementation |
|-----------|----------------|
| Progressive disclosure | Zoomed out shows state summaries; zoomed in reveals individual factories |
| Never cluttered | Marker density adapts to zoom level; clustering prevents overlap |
| Always orientable | User can always tell where they are geographically |
| Drill-down enabled | Every summary links to more detail; every entity has a full page view |
| Filter without leaving | Search and filters operate on the map directly |

---

## Zoom-Based Visualization Strategy

The map displays different data representations based on zoom level. Transitions between levels should be smooth and intuitive.

### Level 1: National Overview (Zoom 3-5)

**Visual**: State boundaries visible with choropleth shading indicating data density. Darker shade = more factories/workforce. No individual markers visible.

**Interaction**: Hover on state shows tooltip with state name and quick stats (factory count, total workforce). Click on state zooms to that state and opens State Summary panel.

**Data source**: Pre-aggregated state statistics (factory_count, total_workforce, open_positions per state).

### Level 2: Regional View (Zoom 6-8)

**Visual**: State boundaries still visible but lighter. Factory clusters appear as numbered circles indicating count of factories in that area. Cluster size and color intensity reflect count.

**Interaction**: Hover on cluster shows count and top companies in cluster. Click on cluster zooms to expand it.

**Clustering rules**:
- Minimum distance between clusters: 50px at current zoom
- Cluster expands into individual markers when zoom would make them non-overlapping
- Maximum markers visible without clustering: 100

### Level 3: Local View (Zoom 9-12)

**Visual**: Individual factory markers visible. Each marker is a small circle with consistent size. State boundaries very subtle or hidden.

**Interaction**: Hover on marker shows factory name and company. Click on marker opens Factory Detail panel.

**Marker styling**:
- Default: Light blue (#60A5FA) with white border
- Selected: Brighter with glow effect
- Filtered out: Muted/semi-transparent

### Level 4: Street View (Zoom 13+)

**Visual**: Same as Level 3 but markers may show additional detail (factory name label appears next to marker if space permits).

**Interaction**: Same as Level 3.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Map] [Nodes] [Input] [Search ⌘K]              ARCHANGEL           │  ← TopNav
├─────────────────────────────────────────────────────────────────┬───┤
│                                                                 │   │
│                                                                 │ S │
│                                                                 │ I │
│                          MAP CANVAS                             │ D │
│                                                                 │ E │
│                     (Full remaining height)                     │ B │
│                                                                 │ A │
│                                                                 │ R │
│                                                                 │   │
├─────────────────────────────────────────────────────────────────┴───┤
│  [Filter Bar - collapsible]                                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Desktop (≥1024px)**: Sidebar is 400px wide, slides in from right. Map fills remaining space.

**Tablet (768-1023px)**: Sidebar is 350px wide or 40% of screen, whichever is smaller.

**Mobile (<768px)**: Sidebar becomes bottom sheet, slides up from bottom, can be expanded to 80% of screen height or collapsed to show just the header.

---

## Component Specifications

### Component: MapCanvas

**Purpose**: Render the interactive map with all layers and handle user interactions.

**Technology**: MapLibre GL JS with MapTiler free tiles (dark style).

**Inputs**:
- GeoJSON data for factories
- State boundary GeoJSON (static, bundled)
- Current filters (company, industry, state)
- Selected entity (state, factory, or null)

**Outputs**:
- User interactions (click, hover, zoom change)
- Current viewport bounds
- Current zoom level

**Layers** (bottom to top):
1. Base map tiles (MapTiler dark style)
2. State fill layer (choropleth, visible at zoom < 8)
3. State boundary lines (always visible, opacity varies by zoom)
4. Factory clusters (visible at zoom 6-8)
5. Factory markers (visible at zoom > 8)
6. Selected state highlight (when state selected)
7. Selected factory highlight (when factory selected)

**Initial viewport**:
- Center: [-98.5795, 39.8283] (geographic center of contiguous US)
- Zoom: 4
- Bounds constrained to continental US plus Alaska, Hawaii, Puerto Rico

**Performance requirements**:
- Smooth 60fps pan and zoom with up to 100,000 factory points loaded
- Use vector tiles and clustering to achieve this
- Lazy load factory details (only fetch full data on click)

### Component: FilterBar

**Purpose**: Allow users to filter visible factories by company, industry, state, and other criteria.

**Position**: Fixed at bottom of map, above any mobile navigation. Collapses to a single "Filters" button on mobile.

**Inputs**: Current filter state, available filter options (loaded from API)

**Outputs**: Updated filter state

**Filter options**:

| Filter | Type | Behavior |
|--------|------|----------|
| Company | Multi-select autocomplete | Show only factories owned by selected companies |
| Industry | Multi-select dropdown | Show only factories in selected industries |
| State | Multi-select dropdown | Show only factories in selected states |
| Workforce size | Range slider | Filter by min/max workforce |
| Has open positions | Toggle | Show only factories with open_positions > 0 |

**Layout**:
- Desktop: Horizontal bar with all filters visible
- Mobile: "Filters" button opens bottom sheet with vertical filter list

**Behavior**:
- Filters are additive (AND logic)
- Active filter count shown as badge
- "Clear all" button resets to no filters
- Filter changes update map immediately (debounced 300ms for range slider)
- URL updates to reflect filter state (shareable links)

### Component: Sidebar

**Purpose**: Display contextual information about selected entity (state or factory). Provides summary view with link to full detail page.

**Position**: Right side on desktop/tablet, bottom sheet on mobile.

**States**:

| State | Content |
|-------|---------|
| Closed | Sidebar not visible, map fills screen |
| State Summary | State selected, shows aggregated state data |
| Factory Detail | Factory selected, shows factory information |
| Company Preview | Company clicked from within sidebar, shows company summary |

**Behavior**:
- Opens automatically when user clicks a state or factory
- Close button (X) dismisses sidebar
- "View Full Details" button navigates to entity's dedicated page
- On mobile, drag handle allows resizing between collapsed/expanded states

### Component: StateSummaryPanel

**Purpose**: Display aggregated statistics for a selected state.

**Shown when**: User clicks on a state at zoom levels 3-8.

**Content structure**:

```
┌─────────────────────────────────────────┐
│ ◉ State Summary          [2 Facilities] │  ← Header with facility count badge
│                                    [X]  │
├─────────────────────────────────────────┤
│ Washington                              │  ← State name (large)
│ WA - United States                      │  ← State code and country
├─────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐        │
│ │ Total       │ │ Open        │        │
│ │ Workforce   │ │ Positions   │        │
│ │   42,000    │ │     630     │        │
│ └─────────────┘ └─────────────┘        │
├─────────────────────────────────────────┤
│ 🏢 Top Employers                        │
│ ┌─────────────────────────────────────┐ │
│ │ #1 Boeing Everett Factory  30,000  │ │
│ │ #2 Boeing Renton Factory   12,000  │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ 🏭 Largest Factories                    │
│ ┌─────────────────────────────────────┐ │
│ │ #1 Wide-body Aircraft     30,000   │ │
│ │    Boeing Everett Factory          │ │
│ │ #2 737 MAX Assembly       12,000   │ │
│ │    Boeing Renton Factory           │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ [View All Factories in Washington →]    │  ← Link to filtered Node Explorer
└─────────────────────────────────────────┘
```

**Data requirements**:
- State name and code
- Aggregate workforce (sum of all factory workforce_size in state)
- Aggregate open positions (sum of all factory open_positions in state)
- Top 5 employers by workforce (factory name, company name, workforce)
- Top 5 largest factories by workforce

**Interactions**:
- Click on employer/factory row → Open factory detail panel
- Click "View All Factories" → Navigate to Node Explorer with state filter applied

### Component: FactoryDetailPanel

**Purpose**: Display detailed information about a selected factory.

**Shown when**: User clicks on a factory marker.

**Content structure**:

```
┌─────────────────────────────────────────┐
│ 🏭 Factory Node        [Active] ✓  [X] │  ← Header with status badge
├─────────────────────────────────────────┤
│ Lockheed Martin                         │  ← Factory name (large)
│ Aerospace                               │  ← Industry
├─────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐        │
│ │ Workforce   │ │ Open        │        │
│ │   12,990    │ │ Positions   │        │
│ │             │ │   1,200     │        │
│ └─────────────┘ └─────────────┘        │
├─────────────────────────────────────────┤
│ Connected Nodes                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🏢 Parent Company              →   │ │  ← Link to company
│ │    Lockheed Martin Corporation     │ │
│ ├─────────────────────────────────────┤ │
│ │ 👔 Occupations                 31  │ │  ← Expandable list
│ ├─────────────────────────────────────┤ │
│ │ 🔧 Skills                     221  │ │  ← Expandable list
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Specialization                          │
│ USAF Plant 4                            │
├─────────────────────────────────────────┤
│ Description                             │
│ Fighter aircraft production with        │
│ stealth technology and avionics         │
├─────────────────────────────────────────┤
│ 📍 Location                             │
│ 32.76°, -97.33°                         │
│ [Center on Map]                         │
├─────────────────────────────────────────┤
│ [View Full Factory Page →]              │
└─────────────────────────────────────────┘
```

**Data requirements**:
- Factory details (name, specialization, description, location)
- Parent company (id, name)
- Workforce statistics (workforce_size, open_positions)
- Occupation count and list (via factory_occupations junction)
- Skill count (aggregated from occupations)

**Interactions**:
- Click "Parent Company" → Open CompanyPreviewPanel or navigate to company page
- Click "Occupations" → Expand to show list of occupation titles
- Click individual occupation → Navigate to occupation detail page
- Click "Center on Map" → Fly map to factory location
- Click "View Full Factory Page" → Navigate to `/factories/:id`

### Component: MapSearch

**Purpose**: Allow users to search for specific entities directly from the map view.

**Position**: Integrated into the FilterBar or as separate search input overlaid on map (top-left).

**Inputs**: Search query string

**Outputs**: Search results, selected result

**Behavior**:
- As-you-type search with 300ms debounce
- Searches across: factory names, company names, state names
- Results grouped by entity type
- Selecting a result:
  - State: Zooms to state bounds, opens StateSummaryPanel
  - Company: Zooms to show all factories of that company, applies company filter
  - Factory: Zooms to factory location, opens FactoryDetailPanel

**Result display**:
```
┌─────────────────────────────────────────┐
│ 🔍 "boeing"                             │
├─────────────────────────────────────────┤
│ Companies                               │
│   The Boeing Company                    │
│   Boeing Defense                        │
├─────────────────────────────────────────┤
│ Factories                               │
│   Boeing Everett Factory                │
│   Boeing Renton Factory                 │
│   Boeing Charleston                     │
├─────────────────────────────────────────┤
│ States                                  │
│   (no matches)                          │
└─────────────────────────────────────────┘
```

### Component: MapControls

**Purpose**: Provide standard map navigation controls.

**Position**: Bottom-right corner of map canvas.

**Controls**:
- Zoom in (+)
- Zoom out (-)
- Reset view (home icon) - returns to initial US overview
- Geolocate (location icon) - centers on user's location if permitted
- Fullscreen toggle (expand icon)

**Behavior**:
- Controls have subtle background for visibility against map
- Tooltips on hover explain each control
- Keyboard shortcuts: +/- for zoom, Escape for reset view

---

## State Management

The Map View requires coordinated state across multiple components. Use Zustand store.

### MapStore

```typescript
interface MapStore {
  // Viewport
  center: [number, number];
  zoom: number;
  bounds: LngLatBounds | null;
  
  // Selection
  selectedEntityType: 'state' | 'factory' | null;
  selectedEntityId: string | null;
  
  // Filters
  filters: {
    companies: string[];      // Company IDs
    industries: string[];     // Industry names
    states: string[];         // State codes
    workforceMin: number | null;
    workforceMax: number | null;
    hasOpenPositions: boolean;
  };
  
  // UI State
  sidebarOpen: boolean;
  filterBarExpanded: boolean;
  
  // Actions
  setViewport: (center, zoom) => void;
  selectState: (stateCode: string) => void;
  selectFactory: (factoryId: string) => void;
  clearSelection: () => void;
  setFilter: (filterName, value) => void;
  clearFilters: () => void;
  toggleSidebar: () => void;
}
```

### URL Synchronization

Map state should sync with URL for shareable links:

```
/map?state=WA                           # State selected
/map?factory=abc123                      # Factory selected
/map?companies=boeing,tesla&industry=aerospace  # Filters applied
/map?lat=47.6&lng=-122.3&zoom=10        # Custom viewport
```

---

## API Endpoints

### GET /api/map/factories/geojson

**Purpose**: Return all factories as GeoJSON for map rendering.

**Query params**:
- `companies`: Comma-separated company IDs
- `industries`: Comma-separated industry names
- `states`: Comma-separated state codes
- `workforce_min`: Minimum workforce size
- `workforce_max`: Maximum workforce size
- `has_positions`: Boolean, filter to factories with open positions

**Response**:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.1234, 47.5678]
      },
      "properties": {
        "id": "factory-uuid",
        "name": "Boeing Everett Factory",
        "company_name": "The Boeing Company",
        "company_id": "company-uuid",
        "industry": "Aerospace",
        "workforce_size": 30000,
        "open_positions": 500,
        "state": "WA"
      }
    }
  ]
}
```

**Performance**: Response should be <1MB even with 100k factories. Properties kept minimal for map rendering; full details fetched on click.

### GET /api/map/states/summary

**Purpose**: Return aggregated statistics for all states (for choropleth).

**Response**:
```json
{
  "states": [
    {
      "code": "WA",
      "name": "Washington",
      "factory_count": 245,
      "total_workforce": 125000,
      "total_open_positions": 3400
    },
    ...
  ]
}
```

### GET /api/map/states/:code

**Purpose**: Return detailed summary for a single state.

**Response**:
```json
{
  "code": "WA",
  "name": "Washington",
  "factory_count": 245,
  "total_workforce": 125000,
  "total_open_positions": 3400,
  "top_employers": [
    {
      "factory_id": "uuid",
      "factory_name": "Boeing Everett Factory",
      "company_name": "The Boeing Company",
      "workforce_size": 30000
    }
  ],
  "largest_factories": [
    {
      "factory_id": "uuid",
      "factory_name": "Wide-body Aircraft Assembly",
      "company_name": "The Boeing Company",
      "workforce_size": 30000,
      "specialization": "Commercial aircraft"
    }
  ],
  "industries": [
    { "name": "Aerospace", "factory_count": 45, "workforce": 65000 },
    { "name": "Automotive", "factory_count": 23, "workforce": 28000 }
  ]
}
```

### GET /api/factories/:id

**Purpose**: Return full factory details for sidebar panel.

**Response**:
```json
{
  "id": "uuid",
  "name": "Boeing Everett Factory",
  "specialization": "Wide-body commercial aircraft",
  "description": "Largest building in the world by volume...",
  "location": {
    "latitude": 47.9234,
    "longitude": -122.2716,
    "address": "3003 W Casino Rd, Everett, WA 98204"
  },
  "workforce_size": 30000,
  "open_positions": 500,
  "company": {
    "id": "uuid",
    "name": "The Boeing Company",
    "industry": "Aerospace"
  },
  "occupations": [
    { "id": "uuid", "title": "Aircraft Assembler", "headcount": 5000 },
    { "id": "uuid", "title": "Quality Inspector", "headcount": 1200 }
  ],
  "occupation_count": 85,
  "skill_count": 342
}
```

### GET /api/search

**Purpose**: Global search across all entity types.

**Query params**:
- `q`: Search query (required)
- `types`: Comma-separated entity types to search (companies, factories, states, occupations, skills)
- `limit`: Max results per type (default 5)

**Response**:
```json
{
  "query": "boeing",
  "results": {
    "companies": [
      { "id": "uuid", "name": "The Boeing Company", "industry": "Aerospace" }
    ],
    "factories": [
      { "id": "uuid", "name": "Boeing Everett Factory", "company": "The Boeing Company", "state": "WA" },
      { "id": "uuid", "name": "Boeing Renton Factory", "company": "The Boeing Company", "state": "WA" }
    ],
    "states": [],
    "occupations": [],
    "skills": []
  }
}
```

---

## Entity Detail Pages

When users click "View Full Details" from the sidebar, they navigate to dedicated entity pages. These pages show comprehensive information with a minimap showing geographic context.

### Route: /states/:code

**Layout**:
```
┌─────────────────────────────────────────────────────────────────────┐
│  [← Back to Map]                                    ARCHANGEL       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Washington                                    ┌───────────────────┐│
│  WA - United States                            │                   ││
│                                                │    [Mini Map]     ││
│  ┌─────────┐ ┌─────────┐ ┌─────────┐          │   State outline   ││
│  │Factories│ │Workforce│ │Open Pos │          │   with markers    ││
│  │   245   │ │ 125,000 │ │  3,400  │          │                   ││
│  └─────────┘ └─────────┘ └─────────┘          └───────────────────┘│
│                                                                     │
│  Industries                                                         │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ [Bar chart showing industry breakdown]                         ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  All Factories (245)                                    [Search]   │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ Boeing Everett Factory    │ Aerospace │ 30,000 │ View →       ││
│  │ Boeing Renton Factory     │ Aerospace │ 12,000 │ View →       ││
│  │ ...                                                            ││
│  └────────────────────────────────────────────────────────────────┘│
│  [Load More]                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Route: /factories/:id

**Layout**: Similar structure with factory details, parent company link, occupation list, skill summary, and minimap centered on factory location.

### Route: /companies/:id

**Layout**: Company overview with minimap showing all factory locations, list of all factories, industry breakdown, total workforce across all facilities.

---

## Static Assets Required

### State Boundaries GeoJSON

Source: US Census Bureau TIGER/Line files, simplified for web use.

File: `/public/data/us-states.geojson`

Properties needed per state: `code` (2-letter), `name`

Optimization: Simplify geometry to reduce file size (<500KB total)

### Choropleth Color Scale

For state data density visualization:

| Percentile | Color | Hex |
|------------|-------|-----|
| 0-20% | Lightest | #1E3A5F |
| 20-40% | Light | #2A4A6F |
| 40-60% | Medium | #3B5B80 |
| 60-80% | Dark | #4C6C91 |
| 80-100% | Darkest | #5D7DA2 |

Zero data states: #1a1a2e (near background, barely visible)

---

## Performance Considerations

### Data Loading Strategy

1. **Initial load**: Fetch `/api/map/states/summary` for choropleth data (small payload)
2. **Deferred load**: Fetch `/api/map/factories/geojson` after map renders (can be large)
3. **On-demand**: Fetch factory details only when user clicks a marker
4. **Caching**: Use TanStack Query with 5-minute stale time for factory GeoJSON

### Clustering Configuration

```javascript
map.addSource('factories', {
  type: 'geojson',
  data: factoriesGeoJSON,
  cluster: true,
  clusterMaxZoom: 10,      // Stop clustering at zoom 10
  clusterRadius: 50,        // Cluster radius in pixels
  clusterProperties: {
    sum_workforce: ['+', ['get', 'workforce_size']]
  }
});
```

### Memory Management

- Remove factory source when zoomed out to national level (zoom < 5)
- Use `map.queryRenderedFeatures()` instead of storing all features in React state
- Implement virtual scrolling for factory lists in sidebar if > 50 items

---

## Accessibility

- All interactive elements keyboard accessible
- Cluster/marker selection via Tab + Enter
- Screen reader announcements for state/factory selection
- High contrast mode support (detect system preference)
- Skip link to bypass map for keyboard users

---

## Mobile-Specific Behavior

### Bottom Sheet Sidebar

- Collapsed: 80px tall, shows entity name only
- Half-expanded: 50% of screen, shows summary stats
- Full-expanded: 90% of screen, shows all details
- Drag handle for resizing
- Swipe down to dismiss

### Touch Interactions

- Pinch to zoom (standard map behavior)
- Tap marker to select
- Tap outside sidebar to dismiss
- Long press on marker for quick preview tooltip

### Filter Drawer

- Filters hidden behind "Filters" FAB
- Opens as full-screen drawer on mobile
- "Apply Filters" button closes drawer and updates map

---

## Future Enhancements (Out of Scope for MVP)

- 3D building extrusions at high zoom levels
- Heatmap layer alternative to choropleth
- Time-based animation showing factory growth/decline
- Draw polygon to search area
- Directions/routing to factory location
- Satellite imagery toggle
- Export visible factories to CSV
