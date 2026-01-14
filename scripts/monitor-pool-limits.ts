/**
 * Pool Limits Monitor
 * 
 * Checks if any module is approaching its pool limit.
 * Exit code 1 = alert needed, Exit code 0 = all OK
 * 
 * Usage:
 *   pnpm exec tsx scripts/monitor-pool-limits.ts [--chain <polygon|base>]
 * 
 * For cron/alerting:
 *   - Exit 0: All limits OK
 *   - Exit 1: Near limit (warning)
 *   - Exit 2: At/over limit (critical)
 */
import { createPublicClient, http, type Address } from "viem";
import { polygon, base } from "viem/chains";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { STAKING_REWARDS_FACTORY_ABI } from "../lib/abis/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "config", "chains.json");

const MAX_FACTORY_POOLS = 100;
const WARNING_THRESHOLD = 90; // Alert at 90%

const CHAIN_MAP = { polygon, base } as const;

async function countFactoryPools(client: any, factoryAddress: Address): Promise<number> {
  for (let i = 0; i < MAX_FACTORY_POOLS + 50; i++) {
    try {
      await client.readContract({
        address: factoryAddress,
        abi: STAKING_REWARDS_FACTORY_ABI,
        functionName: "rewardTokens",
        args: [BigInt(i)],
      });
    } catch {
      return i;
    }
  }
  return MAX_FACTORY_POOLS + 50;
}

async function main() {
  // Parse CLI args
  const chainArg = process.argv.find((_arg, i) => process.argv[i - 1] === "--chain");
  const chainKey = (chainArg || "polygon") as keyof typeof CHAIN_MAP;

  if (!CHAIN_MAP[chainKey]) {
    console.error(`❌ Invalid chain: ${chainKey}`);
    console.error(`   Available: ${Object.keys(CHAIN_MAP).join(", ")}`);
    process.exit(2);
  }

  // Load config
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const chainConfig = config.chains[chainKey];

  if (!chainConfig) {
    console.error(`❌ Chain ${chainKey} not found in config/chains.json`);
    process.exit(2);
  }

  const factoryAddress = chainConfig.contracts?.syrupFactory as Address | undefined;
  if (!factoryAddress) {
    console.log(`ℹ️  No syrupFactory configured for ${chainKey}, skipping.`);
    process.exit(0);
  }

  const rpcUrl = process.env[chainConfig.rpcEnvVar] || chainConfig.defaultRpc;
  const client = createPublicClient({
    chain: CHAIN_MAP[chainKey],
    transport: http(rpcUrl),
  });

  console.log(`🔍 Checking pool limits on ${chainConfig.name}...\n`);
  console.log(`   Factory: ${factoryAddress}\n`);

  const currentCount = await countFactoryPools(client, factoryAddress);
  const percentage = (currentCount / MAX_FACTORY_POOLS) * 100;

  console.log(`Factory Pools: ${currentCount} / ${MAX_FACTORY_POOLS} (${percentage.toFixed(1)}%)`);

  if (currentCount >= MAX_FACTORY_POOLS) {
    console.log("\n🚨 CRITICAL: At or over limit!");
    console.log("   Action: Increase MAX_FACTORY_POOLS and redeploy");
    process.exit(2);
  }

  if (currentCount >= WARNING_THRESHOLD) {
    console.log("\n⚠️  WARNING: Approaching limit");
    console.log("   Action: Plan to increase MAX_FACTORY_POOLS");
    process.exit(1);
  }

  console.log("\n✅ All limits OK");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(2);
});
