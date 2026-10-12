# ReportBond: Graph-first redesign

**Design approach for the reporter and maintainer apps**
October 2026 · prepared from the ReportBond architecture doc and the existing light, monochrome design system

---

## 1. The idea in one line

ReportBond's data is a graph: pools, reports, reporter wallets, and the money that moves between them. So the main screens show that graph directly instead of hiding it in tables.

Every report is a node. Every pool is a hub. Every reporter wallet is a connector between pools. Every verdict is a branch. The UI makes those shapes visible, then puts the familiar cards, tables and forms around them.

## 2. Where the shapes come from (backend → design)

| Backend concept | Source | Visual form |
|---|---|---|
| `pools` mapping, `/api/pools` | Contract + indexer | **Hub node**, sized by balance, gradient core |
| `reports` mapping, `/api/pools/[id]` | Contract + indexer | **Satellite node** around its pool; distance = days waiting |
| Response timeout (e.g. 14 days) | `createPool()` param | **Dashed deadline ring** around the pool |
| Keeper `refundExpired()` (hourly cron) | `/api/cron/keeper` | **Violet band** beyond the deadline ring; violet dashed nodes |
| Reporter address | `submitReport()` sender | **Wallet node** linking reports across pools |
| `submitVerdict()`: valid / mistake / slop | Relayed EIP-712 signature | **Branching outcome tree** (4 leaves incl. expiry) |
| Fees: 1% report, $1 pool, 2% bounty | `ReportBondWithFees` | **Money-flow (Sankey)** ribbons, protocol fees in violet |
| `credits` + `withdraw()` | Contract | **Highlighted payout path** to the reporter's wallet |
| Indexer sync every 15s | `/api/status` | "Indexer synced · block #" chip in the header |

## 3. Visual system

Built on your existing system, with colour added on top.

**Kept from your system:** light mode only · isometric cube grid background (`.geometric-bg`) · large rounded cards (24px) · minimal shadows · pill buttons · Inter. Primary actions ("Sign verdict", "Withdraw", "Pay & submit") stay **black pills** so the main action is always obvious.

**Added:** one brand accent and a status palette.

| Role | Colour | Used for |
|---|---|---|
| Brand / selection | Indigo `#4F46E5` (glow to Sky `#0EA5E9`) | Pool hubs, selected node, payout path, progress, active tab |
| Waiting | Slate `#64748B` | Hollow node |
| Acknowledged | Blue `#2563EB` | Hollow node with centre dot |
| Valid | Green `#16A34A` | Filled node (larger = bounty paid) |
| Honest mistake | Amber `#D97706` | Filled node |
| Slop | Red `#DC2626` | Tinted node with × |
| Auto-refund (keeper) | Violet `#7C3AED` | Dashed node, deadline ring, keeper panels |

Every status also has its own **shape** (filled, hollow, dot, ×, dashed), so red and green are never the only difference. Text colours use the darker shade of each hue (e.g. `#15803D`, `#B91C1C`) so they keep 4.5:1 contrast on white.

## 4. Five graph patterns

1. **Network map:** pools as hubs, reports as satellites, wallets as connectors. *Where:* Browse pools.
2. **Constellation:** one pool, reports placed by age, a dashed deadline ring and the keeper band. *Where:* Pool detail, Concept B.
3. **Attachment preview:** your wallet → a draft report node → the pool. It goes from dashed to solid as you progress. *Where:* Submit report.
4. **Outcome tree:** Submitted → Waiting → Verdict, splitting into 4 leaves. The real path lights up and the rest fade. *Where:* Report detail, Concept A.
5. **Ego network:** your wallet → your reports (as pills) → pools. Thick green lines carry money back to you. *Where:* My reports. A triage variant with a halo and a dark popover is used on the Maintainer desk.

Shared graph styling:
- dotted canvas background
- soft radial halos
- 1.5px pale-indigo edges
- dashed edges for things not yet true
- small outlined tags on edges (e.g. "BOND 5.00")

## 5. Screens

### Reporter flow

**R1 · Browse pools** (`/`)
Hero with the bonded-report pitch, then 3 "how it works" steps. A **Pool network** map shows all pools, their report outcomes, cross-pool reporters and *your* reports as dashed indigo lines. Pool cards below show max bounty, bond, balance, response time and a bar of past verdicts.
![Browse pools](images/Pools.png)

**R2 · Pool detail** (`/pool/[id]`)
Key numbers, then the **Report constellation** with the selected report (#7 · 5d left) beside it. Below: the reports table, track record, and "What your 5.05 can become".
![Pool detail](images/PoolDetail.png)

**R3 · Submit report** (`/pool/[id]/report`)
A 3-step progress bar. The **Where your report lands** graph shows the draft #13 attaching to Pool #1 next to your reports #7 and #12. You paste the advisory URL and click Check advisory (`/api/advisory/check`). The pay button unlocks only after the check passes. Bond breakdown: 5.00 + 0.05 = 5.05.
![Submit report – draft](images/Submit.png)
![Submit report – advisory verified](images/Submit-checked.png)

**R4 · Report detail** (`/report/[id]`)
Status pill, verdict tracker, the **Outcome tree** (current position glows), outcome cards, deadline ring, bond breakdown, private-advisory panel and on-chain activity. A status tweak switches between all six states.
![Report detail – waiting](images/Report.png)
![Report detail – resolved valid](images/Report-valid.png)

**R5 · My reports** (`/me`)
Withdrawable-credit card (deep indigo, Withdraw button), stats (earned, at stake, lost, track record), the **Your report network** graph, the report list and withdrawal history.
![My reports](images/Me.png)

### Maintainer flow

**M1 · My pools** (`/maintainer`)
An amber "reports waiting on your verdict" banner linking to the desk. Stats: bounties paid, slop absorbed, missed deadlines. Pool cards with graph thumbnails and Triage / Top up buttons, plus an activity feed.
![My pools](images/MaintainerHome.png)

**M2 · Create pool** (`/maintainer`, create)
A working form with repo, bond, max bounty, timeout (7/14/30 days) and funding. It calculates the total live (funding + $1 fee) and how many max bounties are covered (each with the 2% fee), warns when funding is too low, and previews the card reporters will see.
![Create pool](images/CreatePool.png)

**M3 · Triage desk** (`/maintainer/pool/[id]`)
Three panels: an inbox with pool exposure, the **report graph** (halo on the selected report, dashed payout path, edge tags, dark detail popover), and the verdict panel. Pick Valid, Mistake or Slop and the payout preview updates. "Sign verdict" is gasless (EIP-712, relayer submits). Keeper queue below.
![Triage desk](images/Desk.png)

### Concept boards

Exploration boards that the screens above draw from.
![A · Report lifecycle tree](images/Main.png)
![B · Pool constellation](images/PoolGraph.png)
![C · Bond money flow](images/FeeFlow.png)

## 6. Interaction notes

- **Selection is indigo:** a selected node gets a halo, an indigo ring and a filled label chip. Its detail opens in a popover (desk) or side card (pool detail).
- **Dashed means "not yet":** draft reports, open branches, payout paths and keeper actions are dashed. They turn solid when the thing happens on-chain.
- **Distance means time:** in the constellation, distance from the centre is days since submission. The deadline is a fixed ring, so "about to expire" is visible at a glance.
- **Money gets thicker lines:** edges that carry funds back to the viewer are heavier and glow.
- **Accessibility:** charts have `role="img"` with a plain-language summary. Controls are real buttons and links (44px+ tap targets). Status never relies on colour alone.

## 7. Implementation notes

- Graph layouts are simple and deterministic, so they can be computed on the client from data you already index:
  - radial: angle = report order, radius = age
  - column trees
  - per-pool satellite rings
- Data per screen:
  - network: `/api/pools` + `/api/reports`
  - constellation: `/api/pools/[id]`
  - outcome tree and activity: `/api/reports/[id]`
  - ego network and credits: `/api/reports?reporter=` + withdrawals
  - verdicts: `/api/relay/verdict` and `/api/relay/acknowledge`
- An SVG plus a small layout helper is enough. If you want pan, zoom or drag later, these layouts move to d3-force or React Flow without changing the visual language.
- The isometric background, 24px radius, minimal shadow and pill shapes map one-to-one to your existing Tailwind classes. Add the indigo and status colours as tokens.

## 8. Open items

- **Real data:** every number shown is sample data that stays consistent across screens. Bracketed values like `[owner/repo]` or `0x[hash]` mark data the design doesn't have.
- **Brand accent:** indigo is a proposal. Swap the hex and every board follows.
- **Not yet designed:** maintainer "acknowledge" confirmation, a pool top-up flow, and an empty-pool constellation preview on Create pool.
