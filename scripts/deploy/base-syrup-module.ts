/**
 * Deploy SyrupStakingModule on Base and configure it in the existing aggregator
 * 
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/base-syrup-module.ts --network base
 *   FACTORY=0x... pnpm exec hardhat run scripts/deploy/base-syrup-module.ts --network base
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import { type Address, createWalletClient, formatEther, http, isAddress } from "viem";
import { base } from "viem/chains";
import hre from "hardhat";
import type { DeployContractConfig, WalletClient } from "@nomicfoundation/hardhat-viem/types";
import { deploySyrupStakingModule, ZERO_ADDRESS } from "./deployers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG_PATH = path.join(__dirname, "..", "..", "config", "chains.json");
const CHAINS_CONFIG = JSON.parse(fs.readFileSync(CHAINS_CONFIG_PATH, "utf8"));

const BASE_CONFIG = CHAINS_CONFIG.chains.base;
const OWNER_ADDRESS = (process.env.OWNER_ADDRESS || CHAINS_CONFIG.owner) as Address;

async function promptFactoryAddress(): Promise<Address> {
  // 1. Check if factory is in chains.json
  const configFactory = BASE_CONFIG.contracts?.syrupFactory;
  
  // 2. Check if FACTORY env var is set
  const envFactory = process.env.FACTORY;
  
  if (envFactory) {
    const addr = envFactory.toLowerCase();
    if (addr === "0x0" || addr === "0x0000000000000000000000000000000000000000") {
      console.log("   Using address(0) from FACTORY env var\n");
      return ZERO_ADDRESS;
    }
    if (!isAddress(envFactory)) {
      throw new Error(`Invalid FACTORY address: ${envFactory}`);
    }
    console.log(`   Using factory from FACTORY env var: ${envFactory}\n`);
    return envFactory as Address;
  }
  
  // 3. Interactive prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const prompt = (query: string): Promise<string> => {
    return new Promise(resolve => rl.question(query, resolve));
  };
  
  if (configFactory && configFactory !== ZERO_ADDRESS) {
    console.log(`   Factory in chains.json: ${configFactory}`);
    const answer = await prompt("   Press Enter to use it, or paste different address (or '0x0' for none): ");
    rl.close();
    
    if (!answer || answer.trim() === "") {
      console.log(`   Using: ${configFactory}\n`);
      return configFactory as Address;
    }
    
    const addr = answer.trim().toLowerCase();
    if (addr === "0x0" || addr === "0x0000000000000000000000000000000000000000") {
      console.log("   Using: address(0)\n");
      return ZERO_ADDRESS;
    }
    
    if (!isAddress(answer.trim())) {
      throw new Error(`Invalid address: ${answer}`);
    }
    
    console.log(`   Using: ${answer.trim()}\n`);
    return answer.trim() as Address;
  } else {
    console.log("   No factory configured in chains.json");
    const answer = await prompt("   Enter factory address (or '0x0' for none): ");
    rl.close();
    
    const addr = answer.trim().toLowerCase();
    if (addr === "0x0" || addr === "0x0000000000000000000000000000000000000000") {
      console.log("   Using: address(0)\n");
      return ZERO_ADDRESS;
    }
    
    if (!isAddress(answer.trim())) {
      throw new Error(`Invalid address: ${answer}`);
    }
    
    console.log(`   Using: ${answer.trim()}\n`);
    return answer.trim() as Address;
  }
}

async function main() {
  console.log("🚀 Base SyrupStaking Module Deployment");
  console.log("=".repeat(60));
  
  // Load deployer account from keystore
  const { getAccount } = await import("../utils/keystore.js");
  const deployerAccount = await getAccount();
  
  // Create network connection
  const connection = await hre.network.connect();
  const hhViem = connection.viem;
  
  // Setup clients
  const rpcUrl = (process.env.BASE_RPC || BASE_CONFIG.defaultRpc) as string;
  const publicClient = await hhViem.getPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ 
    account: deployerAccount, 
    chain: base, 
    transport: http(rpcUrl) 
  }) as unknown as WalletClient;
  
  const deployConfig: DeployContractConfig = { 
    client: { wallet: walletClient, public: publicClient } 
  };
  
  console.log(`   Chain:    ${BASE_CONFIG.name} (${BASE_CONFIG.chainId})`);
  console.log(`   Deployer: ${deployerAccount.address}`);
  console.log(`   Owner:    ${OWNER_ADDRESS}`);
  
  const balance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`   Balance:  ${formatEther(balance)} ETH\n`);
  
  // Get factory address (from config, env, or prompt)
  const factoryAddress = await promptFactoryAddress();
  
  // Load legacy pools from allowlist (should be empty for Base)
  const allowlistPath = path.join(__dirname, "..", "..", "deployments", "allowlists", "base.json");
  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
  const legacyPools = allowlist.syrupLegacyPools?.addresses || [];
  
  if (legacyPools.length > 0) {
    console.log(`   Legacy pools: ${legacyPools.length}`);
  }
  
  // Deploy SyrupStakingModule
  console.log("📦 Deploying SyrupStakingModule...\n");
  const syrupModule = await deploySyrupStakingModule(
    hhViem,
    OWNER_ADDRESS,
    factoryAddress,
    legacyPools,
    deployConfig
  );
  
  console.log(`   ✅ SyrupStakingModule deployed: ${syrupModule.address}\n`);
  
  // Update chains.json
  if (factoryAddress !== ZERO_ADDRESS) {
    CHAINS_CONFIG.chains.base.contracts.syrupFactory = factoryAddress;
  }
  CHAINS_CONFIG.chains.base.modules.syrupStaking = true;
  CHAINS_CONFIG.chains.base.deployed.syrupStaking = syrupModule.address;
  CHAINS_CONFIG.chains.base.deployed._updatedAt = new Date().toISOString();
  
  fs.writeFileSync(CHAINS_CONFIG_PATH, JSON.stringify(CHAINS_CONFIG, null, 2) + "\n");
  console.log("✅ Updated: config/chains.json\n");
  
  // Save deployment backup
  const outputDir = path.join(__dirname, "..", "..", "deployments");
  const backupFile = path.join(outputDir, `base-syrup-${Date.now()}.json`);
  
  fs.writeFileSync(backupFile, JSON.stringify({
    chain: "base",
    chainId: BASE_CONFIG.chainId,
    deployer: deployerAccount.address,
    owner: OWNER_ADDRESS,
    deployedAt: new Date().toISOString(),
    contracts: {
      syrupStaking: {
        address: syrupModule.address,
        name: syrupModule.name,
        args: syrupModule.args,
      }
    },
    factory: factoryAddress,
    aggregator: BASE_CONFIG.deployed.aggregator,
  }, null, 2));
  
  console.log(`📄 Backup: ${backupFile}\n`);
  
  console.log("=".repeat(60));
  console.log("🎯 NEXT STEPS:");
  console.log("=".repeat(60));
  
  const aggregatorAddress = BASE_CONFIG.deployed.aggregator;
  
  console.log("\n1️⃣ Verify the contract on Basescan:\n");
  console.log(`   pnpm exec hardhat verify --network base ${syrupModule.address} \\`);
  console.log(`     "${OWNER_ADDRESS}" \\`);
  console.log(`     "${factoryAddress}" \\`);
  console.log(`     "[]"\n`);
  
  console.log("2️⃣ Update the BaseAggregator to use this module:\n");
  console.log(`   Aggregator Address: ${aggregatorAddress}`);
  console.log(`   Function: setSyrupStakingModule(address module)`);
  console.log(`   Argument: ${syrupModule.address}\n`);
  
  console.log("   📋 Via Safe Multisig:");
  console.log(`      - Target:   ${aggregatorAddress}`);
  console.log(`      - Function: setSyrupStakingModule`);
  console.log(`      - Module:   ${syrupModule.address}\n`);
  
  console.log("   🔧 Or directly (if you're the owner):");
  console.log(`      pnpm exec hardhat run scripts/update-aggregator-module.ts --network base\n`);
  
  console.log("3️⃣ Test the aggregator in Snapshot playground:\n");
  console.log(`   Strategy: erc20-balance-of`);
  console.log(`   Network:  8453`);
  console.log(`   Address:  ${aggregatorAddress}\n`);
  
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

