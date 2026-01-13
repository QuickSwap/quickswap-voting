/**
 * Update BaseAggregator to configure the SyrupStakingModule
 * 
 * Usage:
 *   pnpm exec hardhat run scripts/update-aggregator-module.ts --network base
 * 
 * Prerequisites:
 *   - SyrupStakingModule must be deployed
 *   - You must be the owner of the aggregator (or use a Safe multisig)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Address, createWalletClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import hre from "hardhat";
import type { WalletClient } from "@nomicfoundation/hardhat-viem/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG_PATH = path.join(__dirname, "..", "config", "chains.json");
const CHAINS_CONFIG = JSON.parse(fs.readFileSync(CHAINS_CONFIG_PATH, "utf8"));
const BASE_CONFIG = CHAINS_CONFIG.chains.base;

// ABI for the aggregator function we need
const AGGREGATOR_ABI = parseAbi([
  'function setSyrupStakingModule(address module) external',
  'function getModuleAddresses() external view returns (address walletQuick, address syrupStaking, address algebraIntegral, address liquidityManagers, address v2LPStaking)',
  'function owner() external view returns (address)',
]);

async function main() {
  console.log("🔧 Update BaseAggregator SyrupStaking Module");
  console.log("=".repeat(60));
  
  const aggregatorAddress = BASE_CONFIG.deployed.aggregator as Address;
  const syrupModuleAddress = BASE_CONFIG.deployed.syrupStaking as Address;
  
  if (!aggregatorAddress) {
    throw new Error("BaseAggregator not deployed. Check config/chains.json");
  }
  
  if (!syrupModuleAddress) {
    throw new Error("SyrupStakingModule not deployed. Run: pnpm exec hardhat run scripts/deploy/base-syrup-module.ts --network base");
  }
  
  console.log(`   Aggregator:    ${aggregatorAddress}`);
  console.log(`   SyrupModule:   ${syrupModuleAddress}\n`);
  
  // Load deployer account from keystore
  const { getAccount } = await import("./utils/keystore.js");
  const deployerAccount = await getAccount();
  
  // Create network connection
  const connection = await hre.network.connect();
  const hhViem = connection.viem;
  
  const rpcUrl = (process.env.BASE_RPC || BASE_CONFIG.defaultRpc) as string;
  const publicClient = await hhViem.getPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ 
    account: deployerAccount, 
    chain: base, 
    transport: http(rpcUrl) 
  }) as unknown as WalletClient;
  
  console.log(`   Signer:        ${deployerAccount.address}\n`);
  
  // Check current configuration
  console.log("📋 Checking current aggregator configuration...\n");
  
  const [currentOwner, moduleAddresses] = await Promise.all([
    publicClient.readContract({
      address: aggregatorAddress,
      abi: AGGREGATOR_ABI,
      functionName: 'owner',
    }),
    publicClient.readContract({
      address: aggregatorAddress,
      abi: AGGREGATOR_ABI,
      functionName: 'getModuleAddresses',
    }),
  ]);
  
  console.log(`   Current Owner:         ${currentOwner}`);
  console.log(`   Current WalletQuick:   ${moduleAddresses[0]}`);
  console.log(`   Current SyrupStaking:  ${moduleAddresses[1]}`);
  console.log(`   Current AlgebraV4:     ${moduleAddresses[2]}`);
  console.log(`   Current LiqManagers:   ${moduleAddresses[3]}`);
  console.log(`   Current V2LPStaking:   ${moduleAddresses[4]}\n`);
  
  // Check if signer is the owner
  if (currentOwner.toLowerCase() !== deployerAccount.address.toLowerCase()) {
    console.log("⚠️  WARNING: You are not the owner of the aggregator!");
    console.log(`   Owner:  ${currentOwner}`);
    console.log(`   Signer: ${deployerAccount.address}\n`);
    console.log("   This transaction will fail unless you use the owner account.");
    console.log("   If the owner is a Safe multisig, use the Safe UI instead:\n");
    console.log("   📋 Safe Transaction:");
    console.log(`      - Target:   ${aggregatorAddress}`);
    console.log(`      - Function: setSyrupStakingModule(address)`);
    console.log(`      - Module:   ${syrupModuleAddress}\n`);
    return;
  }
  
  // Check if already configured
  if (moduleAddresses[1].toLowerCase() === syrupModuleAddress.toLowerCase()) {
    console.log("✅ SyrupStakingModule is already configured in the aggregator!");
    console.log("   No action needed.\n");
    return;
  }
  
  // Update the aggregator
  console.log("📝 Updating aggregator configuration...\n");
  
  const hash = await walletClient.writeContract({
    address: aggregatorAddress,
    abi: AGGREGATOR_ABI,
    functionName: 'setSyrupStakingModule',
    args: [syrupModuleAddress],
  });
  
  console.log(`   📤 Transaction sent: ${hash}\n`);
  console.log("   ⏳ Waiting for confirmation...\n");
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status === 'success') {
    console.log("   ✅ Transaction confirmed!\n");
  } else {
    console.log("   ❌ Transaction failed!\n");
    throw new Error("Transaction reverted");
  }
  
  // Verify the update
  console.log("🔍 Verifying update...\n");
  
  const updatedModules = await publicClient.readContract({
    address: aggregatorAddress,
    abi: AGGREGATOR_ABI,
    functionName: 'getModuleAddresses',
  });
  
  console.log(`   Updated SyrupStaking: ${updatedModules[1]}\n`);
  
  if (updatedModules[1].toLowerCase() === syrupModuleAddress.toLowerCase()) {
    console.log("✅ SUCCESS! SyrupStaking module configured in aggregator.\n");
    console.log("=".repeat(60));
    console.log("🎯 NEXT STEPS:");
    console.log("=".repeat(60));
    console.log("\n1️⃣ Test the aggregator in Snapshot playground:");
    console.log(`   Strategy: erc20-balance-of`);
    console.log(`   Network:  8453`);
    console.log(`   Address:  ${aggregatorAddress}\n`);
    console.log("2️⃣ Compare voting power before/after for test addresses\n");
    console.log("3️⃣ Update Snapshot space configuration if needed\n");
  } else {
    console.log("❌ ERROR: Module address mismatch after update!");
    console.log(`   Expected: ${syrupModuleAddress}`);
    console.log(`   Got:      ${updatedModules[1]}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

