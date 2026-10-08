# ReportBond

Refundable USDC deposits for private security reports on GitHub, settled on Arc.

A reporter pays a small deposit when filing a private vulnerability report. The repo's maintainer signs a verdict:

| Verdict | Deposit |
|---|---|
| **Valid** | Returned, plus a bounty from the pool |
| **Mistake** | Returned |
| **Slop** | Kept in the pool to pay future valid reports |
| *(no answer by the deadline)* | Anyone can trigger a refund |

The contract holds all money; there is no admin key. Verdicts are EIP-712 signatures from the pool's verdict signer, so our server can deliver them but never create or change them.

```text
contracts/   Foundry project: ReportBond.sol, tests, deploy script
app/         Next.js frontend + API routes (indexer, relayer, advisory links)
app/jobs/    indexer.ts and keeper.ts (run as separate processes when hosted)
config/      testnet.json, mainnet.json (contract address and deploy block go here)
```

## Setup

Requires Foundry, Node 22 and pnpm. Copy `.env.example` to `.env`.

```sh
git clone --recurse-submodules https://github.com/clatsonhacks/reportbond.git
```

```sh
cd contracts && forge test          # Layer 1: unit, fuzz, invariant
cd app && pnpm install
```

## Local end-to-end (Layer 2)

```sh
anvil
cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
cd app && NETWORK=local pnpm dev     # http://localhost:3000
cd app && NETWORK=local pnpm e2e     # scenarios A–E through the API, relayer and keeper
```

## Testnet (Layer 3)

1. Fund the deployer and relayer addresses in `.env` from https://faucet.circle.com (Arc Testnet).
2. Deploy: `cd contracts && forge script script/Deploy.s.sol --rpc-url https://rpc.drpc.testnet.arc.network --private-key $DEPLOYER_PRIVATE_KEY --broadcast`
3. Put the address and block number into `config/testnet.json`.
4. `cd app && pnpm dev` (or `pnpm build && pnpm start`), plus `pnpm indexer` and `pnpm keeper` when hosted.

After changing the contract: `forge build`, then `pnpm sync-abi` in `app/`.
