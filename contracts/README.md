# ReportBond contract

See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the design.

```sh
forge build
forge test                 # unit, fuzz and invariant tests
forge coverage

# deploy (testnet)
forge script script/Deploy.s.sol --rpc-url https://rpc.drpc.testnet.arc.network \
  --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

Verdict values in signatures use the `Status` enum numbers: Valid = 3, Mistake = 4, Slop = 5.
A bounty is only allowed on Valid. The EIP-712 type strings must match `app/lib/eip712.ts`.
