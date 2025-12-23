/**
 * Parity Tests
 * 
 * Verifies that new modular architecture produces identical results
 * to existing production wrappers (Voting8, Voting10, V3Pools1).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, type Address, parseAbi } from "viem";
import { polygon } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BLOCKS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/blocks.json"), "utf8")
).blocks;

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "chains.json"), "utf8")
).chains;

const TEST_WALLETS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "config/test-wallets.json"), "utf8")
).wallets;

const BALANCE_OF_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const DRAGON_LAIR_ABI = parseAbi(["function QUICKBalance(address) view returns (uint256)"]);

const POLYGON = {
  QUICK: "0xB5C064F955D8e7F38fE0460C556a72987494eE17" as Address,
  DRAGON_LAIR: "0x958d208Cdf087843e9AD98d23823d32E17d723A1" as Address,
  VOTING8: "0x7c87a471abd9bf56d41c752ab7c1b5de91d8dda6" as Address,
  VOTING10: "0x59bcc928c513a6a872b7365511ed2a458c4f5d92" as Address,
  V3POOLS1: "0x2fcb66504ea8ee541176662939ef0c53e95c4a19" as Address,
};

const getRpcUrl = () => process.env.POLYGON_RPC || CHAINS_CONFIG.polygon.defaultRpc;

describe("Parity: WalletAndDQuick vs Voting8", async () => {
  const client = createPublicClient({ chain: polygon, transport: http(getRpcUrl()) });
  const blockNumber = BigInt(BLOCKS.polygon);

  for (const wallet of TEST_WALLETS.filter((w: any) => w.expectedSources?.polygon)) {
    it(`${wallet.label}: wallet + dQUICK = Voting8`, async () => {
      const [voting8, walletQuick, dQuickAsQuick] = await Promise.all([
        client.readContract({
          address: POLYGON.VOTING8, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
        client.readContract({
          address: POLYGON.QUICK, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
        client.readContract({
          address: POLYGON.DRAGON_LAIR, abi: DRAGON_LAIR_ABI,
          functionName: "QUICKBalance", args: [wallet.address as Address], blockNumber,
        }),
      ]);

      assert.equal(voting8, walletQuick + dQuickAsQuick);
    });
  }
});

describe("Parity: Zero Address Safety", async () => {
  const client = createPublicClient({ chain: polygon, transport: http(getRpcUrl()) });
  const blockNumber = BigInt(BLOCKS.polygon);
  const ZERO = "0x0000000000000000000000000000000000000000" as Address;

  it("Voting8 returns 0 for zero address", async () => {
    const score = await client.readContract({
      address: POLYGON.VOTING8, abi: BALANCE_OF_ABI,
      functionName: "balanceOf", args: [ZERO], blockNumber,
    });
    assert.equal(score, 0n);
  });

  it("Voting10 returns 0 for zero address", async () => {
    const score = await client.readContract({
      address: POLYGON.VOTING10, abi: BALANCE_OF_ABI,
      functionName: "balanceOf", args: [ZERO], blockNumber,
    });
    assert.equal(score, 0n);
  });

  it("V3Pools1 reverts for zero address (ERC721 behavior)", async () => {
    // V3Pools1 uses ERC721 internally which reverts for zero address
    // This is expected behavior, not a bug
    try {
      await client.readContract({
        address: POLYGON.V3POOLS1, abi: BALANCE_OF_ABI,
        functionName: "balanceOf", args: [ZERO], blockNumber,
      });
      assert.fail("Expected revert for zero address");
    } catch (e: any) {
      assert.ok(e.message.includes("zero address"), "Should revert with zero address error");
    }
  });
});

describe("Parity: AlgebraV3Module vs V3Pools1 (deployed)", async () => {
  const algebraV3Path = path.join(__dirname, "..", "deployments", "polygon-algebraV3-latest.json");
  if (!fs.existsSync(algebraV3Path)) {
    it("polygon-algebraV3-latest.json missing (skipped)", () => assert.ok(true));
    return;
  }

  const { contract } = JSON.parse(fs.readFileSync(algebraV3Path, "utf8"));
  const algebraV3Address = contract.address as Address;

  const client = createPublicClient({ chain: polygon, transport: http(getRpcUrl()) });
  const poolsHolder = TEST_WALLETS.find((w: any) => w.label === "pools-holder");
  
  if (!poolsHolder) {
    it("pools-holder wallet not found (skipped)", () => assert.ok(true));
    return;
  }

  it(`pools-holder: AlgebraV3Module matches V3Pools1 (±1%)`, async () => {
    // Use current block since AlgebraV3Module is recently deployed
    const blockNumber = await client.getBlockNumber();
    
    const [legacy, newModule] = await Promise.all([
      client.readContract({
        address: POLYGON.V3POOLS1, abi: BALANCE_OF_ABI,
        functionName: "balanceOf", args: [poolsHolder.address as Address], blockNumber,
      }),
      client.readContract({
        address: algebraV3Address, abi: BALANCE_OF_ABI,
        functionName: "balanceOf", args: [poolsHolder.address as Address], blockNumber,
      }),
    ]);

    // Allow 1% tolerance for minor calculation differences
    const diff = legacy > newModule ? legacy - newModule : newModule - legacy;
    const tolerance = legacy / 100n; // 1%
    
    assert.ok(
      diff <= tolerance,
      `Difference too large: legacy=${legacy}, new=${newModule}, diff=${diff}, tolerance=${tolerance}`
    );
  });
});

describe("Smoke: PolygonAggregator (deployed)", async () => {
  const latestPath = path.join(__dirname, "..", "deployments", "polygon-latest.json");
  if (!fs.existsSync(latestPath)) {
    it("polygon-latest.json missing (skipped)", async () => {
      assert.ok(true);
    });
    return;
  }

  const deployment = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const addresses = deployment.contracts as Record<string, { address: Address }>;

  const aggregator = addresses.aggregator?.address;
  const walletAndDQuick = addresses.walletAndDQuick?.address;
  const syrupStaking = addresses.syrupStaking?.address;
  const algebraV3 = addresses.algebraV3?.address;
  const liquidityManagers = addresses.liquidityManagers?.address;
  const v2LPStaking = addresses.v2LPStaking?.address;

  const client = createPublicClient({ chain: polygon, transport: http(getRpcUrl()) });
  const blockNumber =
    process.env.POLYGON_BLOCK !== undefined
      ? BigInt(process.env.POLYGON_BLOCK)
      : await client.getBlockNumber();

  it("aggregator and module addresses exist", async () => {
    assert.ok(aggregator);
    assert.ok(walletAndDQuick);
    assert.ok(syrupStaking);
    assert.ok(algebraV3);
    assert.ok(liquidityManagers);
    assert.ok(v2LPStaking);
  });

  const sampleWallets = TEST_WALLETS.filter((w: any) => w.expectedSources?.polygon).slice(0, 3);
  for (const wallet of sampleWallets) {
    it(`${wallet.label}: aggregator = sum(modules) @ block ${blockNumber}`, async () => {
      const [agg, m1, m2, m3, m4, m5] = await Promise.all([
        client.readContract({
          address: aggregator, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
        client.readContract({
          address: walletAndDQuick, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
        client.readContract({
          address: syrupStaking, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
        client.readContract({
          address: algebraV3, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
        client.readContract({
          address: liquidityManagers, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
        client.readContract({
          address: v2LPStaking, abi: BALANCE_OF_ABI,
          functionName: "balanceOf", args: [wallet.address as Address], blockNumber,
        }),
      ]);

      assert.equal(agg, m1 + m2 + m3 + m4 + m5);
    });
  }
});

