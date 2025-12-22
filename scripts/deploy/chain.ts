/**
 * Generic Chain Deployer
 * 
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/chain.ts --network <chain>
 *   OWNER_ADDRESS=0x... pnpm exec hardhat run scripts/deploy/chain.ts --network base
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Address, formatEther } from "viem";
import {
  deployWalletQuickModule,
  deployWalletAndDQuickModule,
  deploySyrupStakingModule,
  deployAlgebraV3Module,
  deployAlgebraIntegralV4Module,
  deployLiquidityManagersModule,
  deployV2LPStakingModule,
  deployPolygonAggregator,
  deployBaseAggregator,
  ZERO_ADDRESS,
  type DeployResult,
} from "./deployers.js";

const hre = await import("hardhat");
const viem = (hre as any).viem;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "config", "chains.json"), "utf8")
).chains as any;

const OWNER_ADDRESS = (process.env.OWNER_ADDRESS || "0xDA1077c4b0dd6da1BDF166F30aa4BDbF517d637b") as Address;

function getChainConfig(): { chainKey: string; config: any } {
  const networkName = (hre as any).network.name;
  const networkChainId = (hre as any).network.config?.chainId;
  
  // Try direct match first
  if (CHAINS_CONFIG[networkName]) {
    return { chainKey: networkName, config: CHAINS_CONFIG[networkName] };
  }
  
  // Otherwise, find by chainId
  for (const [key, config] of Object.entries(CHAINS_CONFIG) as [string, any][]) {
    if (config.chainId === networkChainId) {
      return { chainKey: key, config };
    }
  }
  
  throw new Error(
    `Chain "${networkName}" (chainId: ${networkChainId}) not found in config/chains.json.\n` +
    `Available: ${Object.keys(CHAINS_CONFIG).join(", ")}`
  );
}

function loadAllowlists(chainKey: string) {
  const filePath = path.join(__dirname, "..", "..", "deployments", "allowlists", `${chainKey}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  No allowlists file: deployments/allowlists/${chainKey}.json`);
    return {
      liquidityManagers: { addresses: [] as Address[] },
      v2StakingPools: { addresses: [] as Address[] },
      syrupLegacyPools: { addresses: [] as Address[] },
      almVaults: { addresses: [] as Address[] },
    };
  }
  
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  const { chainKey, config } = getChainConfig();
  const modules = config.modules || {};
  
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  
  console.log("🚀 Generic Chain Deployer");
  console.log(`   Chain:    ${config.name} (${config.chainId})`);
  console.log(`   Deployer: ${deployer.account.address}`);
  console.log(`   Owner:    ${OWNER_ADDRESS}`);
  
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log(`   Balance:  ${formatEther(balance)} native`);
  console.log("");
  
  // Show which modules will be deployed
  const enabledModules = Object.entries(modules)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  
  console.log("📋 Modules to deploy:");
  enabledModules.forEach(m => console.log(`   ✅ ${m}`));
  
  const disabledModules = Object.entries(modules)
    .filter(([, enabled]) => !enabled)
    .map(([name]) => name);
  
  if (disabledModules.length > 0) {
    console.log("   ⏸️  Skipped:");
    disabledModules.forEach(m => console.log(`      - ${m}`));
  }
  console.log("");
  
  const allowlists = loadAllowlists(chainKey);
  const deployed: Record<string, DeployResult> = {};
  
  if (modules.walletQuick) {
    console.log("📦 Deploying WalletQuickModule...");
    deployed.walletQuick = await deployWalletQuickModule(config.tokens.QUICK);
    console.log(`   ✅ ${deployed.walletQuick.address}`);
  }
  
  if (modules.walletAndDQuick) {
    console.log("📦 Deploying WalletAndDQuickModule...");
    deployed.walletAndDQuick = await deployWalletAndDQuickModule(
      config.tokens.QUICK,
      config.contracts.dragonLair
    );
    console.log(`   ✅ ${deployed.walletAndDQuick.address}`);
  }
  
  if (modules.syrupStaking) {
    const factory = config.contracts?.syrupFactory || ZERO_ADDRESS;
    const legacyPools = allowlists.syrupLegacyPools?.addresses || [];
    
    console.log("📦 Deploying SyrupStakingModule...");
    deployed.syrupStaking = await deploySyrupStakingModule(
      OWNER_ADDRESS,
      factory,
      legacyPools
    );
    console.log(`   ✅ ${deployed.syrupStaking.address}`);
  }
  
  if (modules.algebraV3) {
    console.log("📦 Deploying AlgebraV3Module...");
    deployed.algebraV3 = await deployAlgebraV3Module(
      config.tokens.QUICK,
      config.contracts.nonfungiblePositionManager,
      config.contracts.farmingCenter,
      config.contracts.poolDeployer
    );
    console.log(`   ✅ ${deployed.algebraV3.address}`);
  }
  
  if (modules.algebraIntegralV4) {
    console.log("📦 Deploying AlgebraIntegralV4Module...");
    deployed.algebraIntegralV4 = await deployAlgebraIntegralV4Module(
      config.tokens.QUICK,
      config.contracts.nonfungiblePositionManager,
      config.contracts.factory
    );
    console.log(`   ✅ ${deployed.algebraIntegralV4.address}`);
  }
  
  if (modules.liquidityManagers) {
    const vaults = allowlists.liquidityManagers?.addresses || allowlists.almVaults?.addresses || [];
    console.log(`📦 Deploying LiquidityManagersModule (${vaults.length} vaults)...`);
    deployed.liquidityManagers = await deployLiquidityManagersModule(
      OWNER_ADDRESS,
      config.tokens.QUICK,
      vaults
    );
    console.log(`   ✅ ${deployed.liquidityManagers.address}`);
  }
  
  if (modules.v2LPStaking) {
    const pools = allowlists.v2StakingPools?.addresses || [];
    console.log(`📦 Deploying V2LPStakingModule (${pools.length} pools)...`);
    deployed.v2LPStaking = await deployV2LPStakingModule(
      OWNER_ADDRESS,
      config.tokens.QUICK,
      pools
    );
    console.log(`   ✅ ${deployed.v2LPStaking.address}`);
  }
  
  const moduleCount = Object.keys(deployed).length;
  
  if (moduleCount > 1) {
    console.log("");
    
    if (chainKey === "polygon") {
      console.log("📦 Deploying PolygonAggregator...");
      deployed.aggregator = await deployPolygonAggregator(
        OWNER_ADDRESS,
        deployed.walletAndDQuick?.address || ZERO_ADDRESS,
        deployed.syrupStaking?.address || ZERO_ADDRESS,
        deployed.algebraV3?.address || ZERO_ADDRESS,
        deployed.liquidityManagers?.address || ZERO_ADDRESS,
        deployed.v2LPStaking?.address || ZERO_ADDRESS
      );
      console.log(`   ✅ ${deployed.aggregator.address}`);
    } else if (chainKey === "base") {
      console.log("📦 Deploying BaseAggregator...");
      deployed.aggregator = await deployBaseAggregator(
        OWNER_ADDRESS,
        deployed.walletQuick?.address || ZERO_ADDRESS,
        deployed.syrupStaking?.address || ZERO_ADDRESS,
        deployed.algebraIntegralV4?.address || ZERO_ADDRESS,
        deployed.liquidityManagers?.address || ZERO_ADDRESS,
        deployed.v2LPStaking?.address || ZERO_ADDRESS
      );
      console.log(`   ✅ ${deployed.aggregator.address}`);
    }
  }
  
  console.log("");
  console.log("=".repeat(60));
  console.log("📄 DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  
  const summary: Record<string, string> = {};
  for (const [key, result] of Object.entries(deployed)) {
    summary[key] = result.address;
    console.log(`   ${key}: ${result.address}`);
  }
  
  // Save deployment
  const outputDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  
  const outputFile = path.join(outputDir, `${chainKey}-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    chain: chainKey,
    chainId: config.chainId,
    deployer: deployer.account.address,
    owner: OWNER_ADDRESS,
    deployedAt: new Date().toISOString(),
    contracts: Object.fromEntries(
      Object.entries(deployed).map(([k, v]) => [k, { address: v.address, name: v.name }])
    ),
    modulesEnabled: modules,
  }, null, 2));
  
  console.log(`\n✅ Saved: ${outputFile}`);
  
  // Next steps
  const mainContract = deployed.aggregator?.address || Object.values(deployed)[0]?.address;
  
  console.log("\n🎯 NEXT STEPS:");
  console.log(`   1. Verify: pnpm exec hardhat verify --network ${chainKey} ${mainContract} ...`);
  console.log(`   2. Test in Snapshot playground with address: ${mainContract}`);
  console.log(`   3. Update config/chains.json with new addresses`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

