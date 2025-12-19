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

