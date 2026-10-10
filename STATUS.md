# Project status

Last updated: 9 October 2026.

ReportBond works end to end on Arc Testnet. The contract, backend and frontend are built, every scripted scenario passes on a local chain and on testnet, and the code is ready to host and to run the mainnet smoke test. What's left needs accounts, real money or a person at a browser: hosting it, browser-wallet checks, mainnet, and the submission.

## Done

### Contract (`contracts/`)

- [x] `ReportBond.sol`: pools, exact deposits, signed verdicts and acknowledgements (EIP-712, smart wallets supported), timeout refunds anyone can trigger, and pull-payment withdrawals
- [x] No owner and no admin withdrawal. Slashed deposits can only pay bounties.
- [x] 42 unit and fuzz tests, plus 2 invariant tests (balance always equals what is owed; open-report counters stay exact)
- [x] Coverage: 100% of lines, branches and functions
- [x] Deploy script
- [x] Deployed on Arc Testnet: [`0x4963eCA8E60C1726CE1c123AcebF077024533d13`](https://testnet.arcscan.app/address/0x4963eCA8E60C1726CE1c123AcebF077024533d13), block 66199770

### Backend (`app/lib/server`, `app/app/api`, `app/jobs`)

- [x] Indexer: rebuilds pools and reports from contract events, and reads balances back from the contract
- [x] API for pools, reports, advisory-link checks and repo names
- [x] Advisory links are stored off-chain and shown only to the reporter and pool creator, after they sign in with their wallet. Only the link's hash goes on-chain.
- [x] Relayer: checks each signed verdict before paying gas to submit it
- [x] Refund keeper: refunds overdue reports; safe to run twice. Runs as a CLI job or through `/api/cron/keeper` (needs `CRON_SECRET`)
- [x] Storage: Postgres when `DATABASE_URL` is set, JSON files otherwise. Concurrent writes are safe, and an older sync can never overwrite a newer one

### Frontend (`app/app`, `app/components`)

- [x] Landing page, pool page, three-step report flow and report status page
- [x] "My reports" page with withdraw
- [x] Maintainer console: create and fund a pool, review queue (Valid / Mistake / Slop), withdraw unused funds
- [x] Every transaction shows its state (wallet, pending, confirmed with explorer link, failed with a plain reason)
- [x] Testnet banner; light and dark themes

### GitHub App (platform phase 1, see [PLATFORM.md](PLATFORM.md))

- [x] Connect GitHub: maintainers install the app or sign in; only repos they administer are offered
- [x] Verified pools: a pool is linked to a repo only if its creator proves admin access; pages show "Verified maintainer"
- [x] Report tracker: private reports arrive by webhook and show as deposit paid, awaiting deposit, or unbonded after 48 hours
- [x] Verdicts written back to GitHub: Valid accepts the advisory, Mistake and Slop close it
- [x] `pnpm test:github`: full flow against a mock GitHub
- [x] One-click app creation at `/setup/github` (GitHub manifest flow), tested with `pnpm test:github-setup`
- [ ] Create the real app: open `/setup/github` and click the button ([GITHUB_APP.md](GITHUB_APP.md))

### Bounty rules and AI review (platform phases 3 and 4)

- [x] Setup agent: reads the repository and the maintainer's answers, drafts a rulebook (scope, severity table with payout shares, what a valid report needs, slop signals)
- [x] Rules editor: edit every field, publish versioned rules; reports are judged by the version in force
- [x] `SECURITY.md` generated from the rules, with a link that opens GitHub's editor pre-filled (no write access needed)
- [x] Live README badge at `/api/badge/<pool>`; published rules shown on the public pool page
- [x] Grounding check: do the files, lines and functions a report cites exist? Deterministic, no model
- [x] Triage and critic agents: verdict, confidence, severity and per-claim evidence, with a second reviewer. Recommend-only; the maintainer signs
- [x] Tools: the triage agent investigates with read-only tools (`list_files`, `read_file`, `search_code`, `load_skill`), scoped to the one repository, in a bounded loop. What it read is stored and shown
- [x] Skills: seven review playbooks (memory safety, injection, access control, web, crypto, denial of service, smart contracts). The best match is chosen from the report and given to the reviewer up front
- [x] A different model per step on Groq, because limits are per model: investigation on `openai/gpt-oss-120b`, verdict on `openai/gpt-oss-20b`, critic on `qwen/qwen3.8-27b`, each with fallbacks
- [x] Rate-limit aware: the client paces itself to the AI plan and shrinks the review on a small plan (Groq's free tier allows 8,000 tokens a minute, so a review there takes a few minutes and reads less)
- [x] Tried on this repository with the real model (`pnpm try:agents clatsonhacks/reportbond`): a wrong-but-honest reentrancy report came back *mistake*, a fabricated one *slop*
- [x] Injection attempts in a report are flagged and sent to the maintainer, not followed
- [x] Every run is stored as an audit log
- [x] Model: Groq `openai/gpt-oss-120b` (Claude also supported). Tested with the real model on a mock repo: a real bug came back valid, a fabricated report came back slop with the injection flagged
- [ ] Not built yet: running a proof of concept in a sandbox, duplicate detection across reports, automatic triage when a report arrives (today the maintainer clicks "Review with AI"), auto-decisions and the appeal window (phase 6)

### Reporter identity (platform phase 2)

- [x] Reporters sign in with GitHub from the report flow and return to it
- [x] A wallet is linked to a GitHub account only with both proofs at once: a GitHub session and a wallet signature
- [x] The maintainer's tracker shows, per report, whether the deposit came from the account that filed it, from a wallet linked to someone else, or from an unlinked wallet
- [x] One sign-in page (`/login`): GitHub, then wallet. Once both are connected the wallet is asked for one free signature that proves ownership and links them. The header shows the signed-in GitHub account on every page
- [ ] Not enforced: linking is optional, and a mismatch is shown to the maintainer, not blocked

### Testing

| Layer | Status |
|---|---|
| 1. Contract tests | 44 passing, 100% coverage |
| 2. Local end-to-end (anvil) | Scenarios A–E pass, with both file and Postgres storage |
| 3. Arc Testnet | Scenarios A–E pass on the current code, tagged `v0.1-testnet-passed`; transaction links are in the [README](README.md#arc-testnet) |
| 4. Mainnet smoke test | Ready to run (`pnpm preflight`, then `pnpm e2e` with `NETWORK=mainnet`); needs wallets and real USDC |

The end-to-end script (`app/scripts/e2e.ts`) runs the same scenarios on anvil and testnet. On testnet, scenario D's refund is sent by a stranger directly to the contract, so it proves reporters get their money back even if our server is down.

### Repo

- [x] CI (GitHub Actions): contract tests, typecheck, lint, build and storage tests (files and Postgres) on every push
- [x] Hourly *Refund keeper* workflow; it does nothing until `APP_URL` and `CRON_SECRET` repo secrets are set
- [x] Deployment guide for Vercel and Postgres in the [README](README.md#deploying-hosted-testnet)
- [x] `pnpm preflight`: checks chain ID, deployment, wallets (set, distinct, funded, not testnet keys on mainnet) and the git tag
- [x] Libraries are pinned git submodules: forge-std v1.17.0, OpenZeppelin v5.7.0

## Remaining

### Must do before the Microgrant submission

- [ ] **Scenario F: plain browser wallet.** Go through the report flow with MetaMask or Rabby on testnet. Check the deposit shows as `5.00 USDC`, not a tiny ETH amount.
- [ ] **Scenario G: smart-wallet signer.** Sign a verdict with a passkey or smart wallet. If it fails, fall back to a normal wallet and note it in the README.
- [x] **Hosting.** Live at **https://reportbond-nine.vercel.app** (Vercel project `reportbond`, root `app`, Neon Postgres, testnet). Pushes to `main` deploy automatically, but only when the commit author is the Vercel account owner (`clatsonhacks`); other authors are blocked on the free plan.
- [ ] **After hosting:**
  - Create the GitHub App for the live site at `/setup/github` (needs `SETUP_SECRET`), add its six values to Vercel, redeploy, then remove `SETUP_SECRET`.
  - Add repo secrets `APP_URL` (`https://reportbond-nine.vercel.app`) and `CRON_SECRET` so the hourly keeper workflow runs.
  - Create a Postgres database (Neon or Supabase).
  - Create the Vercel project with Root Directory `app`, and set `NETWORK`, `DATABASE_URL`, `RELAYER_PRIVATE_KEY` and `CRON_SECRET`.
  - Add the `APP_URL` and `CRON_SECRET` repo secrets so the hourly keeper runs.
- [ ] **WalletConnect project ID**, so mobile wallets can connect (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, free at cloud.reown.com).
- [ ] **Mainnet smoke test (Layer 4).** The scripts are ready, and the tag `v0.1-testnet-passed` is in place.
  1. Create five fresh wallets and add their keys to `.env`: `MAINNET_DEPLOYER_PRIVATE_KEY`, `MAINNET_RELAYER_PRIVATE_KEY`, `MAINNET_MAINTAINER_PRIVATE_KEY`, `MAINNET_REPORTER_PRIVATE_KEY` and `MAINNET_STRANGER_PRIVATE_KEY`.
  2. Bridge a little real USDC to Arc: about 0.3 for the deployer, 0.5 for the relayer, 2.1 for the maintainer, 1.1 for the reporter and 0.05 for the stranger.
  3. Deploy with the mainnet deployer key, then put the address and block number in `config/mainnet.json`.
  4. `NETWORK=mainnet pnpm preflight` must pass.
  5. Start the app with `NETWORK=mainnet`, then run `NETWORK=mainnet E2E_MAINNET_CONFIRM=yes pnpm e2e`. It uses 0.50 deposits, a 2.00 pool and a 10-minute timeout, and records every link.
- [ ] **Demo video:** light mode, with the explorer link opened after each step.
- [ ] **Demo repo:** create `clatsonhacks/reportbond-demo-testnet` (and `reportbond-demo` for mainnet) with private vulnerability reporting turned on. The testnet scenarios used this repo name with test advisory IDs.

### Open decisions (need both of us)

- [ ] Default deposit suggested in the UI. Currently 5 USDC on testnet, 0.50 on mainnet.
- [ ] Default timeout. Currently 14 days; 5 minutes on testnet for testing.
- [ ] Should acknowledging a report extend the timeout? Currently no.
- [ ] Payout cap: currently set per pool.
- [ ] Pool creators can withdraw unused funding only when no reports are open, and never slashed funds. This is built; confirm it's what we want.

### Choices made while building (worth a quick review)

- A verdict is signed as the status number: Valid = 3, Mistake = 4, Slop = 5. Only Valid may carry a bounty.
- Pool and report IDs start at 1.
- A pool's payout cap must be above zero.
- The jobs live in `app/jobs/` (not `jobs/` at the repo root) so they can share the app's code.
- `@coinbase/cdp-sdk` is pinned to 1.52.0, because newer versions break the build through RainbowKit.

### Known limitations

- The main testnet RPC (`rpc.testnet.arc.network`) blocks some networks. The app falls back to Blockdaemon automatically. (drpc's free tier rejects historical log queries, so it can't be the fallback.)
- Storage keeps each deployment's data as one JSON record. That's fine for the Microgrant scale; at thousands of reports it should move to proper tables.
- There's no check that a GitHub advisory really exists, only that the link has the right form and is on the pool's repo. Confirming it exists needs a GitHub App with "Repository security advisories: read".
- The phone layout hasn't been checked on a real device.

### Roadmap (out of scope for the Microgrant)

Browser extension, maintainer analytics, higher deposits for repeat offenders, a free tier for proven reporters, a full GitHub App with payouts triggered by merges, an AI triage assistant, EURC deposits, one contract per pool, and multisig verdict signers.
