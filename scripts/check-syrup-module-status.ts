/**
 * Check SyrupStakingModule status for any chain
 * Reads configuration from chains.json or accepts custom addresses
 * 
 * Usage:
 *   pnpm exec tsx scripts/check-syrup-module-status.ts                    # Uses Base from chains.json
 *   pnpm exec tsx scripts/check-syrup-module-status.ts --chain polygon    # Uses Polygon from chains.json
 *   pnpm exec tsx scripts/check-syrup-module-status.ts --module 0x...     # Custom module address
 *   pnpm exec tsx scripts/check-syrup-module-status.ts --factory 0x...    # Custom factory address
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, parseAbi, formatEther, Address, Chain } from "viem";
import { base, polygon, mainnet } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHAINS_CONFIG_PATH = path.join(__dirname, "..", "config", "chains.json");

interface ChainConfig {
  chainId: number;
  name: string;
  rpcEnvVar: string;
  defaultRpc: string;
  contracts: {
    syrupFactory?: string;
  };
  deployed: {
    syrupStaking?: string;
  };
}

interface ChainsConfig {
  chains: Record<string, ChainConfig>;
}

const CHAIN_MAP: Record<number, Chain> = {
  137: polygon,
  8453: base,
  1: mainnet,
};

const moduleAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function factory() view returns (address)",
  "function legacyPoolsLength() view returns (uint256)",
  "function getFactoryStatus() view returns (uint256 currentCount, uint256 maxCount, bool nearLimit)",
  "function MAX_FACTORY_POOLS() view returns (uint256)",
  "function owner() view returns (address)",
]);

const factoryAbi = parseAbi([
  "function rewardTokens(uint256 index) view returns (address)",
  "function stakingRewardsInfoByRewardToken(address rewardToken) view returns (address stakingRewards, uint256 rewardAmount, uint256 duration)",
]);

function parseArgs(): { chain: string; module?: string; factory?: string; user?: string } {
  const args = process.argv.slice(2);
  const result: { chain: string; module?: string; factory?: string; user?: string } = {
    chain: "base", // default
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--chain" && args[i + 1]) {
      result.chain = args[i + 1];
      i++;
    } else if (args[i] === "--module" && args[i + 1]) {
      result.module = args[i + 1];
      i++;
    } else if (args[i] === "--factory" && args[i + 1]) {
      result.factory = args[i + 1];
      i++;
    } else if (args[i] === "--user" && args[i + 1]) {
      result.user = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Usage: pnpm exec tsx scripts/check-syrup-module-status.ts [options]

Options:
  --chain <name>     Chain name from chains.json (default: base)
  --module <addr>    Override SyrupStakingModule address
  --factory <addr>   Override Factory address
  --user <addr>      Test user address for balanceOf checks
  --help             Show this help

Examples:
  pnpm exec tsx scripts/check-syrup-module-status.ts
  pnpm exec tsx scripts/check-syrup-module-status.ts --chain polygon
  pnpm exec tsx scripts/check-syrup-module-status.ts --module 0x1234...
`);
      process.exit(0);
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  // Load chains config
  const chainsConfig: ChainsConfig = JSON.parse(fs.readFileSync(CHAINS_CONFIG_PATH, "utf8"));
  const chainConfig = chainsConfig.chains[args.chain];

  if (!chainConfig) {
    console.error(`❌ Chain "${args.chain}" not found in chains.json`);
    console.error(`   Available chains: ${Object.keys(chainsConfig.chains).join(", ")}`);
    process.exit(1);
  }

  // Determine addresses
  const moduleAddress = (args.module || chainConfig.deployed.syrupStaking) as Address | undefined;
  const factoryAddress = (args.factory || chainConfig.contracts.syrupFactory) as Address | undefined;
  const testUser = args.user as Address | undefined;

  if (!moduleAddress) {
    console.error(`❌ No SyrupStakingModule address found for ${args.chain}`);
    console.error(`   Either deploy one or use --module <address>`);
    process.exit(1);
  }

  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log(`║       SyrupStakingModule Status - ${chainConfig.name.padEnd(23)}  ║`);
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  // Create client
  const viemChain = CHAIN_MAP[chainConfig.chainId];
  const rpcUrl = process.env[chainConfig.rpcEnvVar] || chainConfig.defaultRpc;

  const client = createPublicClient({
    chain: viemChain,
    transport: http(rpcUrl),
  });

  // ======= Module Info =======
  console.log("📦 Module Information");
  console.log("─".repeat(50));
  console.log("  Address:", moduleAddress);

  let moduleFactory: Address | undefined;
  try {
    moduleFactory = await client.readContract({
      address: moduleAddress,
      abi: moduleAbi,
      functionName: "factory",
    });
    console.log("  Factory:", moduleFactory);
  } catch {
    console.log("  Factory: (not available)");
  }

  let maxPools: bigint = 100n;
  try {
    maxPools = await client.readContract({
      address: moduleAddress,
      abi: moduleAbi,
      functionName: "MAX_FACTORY_POOLS",
    });
    console.log("  MAX_FACTORY_POOLS:", maxPools.toString());
  } catch {
    console.log("  MAX_FACTORY_POOLS: (no getter, likely 100)");
  }

  try {
    const legacyLen = await client.readContract({
      address: moduleAddress,
      abi: moduleAbi,
      functionName: "legacyPoolsLength",
    });
    console.log("  Legacy Pools:", legacyLen.toString());
  } catch {
    console.log("  Legacy Pools: (not available)");
  }

  try {
    const owner = await client.readContract({
      address: moduleAddress,
      abi: moduleAbi,
      functionName: "owner",
    });
    console.log("  Owner:", owner);
  } catch {
    // Skip if no owner function
  }
  console.log();

  // ======= Factory Status =======
  const effectiveFactory = moduleFactory || factoryAddress;

  if (effectiveFactory && effectiveFactory !== "0x0000000000000000000000000000000000000000") {
    console.log("🏭 Factory Pool Analysis");
    console.log("─".repeat(50));
    console.log("  Factory Address:", effectiveFactory);
    console.log();

    // Count actual pools in factory
    let poolCount = 0;
    const pools: { index: number; rewardToken: Address; stakingRewards: Address }[] = [];

    for (let i = 0; i < Number(maxPools) + 10; i++) {
      try {
        const rewardToken = await client.readContract({
          address: effectiveFactory,
          abi: factoryAbi,
          functionName: "rewardTokens",
          args: [BigInt(i)],
        });

        const [stakingRewards] = await client.readContract({
          address: effectiveFactory,
          abi: factoryAbi,
          functionName: "stakingRewardsInfoByRewardToken",
          args: [rewardToken],
        });

        pools.push({ index: i, rewardToken, stakingRewards });
        poolCount++;
      } catch {
        // Array out of bounds - no more pools
        break;
      }
    }

    console.log("  ✅ Total Pools in Factory:", poolCount);
    console.log();

    if (pools.length > 0 && pools.length <= 10) {
      console.log("  Pool Details:");
      for (const pool of pools) {
        console.log(`    [${pool.index}] Reward: ${pool.rewardToken.slice(0, 10)}... → Pool: ${pool.stakingRewards}`);
      }
      console.log();
    } else if (pools.length > 10) {
      console.log(`  (${pools.length} pools - showing first 5)`);
      for (const pool of pools.slice(0, 5)) {
        console.log(`    [${pool.index}] Reward: ${pool.rewardToken.slice(0, 10)}... → Pool: ${pool.stakingRewards}`);
      }
      console.log();
    }
  }

  // ======= getFactoryStatus =======
  console.log("📊 Module's getFactoryStatus()");
  console.log("─".repeat(50));

  try {
    const [currentCount, maxCount, nearLimit] = await client.readContract({
      address: moduleAddress,
      abi: moduleAbi,
      functionName: "getFactoryStatus",
    });
    console.log("  Current Pool Count:", currentCount.toString());
    console.log("  Max Pool Limit:", maxCount.toString());
    console.log("  Near Limit:", nearLimit ? "⚠️ YES" : "No");
  } catch {
    console.log("  (getFactoryStatus not available)");
  }
  console.log();

  // ======= Test balanceOf =======
  if (testUser) {
    console.log("👤 Balance Check");
    console.log("─".repeat(50));
    console.log("  User:", testUser);

    try {
      const balance = await client.readContract({
        address: moduleAddress,
        abi: moduleAbi,
        functionName: "balanceOf",
        args: [testUser],
      });
      console.log(`  Balance: ✅ ${formatEther(balance)} QUICK`);
    } catch (e: any) {
      console.log(`  Balance: ❌ FAILED - ${e.shortMessage || e.message?.slice(0, 100)}`);
    }
    console.log();
  }

  // ======= Summary =======
  console.log("═".repeat(60));
  console.log("✅ Status check complete");
}

main().catch(console.error);
