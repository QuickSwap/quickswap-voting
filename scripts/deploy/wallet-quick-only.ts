/**
 * Deploy WalletQuickModule only (Ethereum, Manta, simple chains).
 * 
 * Usage:
 *   pnpm exec hardhat run scripts/deploy/wallet-quick-only.ts --network ethereum
 *   QUICK_ADDRESS=0x... pnpm exec hardhat run scripts/deploy/wallet-quick-only.ts --network manta
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Address, createWalletClient, formatEther, http, isAddress } from "viem";
import { deployWalletQuickModule } from "./deployers.js";
import hre from "hardhat";
import type { DeployContractConfig, WalletClient } from "@nomicfoundation/hardhat-viem/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "config", "chains.json"), "utf8")
).chains as any;

function getChainConfig(): { chainKey: string; config: any } {
  const networkArgIndex = process.argv.indexOf("--network");
  const networkName = networkArgIndex !== -1 ? process.argv[networkArgIndex + 1] : undefined;

  if (!networkName) {
    throw new Error(
      `Network not specified. Use: --network <chain>\n` +
      `Available: ${Object.keys(CHAINS_CONFIG).join(", ")}`
    );
  }

  if (CHAINS_CONFIG[networkName]) {
    return { chainKey: networkName, config: CHAINS_CONFIG[networkName] };
  }

  throw new Error(
    `Chain "${networkName}" not found in config/chains.json.\n` +
    `Available: ${Object.keys(CHAINS_CONFIG).join(", ")}`
  );
}

async function main() {
  const { chainKey, config } = getChainConfig();
  
  // Allow override via env
  const quickAddress = (process.env.QUICK_ADDRESS || config.tokens?.QUICK) as Address;
  
  if (!quickAddress || !isAddress(quickAddress)) {
    throw new Error(
      `QUICK token address not found for chain "${chainKey}".\n` +
      `Set QUICK_ADDRESS env var or add to config/chains.json`
    );
  }
  
  const connection = await hre.network.connect();
  const hhViem = connection.viem;

  const rpcUrl = (process.env[config.rpcEnvVar] || config.defaultRpc) as string;
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for ${chainKey}. Set ${config.rpcEnvVar} or update config/chains.json`);
  }

  const { getAccount } = await import("../utils/keystore.js");
  const deployerAccount = await getAccount();

  const publicClient = await hhViem.getPublicClient({ transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account: deployerAccount, transport: http(rpcUrl) }) as unknown as WalletClient;
  const deployConfig: DeployContractConfig = { client: { wallet: walletClient, public: publicClient } };
  
  console.log("🚀 Deploying WalletQuickModule");
  console.log(`   Chain:    ${config.name} (${config.chainId})`);
  console.log(`   Deployer: ${deployerAccount.address}`);
  console.log(`   QUICK:    ${quickAddress}`);
  
  const balance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`   Balance:  ${formatEther(balance)} ETH`);
  console.log("");
  
  // Deploy
  console.log("📦 Deploying WalletQuickModule...");
  const result = await deployWalletQuickModule(hhViem, quickAddress, deployConfig);
  console.log(`   ✅ Deployed: ${result.address}`);
  
  // Save deployment info
  const outputDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  
  const outputFile = path.join(outputDir, `${chainKey}-wallet-quick-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    chain: chainKey,
    chainId: config.chainId,
    deployer: deployerAccount.address,
    deployedAt: new Date().toISOString(),
    contract: {
      name: result.name,
      address: result.address,
      args: result.args,
    },
    config: {
      quick: quickAddress,
    },
  }, null, 2));
  
  console.log(`\n✅ Saved: ${outputFile}`);
  
  console.log("\n" + "=".repeat(50));
  console.log("🎯 NEXT STEPS");
  console.log("=".repeat(50));
  console.log(`
1. VERIFY:
   pnpm exec hardhat verify --network ${chainKey} ${result.address} ${quickAddress}

2. TEST IN SNAPSHOT PLAYGROUND:
   - URL: https://v1.snapshot.box/#/playground/erc20-balance-of
   - Config: { "address": "${result.address}", "symbol": "QUICK", "decimals": 18 }
   - Network: ${config.chainId}

3. UPDATE config/chains.json:
   Add to ${chainKey}.wrappers:
   "walletQuick": {
     "address": "${result.address}",
     "description": "Wallet QUICK balance only"
   }
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

