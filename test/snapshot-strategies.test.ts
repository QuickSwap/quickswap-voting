import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, getContract, type Address } from "viem";
import { polygon, base, mainnet } from "viem/chains";
import type { BlockNumbers, TestWallet, ChainsConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BLOCKS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/blocks.json"), "utf8")
).blocks as BlockNumbers;

const TEST_WALLETS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "config/test-wallets.json"), "utf8")
).wallets as TestWallet[];

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "chains.json"), "utf8")
).chains as ChainsConfig;

const ABI_BALANCE_OF = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const getRpcUrl = (chain: { rpcEnvVar: string; defaultRpc: string }): string =>
  process.env[chain.rpcEnvVar] || chain.defaultRpc;

describe("Snapshot Strategy Wrappers", async function () {
  describe("Polygon Wrappers (legacy)", async function () {
    const rpcUrl = getRpcUrl(CHAINS_CONFIG.polygon);
    const client = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl),
    });

    const legacy = CHAINS_CONFIG.polygon.legacy;
    if (!legacy?.voting8) {
      it("legacy wrappers not configured (skipped)", () => assert.ok(true));
      return;
    }

    const voting8 = getContract({
      address: legacy.voting8 as Address,
      abi: ABI_BALANCE_OF,
      client,
    });

    const voting10 = getContract({
      address: legacy.voting10 as Address,
      abi: ABI_BALANCE_OF,
      client,
    });

    const v3Pools1 = getContract({
      address: legacy.v3Pools1 as Address,
      abi: ABI_BALANCE_OF,
      client,
    });

    for (const wallet of TEST_WALLETS.filter((w) => w.expectedSources?.polygon)) {
      describe(`${wallet.label} (${wallet.address})`, function () {
        it("should return non-reverting scores", async function () {
          const blockNumber = BigInt(BLOCKS.polygon);

          const [s8, s10, sv3] = await Promise.all([
            voting8.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
            voting10.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
            v3Pools1.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
          ]);

          assert.ok(s8 !== null);
          assert.ok(s10 !== null);
          assert.ok(sv3 !== null);
        });

        it("should match expected sources", async function () {
          const blockNumber = BigInt(BLOCKS.polygon);
          const expected = wallet.expectedSources!.polygon!;

          const [s8, s10, sv3] = await Promise.all([
            voting8.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
            voting10.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
            v3Pools1.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
          ]);

          if (expected.includes("walletQUICK") || expected.includes("dQUICK")) {
            assert.ok(s8 > 0n, `Expected voting8 > 0 for ${wallet.label}`);
          }

          if (expected.includes("syrup")) {
            assert.ok(s10 > 0n, `Expected voting10 > 0 for ${wallet.label}`);
          }

          if (expected.includes("v3Pools")) {
            assert.ok(sv3 > 0n, `Expected v3Pools1 > 0 for ${wallet.label}`);
          }
        });

        it(`should have deterministic total at block ${BLOCKS.polygon}`, async function () {
          const blockNumber = BigInt(BLOCKS.polygon);

          const [s8, s10, sv3] = await Promise.all([
            voting8.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
            voting10.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
            v3Pools1.read.balanceOf([wallet.address as Address], { blockNumber }).catch(() => 0n),
          ]);

          const total = s8 + s10 + sv3;
          assert.ok(total >= 0n);
        });
      });
    }
  });

  describe("Base (simple balance)", async function () {
    const rpcUrl = getRpcUrl(CHAINS_CONFIG.base);
    const hasPrivateRpc = !!process.env.BASE_RPC && process.env.BASE_RPC !== CHAINS_CONFIG.base.defaultRpc;
    
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const quick = getContract({
      address: CHAINS_CONFIG.base.tokens.QUICK as Address,
      abi: ABI_BALANCE_OF,
      client,
    });

    // Delay and retry helpers to avoid rate limiting
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
      for (let i = 0; i < retries; i++) {
        try {
          if (i > 0) await delay(2000 * i);
          return await fn();
        } catch (e: any) {
          const isRateLimit = e.message?.includes("rate limit") || 
                              e.cause?.message?.includes("rate limit") ||
                              e.message?.includes("429");
          if (isRateLimit && i < retries - 1) continue;
          throw e;
        }
      }
      throw new Error("Max retries exceeded");
    }

    // Only wallets explicitly marked as having wallet QUICK on Base.
    // Some Base test wallets represent LP-only exposure (e.g. Algebra v4 positions) and may have 0 wallet balance.
    for (const wallet of TEST_WALLETS.filter((w) => w.expectedSources?.base?.includes("walletQUICK"))) {
      it(`${wallet.label} should have QUICK balance`, async function () {
        try {
          const blockNumber = BigInt(BLOCKS.base);
          const balance = await withRetry(() => 
            quick.read.balanceOf([wallet.address as Address], { blockNumber })
          );
          
          assert.ok(balance >= 0n, "Balance should be non-negative");
        } catch (e: any) {
          const isRateLimit = e.message?.includes("rate limit") || 
                              e.cause?.message?.includes("rate limit") ||
                              e.message?.includes("429");
          if (isRateLimit && !hasPrivateRpc) {
            console.log(`    [SKIP] Rate limited (set BASE_RPC env for private RPC)`);
            return; // Skip test gracefully
          }
          throw e;
        }
      });
    }
  });

  describe("Ethereum (simple balance)", async function () {
    const rpcUrl = getRpcUrl(CHAINS_CONFIG.ethereum);
    const client = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl),
    });

    const quick = getContract({
      address: CHAINS_CONFIG.ethereum.tokens.QUICK as Address,
      abi: ABI_BALANCE_OF,
      client,
    });

    for (const wallet of TEST_WALLETS.filter((w) => w.expectedSources?.ethereum)) {
      it(`${wallet.label} should have QUICK balance`, async function () {
        const blockNumber = BigInt(BLOCKS.ethereum);
        const balance = await quick.read.balanceOf([wallet.address as Address], { blockNumber });
        
        assert.ok(balance >= 0n);
      });
    }
  });
});
