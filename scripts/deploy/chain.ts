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
import { type Address, createWalletClient, formatEther, http } from "viem";
import { polygon, mainnet, base, manta } from "viem/chains";
import hre from "hardhat";
import type { DeployContractConfig, WalletClient } from "@nomicfoundation/hardhat-viem/types";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map network names to viem chains (required for hardhat-viem)
const CHAIN_MAP = {
  polygon,
  ethereum: mainnet,
  base,
  manta
} as const;

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "config", "chains.json"), "utf8")
).chains as any;

const OWNER_ADDRESS = (process.env.OWNER_ADDRESS || "0xDA1077c4b0dd6da1BDF166F30aa4BDbF517d637b") as Address;

function getChainConfig(): { chainKey: string; config: any } {
  // Get network name from command line args (--network <name>)
  const networkArgIndex = process.argv.indexOf('--network');
  const networkName = networkArgIndex !== -1 ? process.argv[networkArgIndex + 1] : undefined;
  
  if (!networkName) {
    throw new Error(
      `Network not specified. Use: --network <chain>\n` +
      `Available: ${Object.keys(CHAINS_CONFIG).join(", ")}`
    );
  }
  
  // Try direct match first
  if (CHAINS_CONFIG[networkName]) {
    return { chainKey: networkName, config: CHAINS_CONFIG[networkName] };
  }
  
  // Otherwise, try to find by chainId from hardhat config
  const hardhatNetworkConfig = (hre.config as any).networks?.[networkName];
  if (hardhatNetworkConfig?.chainId) {
    for (const [key, config] of Object.entries(CHAINS_CONFIG) as [string, any][]) {
      if (config.chainId === hardhatNetworkConfig.chainId) {
        return { chainKey: key, config };
      }
    }
  }
  
  throw new Error(
    `Chain "${networkName}" not found in config/chains.json.\n` +
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
  
  // Get viem chain definition (used for both hardhat-viem + direct viem clients)
  const chain = CHAIN_MAP[chainKey as keyof typeof CHAIN_MAP];
  if (!chain) {
    throw new Error(`Chain ${chainKey} not found in CHAIN_MAP`);
  }
  
  // Load deployer account from keystore
  const { getAccount } = await import("../utils/keystore.js");
  const deployerAccount = await getAccount();
  
  // Create a network connection and use its viem helpers.
  // Note: hardhat-viem extends NetworkConnection (connection.viem), not the HRE object.
  const connection = await hre.network.connect();
  const hhViem = connection.viem;

  // Resolve RPC URL from config/chains.json (single source of truth)
  const rpcUrl = (process.env[config.rpcEnvVar] || config.defaultRpc) as string;
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for ${chainKey}. Set ${config.rpcEnvVar} or update config/chains.json`);
  }

  // Use explicit clients for deployments (keystore signer).
  // hardhat-viem deployContract supports a client override.
  const publicClient = await hhViem.getPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account: deployerAccount, chain, transport: http(rpcUrl) }) as unknown as WalletClient;
  const deployConfig: DeployContractConfig = { client: { wallet: walletClient, public: publicClient } };
  
  console.log("🚀 Generic Chain Deployer");
  console.log(`   Chain:    ${config.name} (${config.chainId})`);
  console.log(`   Deployer: ${deployerAccount.address}`);
  console.log(`   Owner:    ${OWNER_ADDRESS}`);
  
  const balance = await publicClient.getBalance({ address: deployerAccount.address });
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
    deployed.walletQuick = await deployWalletQuickModule(hhViem, config.tokens.QUICK, deployConfig);
    console.log(`   ✅ ${deployed.walletQuick.address}`);
  }
  
  if (modules.walletAndDQuick) {
    console.log("📦 Deploying WalletAndDQuickModule...");
    deployed.walletAndDQuick = await deployWalletAndDQuickModule(
      hhViem,
      config.tokens.QUICK,
      config.contracts.dragonLair,
      deployConfig
    );
    console.log(`   ✅ ${deployed.walletAndDQuick.address}`);
  }
  
  if (modules.syrupStaking) {
    const factory = config.contracts?.syrupFactory || ZERO_ADDRESS;
    const legacyPools = allowlists.syrupLegacyPools?.addresses || [];
    
    console.log("📦 Deploying SyrupStakingModule...");
    deployed.syrupStaking = await deploySyrupStakingModule(
      hhViem,
      OWNER_ADDRESS,
      factory,
      legacyPools,
      deployConfig
    );
    console.log(`   ✅ ${deployed.syrupStaking.address}`);
  }
  
  if (modules.algebraV3) {
    console.log("📦 Deploying AlgebraV3Module...");
    deployed.algebraV3 = await deployAlgebraV3Module(
      hhViem,
      config.tokens.QUICK,
      config.contracts.nonfungiblePositionManager,
      config.contracts.farmingCenter,
      config.contracts.poolDeployer,
      deployConfig
    );
    console.log(`   ✅ ${deployed.algebraV3.address}`);
  }
  
  if (modules.algebraIntegralV4) {
    console.log("📦 Deploying AlgebraIntegralV4Module...");
    deployed.algebraIntegralV4 = await deployAlgebraIntegralV4Module(
      hhViem,
      config.tokens.QUICK,
      config.contracts.nonfungiblePositionManager,
      config.contracts.factory,
      deployConfig
    );
    console.log(`   ✅ ${deployed.algebraIntegralV4.address}`);
  }
  
  if (modules.liquidityManagers) {
    const vaults = allowlists.liquidityManagers?.addresses || allowlists.almVaults?.addresses || [];
    console.log(`📦 Deploying LiquidityManagersModule (${vaults.length} vaults)...`);
    deployed.liquidityManagers = await deployLiquidityManagersModule(
      hhViem,
      OWNER_ADDRESS,
      config.tokens.QUICK,
      vaults,
      deployConfig
    );
    console.log(`   ✅ ${deployed.liquidityManagers.address}`);
  }
  
  if (modules.v2LPStaking) {
    const pools = allowlists.v2StakingPools?.addresses || [];
    console.log(`📦 Deploying V2LPStakingModule (${pools.length} pools)...`);
    deployed.v2LPStaking = await deployV2LPStakingModule(
      hhViem,
      OWNER_ADDRESS,
      config.tokens.QUICK,
      pools,
      deployConfig
    );
    console.log(`   ✅ ${deployed.v2LPStaking.address}`);
  }
  
  const moduleCount = Object.keys(deployed).length;
  
  if (moduleCount > 1) {
    console.log("");
    
    if (chainKey === "polygon") {
      console.log("📦 Deploying PolygonAggregator...");
      deployed.aggregator = await deployPolygonAggregator(
        hhViem,
        OWNER_ADDRESS,
        deployed.walletAndDQuick?.address || ZERO_ADDRESS,
        deployed.syrupStaking?.address || ZERO_ADDRESS,
        deployed.algebraV3?.address || ZERO_ADDRESS,
        deployed.liquidityManagers?.address || ZERO_ADDRESS,
        deployed.v2LPStaking?.address || ZERO_ADDRESS,
        deployConfig
      );
      console.log(`   ✅ ${deployed.aggregator.address}`);
    } else if (chainKey === "base") {
      console.log("📦 Deploying BaseAggregator...");
      deployed.aggregator = await deployBaseAggregator(
        hhViem,
        OWNER_ADDRESS,
        deployed.walletQuick?.address || ZERO_ADDRESS,
        deployed.syrupStaking?.address || ZERO_ADDRESS,
        deployed.algebraIntegralV4?.address || ZERO_ADDRESS,
        deployed.liquidityManagers?.address || ZERO_ADDRESS,
        deployed.v2LPStaking?.address || ZERO_ADDRESS,
        deployConfig
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
  
  // Update config/chains.json (source of truth)
  const chainsConfigPath = path.join(__dirname, "..", "..", "config", "chains.json");
  const chainsConfig = JSON.parse(fs.readFileSync(chainsConfigPath, "utf8"));
  
  chainsConfig.chains[chainKey].deployed = {
    _updatedAt: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(deployed).map(([k, v]) => [k, v.address])),
  };
  
  fs.writeFileSync(chainsConfigPath, JSON.stringify(chainsConfig, null, 2) + "\n");
  console.log(`\n✅ Updated: config/chains.json`);
  
  // Save local backup (gitignored)
  const outputDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  
  const backupFile = path.join(outputDir, `${chainKey}-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    chain: chainKey,
    chainId: config.chainId,
    deployer: deployerAccount.address,
    owner: OWNER_ADDRESS,
    deployedAt: new Date().toISOString(),
    contracts: Object.fromEntries(
      Object.entries(deployed).map(([k, v]) => [k, { address: v.address, name: v.name, args: v.args }])
    ),
  }, null, 2));
  console.log(`📄 Backup: ${backupFile}`);
  
  // Next steps
  const mainContract = deployed.aggregator?.address || Object.values(deployed)[0]?.address;
  
  console.log("\n🎯 NEXT STEPS:");
  console.log(`   1. Verify: pnpm exec hardhat verify --network ${chainKey} ${mainContract} ...`);
  console.log(`   2. Test in Snapshot playground: ${mainContract}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

