# ReportBond platform design

Status: draft for review by Clatson and Anto. 10 October 2026.

The contract, deposit flow and testnet deployment already work (see [STATUS.md](STATUS.md)). This document designs what's around them: the GitHub integration, report tracking, AI triage, and making the whole thing usable from GitHub itself.

## 1. The problem

Open-source projects are shutting their bug bounties because AI-generated "slop" reports cost maintainers more time than real reports are worth. curl ended its HackerOne program in January 2026. Google stopped accepting product reports to its open-source program on 1 October 2026.

Two things help maintainers:

1. **A price on the door.** A refundable deposit makes mass-produced slop expensive. Honest reporters get it back. This part is built.
2. **Less reading.** Most slop can be spotted mechanically. It cites code that doesn't exist, or a proof of concept that doesn't run. Agents can do that first pass so maintainers only read what's worth reading.

## 2. Principles

- **Work where maintainers already are.** Reports stay in GitHub's private vulnerability reporting. We add to it; we don't replace it.
- **Agents recommend; money moves only on a signature.** Valid verdicts and bounties are always signed by the maintainer. The only automatic actions are refunds, plus slop or mistake verdicts above a confidence threshold the maintainer chose, after an appeal window (see §6).
- **The contract is the source of truth for money.** Everything else, including agent output, is evidence attached to a report.
- **Reports are untrusted input.** The person being judged wrote the text the agents read. Agents treat it as data, never as instructions.

## 3. Actors

| Actor | What they do |
|---|---|
| Maintainer | Installs the GitHub App, sets the rules, funds the pool, signs verdicts |
| Reporter | Files a private report on GitHub, pays the deposit, can appeal a slop recommendation |
| GitHub App | Reads the repo and its private reports, receives webhooks, accepts or closes advisories |
| Setup agent | Turns the maintainer's answers and the codebase into a bounty rulebook |
| Triage agent | Checks each report against the code and the rules, recommends a verdict |
| Critic agent | Reviews the triage agent's evidence; escalates disagreements to the maintainer |
| Contract | Holds deposits and the pool; pays out on signed verdicts |

## 4. End-to-end flow

### Maintainer onboarding

1. **Connect GitHub.** The maintainer installs the ReportBond GitHub App on chosen repositories. We record which repos they administer, so nobody can open a pool for a repo they don't control.
2. **Interview.** The setup agent asks what's in scope, what counts as a real vulnerability, what the payouts are, and what they want filtered out.
3. **Rules draft.** The agent reads the repository (structure, languages, entry points, existing `SECURITY.md`, past advisories) and drafts a rulebook:
   - scope (paths, versions, components) and out-of-scope items
   - a severity table, with each level mapped to a share of the payout cap
   - a slop definition specific to this project
   - the response deadline, deposit amount and appeal window
4. **Review and edit.** The maintainer edits the draft in our UI. Rules are versioned. A report is always judged by the version in force when it was filed.
5. **Publish.**
   - The app opens a pull request adding `SECURITY.md` with the rules and a link to the pool.
   - The maintainer creates and funds the pool in one transaction (built).
   - A live README badge shows the bounty pool.

### Reporting

1. The reporter finds the program in `SECURITY.md`, the badge or our directory.
2. They file a private vulnerability report on GitHub, as today.
3. GitHub sends us a `repository_advisory` webhook with action `reported`.
4. The reporter pays the deposit:
   - **On our site:** sign in with GitHub, connect a wallet, paste the advisory link, pay. This is built, apart from GitHub sign-in.
   - **Or from the browser extension**, right on the GitHub page (§8).
5. We match the deposit to the advisory using its GHSA ID. The contract already stores the hash of the advisory link. GitHub sign-in proves the depositor is the GitHub user who filed it.
6. **Unbonded reports:** if no deposit arrives within the window the maintainer set (default 48 hours), the report is tagged *unbonded* in our dashboard. The maintainer's rules decide what happens: lowest priority, or closed automatically.

### Triage

1. A bonded report is queued for the triage agent (§5).
2. The critic agent reviews the result.
3. The decision policy (§6) either acts automatically, or puts the report in the maintainer's queue with the evidence.
4. The maintainer signs a verdict (built). The app moves the advisory on GitHub: accepted goes to *draft* (being fixed), rejected goes to *closed*.

## 5. The agents

### Setup agent

- **Input:** the maintainer's answers and a read-only clone of the repo.
- **Output:** a structured rulebook (JSON with a human-readable view) and a `SECURITY.md` draft.
- **Built on:** the bounty-rules skill we provide. Maintainers can start from templates such as "library", "web app" or "CLI".

### Triage agent

Runs in this order, cheapest first, and stops early when the answer is clear.

1. **Grounding check (deterministic, no model).**
   - Extract every file path, function, class, line number, version and dependency the report names.
   - Check each one against the repo at the reported version.
   - Hallucinated references are the strongest single sign of AI slop, and this check costs almost nothing.
2. **Scope check.** Compare the affected component and version to the rulebook.
3. **Duplicate check.** Compare against the repo's earlier reports and published advisories.
4. **Code reasoning.** Trace the claimed path through the actual code: is the input reachable, is the sink real, do the guards stop it?
5. **Proof-of-concept run.** Run it in an isolated sandbox with no network, no secrets and a time limit, at the reported version, if there is one.
6. **Output:** a verdict, a confidence score, a suggested severity, and evidence. Every claim links to a file and line, or to a sandbox log.

### Critic agent

- Gets the report, the rulebook and the triage output, and checks that every conclusion is backed by the evidence.
- Flags disagreement, missing checks and signs of prompt injection in the report.
- Agree plus high confidence lets the decision policy run. Anything else goes to the maintainer.

### Guardrails

- Report text is passed in a clearly marked data block, never merged into instructions.
- Agents have read-only repo access, and run the sandbox with no network.
- They never touch keys.
- Every agent run is stored: inputs, outputs, model, rulebook version and evidence. That's the audit log.

## 6. Decision policy and the appeal window

Each pool sets an **auto-decision threshold** (or none, which is the default).

| Triage and critic outcome | What happens |
|---|---|
| Valid | Always to the maintainer. A bounty is never paid automatically. |
| Mistake, both agree, confidence ≥ threshold | Auto-verdict *Mistake*. The deposit is returned, so this only ever helps the reporter. |
| Slop, both agree, confidence ≥ threshold | Proposed *Slop*. The reporter is notified with the evidence and the appeal window starts (default 7 days). |
| Anything below threshold, or agents disagree | To the maintainer's queue, with the evidence |

**Appeal window**
- During the window, the reporter can appeal in one click and add context.
- An appeal sends the report to the maintainer; the agents never decide an appealed report.
- With no appeal by the end of the window, the auto-signer signs *Slop*. The deposit moves to the pool and still only pays future bounties.

**Contract change for auto-verdicts.** Today only the maintainer's verdict signer can sign, and its key never touches our servers. Auto-verdicts need a second, limited signer per pool:

- `autoSigner`: a key held by our backend, set per pool by the maintainer, and revocable any time.
- The contract only accepts `Mistake` or `Slop` from it, with `bounty == 0`. It can never sign `Valid`.
- A `Slop` from it is only accepted after `createdAt + appealWindow`, enforced on-chain, so the window can't be skipped.
- The maintainer's own signer still overrides everything until the verdict lands.

This keeps the rule from the original design: automation can return money, but only the maintainer can pay bounties. Slop that has run the full appeal window goes to the pool, which only ever pays other reporters.

## 7. Backend services to build

| Service | Purpose |
|---|---|
| GitHub App | Installation callback, repo admin check, `repository_advisory` webhook receiver, advisory state updates, `SECURITY.md` pull request |
| GitHub sign-in for reporters | Links a GitHub user to a wallet, so we know who filed which report |
| Rulebook store | Versioned rules per pool; reports pin the version they were filed under |
| Report tracker | Advisory to deposit to triage to verdict, with status, deadlines and unbonded detection |
| Job queue and agent runner | Runs the setup, triage and critic agents with retries and cost limits |
| Sandbox | Runs proofs of concept in isolation (container or microVM, no network, time limit) |
| Notifications | Email and GitHub notifications for new reports, recommendations, appeal windows and verdicts |
| Appeals | Appeal intake, deadline tracking, escalation |
| Auto-signer | Holds the per-pool `autoSigner` key, signs only what §6 allows, and is audited |
| Audit log | Every agent run and every automatic action, viewable by maintainer and reporter |
| Metrics | Feed for §10 |

Already built and reused: indexer, relayer, refund keeper, deposit and verdict flows, Postgres storage, cron.

## 8. Using it from GitHub itself

**What GitHub lets an app do with private reports:**

| Can do | Can't do |
|---|---|
| Get a webhook when a report is filed (`repository_advisory` with action `reported`) | Comment on a private advisory |
| Read the report, if granted "Repository security advisories" access | Add labels or custom tags to it |
| Move it to *draft* (accepted) or *closed* (rejected); publish it | Show our own panels on GitHub's pages |
| Manage advisory collaborators and credits | Collect payment inside GitHub |
| Open pull requests, e.g. `SECURITY.md` | |

So there are three layers.

**Layer 1: no install, works for everyone**
- `SECURITY.md` written by the setup agent, with the rules and a deposit link.
- A live README badge (an SVG we serve) showing the bounty pool and deposit, for example "Bounty: 42 USDC · deposit 5 USDC".
- Accept and reject as real GitHub advisory states, which the reporter sees on GitHub.
- Notification emails with deep links that open the right page with everything pre-filled, so the platform feels like a one-step detour.

**Layer 2: a browser extension, recommended for maintainers and frequent reporters**
- Already on the roadmap. The extension adds our panels directly to github.com pages:

| GitHub page | What the extension adds |
|---|---|
| Repository home | Bounty pool, deposit and response time, with a "Report with deposit" button |
| New private report form | Deposit widget: connect wallet, pay, linked automatically once the report is submitted |
| Advisory page (maintainer) | Triage verdict, confidence, evidence with file and line links, critic notes, and Valid / Mistake / Slop buttons that sign with the wallet |
| Advisory page (reporter) | Deposit status, deadline countdown, appeal button, refund button once due |
| Security tab list | Bonded/unbonded and AI recommendation badges on each report |

- **Wallet signing in the extension:** browser wallets like MetaMask expose themselves on the page, so the extension can ask the user's wallet to sign directly on github.com. The signature request still names the verdict in plain words.
- **Costs:** Chrome Web Store and Firefox review, and keeping up with GitHub's page structure. It needs a fallback when GitHub changes its markup: the panel shows "open in ReportBond" instead of breaking.

**Layer 3: our platform**
- Always available. It's the source of truth and the only place for setup, rule editing, pool funding and audit history.

**Recommendation:** build Layer 1 with the GitHub App, then the extension right after triage works. The extension is what makes "everything visible on GitHub" real, and it can only show what the backend already produces.

## 9. Security considerations

- **Prompt injection:** report text is data; the critic looks for injection attempts; agents can't move money.
- **Sandbox escape:** proof-of-concept code is hostile by assumption. Isolated runtime, no network, no secrets, resource limits, destroyed after each run.
- **Repo access:** the GitHub App asks only for what it needs:
  - read: contents, metadata, security advisories
  - write: security advisories (to accept or close)
  - write: pull requests, only for the `SECURITY.md` pull request
- **Auto-signer key:** separate per pool, limited by the contract to Mistake and Slop, revocable. Leaking it can at worst slash reports past their appeal window, never pay out.
- **Privacy:** advisory content stays private. Agents run on our infrastructure, and evidence is shown only to the maintainer and the reporter.

## 10. How we'll know it works

Pilot with three to five real repositories that have private vulnerability reporting turned on.

| Metric | Target to aim for |
|---|---|
| Share of reports flagged as slop that maintainers confirm | High: the agents are right |
| Maintainer agreement with agent recommendations | Rising over the pilot |
| Successful appeals against proposed slop | Near zero: we're not hurting honest reporters |
| Maintainer time per report | Clearly lower than before |
| Share of reports that come with a deposit | Shows whether the price works |

## 11. Build order

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | GitHub App: install, verified repo to pool link, webhook intake, report tracker, unbonded detection. **Built**; needs the real app registered ([GITHUB_APP.md](GITHUB_APP.md)) | App registered by Clatson |
| 2 | GitHub sign-in for reporters, wallet link | Phase 1 |
| 3 | Setup agent and rulebook editor, `SECURITY.md`, README badge. **Built.** `SECURITY.md` is a pre-filled GitHub editor link, not a pull request, so the app needs no write access to code | Phase 1 |
| 4 | Triage agent (grounding check first) and critic agent, recommend-only. **Built**, without the proof-of-concept sandbox and duplicate check | Phases 1, 3 |
| 5 | Maintainer review queue with evidence; accept or close on GitHub | Phase 4 |
| 6 | Appeal window, notifications, contract `autoSigner`, auto-decision threshold | Phases 4, 5 |
| 7 | Browser extension | Phases 4, 5 |
| 8 | Pilot and metrics | All |

## 12. Open questions

1. **Sandbox hosting:** a container service or microVMs (e.g. Firecracker)? Costs per proof-of-concept run need a cap.
2. **Model and cost:** which model runs triage, and what is the cost limit per report? Who pays: the pool, a fee, or us during the pilot?
3. **Fees:** Anto's `ReportBondWithFees.sol` adds protocol fees. That changes "no admin withdrawal" and needs a decision before it's deployed.
4. **Unbonded reports:** default to deprioritise, or to auto-close?
5. **Default appeal window and threshold:** 7 days and 0.9 confidence as defaults?
6. **Duplicates:** does a duplicate of an open report count as *Mistake* (deposit back), as most programs treat it?
