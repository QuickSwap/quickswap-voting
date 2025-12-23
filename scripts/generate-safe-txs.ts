/**
 * Generate Safe multisig transactions for configuring allowlists
 * 
 * Usage:
 *   tsx scripts/generate-safe-txs.ts
 * 
 * Reads:
 *   - deployments/polygon-latest.json (or specify with --deployment flag)
 *   - deployments/allowlists/polygon.json
 * 
 * Outputs:
 *   - deployments/safe-transactions.json (import to Safe Transaction Builder)
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { encodeAbiParameters, parseAbiParameters } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DeploymentModule {
  address: string;
  name: string;
  args?: any[];
}

interface Deployment {
  chain: string;
  chainId: number;
  contracts: Record<string, DeploymentModule>;
  deployedAt: string;
}

interface Allowlists {
  chain: string;
  chainId: number;
  almVaults: { addresses: string[] };
  v2StakingPools: { addresses: string[] };
  syrupLegacyPools: { addresses: string[] };
}

interface SafeTransaction {
  to: string;
  value: string;
  data: string;
  contractMethod: {
    name: string;
    inputs: Array<{ name: string; type: string; internalType: string }>;
  };
  contractInputsValues: Record<string, any>;
}

function findLatestDeployment(chain: string = "polygon"): string {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const stable = path.join(deploymentsDir, `${chain}-latest.json`);
  if (fs.existsSync(stable)) {
    return stable;
  }
  const files = fs.readdirSync(deploymentsDir)
    .filter(f => f.startsWith(`${chain}-`) && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error(`No deployment files found for chain: ${chain}`);
  }
  
  return path.join(deploymentsDir, files[0]);
}

function main() {
  const chain = process.argv[2] || "polygon";
  
  console.log("🔧 Generating Safe multisig transactions");
  console.log(`   Chain: ${chain}`);
  console.log("");
  
  // Load deployment
  const deploymentPath = findLatestDeployment(chain);
  console.log(`📂 Loading deployment: ${path.basename(deploymentPath)}`);
  
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }
  
  const deployment: Deployment = JSON.parse(
    fs.readFileSync(deploymentPath, "utf8")
  );
  
  // Load allowlists
  const allowlistsPath = path.join(__dirname, "..", "deployments", "allowlists", `${chain}.json`);
  console.log(`📂 Loading allowlists: deployments/allowlists/${chain}.json`);
  
  if (!fs.existsSync(allowlistsPath)) {
    throw new Error(`Allowlists file not found: ${allowlistsPath}`);
  }
  
  const allowlists: Allowlists = JSON.parse(
    fs.readFileSync(allowlistsPath, "utf8")
  );
  
  // Validate
  if (allowlists.chainId !== deployment.chainId) {
    throw new Error(
      `Chain ID mismatch: deployment=${deployment.chainId}, allowlists=${allowlists.chainId}`
    );
  }
  
  console.log("");
  console.log("📊 Allowlist counts:");
  console.log(`   ALM Vaults:       ${allowlists.almVaults.addresses.length}`);
  console.log(`   V2 Staking Pools: ${allowlists.v2StakingPools.addresses.length}`);
  console.log(`   Syrup Legacy:     ${allowlists.syrupLegacyPools.addresses.length}`);
  console.log("");
  
  // Generate transactions
  const transactions: SafeTransaction[] = [];
  
  // Transaction 1: LiquidityManagersModule.setVaults()
  if (allowlists.almVaults.addresses.length > 0) {
    const liquidityManagers = deployment.contracts.liquidityManagers;
    if (!liquidityManagers) {
      console.warn("⚠️  LiquidityManagersModule not found in deployment, skipping");
    } else {
      const data = encodeAbiParameters(
        parseAbiParameters("address[]"),
        [allowlists.almVaults.addresses as `0x${string}`[]]
      );
      
      transactions.push({
        to: liquidityManagers.address,
        value: "0",
        data: `0x6bb6c8d5${data.slice(2)}`, // setVaults(address[]) selector
        contractMethod: {
          name: "setVaults",
          inputs: [{ name: "vaults", type: "address[]", internalType: "address[]" }]
        },
        contractInputsValues: {
          vaults: allowlists.almVaults.addresses
        }
      });
      
      console.log(`✅ Transaction 1: LiquidityManagersModule.setVaults()`);
      console.log(`   To: ${liquidityManagers.address}`);
      console.log(`   Vaults: ${allowlists.almVaults.addresses.length}`);
    }
  }
  
  // Transaction 2: V2LPStakingModule.setPools()
  if (allowlists.v2StakingPools.addresses.length > 0) {
    const v2LPStaking = deployment.contracts.v2LPStaking;
    if (!v2LPStaking) {
      console.warn("⚠️  V2LPStakingModule not found in deployment, skipping");
    } else {
      const data = encodeAbiParameters(
        parseAbiParameters("address[]"),
        [allowlists.v2StakingPools.addresses as `0x${string}`[]]
      );
      
      transactions.push({
        to: v2LPStaking.address,
        value: "0",
        data: `0x944e7389${data.slice(2)}`, // setPools(address[]) selector
        contractMethod: {
          name: "setPools",
          inputs: [{ name: "pools", type: "address[]", internalType: "address[]" }]
        },
        contractInputsValues: {
          pools: allowlists.v2StakingPools.addresses
        }
      });
      
      console.log(`✅ Transaction 2: V2LPStakingModule.setPools()`);
      console.log(`   To: ${v2LPStaking.address}`);
      console.log(`   Pools: ${allowlists.v2StakingPools.addresses.length}`);
    }
  }
  
  // Transaction 3: SyrupStakingModule.setLegacyPools()
  if (allowlists.syrupLegacyPools.addresses.length > 0) {
    const syrupStaking = deployment.contracts.syrupStaking;
    if (!syrupStaking) {
      console.warn("⚠️  SyrupStakingModule not found in deployment, skipping");
    } else {
      const data = encodeAbiParameters(
        parseAbiParameters("address[]"),
        [allowlists.syrupLegacyPools.addresses as `0x${string}`[]]
      );
      
      transactions.push({
        to: syrupStaking.address,
        value: "0",
        data: `0x8c0ba289${data.slice(2)}`, // setLegacyPools(address[]) selector
        contractMethod: {
          name: "setLegacyPools",
          inputs: [{ name: "pools", type: "address[]", internalType: "address[]" }]
        },
        contractInputsValues: {
          pools: allowlists.syrupLegacyPools.addresses
        }
      });
      
      console.log(`✅ Transaction 3: SyrupStakingModule.setLegacyPools()`);
      console.log(`   To: ${syrupStaking.address}`);
      console.log(`   Pools: ${allowlists.syrupLegacyPools.addresses.length}`);
    }
  }
  
  if (transactions.length === 0) {
    console.log("");
    console.log("⚠️  No transactions generated (all allowlists are empty)");
    console.log("   Populate deployments/allowlists/polygon.json and re-run");
    return;
  }
  
  // Save transactions
  const outputPath = path.join(__dirname, "..", "deployments", "safe-transactions.json");
  fs.writeFileSync(outputPath, JSON.stringify(transactions, null, 2));
  
  console.log("");
  console.log("=".repeat(60));
  console.log("✅ Safe transactions generated");
  console.log(`   File: ${outputPath}`);
  console.log(`   Transactions: ${transactions.length}`);
  console.log("");
  console.log("📋 Next steps:");
  console.log("   1. Open Safe web app: https://app.safe.global");
  console.log("   2. Navigate to your Safe on Polygon");
  console.log("   3. New Transaction → Transaction Builder");
  console.log("   4. Import JSON or manually enter transaction data");
  console.log("   5. Review and submit for approval");
  console.log("");
  console.log("💡 Tip: You can also use the Safe CLI:");
  console.log(`   safe-cli tx-builder ${outputPath}`);
}

main();

