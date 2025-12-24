#!/usr/bin/env tsx
/**
 * Quick configuration check (no balance verification)
 * Useful for verifying setup without needing funded wallet
 * 
 * Usage: pnpm exec tsx scripts/check-config.ts ethereum
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const chainName = process.argv[2];
if (!chainName) {
  console.error("Usage: pnpm exec tsx scripts/check-config.ts <chain>");
  console.error("Example: pnpm exec tsx scripts/check-config.ts ethereum");
  process.exit(1);
}

console.log(`\n🔍 Checking configuration for ${chainName}...\n`);

let errors = 0;

// 1. Check keystore
const keystorePath = process.env.KEYSTORE_PATH;
if (!keystorePath) {
  console.log("❌ KEYSTORE_PATH not set in .env");
  console.log("   Fix: Add to .env:");
  console.log("        KEYSTORE_PATH=keystores/deployer-0x<address>.json\n");
  errors++;
} else if (!fs.existsSync(keystorePath)) {
  console.log(`❌ Keystore file not found: ${keystorePath}`);
  console.log("   Fix: Run: pnpm exec tsx scripts/create-keystore.ts\n");
  errors++;
} else {
  console.log(`✅ Keystore: ${keystorePath}`);
}

// 2. Check chains.json
const chainsPath = path.join(__dirname, "..", "config", "chains.json");
const chains = JSON.parse(fs.readFileSync(chainsPath, "utf8")).chains;

if (!chains[chainName]) {
  console.log(`❌ Chain "${chainName}" not found in config/chains.json`);
  console.log(`   Available: ${Object.keys(chains).join(", ")}\n`);
  errors++;
} else {
  const config = chains[chainName];
  console.log(`✅ Chain: ${config.name} (chainId: ${config.chainId})`);
  
  // 3. Check RPC
  const rpcUrl = process.env[config.rpcEnvVar];
  if (!rpcUrl) {
    console.log(`⚠️  RPC not configured: ${config.rpcEnvVar}`);
    console.log(`   Will use default: ${config.defaultRpc}`);
    console.log(`   Tip: Set in .env for better performance\n`);
  } else {
    console.log(`✅ RPC: ${config.rpcEnvVar} configured`);
  }
  
  // 4. Check QUICK address
  if (!config.tokens?.QUICK) {
    console.log(`⚠️  QUICK token not configured for ${chainName}`);
    console.log("   Fix: Set QUICK_ADDRESS env var or update config/chains.json\n");
  } else {
    console.log(`✅ QUICK: ${config.tokens.QUICK}`);
  }
}

console.log("");

if (errors > 0) {
  console.log(`❌ Found ${errors} error(s). Fix them before deploying.\n`);
  process.exit(1);
} else {
  console.log("✅ Configuration looks good!\n");
  console.log("Next step:");
  console.log(`  pnpm exec hardhat run scripts/deploy/wallet-quick-only.ts --network ${chainName}\n`);
}

