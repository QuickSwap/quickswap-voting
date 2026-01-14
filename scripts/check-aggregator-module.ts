/**
 * Check Aggregator Module Status
 * 
 * Verifies which module addresses are currently connected to the aggregator contract.
 * Useful for validating Safe transactions and deployment state.
 * 
 * Usage:
 *   pnpm exec tsx scripts/check-aggregator-module.ts [--chain <polygon|base>]
 * 
 * Examples:
 *   pnpm exec tsx scripts/check-aggregator-module.ts
 *   pnpm exec tsx scripts/check-aggregator-module.ts --chain polygon
 */
import { createPublicClient, http, type Address } from "viem";
import { polygon, base } from "viem/chains";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { POLYGON_AGGREGATOR_ABI, BASE_AGGREGATOR_ABI } from "../lib/abis/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "config", "chains.json");

interface ChainConfig {
  chainId: number;
  name: string;
  rpcEnvVar: string;
  defaultRpc: string;
  deployed: Record<string, string>;
}

const CHAIN_MAP = {
  polygon: { chain: polygon, abi: POLYGON_AGGREGATOR_ABI },
  base: { chain: base, abi: BASE_AGGREGATOR_ABI },
} as const;

async function main() {
  // Parse CLI args
  const chainArg = process.argv.find((_arg, i) => process.argv[i - 1] === "--chain");
  const chainKey = (chainArg || "base") as keyof typeof CHAIN_MAP;

  if (!CHAIN_MAP[chainKey]) {
    console.error(`❌ Invalid chain: ${chainKey}`);
    console.error(`   Available: ${Object.keys(CHAIN_MAP).join(", ")}`);
    process.exit(1);
  }

  // Load config
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const chainConfig: ChainConfig = config.chains[chainKey];

  if (!chainConfig) {
    console.error(`❌ Chain ${chainKey} not found in config/chains.json`);
    process.exit(1);
  }

  const aggregatorAddress = chainConfig.deployed?.aggregator as Address | undefined;
  if (!aggregatorAddress) {
    console.error(`❌ No aggregator deployed on ${chainKey}`);
    process.exit(1);
  }

  // Create client
  const { chain, abi } = CHAIN_MAP[chainKey];
  const rpcUrl = process.env[chainConfig.rpcEnvVar] || chainConfig.defaultRpc;
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  console.log(`\n🔍 ${chainConfig.name} Aggregator Module Status\n`);
  console.log("=".repeat(60));
  console.log(`   Aggregator: ${aggregatorAddress}`);
  console.log("=".repeat(60));

  // Query module addresses
  const moduleAddresses = await client.readContract({
    address: aggregatorAddress,
    abi,
    functionName: "getModuleAddresses",
  });

  // Display results
  console.log("\n📋 Connected Modules:\n");

  if (chainKey === "polygon") {
    const [walletDQ, syrup, algebraV3, lm, v2lp] = moduleAddresses;
    const expected = chainConfig.deployed;

    console.log(`   walletAndDQuick:    ${walletDQ} ${checkStatus(walletDQ, expected.walletAndDQuick)}`);
    console.log(`   syrupStaking:       ${syrup} ${checkStatus(syrup, expected.syrupStaking)}`);
    console.log(`   algebraV3:          ${algebraV3} ${checkStatus(algebraV3, expected.algebraV3)}`);
    console.log(`   liquidityManagers:  ${lm} ${checkStatus(lm, expected.liquidityManagers)}`);
    console.log(`   v2LPStaking:        ${v2lp} ${checkStatus(v2lp, expected.v2LPStaking)}`);
  } else if (chainKey === "base") {
    const [walletQ, syrup, algebraV4, lm, v2lp] = moduleAddresses;
    const expected = chainConfig.deployed;

    console.log(`   walletQuick:        ${walletQ} ${checkStatus(walletQ, expected.walletQuick)}`);
    console.log(`   syrupStaking:       ${syrup} ${checkStatus(syrup, expected.syrupStaking)}`);
    console.log(`   algebraIntegralV4:  ${algebraV4} ${checkStatus(algebraV4, expected.algebraIntegralV4)}`);
    console.log(`   liquidityManagers:  ${lm} ${checkStatus(lm, expected.liquidityManagers)}`);
    console.log(`   v2LPStaking:        ${v2lp} ${checkStatus(v2lp, expected.v2LPStaking)}`);
  }

  console.log("\n" + "=".repeat(60));
}

function checkStatus(actual: string, expected: string | undefined): string {
  if (!expected) return "❓ (not in config)";
  if (actual.toLowerCase() === expected.toLowerCase()) return "✅";
  if (actual === "0x0000000000000000000000000000000000000000") return "⏸️ (disabled)";
  return "⚠️ MISMATCH";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
