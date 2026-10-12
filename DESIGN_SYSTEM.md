# ReportBond Design System

## Overview

A **graph-first** design system built on a minimalist foundation. The UI shows pools, reports, and wallets as a graph, with semantic colors for each status state. Primary actions stay black for clarity; the brand accent (Indigo) highlights selection, progress, and payout paths.

---

## Color Palette

### Brand & Neutrals (Light Mode)

```
┌─────────────────────────────────────────────────────────────┐
│  BRAND (Indigo → Sky glow)                                   │
├─────────────────────────────────────────────────────────────┤
│  --brand         #4f46e5    Primary accent, selection       │
│  --brand-light   #818cf8    Hover state                     │
│  --brand-glow    #0ea5e9    Sky glow effect                 │
│  --brand-bg      #eef2ff    Brand background tint           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NEUTRALS                                                    │
├─────────────────────────────────────────────────────────────┤
│  --ink           #000000    Primary text, black buttons     │
│  --ink-muted     #6b7280    Secondary text, labels          │
│  --surface       #f5f5f5    Page background                 │
│  --card          #ffffff    Card backgrounds                │
│  --line          #e5e7eb    Borders, dividers               │
└─────────────────────────────────────────────────────────────┘
```

### Status Colors (Light Mode)

Each status has a distinct **color + shape**, so color is never the only difference.

```
┌─────────────────────────────────────────────────────────────┐
│  STATUS PALETTE                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ○ WAITING (Slate) — Hollow node                            │
│    --waiting       #64748b    Slate icon/border             │
│    --waiting-text  #475569    Text (4.5:1 contrast)         │
│    --waiting-bg    #f1f5f9    Background tint               │
│                                                             │
│  ◉ ACKNOWLEDGED (Blue) — Hollow with center dot             │
│    --acknowledged       #2563eb    Blue icon/border         │
│    --acknowledged-text  #1d4ed8    Text                     │
│    --acknowledged-bg    #dbeafe    Background tint          │
│                                                             │
│  ● VALID (Green) — Filled node, larger = bounty paid        │
│    --valid         #16a34a    Green fill                    │
│    --valid-text    #15803d    Text                          │
│    --valid-bg      #dcfce7    Background tint               │
│                                                             │
│  ● MISTAKE (Amber) — Filled node                            │
│    --mistake       #d97706    Amber fill                    │
│    --mistake-text  #b45309    Text                          │
│    --mistake-bg    #fef3c7    Background tint               │
│                                                             │
│  ⊗ SLOP (Red) — Tinted node with ×                          │
│    --slop          #dc2626    Red border                    │
│    --slop-text     #b91c1c    Text                          │
│    --slop-bg       #fee2e2    Background tint               │
│                                                             │
│  ◌ REFUNDED (Violet) — Dashed node                          │
│    --refunded      #7c3aed    Violet border (dashed)        │
│    --refunded-text #6d28d9    Text                          │
│    --refunded-bg   #ede9fe    Background tint               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Graph Edges

```
┌─────────────────────────────────────────────────────────────┐
│  GRAPH EDGES                                                 │
├─────────────────────────────────────────────────────────────┤
│  --edge          #c7d2fe    Pale indigo (1.5px)             │
│  --edge-dashed   #94a3b8    Slate (dashed, "not yet")       │
│  --edge-money    #4f46e5    Thick indigo (money flows)      │
│  --selection-ring  #4f46e5  Selected node ring              │
│  --selection-glow  rgba(79,70,229,0.2)  Selection halo      │
└─────────────────────────────────────────────────────────────┘
```

### Hero/Background

```
┌─────────────────────────────────────────────────────────────┐
│  HERO/BACKGROUND                                             │
├─────────────────────────────────────────────────────────────┤
│  --hero-bg        #f7f7f7    Geometric background           │
│  --hero-line      #d5d5d5    Isometric grid lines           │
│  --hero-line-2    #e0e0e0    Secondary grid lines           │
│  --hero-glow      rgba(255,255,255,0.85)   Glow spots       │
│  --hero-fade      rgba(247,247,247,0.8)    Bottom fade      │
└─────────────────────────────────────────────────────────────┘
```

### Dark Mode (Auto-detects)

```
--ink             #f3f4f6    (inverted)
--surface         #0d0d0f    (dark)
--card            #17171a    (dark gray)
--line            #2a2a2f    (subtle)
--brand           #818cf8    (lighter indigo)
--brand-glow      #38bdf8    (lighter sky)
--edge            #3730a3    (darker indigo)
```

---

## Typography

### Font Stack

```css
--font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
--font-mono: ui-monospace, monospace;
```

### Text Styles

| Style | Class | Usage |
|-------|-------|-------|
| **Heading XL** | `text-6xl font-black` | Hero titles |
| **Heading L** | `text-4xl font-black` | Section titles |
| **Heading M** | `text-2xl font-semibold` | Page titles |
| **Body** | `text-sm` / `text-base` | Content |
| **Muted** | `text-ink-muted` | Secondary text |
| **Mono** | `.num` | Amounts, addresses, IDs |

### Numeric Display

```css
.num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

Used for: USDC amounts, wallet addresses, report IDs, transaction hashes.

---

## Spacing & Layout

### Border Radius

```
Cards:       rounded-3xl    (24px)
Buttons:     rounded-full   (9999px)
Pills:       rounded-full   (9999px)
Inputs:      rounded-[8px]  (8px)
Notices:     rounded-2xl    (16px)
```

### Container Widths

```
max-w-4xl    Main content (896px)
max-w-2xl    Centered content (672px)
```

### Spacing Scale

```
p-4, p-5, p-6, p-8    Card padding
gap-3, gap-4, gap-6   Grid/flex gaps
space-y-6, space-y-8  Section spacing
```

---

## Components

### Card

```tsx
<Card className="fade-in">
  {children}
</Card>
```

**Styles:**
- `rounded-3xl` - Large border radius
- `border border-line` - Subtle border
- `bg-card` - White background
- `shadow-minimal` - Soft shadow
- `p-6 sm:p-8` - Responsive padding

### Button

```tsx
<Button variant="primary">Action</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger">Delete</Button>
```

**Variants:**

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `primary` | `bg-ink` (black) | `text-card` (white) | none |
| `secondary` | `bg-card` (white) | `text-ink` (black) | `border-ink/10` |
| `danger` | `bg-slashed-bg` | `text-slashed` | `border-slashed/20` |

**Effects:**
- `rounded-full` - Pill shape
- `shadow-minimal-lg` - Elevated shadow
- `active:scale-[0.98]` - Press feedback
- `state-change` - Smooth transitions

### Notice (Status Messages)

```tsx
<Notice tone="returned">Success message</Notice>
<Notice tone="waiting">Processing...</Notice>
<Notice tone="slashed">Error message</Notice>
```

**Tones:**
- `neutral` - Gray border, surface background
- `returned` - Green theme (success)
- `waiting` - Amber theme (pending)
- `slashed` - Red theme (error)

### StatusPill

```tsx
<StatusPill status={Status.Valid} />
```

**States (color + shape, never color alone):**
- Waiting (Slate) - Clock icon, hollow
- Acknowledged (Blue) - Clock icon, dot center
- Valid (Green) - Check icon, filled
- Mistake (Amber) - Return arrow, filled
- Slop (Red) - X icon, tinted
- Refunded (Violet) - Return arrow, dashed

### Empty State

```tsx
<Empty>No items found</Empty>
```

**Styles:**
- Dashed border
- Centered icon
- Muted text

---

## Graph Components

The UI shows pools, reports, and wallets as a graph. Import from `@/components/graph`.

### Node Types

```tsx
import { HubNode, SatelliteNode, ConnectorNode, DraftNode } from "@/components/graph";

// Pool hub - sized by balance, gradient indigo → sky
<HubNode size="lg" balance={10_000_000n} selected />

// Report satellite - status determines fill
<SatelliteNode status={Status.Valid} size="md" />
<SatelliteNode status={Status.Waiting} size="md" />  // hollow
<SatelliteNode status={Status.Slop} size="md" />     // × icon

// Wallet connector - links reports across pools
<ConnectorNode address="0x1234...5678" />

// Draft node - dashed outline, not yet submitted
<DraftNode size="md" />
```

**Node Sizes:**
- `sm` - 24px (graph thumbnails)
- `md` - 40px (default satellites)
- `lg` - 56px (hubs, selected)
- `xl` - 80px (hero focus)

### Edge Types

```tsx
import { Edge, DashedEdge, MoneyEdge, PayoutEdge, GraphContainer } from "@/components/graph";

<GraphContainer width={400} height={300}>
  {/* Standard edge - pale indigo */}
  <Edge from={{ x: 50, y: 50 }} to={{ x: 150, y: 100 }} />

  {/* Dashed edge - "not yet true" */}
  <DashedEdge from={{ x: 50, y: 50 }} to={{ x: 150, y: 100 }} />

  {/* Money edge - thick with glow */}
  <MoneyEdge from={{ x: 50, y: 50 }} to={{ x: 150, y: 100 }} amount={5_000_000n} />

  {/* Payout edge - animated green dashes */}
  <PayoutEdge from={{ x: 50, y: 50 }} to={{ x: 150, y: 100 }} amount={7_000_000n} />
</GraphContainer>
```

### Graph Styling

| Class | Effect |
|-------|--------|
| `.graph-canvas` | Dotted background pattern |
| `.node-hub` | Gradient core, hub shadow |
| `.node-satellite` | Circular, colored by status |
| `.node-selected` | Indigo ring + glow halo |
| `.node-halo` | Soft radial glow effect |
| `.edge` | 1.5px pale indigo stroke |
| `.edge-dashed` | Dashed for pending states |
| `.edge-money` | 3px indigo with glow |
| `.edge-payout` | Animated green dashes |
| `.deadline-ring` | Dashed circle (timeout) |
| `.keeper-band` | Violet fill (auto-refund zone) |

### Graph Patterns

1. **Network Map** - All pools as hubs, reports as satellites, wallets as connectors
2. **Constellation** - Single pool with reports by age, deadline ring
3. **Outcome Tree** - Submitted → Waiting → Verdict (4 leaves)
4. **Ego Network** - Your wallet → your reports → pools

---

## Shadows

```css
.shadow-minimal {
  box-shadow: 0 1px 3px 0 rgba(0,0,0,0.06),
              0 1px 2px -1px rgba(0,0,0,0.04);
}

.shadow-minimal-lg {
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08),
              0 2px 4px -2px rgba(0,0,0,0.04);
}

.shadow-minimal-xl {
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.08),
              0 8px 10px -6px rgba(0,0,0,0.04);
}
```

**Usage:**
- `shadow-minimal` - Default cards
- `shadow-minimal-lg` - Buttons, elevated cards
- `shadow-minimal-xl` - Hover states, modals

---

## Animations

### Page Transitions

```css
.fade-in {
  animation: fadeIn 600ms ease-out;
}

.slide-up {
  animation: slideUp 600ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Interactive States

```css
.state-change {
  transition: background-color 300ms ease,
              color 300ms ease,
              border-color 300ms ease;
}
```

### Bug Icon Animations

```css
.bug-wiggle {
  animation: bugWiggle 2s ease-in-out infinite;
}
/* Rotates ±3° */

.bug-crawl {
  animation: bugCrawl 3s ease-in-out infinite;
}
/* Moves ±8px horizontally */

.float-slow {
  animation: float 4s ease-in-out infinite;
}
/* Floats ±10px vertically */

.pulse-slow {
  animation: pulse 3s ease-in-out infinite;
}
/* Opacity 1 → 0.5 → 1 */
```

### Flow Arrow Animation

```css
.animate-dash {
  animation: dashFlow 2s linear infinite;
}
/* Animates dashed line stroke */
```

### Card Hover

```css
.card-hover:hover {
  transform: translateY(-2px);
}
/* Lifts card with enhanced shadow */
```

---

## Background Patterns

### Isometric Grid (Hero)

```css
.geometric-bg {
  background: var(--hero-bg);
  background-image:
    linear-gradient(30deg, transparent 48%, var(--hero-line) 48%, var(--hero-line) 52%, transparent 52%),
    linear-gradient(-30deg, transparent 48%, var(--hero-line) 48%, var(--hero-line) 52%, transparent 52%),
    linear-gradient(90deg, transparent 48%, var(--hero-line-2) 48%, var(--hero-line-2) 52%, transparent 52%);
  background-size: 60px 104px, 60px 104px, 60px 60px;
}
```

Creates a 3D isometric cube grid pattern.

### Glass Card Effect

```css
.glass-card {
  backdrop-filter: blur(20px) saturate(180%);
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(229, 231, 235, 0.6);
}
```

---

## Icons

### SVG Icon Components

All icons are inline SVG for:
- Crisp rendering at any size
- Color inheritance via `currentColor`
- Animation support

**Icon Set:**

| Icon | Component | Usage |
|------|-----------|-------|
| Bug | `<BugIcon />` | Pool badges |
| Check Bug | `<CheckBugIcon />` | Valid verdict |
| Return Bug | `<ReturnBugIcon />` | Mistake verdict |
| Warning Bug | `<WarningBugIcon />` | Slop verdict |
| Clock Bug | `<ClockBugIcon />` | Refunded verdict |
| Report | `<ReportIcon />` | Submit step |
| Verdict | `<VerdictIcon />` | Review step |
| Reward | `<RewardIcon />` | Payout step |
| Flow Arrow | `<FlowArrow />` | Step connections |

### Status Icons (StatusPill)

```tsx
// 3×3px mini icons for inline status
<WaitingIcon />   // Clock
<CheckIcon />     // Checkmark
<ReturnIcon />    // Return arrow
<XIcon />         // X mark
```

---

## Responsive Breakpoints

```css
sm: 640px    /* Small tablets */
md: 768px    /* Tablets */
lg: 1024px   /* Laptops */
xl: 1280px   /* Desktops */
```

**Common Patterns:**

```tsx
// Responsive padding
className="p-6 sm:p-8"

// Responsive grid
className="grid sm:grid-cols-2 lg:grid-cols-4"

// Responsive text
className="text-4xl sm:text-5xl lg:text-6xl"
```

---

## Accessibility

### Focus States

```css
:focus-visible {
  outline: 2px solid var(--focus);  /* #4f46e5 (brand indigo) */
  outline-offset: 2px;
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: no-preference) {
  .state-change { transition: ... }
  .fade-in { animation: ... }
}
/* Animations disabled for users who prefer reduced motion */
```

### ARIA Labels

- All icons have `aria-hidden="true"`
- Interactive elements have descriptive labels
- Loading states use `aria-live="polite"`

---

## Usage Examples

### Page Layout

```tsx
<main className="space-y-12">
  {/* Hero with isometric background */}
  <section className="geometric-bg rounded-4xl p-12 fade-in">
    <h1 className="text-6xl font-black">Title</h1>
  </section>

  {/* Content section */}
  <section className="space-y-6 slide-up">
    <h2 className="text-4xl font-black">Section</h2>
    <Card>...</Card>
  </section>
</main>
```

### Verdict Card

```tsx
<div className="rounded-2xl bg-returned-bg border-2 border-gray-200 p-6">
  <CheckBugIcon className="h-12 w-12 bug-wiggle" />
  <h3 className="text-lg font-black text-returned">Valid</h3>
  <p className="text-sm text-gray-600">Deposit + Bounty</p>
</div>
```

### Flow Steps

```tsx
<div className="grid sm:grid-cols-3 gap-6">
  <Card className="card-hover">
    <ReportIcon className="float-slow" />
    <h3>Report Bug</h3>
  </Card>
  <FlowArrow className="hidden sm:block" />
  <Card className="card-hover">
    <VerdictIcon className="float-slow" />
    <h3>Get Verdict</h3>
  </Card>
</div>
```

---

## File Structure

```
app/
├── app/
│   └── globals.css         # CSS variables, animations, graph styles
├── components/
│   ├── ui.tsx              # Core components (Card, Button, Notice)
│   ├── icons.tsx           # SVG icon components
│   ├── StatusPill.tsx      # Status indicator with icons
│   ├── FeeBreakdown.tsx    # Fee display components
│   ├── Header.tsx          # Navigation header
│   ├── PoolList.tsx        # Pool cards with bug icons
│   └── graph/              # Graph visualization components
│       ├── index.ts        # Barrel export
│       ├── nodes.tsx       # HubNode, SatelliteNode, ConnectorNode
│       └── edges.tsx       # Edge, MoneyEdge, GraphContainer
└── lib/
    └── format.ts           # USDC formatting utilities
```

---

## Design Principles

1. **Graph First** - Show pools and reports as a visual network
2. **Black Primary Actions** - Main buttons stay black for clarity
3. **Indigo Selection** - Brand accent highlights focus and payout paths
4. **Semantic Shapes** - Every status has color + shape (never color alone)
5. **Dashed = Not Yet** - Dashed lines/borders for pending states
6. **Distance = Time** - Graph position encodes age/deadline
7. **Money Glows** - Thick indigo edges with glow for fund flows
8. **Accessibility** - 4.5:1 contrast, focus states, reduced motion
