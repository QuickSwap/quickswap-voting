/**
 * Pool Limits Monitor
 * 
 * Checks if any module is approaching its pool limit.
 * Exit code 1 = alert needed, Exit code 0 = all OK
 * 
 * Usage:
 *   POLYGON_RPC=... npx tsx scripts/monitor-pool-limits.ts
 * 
 * For cron/alerting:
 *   - Exit 0: All limits OK
 *   - Exit 1: Near limit (warning)
 *   - Exit 2: At/over limit (critical)
 */

import { createPublicClient, http, parseAbi, type Address } from "viem";
import { polygon } from "viem/chains";

const RPC = process.env.POLYGON_RPC || "https://polygon-rpc.com";

const FACTORY_ADDRESS = "0xEDA776E7e1111BE5E82F9148B2deF870f99c1908" as Address;
const MAX_FACTORY_POOLS = 100;
const WARNING_THRESHOLD = 90; // Alert at 90%

const FACTORY_ABI = parseAbi([
  "function rewardTokens(uint256 index) view returns (address)",
]);

async function countFactoryPools(client: any): Promise<number> {
  for (let i = 0; i < MAX_FACTORY_POOLS + 50; i++) {
    try {
      await client.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
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
  const client = createPublicClient({
    chain: polygon,
    transport: http(RPC),
  });

  console.log("🔍 Checking pool limits...\n");

  const currentCount = await countFactoryPools(client);
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

