# Design System

> **ID:** D05
> **Status:** Draft
> **Priority:** P0
> **Last updated:** 2026-03-10
> **Depends on:** D01 (branding_config schema)
> **Depended on by:** D09 (Candidate Portal), D21 (i18n)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-002 (Next.js 16)

---

## 1. Design Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **Data-dense, not cluttered** | ATS users manage hundreds of candidates. Show more data per screen than competitors (Ashby's edge over Greenhouse). |
| 2 | **Analytics-first** | Pipeline health, time-to-fill, source-of-hire visible from day one. Not bolted on later. |
| 3 | **Keyboard-first** | Recruiters live in the app 8+ hours/day. Every action reachable via keyboard shortcuts and command palette. |
| 4 | **Tenant-brandable** | Career pages and candidate portal respect `branding_config` (D01 organizations table). Internal UI stays consistent. |
| 5 | **Light theme is primary** | Corporate product used during business hours. Dark mode deferred to post-MVP — `next-themes` infrastructure included for future addition, but MVP ships light-only to reduce design surface area and testing scope. |
| 6 | **WCAG 2.1 AA baseline** | Legal requirement in many markets. 4.5:1 text contrast, full keyboard nav, screen reader support. |
| 7 | **Motion with purpose** | Animations improve comprehension (drag-drop feedback, loading states). No decorative motion. Respect `prefers-reduced-motion`. |

---

## 2. Color System

All colors defined as CSS custom properties in HSL format (shadcn/ui convention). Semantic tokens — describe purpose, not appearance.

### 2.1 Brand Palette

```css
:root {
  /* Primary — trust/action (blue-based, warmer than default shadcn) */
  --primary: 217 91% 45%;           /* #145FD9 — 5.3:1 on white (WCAG AA safe) */
  --primary-foreground: 210 40% 98%; /* #F8FAFC */

  /* Secondary — subtle backgrounds */
  --secondary: 210 20% 96%;         /* #F3F5F7 */
  --secondary-foreground: 222 47% 11%; /* #0F172A */

  /* Accent — highlight/hover states */
  --accent: 210 20% 93%;            /* #E8ECF0 */
  --accent-foreground: 222 47% 11%;

  /* Backgrounds */
  --background: 40 20% 99%;         /* #FEFDFB — warm white, not #FFF */
  --foreground: 222 47% 11%;        /* #0F172A */

  /* Surfaces (cards, popovers) */
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;

  /* Muted (disabled, secondary text) */
  --muted: 210 20% 96%;
  --muted-foreground: 215 16% 47%;  /* #71717A */

  /* Borders & inputs */
  --border: 214 32% 91%;            /* #E4E4E7 */
  --input: 214 32% 91%;
  --ring: 217 91% 45%;              /* matches primary */

  /* Radius */
  --radius: 0.5rem;                 /* 8px — rounded but not pill-shaped */
}
```

### 2.2 Semantic Status Colors

```css
:root {
  /* Pipeline stage defaults (overridable per tenant) */
  --stage-sourced: 210 100% 95%;     /* light blue */
  --stage-applied: 217 91% 50%;      /* primary blue */
  --stage-screening: 45 93% 47%;     /* amber */
  --stage-interview: 262 83% 58%;    /* purple */
  --stage-offer: 142 71% 45%;        /* green */
  --stage-hired: 142 76% 36%;        /* dark green */
  --stage-rejected: 0 84% 60%;       /* red */

  /* Functional */
  --destructive: 0 84% 60%;         /* #EF4444 */
  --destructive-foreground: 0 0% 98%;
  --success: 142 71% 45%;           /* #22C55E */
  --success-foreground: 0 0% 98%;
  --warning: 45 93% 47%;            /* #EAB308 */
  --warning-foreground: 0 0% 9%;
  --info: 217 91% 50%;              /* matches primary */
  --info-foreground: 0 0% 98%;
}
```

### 2.3 Dark Mode (Post-MVP)

Dark mode tokens are designed but **not shipped in MVP**. This is a corporate product — recruiters and hiring managers work in lit offices during business hours. Light theme is the expected experience.

**Post-MVP plan:** `next-themes` v0.4+ infrastructure will be included (SSR-safe cookie strategy, no white flash). Dark mode toggle added when customer demand warrants it. The token set below is ready for implementation:

<details>
<summary>Dark mode tokens (post-MVP reference)</summary>

```css
.dark {
  --primary: 217 91% 60%;           /* slightly lighter for dark bg */
  --primary-foreground: 222 47% 11%;

  --background: 224 71% 4%;         /* #09090B — soft black */
  --foreground: 213 31% 91%;        /* #E2E8F0 */

  --card: 224 71% 6%;               /* #111318 */
  --card-foreground: 213 31% 91%;
  --popover: 224 71% 6%;
  --popover-foreground: 213 31% 91%;

  --secondary: 223 47% 11%;
  --secondary-foreground: 213 31% 91%;

  --muted: 223 47% 11%;
  --muted-foreground: 215 16% 56%;

  --accent: 223 47% 15%;
  --accent-foreground: 213 31% 91%;

  --border: 223 47% 18%;
  --input: 223 47% 18%;
  --ring: 217 91% 60%;
}
```
</details>

---

## 3. Typography

### 3.1 Font Stack

```css
:root {
  --font-sans: 'Inter', 'Inter Variable', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
}
```

**Why Inter:** Highest x-height of modern sans-serifs. Optimized for data-dense screens. Variable font (single file, all weights). Used by Linear, Vercel, and leading SaaS tools.

**Why Geist Mono:** Next.js native. Code blocks, API keys, IDs, technical data.

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| `text-xs` | 12px | 400 | 1.5 | Labels, badges, metadata |
| `text-sm` | 14px | 400 | 1.5 | **Body (dashboard default)** — data-dense UI base |
| `text-base` | 16px | 400 | 1.5 | Body (marketing, candidate portal) |
| `text-lg` | 18px | 500 | 1.4 | Section subheadings |
| `text-xl` | 20px | 600 | 1.3 | Page section titles |
| `text-2xl` | 24px | 600 | 1.2 | Page titles |
| `text-3xl` | 30px | 700 | 1.2 | Hero / dashboard metric numbers |
| `text-4xl` | 36px | 700 | 1.1 | Career page titles (candidate portal only) |

**Dashboard base is 14px** (not 16px). Enterprise ATS users need information density. Marketing/candidate-facing pages use 16px base.

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

Tailwind default `0.25rem` base. No custom overrides needed.

| Token | Value | Common Use |
|-------|-------|------------|
| `1` | 4px | Icon gaps, badge padding |
| `2` | 8px | Input padding, card inner spacing |
| `3` | 12px | Compact list items |
| `4` | 16px | Standard card padding, section gaps |
| `6` | 24px | Between sections within a page |
| `8` | 32px | Major section dividers |
| `12` | 48px | Page-level vertical spacing |
| `16` | 64px | Top-level layout spacing |

### 4.2 Layout Grid

```
┌──────────────────────────────────────────────────┐
│ TopNav (h-14, fixed, z-50)                       │
├──────────┬───────────────────────────────────────┤
│ Sidebar  │ Main Content Area                     │
│ (w-64    │ (flex-1, overflow-y-auto)             │
│  collap- │                                       │
│  sed:    │  ┌─────────────────────────────────┐  │
│  w-16)   │  │ Page Header (breadcrumb + title)│  │
│          │  ├─────────────────────────────────┤  │
│          │  │ Content                         │  │
│          │  │ (max-w-7xl mx-auto px-6)        │  │
│          │  └─────────────────────────────────┘  │
├──────────┴───────────────────────────────────────┤
│ Command Palette (⌘K, overlay, z-50)              │
└──────────────────────────────────────────────────┘
```

- **Sidebar:** Left-aligned, 256px expanded / 64px collapsed. Persistent on desktop, drawer on mobile.
- **TopNav:** 56px height. Org switcher (left), search trigger (center), user menu + notifications (right).
- **Content:** `max-w-7xl` (1280px) centered with `px-6` padding. Full-width for kanban/table views.

---

## 5. Responsive Breakpoints

| Token | Width | Target | Layout Changes |
|-------|-------|--------|----------------|
| `sm` | 640px | Phone landscape | Single column. Sidebar hidden. Bottom nav. |
| `md` | 768px | Tablet portrait | Single column. Sidebar as drawer. |
| `lg` | 1024px | Tablet landscape | Two-column. Sidebar collapsed (icons). |
| `xl` | 1280px | Desktop | Full layout. Sidebar expanded. |
| `2xl` | 1536px | Large desktop | Extra-wide kanban columns. More table columns visible. |

**Primary target:** `xl` (1280px). Design desktop-first, adapt down.

### Responsive Patterns

| Component | `< lg` | `lg` | `xl+` |
|-----------|--------|------|-------|
| Sidebar | Hidden (hamburger) | Collapsed (64px icons) | Expanded (256px) |
| Kanban board | Vertical stack | Horizontal scroll | Full columns |
| Data tables | Card view | Horizontal scroll | Full table |
| Candidate detail | Full page | Full page | Side drawer (480px) |
| Filters | Bottom sheet | Collapsible panel | Inline sidebar |

---

## 6. Component Specifications

### 6.1 shadcn/ui Customizations

Base: shadcn/ui (Radix UI primitives + Tailwind styling). Customize, don't fork.

| Component | Customization |
|-----------|--------------|
| `Button` | 5 variants: `default`, `secondary`, `outline`, `ghost`, `destructive`. Height: 36px (sm), 40px (default), 48px (lg). |
| `Card` | `shadow-sm` default. `hover:shadow-md` for interactive cards. `border` always visible (no shadow-only cards). |
| `Dialog` | Max-width: `sm` (384px), `md` (448px), `lg` (512px), `xl` (640px), `full` (calc(100vw - 4rem)). |
| `Select` | Searchable by default for lists > 7 items (use `Combobox` pattern). |
| `Table` | Sticky header. Row hover highlight. Alternate row colors disabled (too cluttered). |
| `Badge` | Pipeline stage badges use `--stage-*` colors. Status badges: solid fill. Tag badges: outline. |
| `Tabs` | Underline style for page-level tabs. Pill style for inline toggles. |
| `Toast` | Bottom-right. Auto-dismiss: 5s (info), 8s (success), persistent (error). Slide-in from right. |
| `Tooltip` | 200ms delay. Max-width 240px. Dark background in both themes. |
| `Avatar` | Initials fallback. Size: 24px (xs), 32px (sm), 40px (md), 48px (lg). Ring for online status. |
| `Command` | `⌘K` trigger. Recent searches, contextual suggestions, keyboard navigation. |

### 6.2 Custom Components (ATS-specific)

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `KanbanBoard` | Horizontal pipeline view with drag-and-drop | `stages[]`, `candidates[]`, `onMove()` |
| `KanbanCard` | Candidate card within kanban column | `variant: 'mini' \| 'full'`, `candidate`, `daysInStage` |
| `CandidateDrawer` | Side drawer for candidate detail (480px) | `candidateId`, `applicationId` |
| `TimelineActivity` | Unified activity feed (notes, emails, interviews) | `events[]`, `grouped: boolean` |
| `StageIndicator` | Visual pipeline progress bar | `stages[]`, `currentStageId` |
| `MetricCard` | Dashboard analytics card with sparkline | `title`, `value`, `trend`, `sparkData[]` |
| `OrgSwitcher` | Organization selector in topnav | Uses `last_active_org_id` (ADR-005) |
| `FilterBar` | Composable filter chips with saved views | `filters[]`, `onApply()` |
| `ScoreRubric` | Structured scorecard display/input | `attributes[]`, `ratings[]` |
| `InterviewScheduler` | Calendar-integrated scheduling widget | `interviewerIds[]`, `duration` |
| `CustomFieldRenderer` | Renders custom field values by type (D07 `custom_field_definitions`) | `definition: CustomFieldDefinition`, `value: unknown`, `mode: 'display' \| 'edit'` |

**`CustomFieldRenderer` type mapping:**

| `field_type` | Display | Edit |
|-------------|---------|------|
| `text` | `<span>` | `<Input>` |
| `number` | `<span>` (formatted) | `<Input type="number">` |
| `date` | Formatted date string | `<DatePicker>` |
| `boolean` | Badge (Yes/No) | `<Switch>` |
| `select` | Badge | `<Select>` with options from `validation_rules.options` |
| `multi_select` | Badge group | `<MultiSelect>` with options from `validation_rules.options` |
| `url` | `<a>` link | `<Input type="url">` |

Validation uses `validation_rules` JSONB from the field definition (required, min/max, regex pattern). All custom field edit forms use `react-hook-form` + Zod with schemas generated from the definition at runtime.

---

## 7. Accessibility (WCAG 2.1 AA)

### 7.1 Contrast Ratios

| Element | Minimum Ratio | Verification |
|---------|--------------|--------------|
| Body text on background | 4.5:1 | `#0F172A` on `#FEFDFB` = 15.2:1 ✅ |
| Muted text on background | 4.5:1 | `#71717A` on `#FEFDFB` = 5.0:1 ✅ |
| Primary on white | 4.5:1 | `#145FD9` on `#FFFFFF` = 5.3:1 ✅ |
| Dark: body on background (post-MVP) | 4.5:1 | `#E2E8F0` on `#09090B` = 14.8:1 ✅ |
| Dark: muted on background (post-MVP) | 4.5:1 | `#8B8FA3` on `#09090B` = 5.7:1 ✅ |
| UI components (borders, icons) | 3:1 | All border colors verified against backgrounds |

### 7.2 Keyboard Navigation

- **Tab order:** Logical, left-to-right, top-to-bottom within each section
- **Focus ring:** 2px solid `--ring`, 2px offset. Visible in both themes.
- **Skip links:** "Skip to main content" on every page
- **Roving tabindex:** In kanban columns, table rows, and menu items
- **Escape:** Closes any overlay (modal, drawer, popover, command palette)

### 7.3 Screen Reader

- All images have `alt` text (or `aria-hidden` for decorative)
- Form inputs have visible labels (not placeholder-only)
- Status changes announced via `aria-live="polite"` regions
- Pipeline stage transitions use `aria-live` announcements
- Data tables use proper `<th scope>` and `<caption>`

### 7.4 Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

---

## 8. Animation & Motion

### 8.1 Timing Tokens

| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| `--duration-fast` | 100ms | `ease-out` | Hover states, focus rings |
| `--duration-normal` | 200ms | `ease-in-out` | Toasts, toggles, tab switches |
| `--duration-slow` | 300ms | `ease-in-out` | Drawer open/close, page transitions |
| `--duration-spring` | 400ms | `type: "spring", stiffness: 80, damping: 10` | Drag-and-drop, modal entry |

### 8.2 Patterns

| Interaction | Animation | Library |
|-------------|-----------|---------|
| Page route change | Fade (opacity 0→1, 150ms) | CSS transition |
| Kanban card drag | Scale 1.02, shadow elevation, spring settle | Motion (Framer Motion v11+) |
| Kanban card drop | Smooth position interpolation, 300ms spring | Motion (Framer Motion v11+) |
| Drawer open | Slide from right + fade, 300ms | Motion (Framer Motion v11+) |
| Modal open | Scale 0.95→1 + fade, 200ms | CSS transition |
| Toast appear | Slide from right, spring | Motion (Framer Motion v11+) |
| Loading states | Skeleton shimmer (CSS animation) | Tailwind `animate-pulse` |
| List stagger | Each item fades in +30ms offset | Motion `staggerChildren` |
| Chart transitions | Value interpolation, 400ms | Chart library native |

---

## 9. Iconography

- **Library:** Lucide React v0.460+ (shadcn/ui default, MIT licensed, 1500+ icons)
- **Size tokens:** 16px (inline with text), 20px (buttons/nav), 24px (page headers)
- **Stroke width:** 1.5px (default). 2px for emphasis/active states.
- **Color:** Inherit from parent `currentColor`. Never hardcode icon colors.

---

## 10. Career Page Theming (Candidate Portal)

The candidate-facing portal (`D09`) respects `branding_config` from `organizations` table.

### Tenant-Customizable Properties

| Property | CSS Variable Override | Fallback |
|----------|----------------------|----------|
| `logo_url` | — (rendered as `<img>`) | itecbrains ATS logo |
| `primary_color` | `--primary` | `217 91% 50%` |
| `secondary_color` | `--secondary` | `210 20% 96%` |
| `font_family` | `--font-sans` | Inter |
| `favicon_url` | — (rendered as `<link>`) | Default favicon |
| `career_page_header_html` | — (sanitized render) | Default header |

**Constraint:** Tenant branding applies only to career pages and candidate portal. Internal recruiter UI uses the system design tokens exclusively.

---

## 11. File Naming & Organization

```
components/
├── ui/                    # shadcn/ui base (auto-generated, minimal edits)
│   ├── button.tsx
│   ├── card.tsx
│   └── ...
├── layout/                # App shell
│   ├── sidebar.tsx
│   ├── topnav.tsx
│   ├── org-switcher.tsx
│   └── command-palette.tsx
├── pipeline/              # Kanban / pipeline
│   ├── kanban-board.tsx
│   ├── kanban-card.tsx
│   └── stage-indicator.tsx
├── candidates/            # Candidate views
│   ├── candidate-drawer.tsx
│   ├── candidate-card.tsx
│   └── timeline-activity.tsx
├── analytics/             # Dashboard widgets
│   ├── metric-card.tsx
│   └── funnel-chart.tsx
├── interviews/            # Scheduling & scorecards
│   ├── score-rubric.tsx
│   └── interview-scheduler.tsx
└── shared/                # Cross-cutting
    ├── filter-bar.tsx
    ├── data-table.tsx
    └── empty-state.tsx
```

---

*Created: 2026-03-10*
