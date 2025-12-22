/**
 * Pre-deployment checklist validator
 * 
 * Usage:
 *   tsx scripts/check-deployment-ready.ts [chain]
 * 
 * Validates:
 *   - Environment variables
 *   - Keystore file
 *   - Deployer balance
 *   - Allowlists configuration
 *   - Contract compilation
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, formatEther, type Address } from "viem";
import { polygon, mainnet, base, manta } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS = {
  polygon: { chain: polygon, rpcEnv: "POLYGON_RPC", minBalance: "0.1" },
  ethereum: { chain: mainnet, rpcEnv: "ETHEREUM_RPC", minBalance: "0.01" },
  base: { chain: base, rpcEnv: "BASE_RPC", minBalance: "0.001" },
  manta: { chain: manta, rpcEnv: "MANTA_RPC", minBalance: "0.1" },
};

type ChainKey = keyof typeof CHAINS;

function checkmark(condition: boolean): string {
  return condition ? "✅" : "❌";
}

async function main() {
  const chainKey = (process.argv[2] || "polygon") as ChainKey;
  
  if (!CHAINS[chainKey]) {
    console.error(`❌ Invalid chain: ${chainKey}`);
    console.error(`   Available: ${Object.keys(CHAINS).join(", ")}`);
    process.exit(1);
  }
  
  console.log("🔍 Deployment Readiness Check");
  console.log(`   Chain: ${chainKey}`);
  console.log("=".repeat(60));
  console.log("");
  
  let allGood = true;
  
  // 1. Check .env file
  console.log("1️⃣  Environment Configuration");
  const envPath = path.join(__dirname, "..", ".env");
  const envExists = fs.existsSync(envPath);
  console.log(`   ${checkmark(envExists)} .env file exists`);
  
  if (!envExists) {
    console.log("   ⚠️  Create .env from .env.example");
    allGood = false;
  }
  
  // 2. Check RPC endpoint
  const chainConfig = CHAINS[chainKey];
  const rpcUrl = process.env[chainConfig.rpcEnv];
  const hasRpc = !!rpcUrl;
  console.log(`   ${checkmark(hasRpc)} ${chainConfig.rpcEnv} configured`);
  
  if (!hasRpc) {
    console.log(`   ⚠️  Set ${chainConfig.rpcEnv} in .env`);
    allGood = false;
  }
  
  // 3. Check API keys
  const apiKeyEnv = `${chainKey.toUpperCase()}SCAN_API_KEY`;
  const hasApiKey = !!process.env[apiKeyEnv];
  console.log(`   ${checkmark(hasApiKey)} ${apiKeyEnv} configured`);
  
  if (!hasApiKey) {
    console.log(`   ⚠️  Set ${apiKeyEnv} in .env (for verification)`);
  }
  
  console.log("");
  
  // 4. Check keystore
  console.log("2️⃣  Deployer Wallet");
  const keystorePath = process.env.KEYSTORE_PATH || "keystores/deployer.json";
  const keystoreFullPath = path.join(__dirname, "..", keystorePath);
  const keystoreExists = fs.existsSync(keystoreFullPath);
  console.log(`   ${checkmark(keystoreExists)} Keystore file: ${keystorePath}`);
  
  if (!keystoreExists) {
    console.log(`   ❌ Keystore not found at: ${keystoreFullPath}`);
    allGood = false;
  }
  
  // Try to read keystore address (without decrypting)
  if (keystoreExists) {
    try {
      const keystoreJson = JSON.parse(fs.readFileSync(keystoreFullPath, "utf8"));
      const address = keystoreJson.address ? `0x${keystoreJson.address}` : "unknown";
      console.log(`   📍 Deployer address: ${address}`);
      
      // Check balance if RPC is configured
      if (hasRpc && rpcUrl) {
        const client = createPublicClient({
          chain: chainConfig.chain,
          transport: http(rpcUrl),
        });
        
        try {
          const balance = await client.getBalance({ address: address as Address });
          const balanceEth = formatEther(balance);
          const hasMinBalance = parseFloat(balanceEth) >= parseFloat(chainConfig.minBalance);
          
          console.log(`   ${checkmark(hasMinBalance)} Balance: ${balanceEth} (min: ${chainConfig.minBalance})`);
          
          if (!hasMinBalance) {
            console.log(`   ⚠️  Insufficient balance for deployment`);
            allGood = false;
          }
        } catch (error) {
          console.log(`   ⚠️  Could not check balance (RPC error)`);
        }
      }
    } catch {
      console.log(`   ⚠️  Could not read keystore (may be corrupted)`);
    }
  }
  
  console.log("");
  
  // 5. Check owner address
  console.log("3️⃣  Owner Configuration");
  const ownerAddress = process.env.OWNER_ADDRESS;
  const hasOwner = !!ownerAddress;
  console.log(`   ${checkmark(hasOwner)} OWNER_ADDRESS configured`);
  
  if (hasOwner) {
    console.log(`   📍 Owner: ${ownerAddress}`);
    console.log(`   💡 Recommended: Use Safe multisig address`);
  } else {
    console.log(`   ⚠️  OWNER_ADDRESS not set (will use default)`);
    console.log(`   ⚠️  Default: 0xDA1077c4b0dd6da1BDF166F30aa4BDbF517d637b`);
  }
  
  console.log("");
  
  // 6. Check allowlists
  console.log("4️⃣  Allowlists Configuration");
  const allowlistPath = path.join(__dirname, "..", "deployments", "allowlists", `${chainKey}.json`);
  const allowlistExists = fs.existsSync(allowlistPath);
  console.log(`   ${checkmark(allowlistExists)} Allowlist file: deployments/allowlists/${chainKey}.json`);
  
  if (allowlistExists) {
    try {
      const allowlists = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
      const almCount = allowlists.almVaults?.addresses?.length || 0;
      const v2Count = allowlists.v2StakingPools?.addresses?.length || 0;
      const syrupCount = allowlists.syrupLegacyPools?.addresses?.length || 0;
      
      console.log(`   📊 ALM vaults:       ${almCount}`);
      console.log(`   📊 V2 staking pools: ${v2Count}`);
      console.log(`   📊 Syrup legacy:     ${syrupCount}`);
      
      if (almCount === 0 && v2Count === 0 && syrupCount === 0) {
        console.log(`   ⚠️  All allowlists are empty`);
        console.log(`   💡 Deploy now, populate via Safe multisig later (RECOMMENDED)`);
      }
    } catch {
      console.log(`   ⚠️  Could not parse allowlist file`);
    }
  } else {
    console.log(`   ⚠️  Allowlist file not found (will use empty arrays)`);
  }
  
  console.log("");
  
  // 7. Check contract compilation
  console.log("5️⃣  Contract Compilation");
  const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
  const artifactsExist = fs.existsSync(artifactsDir);
  console.log(`   ${checkmark(artifactsExist)} Contracts compiled`);
  
  if (!artifactsExist) {
    console.log(`   ⚠️  Run: pnpm exec hardhat compile`);
    allGood = false;
  } else {
    // Check specific artifacts
    const requiredArtifacts = [
      "aggregators/PolygonAggregator.sol/PolygonAggregator.json",
      "modules/WalletAndDQuickModule.sol/WalletAndDQuickModule.json",
      "modules/SyrupStakingModule.sol/SyrupStakingModule.json",
      "modules/AlgebraV3Module.sol/AlgebraV3Module.json",
      "modules/LiquidityManagersModule.sol/LiquidityManagersModule.json",
      "modules/V2LPStakingModule.sol/V2LPStakingModule.json",
    ];
    
    let missingArtifacts = false;
    for (const artifact of requiredArtifacts) {
      const artifactPath = path.join(artifactsDir, artifact);
      if (!fs.existsSync(artifactPath)) {
        console.log(`   ❌ Missing: ${artifact}`);
        missingArtifacts = true;
      }
    }
    
    if (missingArtifacts) {
      console.log(`   ⚠️  Run: pnpm exec hardhat compile`);
      allGood = false;
    } else {
      console.log(`   ✅ All required artifacts present`);
    }
  }
  
  console.log("");
  console.log("=".repeat(60));
  
  if (allGood) {
    console.log("✅ READY FOR DEPLOYMENT");
    console.log("");
    console.log("📋 Next steps:");
    console.log(`   1. Review configuration above`);
    console.log(`   2. Run deployment:`);
    console.log(`      ./scripts/deploy/polygon-deploy.sh`);
    console.log(`      OR`);
    console.log(`      pnpm exec hardhat run scripts/deploy/chain.ts --network ${chainKey}`);
  } else {
    console.log("❌ NOT READY FOR DEPLOYMENT");
    console.log("");
    console.log("📋 Fix issues above and re-run:");
    console.log(`   tsx scripts/check-deployment-ready.ts ${chainKey}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

