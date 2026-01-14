/**
 * Deploy a new AlgebraIntegralV4Module on Base and print Safe calldata to update BaseAggregator.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/base-algebra-v4-only.ts --network base
 *
 * Notes:
 * - Reads addresses from config/chains.json (base.contracts.* and base.tokens.QUICK).
 * - Uses encrypted keystore (KEYSTORE_PATH) and prompts for password.
 * - Writes:
 *   - deployments/base-algebraIntegralV4-<timestamp>.json (local history, gitignored)
 *   - deployments/base-algebraIntegralV4-latest.json (stable, intended to be committed if desired)
 * - Prints SAFE calldata for: BaseAggregator.setAlgebraIntegralModule(newModule)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import hre from "hardhat";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import type { DeployContractConfig, WalletClient } from "@nomicfoundation/hardhat-viem/types";
import { deployAlgebraIntegralV4Module } from "./deployers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "config", "chains.json"), "utf8")
).chains as any;

function requireBaseConfig() {
  const cfg = CHAINS_CONFIG.base;
  if (!cfg) throw new Error("Missing chains.base in config/chains.json");
  return cfg;
}

async function main() {
  const baseCfg = requireBaseConfig();

  // Load deployer account from keystore
  const { getAccount } = await import("../utils/keystore.js");
  const deployerAccount = await getAccount();

  // Hardhat network connection (for hardhat-viem helpers)
  const connection = await hre.network.connect();
  const hhViem = connection.viem;

  // Resolve RPC URL from config/chains.json (single source of truth)
  const rpcUrl = (process.env[baseCfg.rpcEnvVar] || baseCfg.defaultRpc) as string;
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL. Set ${baseCfg.rpcEnvVar} or update config/chains.json`);
  }

  const publicClient = await hhViem.getPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account: deployerAccount,
    chain: base,
    transport: http(rpcUrl),
  }) as unknown as WalletClient;

  const deployConfig: DeployContractConfig = { client: { wallet: walletClient, public: publicClient } };

  // Constructor args (from config; must match your provided constants)
  const quick = baseCfg.tokens.QUICK as Address;
  const positionManager = baseCfg.contracts.nonfungiblePositionManager as Address;
  const factory = baseCfg.contracts.factory as Address;

  console.log("🚀 Deploying AlgebraIntegralV4Module (Base)");
  console.log(`   Deployer:         ${deployerAccount.address}`);
  console.log(`   QUICK:            ${quick}`);
  console.log(`   PositionManager:  ${positionManager}`);
  console.log(`   Factory:          ${factory}`);
  console.log("");

  // Deploy
  const deployed = await deployAlgebraIntegralV4Module(hhViem, quick, positionManager, factory, deployConfig);
  console.log(`✅ Deployed AlgebraIntegralV4Module: ${deployed.address}`);

  // Persist deployment artifact(s)
  const outputDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });

  const payload = {
    chain: "base",
    chainId: baseCfg.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployerAccount.address,
    contract: {
      name: deployed.name,
      address: deployed.address,
      args: deployed.args,
    },
    baseAggregatorToUpdate: (baseCfg.deployed?.aggregator as Address | undefined) ?? null,
  };

  const tsFile = path.join(outputDir, `base-algebraIntegralV4-${Date.now()}.json`);
  fs.writeFileSync(tsFile, JSON.stringify(payload, null, 2));
  console.log(`📄 Saved: ${tsFile}`);

  const latestFile = path.join(outputDir, `base-algebraIntegralV4-latest.json`);
  fs.writeFileSync(latestFile, JSON.stringify(payload, null, 2));
  console.log(`📄 Updated: ${latestFile}`);

  // Update config/chains.json (source of truth)
  const chainsConfigPath = path.join(__dirname, "..", "..", "config", "chains.json");
  const chainsConfig = JSON.parse(fs.readFileSync(chainsConfigPath, "utf8"));
  
  chainsConfig.chains.base.deployed = {
    ...chainsConfig.chains.base.deployed,
    _updatedAt: new Date().toISOString(),
    algebraIntegralV4: deployed.address,
  };
  
  fs.writeFileSync(chainsConfigPath, JSON.stringify(chainsConfig, null, 2) + "\n");
  console.log(`✅ Updated: config/chains.json (base.deployed.algebraIntegralV4)`);

  // Verify args file
  const verifyArgsDir = path.join(__dirname, "..", "..", "verify-args");
  fs.mkdirSync(verifyArgsDir, { recursive: true });
  const verifyArgsFile = path.join(verifyArgsDir, `base-algebra-v4-module.cjs`);
  fs.writeFileSync(
    verifyArgsFile,
    `// Constructor arguments for AlgebraIntegralV4Module (Base)\n` +
      `// Generated: ${new Date().toISOString()}\n` +
      `module.exports = [\n` +
      `  "${quick}", // _quick\n` +
      `  "${positionManager}", // _positionManager\n` +
      `  "${factory}", // _factory\n` +
      `];\n`
  );
  console.log(`📄 Created: verify-args/base-algebra-v4-module.cjs`);

  // Safe calldata to update BaseAggregator
  const aggregator = baseCfg.deployed?.aggregator as Address | undefined;
  if (aggregator) {
    const ABI = parseAbi(["function setAlgebraIntegralModule(address module)"]);
    const data = encodeFunctionData({
      abi: ABI,
      functionName: "setAlgebraIntegralModule",
      args: [deployed.address as Address],
    });

    console.log("\n🔐 SAFE TX (BaseAggregator update)");
    console.log(`   to:   ${aggregator}`);
    console.log(`   data: ${data}`);
    console.log(`   call: setAlgebraIntegralModule(${deployed.address})`);
  } else {
    console.log("\nℹ️  Base aggregator address not found in config/chains.json (base.deployed.aggregator).");
    console.log(`   Call manually: setAlgebraIntegralModule(${deployed.address})`);
  }

  console.log("\n🎯 NEXT STEPS:");
  console.log("");
  console.log("1️⃣ Verify contract:");
  console.log(`   pnpm exec hardhat verify --network base ${deployed.address} \\`);
  console.log(`     --constructor-args-path verify-args/base-algebra-v4-module.cjs`);
  console.log("");
  console.log("2️⃣ Submit Safe tx to update BaseAggregator.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

