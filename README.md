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

## Arc Testnet

ReportBond is deployed at [`0x4963eCA8E60C1726CE1c123AcebF077024533d13`](https://testnet.arcscan.app/address/0x4963eCA8E60C1726CE1c123AcebF077024533d13) (block 66199770).

The end-to-end scenarios pass on testnet with a 5-minute timeout, 5.00 USDC deposit and 10.00 USDC pool:

| Scenario | Result | Transactions |
|---|---|---|
| Setup | Pool created and funded with 10.00 | [create](https://testnet.arcscan.app/tx/0xb2085072f38d1c3f9c04ead955ed830bee02e993f9815f85f0bfb588d253c256) |
| A. Valid | Reporter credited 7.00 (5.00 deposit + 2.00 bounty) | [deposit](https://testnet.arcscan.app/tx/0x31eec704855d6b5752e18bda53b669b6a479a456dc51762106ad0d258372568c) · [verdict](https://testnet.arcscan.app/tx/0x256ab40e7fad6f0f8b9bcd45453cc127413b92f6365d7ae8c3f832e09df663ca) |
| B. Mistake | Deposit returned, pool unchanged | [deposit](https://testnet.arcscan.app/tx/0x3f815e4f8878cee63d0d50f90f1f9306d24d235942f5cff6196e0850f7ea7f20) · [verdict](https://testnet.arcscan.app/tx/0x74e9899b42355ec86ded576f6c13fe83e70154b37208651437fb7efa805c4b7f) |
| C. Slop | 5.00 moved to slashed funds, not withdrawable | [deposit](https://testnet.arcscan.app/tx/0x4d48a39fb523c4e77cb373e3222a53b71f85ce0712cdfc542691bb7046f96fa8) · [verdict](https://testnet.arcscan.app/tx/0x429c2270d150e5c0f0d5683bc11a4d5828224eec5c3e555bbbfa7162370c8576) |
| D. No response | Refunded by a stranger straight on the contract, no server involved | [deposit](https://testnet.arcscan.app/tx/0x46ffb5303d0c0f3a99c298557837fd1dd05ed0611972f1ccd0871aa8ecd8a873) · [refund](https://testnet.arcscan.app/tx/0x8c89a752bd01deaa7a17e5a82d68448f1fa1b9a6f6e761945ee4eb2f15e0c14b) |
| E. Tampered / replayed | Slop signature edited to Valid rejected; second submission rejected | [deposit](https://testnet.arcscan.app/tx/0x88fd201d9cd5b61c0c0f44726aa699a6a05ae3593e2bbea48427257887e89964) · [verdict](https://testnet.arcscan.app/tx/0x601f9af215bbfe991680c5a9b74a3517c108fffd5c49578d3a1aeefb9f2a8d36) |
| Withdrawals | Reporter got back exactly 17.00 in total | [12.00](https://testnet.arcscan.app/tx/0x8da9d119cbc9e4f1b701ff3b9992ad00aadb990c6172415f4a678edc8ed27d73) · [5.00](https://testnet.arcscan.app/tx/0xa8ed8e67d325846b7ba7039b3c0e6eca2ff797df9c6f00f826da5fa5d7181f76) |

Still to do by hand: a plain browser wallet (MetaMask or Rabby) going through the report flow, and a smart-wallet verdict signer.

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
5. With the `TEST_*` wallets in `.env` funded: `cd app && pnpm e2e` runs scenarios A–E on testnet (about 6 minutes).

After changing the contract: `forge build`, then `pnpm sync-abi` in `app/`.
