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
import { createPublicClient, http, type Address } from "viem";
import { polygon } from "viem/chains";
import { BALANCE_OF_ABI, DRAGON_LAIR_ABI } from "../lib/abis/index.js";

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

describe("Parity: AlgebraV3Module vs V3Pools1", async () => {
  const algebraV3Address = CHAINS_CONFIG.polygon.deployed?.algebraV3 as Address | undefined;
  if (!algebraV3Address) {
    it("algebraV3 not deployed (skipped)", () => assert.ok(true));
    return;
  }

  const client = createPublicClient({ chain: polygon, transport: http(getRpcUrl()) });
  const poolsHolder = TEST_WALLETS.find((w: any) => w.label === "pools-holder");
  
  if (!poolsHolder) {
    it("pools-holder wallet not found (skipped)", () => assert.ok(true));
    return;
  }

  it(`pools-holder: AlgebraV3Module matches V3Pools1 (±1%)`, async () => {
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

    const diff = legacy > newModule ? legacy - newModule : newModule - legacy;
    const tolerance = legacy / 100n; // 1%
    
    assert.ok(
      diff <= tolerance,
      `Difference too large: legacy=${legacy}, new=${newModule}, diff=${diff}, tolerance=${tolerance}`
    );
  });
});

describe("Smoke: PolygonAggregator", async () => {
  const deployed = CHAINS_CONFIG.polygon.deployed;
  if (!deployed?.aggregator) {
    it("aggregator not deployed (skipped)", () => assert.ok(true));
    return;
  }

  const aggregator = deployed.aggregator as Address;
  const walletAndDQuick = deployed.walletAndDQuick as Address;
  const syrupStaking = deployed.syrupStaking as Address;
  const algebraV3 = deployed.algebraV3 as Address;
  const liquidityManagers = deployed.liquidityManagers as Address;
  const v2LPStaking = deployed.v2LPStaking as Address;

  const client = createPublicClient({ chain: polygon, transport: http(getRpcUrl()) });

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
    it(`${wallet.label}: aggregator = sum(modules)`, async () => {
      const blockNumber = await client.getBlockNumber();
      
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

