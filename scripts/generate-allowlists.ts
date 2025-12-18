/**
 * Generate Allowlists for Voting Modules
 * 
 * This script generates the allowlists needed for deployment:
 * - Gamma vaults (from interface-v3 GammaPairs)
 * - V2 LP staking pools (from quickswap-default-stake-list)
 * 
 * Usage:
 *   pnpm exec tsx scripts/generate-allowlists.ts
 * 
 * Output:
 *   deployments/allowlists/polygon.json
 *   deployments/allowlists/base.json
 */

import fs from "fs";
import path from "path";

// ============= Configuration =============

const QUICK_ADDRESSES: Record<string, string> = {
  polygon: "0xB5C064F955D8e7F38fE0460C556a72987494eE17",
  base: "0x7094c27f342DBAdfbbeD005b219431595E33b305",
};

// Paths to source data (adjust if needed)
const INTERFACE_V3_PATH = path.join(__dirname, "../../interface-v3");
const STAKE_LIST_PATH = path.join(__dirname, "../../quickswap-default-stake-list");

// ============= Types =============

interface GammaPair {
  address: string;
  token0: { address: string };
  token1: { address: string };
  title?: string;
}

interface LPFarm {
  tokens: { address: string }[];
  stakingRewardAddress: string;
  pair: string;
  ended?: boolean;
}

interface Allowlists {
  chain: string;
  quick: string;
  generatedAt: string;
  gammaVaults: {
    count: number;
    addresses: string[];
    details: { address: string; title?: string }[];
  };
  v2StakingPools: {
    count: number;
    addresses: string[];
    details: { stakingAddress: string; pair: string }[];
  };
  syrupLegacyPools: {
    count: number;
    addresses: string[];
  };
}

// ============= Helpers =============

function loadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.warn(`⚠️ Could not load: ${filePath}`);
    return null;
  }
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

function isQuickPair(pair: GammaPair, quickAddress: string): boolean {
  const quick = normalizeAddress(quickAddress);
  return (
    normalizeAddress(pair.token0.address) === quick ||
    normalizeAddress(pair.token1.address) === quick
  );
}
void isQuickPair; // Used when parsing Gamma pairs

function hasQuickToken(farm: LPFarm, quickAddress: string): boolean {
  const quick = normalizeAddress(quickAddress);
  return farm.tokens.some((t) => normalizeAddress(t.address) === quick);
}

// ============= Main Logic =============

function generateAllowlistsForChain(chain: string): Allowlists | null {
  const quickAddress = QUICK_ADDRESSES[chain];
  if (!quickAddress) {
    console.warn(`⚠️ No QUICK address configured for chain: ${chain}`);
    return null;
  }

  console.log(`\n📋 Generating allowlists for ${chain}...`);
  console.log(`   QUICK: ${quickAddress}`);

  // 1. Load Gamma pairs
  let gammaVaults: { address: string; title?: string }[] = [];

  // Try to find gamma pairs from various possible locations
  const possibleGammaPaths = [
    path.join(INTERFACE_V3_PATH, "src", "constants", "GammaPairs.ts"),
    path.join(INTERFACE_V3_PATH, "src", "constants", "gammaPairs.json"),
    path.join(INTERFACE_V3_PATH, "gamma-pairs.json"),
  ];

  for (const gPath of possibleGammaPaths) {
    if (fs.existsSync(gPath)) {
      console.log(`   Found Gamma source: ${gPath}`);
      // Note: For .ts files, you'd need to parse differently or export to JSON
      break;
    }
  }

  // 2. Load LP farms from stake list
  const lpFarmsPath = path.join(STAKE_LIST_PATH, "lpfarms.json");
  let v2StakingPools: { stakingAddress: string; pair: string }[] = [];

  const lpFarmsData = loadJson<LPFarm[]>(lpFarmsPath);
  if (lpFarmsData && Array.isArray(lpFarmsData)) {
    const quickFarms = lpFarmsData.filter(
      (farm) => hasQuickToken(farm, quickAddress) && !farm.ended
    );
    v2StakingPools = quickFarms.map((farm) => ({
      stakingAddress: farm.stakingRewardAddress,
      pair: farm.pair,
    }));
    console.log(`   V2 LP farms with QUICK: ${v2StakingPools.length}`);
  }

  // 3. Build result
  const result: Allowlists = {
    chain,
    quick: quickAddress,
    generatedAt: new Date().toISOString(),
    gammaVaults: {
      count: gammaVaults.length,
      addresses: gammaVaults.map((v) => v.address),
      details: gammaVaults,
    },
    v2StakingPools: {
      count: v2StakingPools.length,
      addresses: v2StakingPools.map((p) => p.stakingAddress),
      details: v2StakingPools,
    },
    syrupLegacyPools: {
      count: 0,
      addresses: [],
    },
  };

  return result;
}

async function main() {
  console.log("🔧 Generating allowlists for voting modules...\n");

  const outputDir = path.join(__dirname, "..", "deployments", "allowlists");
  fs.mkdirSync(outputDir, { recursive: true });

  const chains = ["polygon", "base"];

  for (const chain of chains) {
    const allowlists = generateAllowlistsForChain(chain);
    if (allowlists) {
      const outputPath = path.join(outputDir, `${chain}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(allowlists, null, 2));
      console.log(`   ✅ Saved: ${outputPath}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📋 MANUAL STEPS REQUIRED:");
  console.log("=".repeat(60));
  console.log(`
1. GAMMA VAULTS:
   - Go to interface-v3/src/constants/GammaPairs.ts
   - Find pairs for ${QUICK_ADDRESSES.polygon} (Polygon)
   - Extract hypervisor addresses where token0 or token1 is QUICK
   - Add to deployments/allowlists/polygon.json

2. V2 LP STAKING:
   - The script attempted to load from quickswap-default-stake-list
   - Verify the addresses are correct
   - Filter out any ended/inactive farms

3. SYRUP LEGACY POOLS:
   - Check if there are syrup pools not in the factory
   - Add addresses to syrupLegacyPools array

4. DEPLOYMENT:
   - Use the generated allowlists in deploy scripts
   - Example: pnpm exec hardhat run scripts/deploy-modules.ts --network polygon
`);
}

main().catch(console.error);

