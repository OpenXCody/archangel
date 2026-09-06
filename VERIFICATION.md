# White-Dot Marker Verification

## Design Spec Implementation Checklist

### ✅ Blue Cluster Badges REMOVED
- [x] Removed clustering from factories GeoJSON source (`cluster: true` → removed)
- [x] Removed `factory-clusters` layer (blue numbered circles)
- [x] Removed `factory-cluster-count` layer (white number labels)
- [x] Removed cluster click handler (`factory-clusters` click → removed)
- [x] Removed cluster hover handlers (mouseenter/mouseleave → removed)

### ✅ White-Dot Markers RESTORED
**Core Markers (`factory-points`):**
- [x] Color: `#ffffff` (white, no blue)
- [x] Sizing per spec:
  - z3: 3px default, 4px hover, 5px selected
  - z5: 4px default, 5px hover, 6px selected
  - z6: 5px default, 6px hover, 7px selected
  - z8: 6px default, 7px hover, 8px selected
  - z9: 7px default, 8px hover, 9px selected
  - z12: 8px default, 9px hover, 10px selected (max)
- [x] Opacity per spec:
  - z3: 0.55 default, 1.0 hover/selected
  - z5: 0.65 default, 1.0 hover/selected
  - z6: 0.75 default, 1.0 hover/selected
  - z8: 0.85 default, 1.0 hover/selected
  - z9: 0.90 default, 1.0 hover/selected
  - z12: 0.95 default, 1.0 hover/selected

**Glow Layer (`factory-points-glow`):**
- [x] Color: `#ffffff` (white, no blue)
- [x] Radius: 4-12px growing with zoom and state
- [x] Opacity per spec:
  - z3: 0.12 default, 0.18 hover, 0.20 selected
  - z5: 0.18 default, 0.24 hover, 0.26 selected
  - z6: 0.18 default, 0.24 hover, 0.26 selected
  - z8: 0.22 default, 0.28 hover, 0.30 selected
  - z9: 0.28 default, 0.34 hover, 0.36 selected
- [x] Blur: 0.5-0.65 (controlled, progressive with zoom)

### ✅ Selected/Hover States
- [x] Removed all blue (`#60A5FA`) from selected/hover states
- [x] Selected ring: soft white `#ffffff` with 1.5px stroke at 0.35 opacity
- [x] Hover state: +1-2px core size, opacity 1.0, glow +0.08
- [x] Selected state: +1-2px core size, opacity 1.0, glow +0.08

### ✅ Interaction Model
- [x] Removed zoom gates - dots clickable at all zoom levels
- [x] Removed cluster hit-targets
- [x] Factory markers interactive from z3 onwards
- [x] Hover cursor on all zoom levels

### ✅ Preserved from #7
- [x] Opaque MapDetailPanel (solid `#141414`, no glass)
- [x] Center-above-sheet layout
- [x] 32vh bottom sheet peek
- [x] MAP-NAV lifecycle
- [x] State selection and choropleth

## Build Status
✅ TypeScript: Clean (no errors)
✅ Vite Production Build: Success
✅ Bundle size: ~796KB map chunk (no significant change)

## Visual Intent
Continental view (z3-5): Subtle white density overlay, no blue badges
State/region view (z6-8): Progressive size/opacity increase
City view (z≥9): Clear individual markers, max 7-8px diameter

Design aesthetic: once-ui / HeroUI dark craft - luminous white dots with controlled glow, NOT VB/PowerPoint blue numbered bubbles.
