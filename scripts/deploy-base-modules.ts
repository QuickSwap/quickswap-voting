/**
 * Deploy Base Voting Modules
 * 
 * Deploys all modules and the aggregator for Base network.
 * 
 * Prerequisites:
 *   1. Run: pnpm exec tsx scripts/generate-allowlists.ts (for Base)
 *   2. Edit: deployments/allowlists/base.json
 * 
 * Usage:
 *   export BASE_RPC="https://base-mainnet.infura.io/v3/<YOUR_KEY>"
 *   export KEYSTORE_PATH="keystores/deployer.json"
 *   pnpm exec tsx scripts/deploy-base-modules.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Address, formatEther, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { getAccount } from "./utils/keystore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============= Base Addresses =============

const BASE = {
  QUICK: "0x7094c27f342DBAdfbbeD005b219431595E33b305" as Address,
  POSITION_MANAGER: "0x84715977598247125C3D6E2e85370d1F6fDA1eaF" as Address,
  FACTORY: "0x411b0facc3489691f28ad58c47006af5e3ab3a28" as Address,
};

const BASE_RPC = process.env.BASE_RPC || "https://mainnet.base.org";

// ============= Load Allowlists =============

interface Allowlists {
  gammaVaults: { addresses: Address[] };
  v2StakingPools: { addresses: Address[] };
}

function loadAllowlists(): Allowlists {
  const filePath = path.join(__dirname, "..", "deployments", "allowlists", "base.json");
  
  if (!fs.existsSync(filePath)) {
    console.log("\n⚠️  No allowlists file found. Using empty allowlists.");
    console.log("   Run: pnpm exec tsx scripts/generate-allowlists.ts --chain base\n");
    return {
      gammaVaults: { addresses: [] },
      v2StakingPools: { addresses: [] },
    };
  }
  
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ============= Deploy =============

async function main() {
  // Get deployer account from keystore
  const account = await getAccount();
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_RPC),
  });

  // Wallet client for deployments (will be used when deployment is implemented)
  // const walletClient = createWalletClient({
  //   account,
  //   chain: base,
  //   transport: http(BASE_RPC),
  // });
  
  console.log("🚀 Deploying Base Voting Modules");
  console.log("   Chain: Base (8453)");
  console.log("   Deployer:", account.address);
  
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("   Balance:", formatEther(balance), "ETH");
  console.log("");

  const allowlists = loadAllowlists();
  
  console.log("📋 Allowlists:");
  console.log(`   Gamma vaults: ${allowlists.gammaVaults.addresses.length}`);
  console.log(`   V2 staking pools: ${allowlists.v2StakingPools.addresses.length}`);
  console.log("");

  // Import contract artifacts (Hardhat v3 doesn't have direct artifact access from viem)
  // We'll need to compile first and use the artifacts
  console.log("⚠️  Note: Make sure contracts are compiled: pnpm exec hardhat compile\n");

  // Deploy modules
  const deployedModules: Record<string, Address> = {};

  // 1. WalletQuickModule
  console.log("📦 Deploying WalletQuickModule...");
  // TODO: Implement actual deployment with artifacts
  console.log("   ⚠️  Deployment not implemented yet");
  console.log("   Need to load artifacts and deploy");
  console.log("");

  // 2. AlgebraIntegralModule
  console.log("📦 Deploying AlgebraIntegralModule...");
  console.log(`   QUICK: ${BASE.QUICK}`);
  console.log(`   Position Manager: ${BASE.POSITION_MANAGER}`);
  console.log(`   Factory: ${BASE.FACTORY}`);
  // TODO: Implement actual deployment
  console.log("   ⚠️  Deployment not implemented yet");
  console.log("");

  // 3. GammaVaultsModule
  if (allowlists.gammaVaults.addresses.length > 0) {
    console.log("📦 Deploying GammaVaultsModule...");
    console.log(`   QUICK: ${BASE.QUICK}`);
    console.log(`   Vaults: ${allowlists.gammaVaults.addresses.length}`);
    // TODO: Implement actual deployment
    console.log("   ⚠️  Deployment not implemented yet");
    console.log("");
  }

  // 4. V2LPStakingModule
  if (allowlists.v2StakingPools.addresses.length > 0) {
    console.log("📦 Deploying V2LPStakingModule...");
    console.log(`   QUICK: ${BASE.QUICK}`);
    console.log(`   Staking pools: ${allowlists.v2StakingPools.addresses.length}`);
    // TODO: Implement actual deployment
    console.log("   ⚠️  Deployment not implemented yet");
    console.log("");
  }

  // 5. BaseAggregator
  console.log("📦 Deploying BaseAggregator...");
  console.log(`   QUICK: ${BASE.QUICK}`);
  console.log(`   Modules: ${Object.keys(deployedModules).length}`);
  // TODO: Implement actual deployment
  console.log("   ⚠️  Deployment not implemented yet");
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    chain: "base",
    chainId: 8453,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    contracts: deployedModules,
    addresses: BASE,
    allowlists: {
      gammaVaults: allowlists.gammaVaults.addresses,
      v2StakingPools: allowlists.v2StakingPools.addresses,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, "base.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("✅ Deployment complete!");
  console.log(`📄 Saved to: ${outputPath}`);
  console.log("");
  console.log("🔍 Next steps:");
  console.log("   1. Verify contracts on Basescan");
  console.log("   2. Validate aggregator in Snapshot Playground");
  console.log("   3. Update Snapshot space strategies");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

