// Checks before running scenarios on a live network (docs/TESTING.md, Layer 4 "Before deploying").
//   pnpm preflight                    testnet
//   NETWORK=mainnet pnpm preflight    mainnet: uses MAINNET_* wallets and must pass before E2E_MAINNET_CONFIRM=yes
import "../jobs/env";
import { execSync } from "node:child_process";
import { createPublicClient, fallback, http, zeroAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { formatUsdc, parseUsdc } from "../lib/format";
import { chain, config } from "../lib/network";

const TAG = "v0.1-testnet-passed";
const mainnet = config.network === "mainnet";
const prefix = mainnet ? "MAINNET" : "TEST";
const need = mainnet
  ? { deployer: "0.3", maintainer: "2.1", reporter: "1.1", stranger: "0.05", relayer: "0.5" }
  : { deployer: "0", maintainer: "10.2", reporter: "10.3", stranger: "0.1", relayer: "0.5" };

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  if (config.network === "local") throw new Error("Preflight is for testnet or mainnet");
  console.log(`Preflight for ${config.network}\n`);
  const client = createPublicClient({ chain, transport: fallback([http(config.rpcUrl), http(config.rpcFallbackUrl)]) });

  const id = await client.getChainId();
  check(`RPC reports chain ID ${config.chainId}`, id === config.chainId, `got ${id}`);

  if (config.contractAddress === zeroAddress) {
    console.log("  --   contract not deployed yet; put its address and block in config/" + config.network + ".json after deploying");
  } else {
    const code = await client.getCode({ address: config.contractAddress });
    check("contract has code at the configured address", Boolean(code && code !== "0x"), config.contractAddress);
  }

  const testKeys = new Set(
    Object.entries(process.env)
      // In a local .env, the unprefixed deployer and relayer keys are the testnet ones.
      .filter(([k]) => mainnet && (k.startsWith("TEST_") || k === "DEPLOYER_PRIVATE_KEY" || k === "RELAYER_PRIVATE_KEY"))
      .map(([, v]) => v?.toLowerCase()),
  );
  const wallets: [string, string | undefined, string][] = [
    ...(mainnet ? ([["deployer", process.env.MAINNET_DEPLOYER_PRIVATE_KEY, need.deployer]] as [string, string | undefined, string][]) : []),
    ["relayer", mainnet ? process.env.MAINNET_RELAYER_PRIVATE_KEY : process.env.RELAYER_PRIVATE_KEY, need.relayer],
    ["maintainer", process.env[`${prefix}_MAINTAINER_PRIVATE_KEY`], need.maintainer],
    ["reporter", process.env[`${prefix}_REPORTER_PRIVATE_KEY`], need.reporter],
    ["stranger", process.env[`${prefix}_STRANGER_PRIVATE_KEY`], need.stranger],
  ];
  const seen = new Set<string>();
  for (const [name, key, min] of wallets) {
    if (!key) {
      const variable = name === "relayer" && !mainnet ? "RELAYER_PRIVATE_KEY" : `${prefix}_${name.toUpperCase()}_PRIVATE_KEY`;
      check(`${name} wallet key is set`, false, variable);
      continue;
    }
    const account = privateKeyToAccount(key as Hex);
    if (mainnet) check(`${name} wallet is not a testnet wallet`, !testKeys.has(key.toLowerCase()), account.address);
    check(`${name} wallet is different from the others`, !seen.has(account.address), account.address);
    seen.add(account.address);
    const balance = await client.getBalance({ address: account.address });
    check(`${name} holds at least ${formatUsdc(parseUsdc(min))}`, balance >= parseUsdc(min), `${formatUsdc(balance)} at ${account.address}`);
  }

  if (mainnet) {
    let tagged = false;
    try {
      execSync(`git rev-parse --verify --quiet ${TAG}`, { stdio: "ignore" });
      tagged = true;
    } catch {}
    check(`git tag ${TAG} exists`, tagged, tagged ? undefined : `tag the commit that passed testnet: git tag ${TAG} <commit>`);
    if (tagged) {
      let same = false;
      try {
        execSync(`git diff --quiet ${TAG} HEAD -- ../contracts/src`, { stdio: "ignore" });
        same = true;
      } catch {}
      check("contract source unchanged since that tag", same);
    }
  }

  console.log(failures ? `\n${failures} check(s) failed: fix these before going further.` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
