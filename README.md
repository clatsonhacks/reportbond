# ReportBond

**A trust-minimized bug bounty platform where security researchers stake refundable bonds to prove report quality.**

Refundable USDC deposits for private security reports on GitHub, settled on Arc.

---

## Live on Arc mainnet

ReportBond runs on **Arc mainnet** with real USDC.

| | |
|---|---|
| App | **https://reportbond-nine.vercel.app** |
| Contract | [`0x7281Be3731A85E20648188Ce7d2d6776BF8746E4`](https://explorer.arc.io/address/0x7281Be3731A85E20648188Ce7d2d6776BF8746E4) |
| Network | Arc mainnet, chain ID `5042`, deployed at block `25627878` |

Every outcome has already happened on mainnet:

| Report | Outcome | Transactions |
|---|---|---|
| Pool 1 created | Funded for bounties, 0.50 USDC deposit per report | [create](https://explorer.arc.io/tx/0xa8b160392ec9003aff8e07573f90ef6995e2a8fa0f7f2effae6665101b41d7f5) |
| #2 | **Valid**: deposit back plus a 0.20 USDC bounty | [deposit](https://explorer.arc.io/tx/0x02b18db2364f59cd196b5c9d82ac615891ee530e307d59de28ea5b1513048dce) · [verdict](https://explorer.arc.io/tx/0x15c3e2d2905daa26956cf967a8c2fb763dd97410ce35ab1a5b3817d6b5cf536c) |
| #3 | **Honest mistake**: deposit back | [deposit](https://explorer.arc.io/tx/0x6e74a39f410522db5fe1cd2b615300d974102d9fc480b4e1b358727bdaa72493) · [verdict](https://explorer.arc.io/tx/0xd45d1a72bc38e15ae50f483536366bc3a1d7213db8c7a1eab03d71e09e131b90) |
| #5 | **Slop**: deposit kept by the pool | [deposit](https://explorer.arc.io/tx/0xf0aff1861ce78bbab69f7e344b632f847e976ba11d4f640be41131c1873f920f) · [verdict](https://explorer.arc.io/tx/0xce79c726d550a05751b872e62b939aff9e337a1801815476837aa94f15416c76) |
| #1 | **No answer in time**: deposit refunded automatically | [deposit](https://explorer.arc.io/tx/0xe067b11361530927c645cbb417db3acb02666d63192f5123c86ae7b6b1956c0a) · [refund](https://explorer.arc.io/tx/0xd6728d01be3cd460e0b9c5ca403ec2a4d77a2fdff84da4d7dd378d663081cf97) |
| #6 | **Honest mistake** on a GitHub-verified pool, filed through the app with a 0.001 USDC deposit | [deposit](https://explorer.arc.io/tx/0x809cabe349fe5db9ec72a20a848f1bbdddead1b0ada15bcbc2e73050f27c1618) · [verdict](https://explorer.arc.io/tx/0x400900316e6856755d9334791530fb1a828b24869205178333176bb1db165100) |

Automatic slop rejection needs the `VerdictDelegateFactory` contract, which isn't deployed on mainnet yet. Until it is, the AI reviews and flags every paid report, and the maintainer decides.

---

## The Problem

Private vulnerability disclosure is broken. Security researchers discover bugs but hesitate to report them  because:

- **Maintainers ghost** — Reports go unanswered for weeks or months
- **Bounties vanish** — "We don't pay for that severity" after the fact
- **Credit stolen** — Researchers get nothing while maintainers quietly ship fixes
- **No accountability** — There's no mechanism to enforce fair treatment

From the maintainer's side, they're flooded with:

- **Low-effort spam** — AI-generated "vulnerabilities" that waste triage time
- **Duplicate reports** — Same issue submitted by multiple researchers
- **Non-issues** — Misunderstandings dressed up as security bugs

Both sides lose. Researchers stop reporting privately, and real vulnerabilities go to public disclosure or worse.

---

## Our Approach

ReportBond creates **mutual accountability** through a bonding mechanism:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   Reporter stakes 5 USDC deposit  ──────►  Files vulnerability     │
│                                                                     │
│                          ┌─────────────────┐                        │
│                          │   Maintainer    │                        │
│                          │    Reviews      │                        │
│                          └────────┬────────┘                        │
│                                   │                                 │
│              ┌────────────────────┼────────────────────┐            │
│              ▼                    ▼                    ▼            │
│         ┌────────┐           ┌────────┐           ┌────────┐        │
│         │ Valid  │           │Mistake │           │  Slop  │        │
│         └───┬────┘           └───┬────┘           └───┬────┘        │
│             │                    │                    │             │
│      Deposit + Bounty       Deposit back        Deposit to pool    │
│                                                                     │
│                     ┌──────────────────────┐                        │
│                     │  No response in 14d? │                        │
│                     │   Auto-refund bond   │                        │
│                     └──────────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

A reporter pays a small deposit when filing a private vulnerability report. The repo's maintainer signs a verdict:

| Verdict | Deposit |
|---|---|
| **Valid** | Returned, plus a bounty from the pool |
| **Mistake** | Returned |
| **Slop** | Kept in the pool to pay future valid reports |
| *(no answer by the deadline)* | Anyone can trigger a refund |

The contract holds all money; there is no admin key. Verdicts are EIP-712 signatures from the pool's verdict signer, so our server can deliver them but never create or change them.

### How It Works

1. **Maintainer creates a pool** — Deposits funds, sets bounty range, defines response deadline
2. **Reporter stakes a bond** — Puts down a small deposit (e.g., 5 USDC) when filing a report
3. **Maintainer reviews** — Has a fixed window (e.g., 14 days) to respond
4. **Verdict issued**:
   - **Valid** → Reporter gets deposit back + bounty
   - **Honest Mistake** → Reporter gets deposit back (no penalty)
   - **Slop** → Deposit forfeits to the pool (spam deterrent)
5. **Timeout protection** — If maintainer ghosts, bond auto-refunds

This creates a **skin-in-the-game equilibrium**:
- Researchers only stake on reports they believe in
- Maintainers must respond or lose the right to judge
- Spammers lose money; quality reporters get rewarded

---

## The Role of Arc Chain

ReportBond runs on **Arc**, a Cosmos-based EVM chain with native USDC.

### Why Blockchain at All?

| Without Blockchain | With Blockchain |
|-------------------|-----------------|
| Platform controls funds | Smart contract holds escrow |
| "Trust us" guarantees | Code enforces rules |
| Arbitrary rule changes | Immutable logic |
| Platform can freeze funds | Only protocol rules apply |
| Opaque fee structure | Transparent on-chain fees |

The smart contract is the neutral arbiter. Neither party can cheat because the rules are encoded and enforced automatically.

### Why Arc Specifically?

1. **Native USDC** — No wrapped tokens, no bridge risk, no slippage. Real USDC from Circle.
2. **Low gas costs** — Transactions cost ~$0.01, making small bonds practical
3. **Fast finality** — Verdicts settle in seconds, not minutes
4. **EVM compatible** — Standard Solidity, works with MetaMask/WalletConnect/RainbowKit

### What Lives On-Chain

```solidity
// Every pool is on-chain
struct Pool {
    address creator;
    uint256 requiredDeposit;    // e.g., 5 USDC
    uint256 maxBounty;          // e.g., 500 USDC
    uint256 timeout;            // e.g., 14 days
    uint256 available;          // Remaining bounty funds
}

// Every report is on-chain
struct Report {
    address reporter;
    bytes32 advisoryHash;       // Hash of GitHub URL (privacy!)
    uint256 deposit;
    uint256 deadline;
    Status status;              // Submitted → Verdict
}

// Credits accumulate on-chain
mapping(address => uint256) public credits;  // Withdraw anytime
```

### What Stays Off-Chain (Privacy)

- **Advisory URLs** — Only the hash is stored on-chain
- **GitHub identities** — Verified via OAuth, not stored publicly
- **Report contents** — Actual vulnerability details remain on GitHub

---

## GitHub Integration

ReportBond bridges on-chain coordination with GitHub's security infrastructure.

### The Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  1. Reporter files private vulnerability on GitHub               │
│     github.com/owner/repo/security/advisories/new               │
│                                                                  │
│  2. Reporter submits to ReportBond with advisory URL            │
│     - System verifies: URL exists, repo matches pool,           │
│       reporter filed it (GitHub OAuth proves identity)          │
│     - Hash stored on-chain, URL stored privately                │
│                                                                  │
│  3. Maintainer reviews on GitHub (full details there)           │
│     Signs verdict with wallet (no gas needed - EIP-712)         │
│                                                                  │
│  4. Verdict synced back to GitHub advisory                      │
│     - Valid → Advisory closed as resolved                       │
│     - Mistake → Advisory closed as not-applicable               │
│     - Slop → Advisory closed as spam                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Why GitHub?

- **Where developers already work** — No new workflow to learn
- **Private by default** — Security advisories are private until published
- **Rich context** — Full markdown, attachments, discussion threads
- **Reputation** — GitHub profiles provide researcher identity

### GitHub App Features

| Feature | Purpose |
|---------|---------|
| Repository verification | Proves maintainer owns the repo |
| Advisory validation | Confirms URL is real and matches pool |
| Reporter authentication | Proves who filed the advisory |
| State synchronization | Pushes verdicts back to GitHub |

---

## Problems Solved

### For Security Researchers

| Problem | ReportBond Solution |
|---------|---------------------|
| Maintainer ignores report | Auto-refund after deadline (14 days default) |
| "We don't pay bounties" | Pool balance visible upfront, locked in contract |
| Bounty amount disputed | Max bounty defined when pool created |
| No proof of submission | On-chain record with timestamp |
| Report stolen, no credit | Advisory hash proves prior filing |

### For Maintainers

| Problem | ReportBond Solution |
|---------|---------------------|
| Inbox flooded with spam | Reporters lose deposit on slop verdicts |
| AI-generated garbage | 5 USDC stake filters out zero-effort reports |
| Same bug filed 10 times | System detects duplicate advisory hashes |
| Unclear severity claims | Bounty reflects actual assessment |
| Legal/payment complexity | USDC payouts, no invoicing needed |

### For the Ecosystem

| Problem | ReportBond Solution |
|---------|---------------------|
| Distrust between parties | Contract enforces rules, not promises |
| Race to public disclosure | Private channel with guaranteed response |
| Bounty platforms take 20%+ | Transparent 1-2% protocol fees |
| Centralized points of failure | On-chain escrow, distributed hosting |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Arc Blockchain                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ReportBondWithFees Contract                            │   │
│  │  - createPool()      - submitReport()                   │   │
│  │  - submitVerdict()   - refundExpired()                  │   │
│  │  - withdraw()        - withdrawProtocolFees()           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Events
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Indexer (Background)                        │
│  - Polls chain every 15s                                        │
│  - Syncs pools, reports, withdrawals to database               │
│  - Rebuilds from genesis if cache lost                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Postgres Database                           │
│  - Chain state (pools, reports, credits)                       │
│  - Private data (advisory URLs, repo names)                    │
│  - GitHub sessions (OAuth tokens, installations)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Application                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Frontend   │  │  API Routes  │  │  Background  │          │
│  │   (React)    │  │  (Serverless)│  │   (Cron)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │    Wallet    │  │    GitHub    │  │   Relayer    │
      │   Connect    │  │    OAuth     │  │  (Verdicts)  │
      └──────────────┘  └──────────────┘  └──────────────┘
```

---

## Project Structure

```text
contracts/   Foundry project: ReportBond.sol, tests, deploy script
app/         Next.js frontend + API routes (indexer, relayer, advisory links)
app/jobs/    indexer.ts and keeper.ts (run as separate processes when hosted)
config/      mainnet.json (contract address and deploy block)
```

---

## Deploying

The app runs on any Node host; these steps use Vercel and a hosted Postgres.

1. **Database.** Create a Postgres database (Neon from Vercel's Storage tab, or Supabase) and copy its *pooled* connection string. The table is created on first use.
2. **Vercel project.** Import this repo and set **Root Directory** to `app`. Keep "Include files outside the root directory" on, because the app reads `config/*.json`.
3. **Environment variables** (Production and Preview):

   | Name | Value |
   |---|---|
   | `NETWORK` | `mainnet` |
   | `DATABASE_URL` | the pooled Postgres URL |
   | `RELAYER_PRIVATE_KEY` | a wallet holding only gas money (1–2 USDC) |
   | `CRON_SECRET` | any long random string |
   | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | optional, from cloud.reown.com, enables mobile wallets |

4. **Hourly refunds.** In GitHub, add repo secrets `APP_URL` (e.g. `https://reportbond.vercel.app`) and `CRON_SECRET` (same value). The *Refund keeper* workflow then calls `/api/cron/keeper` every hour.
5. **Check.** `GET /api/status` should report `"storage": "postgres"` and the latest block.

Without `DATABASE_URL` the app falls back to JSON files in `app/.data`, which is fine locally but doesn't persist on serverless hosts. `pnpm test:db` checks either backend.

---

## Setup

Requires Foundry, Node 22 and pnpm. Copy `.env.example` to `.env`.

```sh
git clone --recurse-submodules https://github.com/clatsonhacks/reportbond.git
```

```sh
cd contracts && forge test          # Layer 1: unit, fuzz, invariant
cd app && pnpm install
```

---

## Local end-to-end (Layer 2)

```sh
anvil
cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
cd app && NETWORK=local pnpm dev     # http://localhost:3000
cd app && NETWORK=local pnpm e2e     # scenarios A–E through the API, relayer and keeper
```

---

## Mainnet (Layer 3)

1. Put fresh wallets' keys in `.env`: `MAINNET_DEPLOYER_PRIVATE_KEY`, `MAINNET_RELAYER_PRIVATE_KEY`, and for the scenarios `MAINNET_MAINTAINER_PRIVATE_KEY`, `MAINNET_REPORTER_PRIVATE_KEY` and `MAINNET_STRANGER_PRIVATE_KEY`. Fund them with a little real USDC on Arc.
2. Deploy: `cd contracts && forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.arc.io --private-key $MAINNET_DEPLOYER_PRIVATE_KEY --broadcast`
3. Put the address and block number into `config/mainnet.json`.
4. `cd app && NETWORK=mainnet pnpm preflight` must pass.
5. `NETWORK=mainnet pnpm dev` (or `pnpm build && pnpm start`), then `NETWORK=mainnet E2E_MAINNET_CONFIRM=yes pnpm e2e` runs the scenarios with 0.50 USDC deposits.

After changing the contract: `forge build`, then `pnpm sync-abi` in `app/`.

---

## Filing fee (Circle Gateway nanopayments)

Optional and off by default. Set `FILING_FEE_USDC` (for example `0.001`) and `FILING_FEE_RECIPIENT` to charge a small, non-refundable fee before the deposit. The deposit stays the real bond and is still refunded as before; the fee makes mass-filing cost something even when every deposit would come back.

How it works:

1. The reporter picks a report. Once the app has confirmed they may pay for it, `/api/advisory/check` answers `402 Payment Required` with what to pay (the [x402](https://www.x402.org) convention).
2. The reporter's wallet keeps a small USDC balance in Circle's Gateway Wallet contract. The first time, the app asks for one top-up (an approval and a deposit, both on-chain), enough for twenty fees.
3. The fee itself is a signature only: no gas and no transaction. The app sends it to Circle Gateway, which checks it, moves the amount to the recipient's Gateway balance, and settles many such payments on-chain in one batch.
4. The fee is charged once per report, and the maintainer's tracker shows "Filing fee paid".

The recipient's fees accumulate in its Gateway balance, not its wallet; withdrawing them is done with Circle's Gateway tools and isn't built into this app. With the fee on, `pnpm e2e` would be asked for the fee too, so leave it off when running the scenarios.

---

## Tests

Run from `app/`:

| Command | What it covers | Needs |
|---|---|---|
| `pnpm test:grounding` | The check that a report's cited files, lines and functions exist | nothing |
| `pnpm test:agents --mock` | Setup, triage and critic agents, their tools and playbooks, on a mock repo | nothing |
| `pnpm test:agents` | The same with the real model | `GROQ_API_KEY` or `ANTHROPIC_API_KEY` |
| `pnpm try:agents owner/repo [report.md ...]` | The agents on a real repo the GitHub App can read | GitHub App installed, a model key |
| `pnpm test:db` | Storage, on files or Postgres | `NETWORK=local` |
| `pnpm test:github-setup` | One-click GitHub App setup against a mock GitHub | a dev server pointed at the mock |
| `pnpm test:github` | GitHub connect, verified pools, webhooks, reporter identity, rules and AI review; the filing fee too when `FILING_FEE_USDC` is set | anvil, a dev server pointed at the mock |
| `pnpm e2e` | Deposit, verdict, refund and withdraw scenarios | anvil, or funded mainnet wallets |

---

## Tech Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS 4
- **Wallet**: RainbowKit, Wagmi, Viem
- **Database**: Neon Postgres (pooled connections)
- **Blockchain**: Arc Chain (EVM), Solidity ^0.8.24
- **Auth**: GitHub OAuth, EIP-712 signatures
- **Deploy**: Vercel (app), Neon (database)

--

## License

MIT
