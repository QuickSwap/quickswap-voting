/**
 * Deploy Polygon Voting Modules
 * 
 * Deploys all modules and the aggregator for Polygon.
 * 
 * Prerequisites:
 *   1. Run: pnpm exec tsx scripts/generate-allowlists.ts
 *   2. Edit: deployments/allowlists/polygon.json
 * 
 * Usage:
 *   POLYGON_RPC=... PRIVATE_KEY=... pnpm exec hardhat run scripts/deploy-polygon-modules.ts --network polygon
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Address, formatEther } from "viem";

// Hardhat v3 runtime import
const hre = await import("hardhat");
const viem = (hre as any).viem;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============= Polygon Addresses =============

const POLYGON = {
  QUICK: "0xB5C064F955D8e7F38fE0460C556a72987494eE17" as Address,
  DRAGON_LAIR: "0x958d208Cdf087843e9AD98d23823d32E17d723A1" as Address,
  POSITION_MANAGER: "0x8eF88E4c7CfbbaC1C163f7eddd4B578792201de6" as Address,
  FARMING_CENTER: "0x7F281A8cdF66eF5e9db8434Ec6D97acc1bc01E78" as Address,
  POOL_DEPLOYER: "0x2D98E2FA9da15aa6dC9581AB097Ced7af697CB92" as Address,
  SYRUP_FACTORY: "0xEDA776E7e1111BE5E82F9148B2deF870f99c1908" as Address,
};

// ============= Load Allowlists =============

interface Allowlists {
  gammaVaults: { addresses: Address[] };
  v2StakingPools: { addresses: Address[] };
  syrupLegacyPools: { addresses: Address[] };
}

function loadAllowlists(): Allowlists {
  const filePath = path.join(__dirname, "..", "deployments", "allowlists", "polygon.json");
  
  if (!fs.existsSync(filePath)) {
    console.log("\n⚠️  No allowlists file found. Using empty allowlists.");
    console.log("   Run: pnpm exec tsx scripts/generate-allowlists.ts\n");
    return {
      gammaVaults: { addresses: [] },
      v2StakingPools: { addresses: [] },
      syrupLegacyPools: { addresses: [] },
    };
  }
  
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ============= Deploy =============

async function main() {
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  
  console.log("🚀 Deploying Polygon Voting Modules");
  console.log("   Deployer:", deployer.account.address);
  
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("   Balance:", formatEther(balance), "MATIC");
  console.log("");

  const allowlists = loadAllowlists();
  
  console.log("📋 Allowlists:");
  console.log(`   Gamma vaults: ${allowlists.gammaVaults.addresses.length}`);
  console.log(`   V2 staking pools: ${allowlists.v2StakingPools.addresses.length}`);
  console.log(`   Syrup legacy pools: ${allowlists.syrupLegacyPools.addresses.length}`);
  console.log("");

  const deployed: Record<string, Address> = {};

  // ===== 1. Deploy WalletAndDQuickModule =====
  console.log("1️⃣  Deploying WalletAndDQuickModule...");
  const walletAndDQuick = await viem.deployContract("WalletAndDQuickModule", [
    POLYGON.QUICK,
    POLYGON.DRAGON_LAIR,
  ]);
  deployed.walletAndDQuick = walletAndDQuick.address;
  console.log(`   ✅ WalletAndDQuickModule: ${walletAndDQuick.address}`);

  // ===== 2. Deploy SyrupStakingModule =====
  console.log("2️⃣  Deploying SyrupStakingModule...");
  const syrupStaking = await viem.deployContract("SyrupStakingModule", [
    deployer.account.address,
    POLYGON.SYRUP_FACTORY,
    allowlists.syrupLegacyPools.addresses,
  ]);
  deployed.syrupStaking = syrupStaking.address;
  console.log(`   ✅ SyrupStakingModule: ${syrupStaking.address}`);

  // ===== 3. Deploy AlgebraV3Module =====
  console.log("3️⃣  Deploying AlgebraV3Module...");
  const algebraV3 = await viem.deployContract("AlgebraV3Module", [
    POLYGON.QUICK,
    POLYGON.POSITION_MANAGER,
    POLYGON.FARMING_CENTER,
    POLYGON.POOL_DEPLOYER,
  ]);
  deployed.algebraV3 = algebraV3.address;
  console.log(`   ✅ AlgebraV3Module: ${algebraV3.address}`);

  // ===== 4. Deploy GammaVaultsModule =====
  console.log("4️⃣  Deploying GammaVaultsModule...");
  const gammaVaults = await viem.deployContract("GammaVaultsModule", [
    deployer.account.address,
    POLYGON.QUICK,
    allowlists.gammaVaults.addresses,
  ]);
  deployed.gammaVaults = gammaVaults.address;
  console.log(`   ✅ GammaVaultsModule: ${gammaVaults.address}`);

  // ===== 5. Deploy V2LPStakingModule =====
  console.log("5️⃣  Deploying V2LPStakingModule...");
  const v2LPStaking = await viem.deployContract("V2LPStakingModule", [
    deployer.account.address,
    POLYGON.QUICK,
    allowlists.v2StakingPools.addresses,
  ]);
  deployed.v2LPStaking = v2LPStaking.address;
  console.log(`   ✅ V2LPStakingModule: ${v2LPStaking.address}`);

  // ===== 6. Deploy PolygonAggregator =====
  console.log("6️⃣  Deploying PolygonAggregator...");
  const aggregator = await viem.deployContract("PolygonAggregator", [
    deployer.account.address,
    deployed.walletAndDQuick,
    deployed.syrupStaking,
    deployed.algebraV3,
    deployed.gammaVaults,
    deployed.v2LPStaking,
  ]);
  deployed.aggregator = aggregator.address;
  console.log(`   ✅ PolygonAggregator: ${aggregator.address}`);

  // ===== Save deployment info =====
  console.log("");
  console.log("=".repeat(60));
  console.log("📄 DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(JSON.stringify(deployed, null, 2));
  
  const outputDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  
  const outputFile = path.join(outputDir, `polygon-modules-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    chain: "polygon",
    chainId: 137,
    deployer: deployer.account.address,
    deployedAt: new Date().toISOString(),
    contracts: deployed,
    config: {
      quick: POLYGON.QUICK,
      dragonLair: POLYGON.DRAGON_LAIR,
      positionManager: POLYGON.POSITION_MANAGER,
      farmingCenter: POLYGON.FARMING_CENTER,
      poolDeployer: POLYGON.POOL_DEPLOYER,
      syrupFactory: POLYGON.SYRUP_FACTORY,
    },
    allowlists: {
      gammaVaults: allowlists.gammaVaults.addresses.length,
      v2StakingPools: allowlists.v2StakingPools.addresses.length,
      syrupLegacyPools: allowlists.syrupLegacyPools.addresses.length,
    },
  }, null, 2));
  
  console.log(`\n✅ Saved: ${outputFile}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("🎯 NEXT STEPS");
  console.log("=".repeat(60));
  console.log(`
1. VERIFY CONTRACTS:
   pnpm exec hardhat verify --network polygon ${aggregator.address} \\
     ${deployer.account.address} ${deployed.walletAndDQuick} ${deployed.syrupStaking} \\
     ${deployed.algebraV3} ${deployed.gammaVaults} ${deployed.v2LPStaking}

2. TEST IN PLAYGROUND:
   - Go to: https://v1.snapshot.box/#/playground/erc20-balance-of
   - Strategy: { "address": "${aggregator.address}", "symbol": "QUICK", "decimals": 18 }
   - Network: 137
   - Test with known wallets

3. VALIDATE PARITY:
   - Compare aggregator.balanceOf() with old wrappers
   - Sum should be >= Voting8 + Voting10 + V3Pools1

4. UPDATE SNAPSHOT SPACE:
   - Replace existing strategies with new aggregator
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
