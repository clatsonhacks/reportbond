# ReportBond Implementation Plan

A phase-by-phase implementation plan based on the design approach analysis.

---

## Phase 1: Core Infrastructure

### Graph Visualization Foundation
- [ ] Install D3.js or Recharts for graph rendering
- [ ] Create base `GraphContainer` component with zoom/pan
- [ ] Implement node and edge primitives
- [ ] Add touch/mouse interaction handlers

### Data Layer
- [ ] Create graph data types (`Node`, `Edge`, `GraphData`)
- [ ] Build transformation utilities (pool data → graph format)
- [ ] Implement caching for graph computations
- [ ] Add real-time update hooks

### Brand Color Integration
- [ ] Add primary brand color (Indigo `#4F46E5`) to CSS variables
- [ ] Update `globals.css` with `--brand` and `--brand-bg` tokens
- [ ] Create branded button variant
- [ ] Update accent colors for consistency

---

## Phase 2: Maintainer Flow

### 2.1 Pool Creation
- [ ] Multi-step wizard with progress indicator
- [ ] GitHub repository selector with search
- [ ] Deposit amount input with USDC formatting
- [ ] Bounty configuration (fixed or percentage)
- [ ] Timeout period selector
- [ ] Preview card before confirmation
- [ ] Transaction status with animated feedback

### 2.2 Report Review Dashboard
- [ ] Report queue with status filtering
- [ ] Report detail modal with:
  - Vulnerability summary
  - Affected files/lines (grounded)
  - Severity assessment
  - AI triage recommendation
- [ ] Quick verdict buttons (Valid/Mistake/Slop)
- [ ] Batch verdict signing

### 2.3 Verdict Signing
- [ ] EIP-712 signature flow explanation
- [ ] Preview outcome (deposit return, bounty payout)
- [ ] Fee breakdown display
- [ ] Signature confirmation modal
- [ ] Success/failure feedback

### 2.4 Fund Management
- [ ] Pool balance display with chart
- [ ] Deposit history timeline
- [ ] Bounty payout history
- [ ] Add funds action
- [ ] Withdraw available funds

### 2.5 Maintainer Dashboard
- [ ] Overview cards (active pools, pending reports, total payouts)
- [ ] Pool list with quick stats
- [ ] Recent activity feed
- [ ] Notification preferences

---

## Phase 3: Reporter Flow

### 3.1 Pool Discovery
- [ ] Search by GitHub repository
- [ ] Pool cards with:
  - Repository info
  - Bounty range
  - Response time stats
  - Active status
- [ ] Filter by bounty size, activity
- [ ] Sort by newest, highest bounty

### 3.2 Report Submission
- [ ] Advisory link input with validation
- [ ] Deposit amount display (from pool config)
- [ ] Fee breakdown component
- [ ] Wallet connection check
- [ ] USDC approval flow (if needed)
- [ ] Submit transaction with progress
- [ ] Confirmation with report ID

### 3.3 Status Tracking
- [ ] Report status timeline
- [ ] Status icons with animations:
  - `Waiting` - Clock icon, pulse animation
  - `Acknowledged` - Clock icon, amber
  - `Valid` - Check bug, green, wiggle
  - `Mistake` - Return bug, green
  - `Slop` - Warning bug, red
  - `Refunded` - Clock bug, violet
- [ ] Estimated response time
- [ ] Timeout countdown

### 3.4 Withdrawal
- [ ] Available balance display
- [ ] Withdrawal breakdown (deposit + bounty)
- [ ] One-click withdraw button
- [ ] Transaction confirmation
- [ ] Success celebration animation

### 3.5 Report History
- [ ] List of submitted reports
- [ ] Status pills with semantic colors
- [ ] Payout amounts
- [ ] Link to explorer transactions
- [ ] Export capability

---

## Phase 4: Polish & Animations

### 4.1 Graph Visualizations
- [ ] **Network Map**: All pools and reports as connected nodes
- [ ] **Constellation**: Repository-centric view with orbiting reports
- [ ] **Outcome Tree**: Verdict flow visualization
- [ ] **Ego Network**: User's pools/reports as central node

### 4.2 Brand Colors
Update semantic color mapping:
```css
--waiting: #64748b;      /* Slate - pending */
--acknowledged: #3b82f6; /* Blue - in progress */
--returned: #22c55e;     /* Green - valid/mistake */
--slashed: #ef4444;      /* Red - slop */
--refunded: #8b5cf6;     /* Violet - refunded */
--brand: #4f46e5;        /* Indigo - primary actions */
```

### 4.3 Micro-Animations
- [ ] Button press feedback (`active:scale-[0.98]`)
- [ ] Card hover lift (`translateY(-2px)`)
- [ ] Status icon animations:
  - `bug-wiggle` for valid verdicts
  - `pulse-slow` for pending states
  - `float-slow` for hero elements
- [ ] Flow arrow dash animation
- [ ] Page transitions (`fade-in`, `slide-up`)

### 4.4 Responsive Design
- [ ] Mobile-first layouts
- [ ] Touch-friendly tap targets (44px minimum)
- [ ] Collapsible navigation on mobile
- [ ] Responsive grid breakpoints:
  - `sm: 640px` - Small tablets
  - `md: 768px` - Tablets
  - `lg: 1024px` - Laptops
  - `xl: 1280px` - Desktops

### 4.5 Accessibility
- [ ] Focus visible states (`outline: 2px solid var(--focus)`)
- [ ] Reduced motion support (`prefers-reduced-motion`)
- [ ] ARIA labels on all icons
- [ ] Screen reader announcements for status changes
- [ ] Keyboard navigation for all flows

---

## Phase 5: Production Ready

### 5.1 Testing
- [ ] Component unit tests
- [ ] Integration tests for flows
- [ ] E2E scenarios (A-E) passing
- [ ] Visual regression tests
- [ ] Accessibility audit (WCAG 2.1 AA)

### 5.2 Security
- [ ] Input validation on all forms
- [ ] CSRF protection
- [ ] Rate limiting on API routes
- [ ] Signature verification
- [ ] No exposed private keys

### 5.3 Performance
- [ ] Bundle size optimization
- [ ] Image optimization (WebP, lazy loading)
- [ ] API response caching
- [ ] Database query optimization
- [ ] Lighthouse score > 90

### 5.4 Deployment
- [ ] Vercel configuration (`vercel.json`)
- [ ] Environment variables documented
- [ ] Database migrations automated
- [ ] Monitoring and alerting
- [ ] Error tracking (Sentry)

### 5.5 Documentation
- [x] README.md - Setup and usage
- [x] ARCHITECTURE.md - System overview
- [x] DESIGN_SYSTEM.md - UI specifications
- [ ] API documentation
- [ ] User guides

---

## Component Checklist

### Core UI (from `ui.tsx`)
- [x] `Card` - Rounded container with shadow
- [x] `Button` - Primary/secondary/danger variants
- [x] `ButtonLink` - Link styled as button
- [x] `Amount` - USDC formatted display
- [x] `ExplorerLink` - Transaction link
- [x] `Notice` - Status message (neutral/returned/waiting/slashed)
- [x] `Row` - Label/value pair
- [x] `Empty` - Empty state placeholder
- [x] `Loading` - Loading indicator

### Status Components
- [x] `StatusPill` - Inline status indicator
- [ ] `StatusTimeline` - Vertical progress tracker
- [ ] `VerdictCard` - Outcome display with icon

### Fee Components (from `FeeBreakdown.tsx`)
- [x] `ReportFeeBreakdown` - Deposit + protocol fee
- [x] `PoolCreationFeeNotice` - Pool fee display
- [x] `BountyFeeInfo` - Bounty fee explanation
- [x] `ProtocolFeeExplainer` - Full fee breakdown

### Graph Components (to build)
- [ ] `GraphContainer` - Zoomable/pannable canvas
- [ ] `NetworkMap` - Full network visualization
- [ ] `Constellation` - Repository-centric view
- [ ] `OutcomeTree` - Verdict flow
- [ ] `EgoNetwork` - User-centric view

---

## File Structure

```
app/
├── app/
│   ├── globals.css           # CSS variables, animations
│   ├── page.tsx              # Landing page
│   ├── pools/
│   │   ├── page.tsx          # Pool list
│   │   ├── [id]/page.tsx     # Pool detail
│   │   └── create/page.tsx   # Pool creation wizard
│   └── reports/
│       ├── page.tsx          # Report list
│       └── [id]/page.tsx     # Report detail
├── components/
│   ├── ui.tsx                # Core UI components
│   ├── icons.tsx             # SVG icons
│   ├── StatusPill.tsx        # Status indicators
│   ├── FeeBreakdown.tsx      # Fee displays
│   ├── Header.tsx            # Navigation
│   ├── PoolList.tsx          # Pool cards
│   └── graphs/               # Graph visualizations
│       ├── GraphContainer.tsx
│       ├── NetworkMap.tsx
│       ├── Constellation.tsx
│       └── OutcomeTree.tsx
└── lib/
    ├── format.ts             # USDC formatting
    ├── eip712.ts             # Signature types
    └── graph.ts              # Graph utilities
```

---

## Priority Order

1. **High Priority** (Week 1-2)
   - Brand color integration
   - Report submission flow completion
   - Status tracking with animations
   - Withdrawal flow

2. **Medium Priority** (Week 3-4)
   - Maintainer dashboard
   - Verdict signing flow
   - Pool management

3. **Lower Priority** (Week 5+)
   - Graph visualizations
   - Advanced filtering/search
   - Export features
   - Analytics dashboard

---

## Design Tokens Reference

From `DESIGN_SYSTEM.md`:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--ink` | `#000000` | `#f3f4f6` | Primary text |
| `--surface` | `#f5f5f5` | `#0d0d0f` | Page background |
| `--card` | `#ffffff` | `#17171a` | Card background |
| `--returned` | `#10b981` | `#34d399` | Success/valid |
| `--waiting` | `#f59e0b` | `#fbbf24` | Pending |
| `--slashed` | `#ef4444` | `#f87171` | Error/rejected |
