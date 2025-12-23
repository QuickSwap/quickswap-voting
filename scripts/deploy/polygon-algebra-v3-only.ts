/**
 * Deploy a new AlgebraV3Module on Polygon and print Safe calldata to update PolygonAggregator.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/polygon-algebra-v3-only.ts --network polygon
 *
 * Notes:
 * - Reads addresses from config/chains.json (polygon.contracts.* and polygon.tokens.QUICK).
 * - Uses encrypted keystore (KEYSTORE_PATH) and prompts for password.
 * - Writes:
 *   - deployments/polygon-algebraV3-<timestamp>.json (local history, gitignored)
 *   - deployments/polygon-algebraV3-latest.json (stable, intended to be committed)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import hre from "hardhat";
import { createWalletClient, http } from "viem";
import { polygon } from "viem/chains";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import type { DeployContractConfig, WalletClient } from "@nomicfoundation/hardhat-viem/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "config", "chains.json"), "utf8")
).chains as any;

function requirePolygonConfig() {
  const cfg = CHAINS_CONFIG.polygon;
  if (!cfg) throw new Error("Missing chains.polygon in config/chains.json");
  return cfg;
}

async function main() {
  const polygonCfg = requirePolygonConfig();

  // Load deployer account from keystore
  const { getAccount } = await import("../utils/keystore.js");
  const deployerAccount = await getAccount();

  // Hardhat network connection (for hardhat-viem helpers)
  const connection = await hre.network.connect();
  const hhViem = connection.viem;

  // Resolve RPC URL from config/chains.json (single source of truth)
  const rpcUrl = (process.env[polygonCfg.rpcEnvVar] || polygonCfg.defaultRpc) as string;
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL. Set ${polygonCfg.rpcEnvVar} or update config/chains.json`);
  }

  const publicClient = await hhViem.getPublicClient({ chain: polygon, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account: deployerAccount,
    chain: polygon,
    transport: http(rpcUrl),
  }) as unknown as WalletClient;

  const deployConfig: DeployContractConfig = { client: { wallet: walletClient, public: publicClient } };

  const quick = polygonCfg.tokens.QUICK as Address;
  const positionManager = polygonCfg.contracts.nonfungiblePositionManager as Address;
  const farmingCenter = polygonCfg.contracts.farmingCenter as Address;
  const poolDeployer = polygonCfg.contracts.poolDeployer as Address;

  console.log("🚀 Deploying AlgebraV3Module (Polygon)");
  console.log(`   Deployer: ${deployerAccount.address}`);
  console.log(`   QUICK:    ${quick}`);
  console.log(`   NPM:      ${positionManager}`);
  console.log(`   FarmCtr:  ${farmingCenter}`);
  console.log(`   PoolDep:  ${poolDeployer}`);
  console.log("");

  const contract = await hhViem.deployContract(
    "AlgebraV3Module",
    [quick, positionManager, farmingCenter, poolDeployer],
    deployConfig
  );

  console.log(`✅ Deployed AlgebraV3Module: ${contract.address}`);

  // Load current aggregator address (if present in config)
  const aggregatorFromConfig =
    (polygonCfg.wrappers?.polygonAggregator?.address || polygonCfg.wrappers?.aggregator?.address) as Address | undefined;

  const outputDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });

  const payload = {
    chain: "polygon",
    chainId: polygonCfg.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployerAccount.address,
    contract: {
      name: "AlgebraV3Module",
      address: contract.address,
      args: [quick, positionManager, farmingCenter, poolDeployer],
    },
    aggregatorToUpdate: aggregatorFromConfig ?? null,
  };

  const tsFile = path.join(outputDir, `polygon-algebraV3-${Date.now()}.json`);
  fs.writeFileSync(tsFile, JSON.stringify(payload, null, 2));
  console.log(`✅ Saved: ${tsFile}`);

  const latestFile = path.join(outputDir, `polygon-algebraV3-latest.json`);
  fs.writeFileSync(latestFile, JSON.stringify(payload, null, 2));
  console.log(`✅ Updated: ${latestFile}`);

  if (aggregatorFromConfig) {
    const ABI = parseAbi(["function setAlgebraV3Module(address module)"]);
    const data = encodeFunctionData({
      abi: ABI,
      functionName: "setAlgebraV3Module",
      args: [contract.address as Address],
    });

    console.log("\n🔐 SAFE TX (PolygonAggregator update)");
    console.log(`   to:   ${aggregatorFromConfig}`);
    console.log(`   data: ${data}`);
    console.log(`   call: setAlgebraV3Module(${contract.address})`);
  } else {
    console.log("\nℹ️  Aggregator address not found in config/chains.json (polygon.wrappers.polygonAggregator.address).");
    console.log("   Provide it manually to your Safe and call: setAlgebraV3Module(newModuleAddress)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


