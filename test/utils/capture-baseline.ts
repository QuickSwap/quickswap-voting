#!/usr/bin/env tsx
/**
 * Capture baseline scores for all test wallets at a fixed block.
 * Output: JSON file for comparison with new wrappers.
 * 
 * Usage:
 *   POLYGON_RPC=... pnpm run baseline:capture [blockNumber]
 * 
 * Output:
 *   test/baselines/baseline-{block}-{timestamp}.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, getContract, formatUnits, type Address } from "viem";
import { polygon } from "viem/chains";
import type { BlockNumbers, TestWallet, ChainsConfig, WalletScores } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, "..");  // test/utils -> test
const ROOT_DIR = path.join(__dirname, "..", "..");  // test/utils -> root

// Load configs
const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "config", "chains.json"), "utf8")
).chains as ChainsConfig;

const TEST_WALLETS = JSON.parse(
  fs.readFileSync(path.join(TEST_DIR, "config/test-wallets.json"), "utf8")
).wallets as TestWallet[];

const BLOCKS = JSON.parse(
  fs.readFileSync(path.join(TEST_DIR, "fixtures/blocks.json"), "utf8")
).blocks as BlockNumbers;

const POLYGON_RPC = process.env.POLYGON_RPC || CHAINS_CONFIG.polygon.defaultRpc;

const ABI_BALANCE_OF = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface BaselineEntry {
  address: string;
  label: string;
  expectedSources: string[];
  scores: WalletScores;
}

interface Baseline {
  capturedAt: string;
  block: number;
  rpc: string;
  wrappers: {
    voting8: string;
    voting10: string;
    v3Pools1: string;
  };
  wallets: BaselineEntry[];
}

async function capturePolygonBaseline(wallet: string, blockNumber: bigint): Promise<WalletScores> {
  const client = createPublicClient({
    chain: polygon,
    transport: http(POLYGON_RPC),
  });

  const voting8 = getContract({
    address: CHAINS_CONFIG.polygon.wrappers.voting8.address as Address,
    abi: ABI_BALANCE_OF,
    client,
  });

  const voting10 = getContract({
    address: CHAINS_CONFIG.polygon.wrappers.voting10.address as Address,
    abi: ABI_BALANCE_OF,
    client,
  });

  const v3Pools1 = getContract({
    address: CHAINS_CONFIG.polygon.wrappers.v3Pools1.address as Address,
    abi: ABI_BALANCE_OF,
    client,
  });

  const [s8, s10, sv3] = await Promise.all([
    voting8.read.balanceOf([wallet as Address], { blockNumber }).catch(() => 0n),
    voting10.read.balanceOf([wallet as Address], { blockNumber }).catch(() => 0n),
    v3Pools1.read.balanceOf([wallet as Address], { blockNumber }).catch(() => 0n),
  ]);

  const total = s8 + s10 + sv3;

  return {
    voting8: {
      raw: s8.toString(),
      formatted: formatUnits(s8, 18),
    },
    voting10: {
      raw: s10.toString(),
      formatted: formatUnits(s10, 18),
    },
    v3Pools1: {
      raw: sv3.toString(),
      formatted: formatUnits(sv3, 18),
    },
    total: {
      raw: total.toString(),
      formatted: formatUnits(total, 18),
    },
  };
}

async function main(): Promise<void> {
  const [blockArg] = process.argv.slice(2);
  const blockTag = blockArg ? Number(blockArg) : BLOCKS.polygon;
  const blockNumber = BigInt(blockTag);

  console.log("Capturing baseline at block:", blockTag);
  console.log("RPC:", POLYGON_RPC);

  const baseline: Baseline = {
    capturedAt: new Date().toISOString(),
    block: blockTag,
    rpc: POLYGON_RPC,
    wrappers: {
      voting8: CHAINS_CONFIG.polygon.wrappers.voting8.address,
      voting10: CHAINS_CONFIG.polygon.wrappers.voting10.address,
      v3Pools1: CHAINS_CONFIG.polygon.wrappers.v3Pools1.address,
    },
    wallets: [],
  };

  for (const wallet of TEST_WALLETS.filter((w) => w.expectedSources?.polygon)) {
    console.log(`Scoring ${wallet.label}...`);
    const scores = await capturePolygonBaseline(wallet.address, blockNumber);
    
    baseline.wallets.push({
      address: wallet.address,
      label: wallet.label,
      expectedSources: wallet.expectedSources?.polygon || [],
      scores,
    });
  }

  // Save
  const baselineDir = path.join(TEST_DIR, "baselines");
  fs.mkdirSync(baselineDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `baseline-${blockTag}-${timestamp}.json`;
  const filepath = path.join(baselineDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(baseline, null, 2));
  console.log(`\n✅ Saved: ${filepath}`);

  // Also save as "latest" for easy reference
  const latestPath = path.join(baselineDir, "baseline-latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(baseline, null, 2));
  console.log(`✅ Saved: ${latestPath}`);

  // Print summary
  console.log("\n📊 Summary:");
  const grandTotal = baseline.wallets.reduce(
    (sum, w) => sum + BigInt(w.scores.total.raw),
    0n
  );
  console.log(`   Total voting power: ${formatUnits(grandTotal, 18)} QUICK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
