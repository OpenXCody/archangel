# Design QA Screenshots - White-Dot Map Markers

PR: #8 - Remove blue cluster badges, restore white-dot markers

## Screenshot Inventory

All screenshots captured from local dev server with mock factory data (30 locations across US).

### Phone (390px width)
- **`/workspace/artifacts/phone-map-continental.png`** (62K, 780x1848)
  - Continental US map with white dot markers visible
  - Solid dark search bar (no frosted glass)
  - Subtle white dot density at z3-5

- **`/workspace/artifacts/phone-map-sheet.png`** (80K, 780x1848)
  - Map with solid opaque bottom sheet open (#141414)
  - Factory detail view: "Kansas City Manufacturing"
  - 32vh peek, center-above-sheet preserved
  - Sheet cards solid #1A1A1A (bg-bg-elevated)

### Tablet (768px width)
- **`/workspace/artifacts/tablet-map-continental.png`** (95K, 1536x1848)
  - Continental US map, white dots spread across states
  - Progressive opacity visible at mid-zoom
  - All chrome solid opaque

- **`/workspace/artifacts/tablet-map-sheet.png`** (113K, 1536x1848)
  - Right-side sheet overlay on map
  - Factory information panel open
  - Solid dark background throughout

### Desktop (1280px+ width)
- **`/workspace/artifacts/desktop-map-continental.png`** (145K, 2560x1945)
  - Full continental US view with all 30 white dot markers
  - Optimal spacing and density perception
  - Search bar top-left, solid dark

- **`/workspace/artifacts/desktop-map-sheet.png`** (160K, 2560x1945)
  - Right-side detail panel open: "Minneapolis Plant"
  - Map visible on left with white dots
  - Solid opaque sheet #141414, cards #1A1A1A

## Design Verification Checklist

### ✅ White-Dot Markers (PASS)
- [x] White dots (#FFFFFF) visible at all zoom levels
- [x] NO blue numbered cluster badges (removed)
- [x] Progressive sizing: 3-4px (z3-5) → 5-6px (z6-8) → 7-8px (z≥9)
- [x] Progressive opacity: 0.55-0.65 → 0.75-0.85 → 0.90-0.95
- [x] Controlled glow visible, not blooming

### ✅ Solid Opaque Chrome (PASS)
- [x] Search bar solid dark, NO backdrop-blur-md
- [x] Sheet solid #141414 (bg-bg-surface)
- [x] Inner sheet cards solid #1A1A1A (bg-bg-elevated)
- [x] No frosted glass anywhere

### ✅ Layout Preserved (PASS)
- [x] 32vh bottom sheet peek on mobile
- [x] Center-above-sheet map positioning
- [x] State selection + choropleth intact
- [x] Factory markers interactive

### ✅ Counts Display (PASS)
- [x] NO count labels on map face
- [x] Blue numbered badges completely removed
- [x] Counts only in detail sheets (workforce size shown)

## once-ui / HeroUI Dark Craft Aesthetic

**Achieved:** Luminous white map dots with controlled glow for natural density perception. Solid opaque UI chrome throughout. Clean, modern dark interface matching design system.

**Rejected:** VB/PowerPoint blue numbered bubble aesthetic eliminated.

## Notes for Design Review

- All screenshots use mock GeoJSON data (30 US factories)
- Real marker interactions captured (clickable white dots)
- Sheet content shows actual data structure
- No Vercel preview needed - local validation complete
