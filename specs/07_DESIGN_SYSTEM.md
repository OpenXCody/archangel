# Design System Specification

## Overview

This document defines the visual language for Archangel, consolidating existing design tokens with entity-specific styling, component patterns, and animation guidelines. All UI code should reference this specification to ensure visual consistency across the application.

---

## Design Tokens

The design system uses CSS custom properties with a semantic naming convention. Tokens are defined in three layers:

1. **globals.css** — CSS custom properties consumed by Tailwind and components
2. **tokens.ts** — TypeScript export for programmatic access
3. **tailwind.config.ts** — Extended Tailwind classes

### Color System

#### Background Hierarchy

Four background levels create visual depth:

| Token | Dark Mode | Light Mode | Usage |
|-------|-----------|------------|-------|
| `--color-bg-shell` | #050608 | #f5f6f8 | App chrome, outer frame |
| `--color-bg-base` | #050608 | #f5f6f8 | Page background |
| `--color-bg-surface` | #090c12 | #e5e7ec | Cards, panels, modals |
| `--color-bg-elevated` | #11141d | #dde1e8 | Hover states, nested elements |

#### Foreground Colors

| Token | Dark Mode | Light Mode | Usage |
|-------|-----------|------------|-------|
| `--color-fg-default` | #f9fafb | #080b12 | Primary text |
| `--color-fg-muted` | #9ca3af | #6b7280 | Secondary text, labels |
| `--color-fg-soft` | #6b7280 | #9ca3af | Placeholder text, disabled |

#### Border Colors

| Token | Dark Mode | Light Mode | Usage |
|-------|-----------|------------|-------|
| `--color-border-subtle` | #1e2230 | #d2d7e2 | Card borders, dividers |
| `--color-border-strong` | #272b3a | #babfcc | Input borders, focus rings |

#### Accent Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-accent-primary` | #3b4a60 | Interactive elements, links |
| `--color-accent-soft` | #141822 (dark) / #e4e6ed (light) | Subtle highlights |
| `--color-accent-warning` | #ff9f1c | Alerts, warnings |

### Entity Colors

Each entity type has a distinct color for immediate visual identification:

| Entity | Primary | Light | Dark | Background |
|--------|---------|-------|------|------------|
| Company | #F59E0B | #FCD34D | #B45309 | rgba(245, 158, 11, 0.1) |
| Factory | #60A5FA | #93C5FD | #2563EB | rgba(96, 165, 250, 0.1) |
| Occupation | #1E40AF | #3B82F6 | #1E3A8A | rgba(30, 64, 175, 0.1) |
| Skill | #10B981 | #34D399 | #047857 | rgba(16, 185, 129, 0.1) |
| State | #6366F1 | #818CF8 | #4338CA | rgba(99, 102, 241, 0.1) |

Usage in components:

```tsx
// Entity badge
<span className="bg-amber-500/10 text-amber-500 border border-amber-500/20">
  Company
</span>

// Factory marker on map
const FACTORY_MARKER_COLOR = '#60A5FA';
```

### Typography

#### Font Families

| Token | Stack | Usage |
|-------|-------|-------|
| `--font-family-sans` | Inter, -apple-system, system-ui, sans-serif | Body text, UI |
| `--font-family-mono` | JetBrains Mono, ui-monospace, monospace | Code, data |

#### Type Scale

Use Tailwind's default scale with these semantic mappings:

| Purpose | Class | Size | Weight |
|---------|-------|------|--------|
| Page title | `text-2xl font-semibold` | 24px | 600 |
| Section heading | `text-lg font-medium` | 18px | 500 |
| Card title | `text-base font-medium` | 16px | 500 |
| Body text | `text-sm` | 14px | 400 |
| Caption/label | `text-xs text-fg-muted` | 12px | 400 |
| Data/numbers | `text-sm font-mono` | 14px | 400 |

#### Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `tracking-tight` | -0.02em | Headings |
| `tracking-normal` | 0 | Body text |

### Spacing

Use Tailwind's default spacing scale (4px base). Key patterns:

| Context | Spacing | Class |
|---------|---------|-------|
| Card padding | 16px | `p-4` |
| Section gap | 24px | `gap-6` |
| Inline elements | 8px | `gap-2` |
| Page margins | 24px | `px-6` |
| Modal padding | 24px | `p-6` |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-shell` | 20px | App shell corners |
| `--radius-card` | 16px | Cards, modals |
| `--radius-button` | 999px | Pill buttons |
| `--radius-input` | 10px | Inputs, selects |

Tailwind mapping:
```
rounded-sm  → 3px
rounded-md  → 6px
rounded-lg  → 9px
rounded-xl  → 16px (cards)
rounded-2xl → 20px (shell)
rounded-full → 999px (pills)
```

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-soft` | 0 18px 45px rgba(0, 0, 0, 0.7) | Elevated modals, dropdowns |

For lighter shadows, use Tailwind defaults:
- `shadow-sm` — Subtle card elevation
- `shadow-md` — Dropdowns, popovers
- `shadow-lg` — Modals

---

## Component Patterns

### Buttons

#### Primary Button
```tsx
<button className="
  bg-accent-primary text-fg-default
  px-4 py-2 rounded-full
  font-medium text-sm
  hover:bg-accent-primary/90
  focus-visible:ring-2 focus-visible:ring-accent-primary
  transition-colors
">
  Action
</button>
```

#### Secondary Button
```tsx
<button className="
  bg-bg-surface text-fg-default
  border border-border-subtle
  px-4 py-2 rounded-full
  font-medium text-sm
  hover:bg-bg-elevated
  transition-colors
">
  Cancel
</button>
```

#### Ghost Button
```tsx
<button className="
  text-fg-muted
  px-3 py-2 rounded-lg
  hover:bg-bg-surface hover:text-fg-default
  transition-colors
">
  <Icon className="w-4 h-4" />
</button>
```

### Cards

#### Standard Card
```tsx
<div className="
  bg-bg-surface
  border border-border-subtle
  rounded-xl
  p-4
">
  {/* Content */}
</div>
```

#### Interactive Card (clickable)
```tsx
<button className="
  bg-bg-surface
  border border-border-subtle
  rounded-xl
  p-4
  text-left w-full
  hover:bg-bg-elevated hover:border-border-strong
  transition-colors
">
  {/* Content */}
</button>
```

#### Entity Card
```tsx
// Company card with amber accent
<div className="
  bg-bg-surface
  border border-amber-500/20
  rounded-xl
  p-4
">
  <div className="flex items-center gap-2">
    <span className="text-amber-500">🏢</span>
    <span className="font-medium">Company Name</span>
    <span className="
      ml-auto
      bg-amber-500/10 text-amber-500
      text-xs px-2 py-0.5 rounded-full
    ">
      Company
    </span>
  </div>
</div>
```

### Inputs

#### Text Input
```tsx
<input
  type="text"
  className="
    w-full
    bg-bg-surface
    border border-border-subtle
    rounded-[10px]
    px-3 py-2
    text-sm text-fg-default
    placeholder:text-fg-soft
    focus:border-border-strong focus:outline-none
    focus:ring-2 focus:ring-accent-primary/20
  "
  placeholder="Search..."
/>
```

#### Select
```tsx
<select className="
  w-full
  bg-bg-surface
  border border-border-subtle
  rounded-[10px]
  px-3 py-2
  text-sm text-fg-default
  focus:border-border-strong focus:outline-none
">
  <option>Option 1</option>
</select>
```

### Badges

#### Entity Type Badge
```tsx
const ENTITY_BADGE_STYLES = {
  company: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  factory: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  occupation: 'bg-blue-800/10 text-blue-400 border-blue-800/20',
  skill: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  state: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

<span className={`
  text-xs px-2 py-0.5 rounded-full border
  ${ENTITY_BADGE_STYLES[entityType]}
`}>
  {entityType}
</span>
```

#### Status Badge
```tsx
<span className="
  inline-flex items-center gap-1.5
  text-xs text-fg-muted
">
  <span className="w-2 h-2 rounded-full bg-status-online" />
  Active
</span>
```

### Modals

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
  
  {/* Modal */}
  <div className="
    relative
    bg-bg-surface
    border border-border-subtle
    rounded-xl
    shadow-soft
    w-full max-w-lg
    max-h-[85vh] overflow-auto
    p-6
  ">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-medium">Modal Title</h2>
      <button className="text-fg-muted hover:text-fg-default">
        <X className="w-5 h-5" />
      </button>
    </div>
    
    {/* Content */}
    <div className="space-y-4">
      {/* ... */}
    </div>
  </div>
</div>
```

### Sidebar Panel

```tsx
<aside className="
  w-[400px]
  h-full
  bg-bg-surface
  border-l border-border-subtle
  overflow-y-auto
">
  {/* Header */}
  <div className="
    sticky top-0
    bg-bg-surface
    border-b border-border-subtle
    px-4 py-3
  ">
    <div className="flex items-center justify-between">
      <span className="font-medium">Panel Title</span>
      <button className="text-fg-muted hover:text-fg-default">
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
  
  {/* Content */}
  <div className="p-4 space-y-4">
    {/* ... */}
  </div>
</aside>
```

---

## Animation Patterns

### Transition Defaults

Apply to all interactive elements:

```css
.interactive {
  transition-property: color, background-color, border-color, opacity, transform;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

Tailwind shorthand: `transition-colors` or `transition-all duration-150`

### Micro-interactions

#### Button Press
```tsx
<button className="active:scale-[0.98] transition-transform">
```

#### Card Hover Lift
```tsx
<div className="hover:-translate-y-0.5 transition-transform">
```

#### Icon Rotation (accordion, dropdown)
```tsx
<ChevronDown className={`
  w-4 h-4 transition-transform duration-200
  ${isOpen ? 'rotate-180' : ''}
`} />
```

### Page Transitions

For route changes, use CSS transitions on the page wrapper:

```tsx
// Simple fade
<main className="animate-in fade-in duration-200">
  {children}
</main>
```

The `tailwindcss-animate` plugin provides:
- `animate-in` / `animate-out`
- `fade-in` / `fade-out`
- `slide-in-from-bottom-4` / `slide-out-to-bottom-4`
- `zoom-in-95` / `zoom-out-95`

### Modal Enter/Exit

```tsx
// Enter
<div className="animate-in fade-in zoom-in-95 duration-200">

// Exit
<div className="animate-out fade-out zoom-out-95 duration-150">
```

### Sidebar Slide

```tsx
// Enter from right
<aside className="animate-in slide-in-from-right duration-300">

// Enter from bottom (mobile)
<div className="animate-in slide-in-from-bottom duration-300">
```

### Loading States

#### Skeleton Pulse
```tsx
<div className="animate-pulse bg-bg-elevated rounded h-4 w-32" />
```

#### Spinner
```tsx
<svg className="animate-spin h-5 w-5 text-fg-muted">
  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.25" />
  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
```

### Map Animations

Map transitions are handled by MapLibre GL JS. Configure smooth zooming:

```typescript
map.easeTo({
  center: [lng, lat],
  zoom: 12,
  duration: 800,
  easing: (t) => t * (2 - t), // ease-out-quad
});
```

Marker appearance on zoom:
```typescript
// Fade in markers as they become visible
map.setPaintProperty('factory-markers', 'circle-opacity', [
  'interpolate', ['linear'], ['zoom'],
  7, 0,    // invisible at zoom 7
  8, 1,    // fully visible at zoom 8
]);
```

---

## Responsive Breakpoints

Use Tailwind's default breakpoints:

| Breakpoint | Min Width | Target |
|------------|-----------|--------|
| `sm` | 640px | Large phones (landscape) |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large monitors |

### Mobile-First Patterns

```tsx
// Stack on mobile, row on desktop
<div className="flex flex-col md:flex-row">

// Full width on mobile, fixed on desktop
<aside className="w-full md:w-[400px]">

// Hide on mobile, show on desktop
<nav className="hidden lg:flex">

// Bottom sheet on mobile, sidebar on desktop
<div className="
  fixed inset-x-0 bottom-0 md:relative md:inset-auto
  h-[50vh] md:h-full
  rounded-t-xl md:rounded-none
">
```

### Safe Area Insets (Mobile)

For native mobile (Capacitor), respect device safe areas:

```css
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}

.app-header {
  padding-top: max(1rem, var(--safe-area-top));
}

.bottom-nav {
  padding-bottom: max(0.5rem, var(--safe-area-bottom));
}
```

---

## Iconography

Use **Lucide React** for icons (MIT license, consistent stroke width).

```bash
npm install lucide-react
```

Standard sizing:
- Inline with text: `w-4 h-4`
- Button icon: `w-5 h-5`
- Feature icon: `w-6 h-6`
- Hero icon: `w-8 h-8`

Entity icons (emoji fallback for simplicity):
- Company: 🏢 or `<Building2 />`
- Factory: 🏭 or `<Factory />`
- Occupation: 👔 or `<Briefcase />`
- Skill: 🔧 or `<Wrench />`
- State: 📍 or `<MapPin />`

---

## Dark Mode

Dark mode is the default. Light mode is supported via the `.dark` class on `<html>`.

Toggle implementation:
```tsx
const toggleTheme = () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', 
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
};

// On page load
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
}
```

For MVP, dark mode only is acceptable. Light mode can be added post-launch.

---

## Accessibility

### Focus States

All interactive elements must have visible focus indicators:

```css
:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}
```

### Color Contrast

Ensure WCAG AA compliance (4.5:1 for normal text, 3:1 for large text):

| Combination | Contrast | Status |
|-------------|----------|--------|
| fg-default on bg-surface (dark) | 13.5:1 | ✓ AAA |
| fg-muted on bg-surface (dark) | 5.4:1 | ✓ AA |
| fg-soft on bg-surface (dark) | 3.9:1 | ✓ Large text only |

### Keyboard Navigation

- All interactive elements reachable via Tab
- Modals trap focus
- Escape closes modals/dropdowns
- Arrow keys navigate lists
- Enter/Space activate buttons

### Screen Reader Support

- Use semantic HTML (`<nav>`, `<main>`, `<aside>`, `<button>`)
- Add `aria-label` to icon-only buttons
- Use `aria-expanded` for accordions/dropdowns
- Announce dynamic content changes with `aria-live`

---

## File Reference

These files implement the design system:

| File | Purpose |
|------|---------|
| `client/src/styles/globals.css` | CSS custom properties, base styles |
| `tailwind.config.ts` | Tailwind extensions, plugins |
| `shared/tokens.ts` | TypeScript design tokens |
| `shared/colors.ts` | Entity color definitions |

When making UI decisions, consult this spec first, then these files.
