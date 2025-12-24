/**
 * Redeploy Aggregator Only
 * 
 * Reads module addresses from config/chains.json and deploys a new aggregator.
 * Useful when only the aggregator contract has changed (e.g., _validateModule fix).
 * 
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/redeploy-aggregator.ts --network polygon
 *   pnpm exec hardhat run scripts/deploy/redeploy-aggregator.ts --network base
 * 
 * Override specific modules via env vars:
 *   ALGEBRA_V3=0x... pnpm exec hardhat run scripts/deploy/redeploy-aggregator.ts --network polygon
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Address, createWalletClient, formatEther, http } from "viem";
import { polygon, base } from "viem/chains";
import hre from "hardhat";
import type { DeployContractConfig, WalletClient } from "@nomicfoundation/hardhat-viem/types";
import { deployPolygonAggregator, deployBaseAggregator, ZERO_ADDRESS, type DeployResult } from "./deployers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAIN_MAP = { polygon, base } as const;

function getChainKey(): string {
  const networkArgIndex = process.argv.indexOf("--network");
  const networkName = networkArgIndex !== -1 ? process.argv[networkArgIndex + 1] : undefined;
  
  if (!networkName || !["polygon", "base"].includes(networkName)) {
    throw new Error(`Usage: --network <polygon|base>`);
  }
  return networkName;
}

function loadChainsConfig() {
  const filePath = path.join(__dirname, "..", "..", "config", "chains.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveChainsConfig(config: any) {
  const filePath = path.join(__dirname, "..", "..", "config", "chains.json");
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
}

function getModuleAddress(deployed: Record<string, string>, envVar: string, key: string): Address {
  // Priority: env var > deployed > zero address
  const envValue = process.env[envVar];
  if (envValue) {
    console.log(`   📌 Override: ${key} = ${envValue}`);
    return envValue as Address;
  }
  return (deployed[key] || ZERO_ADDRESS) as Address;
}

async function main() {
  const chainKey = getChainKey();
  const chain = CHAIN_MAP[chainKey as keyof typeof CHAIN_MAP];
  const chainsConfig = loadChainsConfig();
  const chainConfig = chainsConfig.chains[chainKey];
  
  if (!chainConfig) {
    throw new Error(`Chain ${chainKey} not found in config/chains.json`);
  }
  
  const OWNER = (process.env.OWNER_ADDRESS || chainsConfig.owner) as Address;
  const deployed = chainConfig.deployed || {};
  
  console.log("🔄 Redeploy Aggregator Only");
  console.log(`   Chain: ${chainConfig.name} (${chainConfig.chainId})`);
  console.log(`   Owner: ${OWNER}`);
  console.log(`   Previous aggregator: ${deployed.aggregator || "none"}`);
  console.log("");
  
  // Build module addresses
  const modules: Record<string, Address> = {};
  
  if (chainKey === "polygon") {
    modules.walletAndDQuick = getModuleAddress(deployed, "WALLET_MODULE", "walletAndDQuick");
    modules.syrupStaking = getModuleAddress(deployed, "SYRUP_STAKING", "syrupStaking");
    modules.algebraV3 = getModuleAddress(deployed, "ALGEBRA_V3", "algebraV3");
    modules.liquidityManagers = getModuleAddress(deployed, "LIQUIDITY_MANAGERS", "liquidityManagers");
    modules.v2LPStaking = getModuleAddress(deployed, "V2LP_STAKING", "v2LPStaking");
  } else if (chainKey === "base") {
    modules.walletQuick = getModuleAddress(deployed, "WALLET_MODULE", "walletQuick");
    modules.syrupStaking = getModuleAddress(deployed, "SYRUP_STAKING", "syrupStaking");
    modules.algebraIntegralV4 = getModuleAddress(deployed, "ALGEBRA_INTEGRAL", "algebraIntegralV4");
    modules.liquidityManagers = getModuleAddress(deployed, "LIQUIDITY_MANAGERS", "liquidityManagers");
    modules.v2LPStaking = getModuleAddress(deployed, "V2LP_STAKING", "v2LPStaking");
  }
  
  console.log("📋 Modules:");
  for (const [name, addr] of Object.entries(modules)) {
    const isZero = addr === ZERO_ADDRESS;
    const marker = isZero ? "⏸️" : "✅";
    console.log(`   ${marker} ${name}: ${addr}`);
  }
  console.log("");
  
  // Setup deployer
  const { getAccount } = await import("../utils/keystore.js");
  const deployerAccount = await getAccount();
  
  const connection = await hre.network.connect();
  const hhViem = connection.viem;
  
  const rpcUrl = process.env[chainConfig.rpcEnvVar] || chainConfig.defaultRpc;
  
  const publicClient = await hhViem.getPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account: deployerAccount, chain, transport: http(rpcUrl) }) as unknown as WalletClient;
  const deployConfig: DeployContractConfig = { client: { wallet: walletClient, public: publicClient } };
  
  const balance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`   Deployer: ${deployerAccount.address}`);
  console.log(`   Balance:  ${formatEther(balance)} native`);
  console.log("");
  
  // Deploy aggregator
  let aggregator: DeployResult;
  
  if (chainKey === "polygon") {
    console.log("📦 Deploying PolygonAggregator...");
    aggregator = await deployPolygonAggregator(
      hhViem,
      OWNER,
      modules.walletAndDQuick,
      modules.syrupStaking,
      modules.algebraV3,
      modules.liquidityManagers,
      modules.v2LPStaking,
      deployConfig
    );
  } else {
    console.log("📦 Deploying BaseAggregator...");
    aggregator = await deployBaseAggregator(
      hhViem,
      OWNER,
      modules.walletQuick,
      modules.syrupStaking,
      modules.algebraIntegralV4,
      modules.liquidityManagers,
      modules.v2LPStaking,
      deployConfig
    );
  }
  
  console.log(`   ✅ ${aggregator.address}`);
  console.log("");
  
  // Update chains.json
  chainsConfig.chains[chainKey].deployed = {
    ...deployed,
    _updatedAt: new Date().toISOString(),
    aggregator: aggregator.address,
  };
  
  saveChainsConfig(chainsConfig);
  console.log("✅ Updated config/chains.json");
  
  // Save local backup (gitignored)
  const backupDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${chainKey}-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    chain: chainKey,
    deployedAt: new Date().toISOString(),
    deployer: deployerAccount.address,
    aggregator: aggregator.address,
    modules,
  }, null, 2));
  console.log(`📄 Backup: ${backupFile}`);
  
  console.log("");
  console.log("=".repeat(60));
  console.log("🎯 NEXT STEPS:");
  console.log(`   1. Verify contract on explorer`);
  console.log(`   2. Test in Snapshot playground: ${aggregator.address}`);
  console.log(`   3. Update Snapshot strategy`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
