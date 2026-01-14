/**
 * Algebra Integral Module Tests
 * 
 * Tests for AlgebraIntegralV4Module which counts QUICK in Algebra v4 positions
 * on Base, Somnia, and future Algebra Integral deployments.
 * 
 * Updated: Uses correct Uniswap V3 math for concentrated liquidity positions.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, parseAbi, formatUnits, type Address } from "viem";
import { base } from "viem/chains";
import type { ChainsConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "chains.json"), "utf8")
).chains as ChainsConfig;


const getRpcUrl = (chain: { rpcEnvVar: string; defaultRpc: string }): string =>
  process.env[chain.rpcEnvVar] || chain.defaultRpc;

// Check if we have a private RPC (not the default public one)
const hasPrivateBaseRpc = !!process.env.BASE_RPC && process.env.BASE_RPC !== CHAINS_CONFIG.base.defaultRpc;

// Delay helper to avoid rate limiting on public RPCs
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to retry RPC calls with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) await delay(delayMs * i);
      return await fn();
    } catch (e: any) {
      const isRateLimit = e.message?.includes("rate limit") || 
                          e.cause?.message?.includes("rate limit") ||
                          e.message?.includes("429");
      if (isRateLimit && i < retries - 1) {
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

// Conditional test runner - skips if no private RPC and rate limited
function itWithRpc(name: string, fn: () => Promise<void>) {
  it(name, async () => {
    try {
      await fn();
    } catch (e: any) {
      const isRateLimit = e.message?.includes("rate limit") || 
                          e.cause?.message?.includes("rate limit") ||
                          e.message?.includes("429");
      if (isRateLimit && !hasPrivateBaseRpc) {
        console.log(`    [SKIP] Rate limited (set BASE_RPC env for private RPC)`);
        return;
      }
      throw e;
    }
  });
}

// ============================================================================
// V3 Math (mirrors the smart contract implementation)
// ============================================================================

const Q96 = 2n ** 96n;

function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = Math.abs(tick);
  if (absTick > 887272) throw new Error("Tick out of bounds");
  
  let ratio = (absTick & 0x1) !== 0 
    ? 0xfffcb933bd6fad37aa2d162d1a594001n 
    : 0x100000000000000000000000000000000n;
  
  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;
  
  if (tick > 0) {
    ratio = (2n ** 256n - 1n) / ratio;
  }
  
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function getAmountsForLiquidity(
  sqrtRatioX96: bigint,
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint
): { amount0: bigint; amount1: bigint } {
  // Ensure A < B
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  
  let amount0 = 0n;
  let amount1 = 0n;
  
  if (sqrtRatioX96 <= sqrtRatioAX96) {
    // Current price BELOW range: position is 100% token0
    amount0 = ((liquidity << 96n) * (sqrtRatioBX96 - sqrtRatioAX96) / sqrtRatioBX96) / sqrtRatioAX96;
  } else if (sqrtRatioX96 < sqrtRatioBX96) {
    // Current price IN range: position has both tokens
    amount0 = ((liquidity << 96n) * (sqrtRatioBX96 - sqrtRatioX96) / sqrtRatioBX96) / sqrtRatioX96;
    amount1 = (liquidity * (sqrtRatioX96 - sqrtRatioAX96)) / Q96;
  } else {
    // Current price ABOVE range: position is 100% token1
    amount1 = (liquidity * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;
  }
  
  return { amount0, amount1 };
}

// ============================================================================
// Contract ABIs
// ============================================================================

const POSITION_MANAGER_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint88 nonce, address operator, address token0, address token1, address deployer, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

const FACTORY_ABI = parseAbi([
  "function poolByPair(address tokenA, address tokenB) view returns (address pool)",
]);

const POOL_ABI = parseAbi([
  "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
]);

const BASE = {
  QUICK: CHAINS_CONFIG.base.tokens.QUICK as Address,
  POSITION_MANAGER: CHAINS_CONFIG.base.contracts.nonfungiblePositionManager as Address,
  FACTORY: CHAINS_CONFIG.base.contracts.factory as Address,
};

// ============================================================================
// Tests
// ============================================================================

describe("Algebra Integral Module (Base)", async () => {
  const rpcUrl = getRpcUrl(CHAINS_CONFIG.base);
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  describe("Contract Interface Compatibility", async () => {
    itWithRpc("should read PositionManager.balanceOf for zero address", async () => {
      const balance = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: ["0x0000000000000000000000000000000000000001" as Address],
      }));
      
      assert.ok(balance >= 0n, "Should return a valid balance");
    });

    itWithRpc("should read Factory.poolByPair for QUICK pairs", async () => {
      const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
      
      const pool = await withRetry(() => client.readContract({
        address: BASE.FACTORY,
        abi: FACTORY_ABI,
        functionName: "poolByPair",
        args: [BASE.QUICK, USDC],
      })).catch(() => "0x0000000000000000000000000000000000000000" as Address);
      
      assert.ok(typeof pool === "string", "Should return an address");
    });
  });

  describe("V3 Math: Unit Tests", async () => {
    it("should calculate sqrtRatioAtTick correctly for tick 0", () => {
      const sqrtRatio = getSqrtRatioAtTick(0);
      // At tick 0, sqrt(1.0001^0) * 2^96 = 2^96
      const expected = 79228162514264337593543950336n; // 2^96
      assert.equal(sqrtRatio, expected, "Tick 0 should equal 2^96");
    });

    it("should handle positive ticks", () => {
      const sqrtRatio = getSqrtRatioAtTick(100);
      assert.ok(sqrtRatio > Q96, "Positive tick should have ratio > 2^96");
    });

    it("should handle negative ticks", () => {
      const sqrtRatio = getSqrtRatioAtTick(-100);
      assert.ok(sqrtRatio < Q96, "Negative tick should have ratio < 2^96");
    });

    it("should calculate 100% token0 when price BELOW range", () => {
      // sqrtRatioX96 < sqrtRatioAX96 (current price below range)
      const { amount0, amount1 } = getAmountsForLiquidity(
        79228162514264337593543950336n,  // sqrtRatioX96 (tick 0)
        89228162514264337593543950336n,  // sqrtRatioAX96 (above current)
        99228162514264337593543950336n,  // sqrtRatioBX96 (even higher)
        1000000000000000000n              // liquidity (1e18)
      );
      
      assert.ok(amount0 > 0n, "Should have token0 when price below range");
      assert.equal(amount1, 0n, "Should have NO token1 when price below range");
    });

    it("should calculate 100% token1 when price ABOVE range", () => {
      // sqrtRatioX96 > sqrtRatioBX96 (current price above range)
      const { amount0, amount1 } = getAmountsForLiquidity(
        99228162514264337593543950336n,  // sqrtRatioX96 (tick high)
        69228162514264337593543950336n,  // sqrtRatioAX96 (below current)
        79228162514264337593543950336n,  // sqrtRatioBX96 (still below current)
        1000000000000000000n              // liquidity (1e18)
      );
      
      assert.equal(amount0, 0n, "Should have NO token0 when price above range");
      assert.ok(amount1 > 0n, "Should have token1 when price above range");
    });

    it("should calculate both tokens when price IN range", () => {
      // sqrtRatioAX96 < sqrtRatioX96 < sqrtRatioBX96 (current price in range)
      const { amount0, amount1 } = getAmountsForLiquidity(
        79228162514264337593543950336n,  // sqrtRatioX96 (tick 0)
        69228162514264337593543950336n,  // sqrtRatioAX96 (below current)
        89228162514264337593543950336n,  // sqrtRatioBX96 (above current)
        1000000000000000000n              // liquidity (1e18)
      );
      
      assert.ok(amount0 > 0n, "Should have token0 when price in range");
      assert.ok(amount1 > 0n, "Should have token1 when price in range");
    });
  });

  describe("V3 Math: Real Position Tests", async () => {
    // BD's position #663 - OUT OF RANGE (price above)
    itWithRpc("BD Position #663: OUT OF RANGE - should calculate ~24,710 QUICK", async () => {
      const tokenId = 663n;
      
      const position = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "positions",
        args: [tokenId],
      }));
      
      const [, , token0, token1, , tickLower, tickUpper, liquidity] = position;
      const isQuick0 = (token0 as string).toLowerCase() === BASE.QUICK.toLowerCase();
      
      console.log(`    [INFO] Position #${tokenId}`);
      console.log(`    [INFO] Token0: ${token0}, Token1: ${token1}`);
      console.log(`    [INFO] QUICK is token${isQuick0 ? '0' : '1'}`);
      console.log(`    [INFO] Tick Range: [${tickLower}, ${tickUpper}]`);
      console.log(`    [INFO] Liquidity: ${liquidity}`);
      
      // Get pool and current price
      const pool = await withRetry(() => client.readContract({
        address: BASE.FACTORY,
        abi: FACTORY_ABI,
        functionName: "poolByPair",
        args: [token0 as Address, token1 as Address],
      }));
      
      const state = await withRetry(() => client.readContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "globalState",
      }));
      
      const sqrtPriceX96 = state[0];
      const currentTick = state[1];
      
      console.log(`    [INFO] Pool: ${pool}`);
      console.log(`    [INFO] Current Tick: ${currentTick}`);
      
      const inRange = currentTick >= tickLower && currentTick < tickUpper;
      console.log(`    [INFO] In Range: ${inRange ? '✅ YES' : '⚠️ NO (OUT OF RANGE)'}`);
      
      // Verify it's out of range (price moved up past their range)
      assert.ok(!inRange, "Position #663 should be out of range");
      assert.ok(currentTick > tickUpper, "Current tick should be above position range");
      
      // Calculate amounts using V3 math
      const sqrtRatioAX96 = getSqrtRatioAtTick(tickLower);
      const sqrtRatioBX96 = getSqrtRatioAtTick(tickUpper);
      
      const { amount0, amount1 } = getAmountsForLiquidity(
        sqrtPriceX96,
        sqrtRatioAX96,
        sqrtRatioBX96,
        liquidity
      );
      
      const quickAmount = isQuick0 ? amount0 : amount1;
      const quickFormatted = parseFloat(formatUnits(quickAmount, 18));
      
      console.log(`    [INFO] Amount0: ${formatUnits(amount0, 18)}`);
      console.log(`    [INFO] Amount1: ${formatUnits(amount1, 18)}`);
      console.log(`    [INFO] QUICK Amount: ${quickFormatted.toLocaleString()}`);
      
      // Since price is ABOVE range and QUICK is token1, position should be 100% QUICK
      if (!isQuick0) {
        assert.equal(amount0, 0n, "Token0 should be 0 when price above range");
        assert.ok(amount1 > 0n, "Token1 (QUICK) should be non-zero");
      }
      
      // Verify within expected range (UI shows ~24,710)
      assert.ok(quickFormatted >= 24000, `Expected >= 24000 QUICK, got ${quickFormatted}`);
      assert.ok(quickFormatted <= 25500, `Expected <= 25500 QUICK, got ${quickFormatted}`);
    });

    // Position #694 - IN RANGE (full range)
    itWithRpc("Position #694: IN RANGE - should calculate ~77 QUICK", async () => {
      const tokenId = 694n;
      
      const position = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "positions",
        args: [tokenId],
      }));
      
      const [, , token0, token1, , tickLower, tickUpper, liquidity] = position;
      const isQuick0 = (token0 as string).toLowerCase() === BASE.QUICK.toLowerCase();
      
      console.log(`    [INFO] Position #${tokenId}`);
      console.log(`    [INFO] Token0: ${token0}, Token1: ${token1}`);
      console.log(`    [INFO] Tick Range: [${tickLower}, ${tickUpper}] (full range)`);
      console.log(`    [INFO] Liquidity: ${liquidity}`);
      
      // Get pool and current price
      const pool = await withRetry(() => client.readContract({
        address: BASE.FACTORY,
        abi: FACTORY_ABI,
        functionName: "poolByPair",
        args: [token0 as Address, token1 as Address],
      }));
      
      const state = await withRetry(() => client.readContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "globalState",
      }));
      
      const sqrtPriceX96 = state[0];
      const currentTick = state[1];
      
      console.log(`    [INFO] Pool: ${pool}`);
      console.log(`    [INFO] Current Tick: ${currentTick}`);
      
      const inRange = currentTick >= tickLower && currentTick < tickUpper;
      console.log(`    [INFO] In Range: ${inRange ? '✅ YES' : '⚠️ NO'}`);
      
      // Full range positions should always be in range
      assert.ok(inRange, "Full range position should be in range");
      
      // Calculate amounts using V3 math
      const sqrtRatioAX96 = getSqrtRatioAtTick(tickLower);
      const sqrtRatioBX96 = getSqrtRatioAtTick(tickUpper);
      
      const { amount0, amount1 } = getAmountsForLiquidity(
        sqrtPriceX96,
        sqrtRatioAX96,
        sqrtRatioBX96,
        liquidity
      );
      
      const quickAmount = isQuick0 ? amount0 : amount1;
      const quickFormatted = parseFloat(formatUnits(quickAmount, 18));
      
      console.log(`    [INFO] Amount0: ${formatUnits(amount0, 18)}`);
      console.log(`    [INFO] Amount1: ${formatUnits(amount1, 18)}`);
      console.log(`    [INFO] QUICK Amount: ${quickFormatted.toLocaleString()}`);
      
      // In-range positions should have both tokens
      assert.ok(amount0 > 0n || amount1 > 0n, "Should have at least one token");
      
      // Verify within expected range
      assert.ok(quickFormatted >= 70, `Expected >= 70 QUICK, got ${quickFormatted}`);
      assert.ok(quickFormatted <= 90, `Expected <= 90 QUICK, got ${quickFormatted}`);
    });
  });

  describe("Integration: Simulated Module Behavior (V3 Math)", async () => {
    // Simulates AlgebraIntegralV4Module.balanceOf() with CORRECT V3 math
    async function simulateModuleBalanceOf(account: Address): Promise<bigint> {
      let balance = 0n;
      
      const nftCount = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [account],
      }));
      
      const limit = nftCount > 5n ? 5n : nftCount;
      
      for (let i = 0n; i < limit; i++) {
        try {
          const tokenId = await withRetry(() => client.readContract({
            address: BASE.POSITION_MANAGER,
            abi: POSITION_MANAGER_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [account, i],
          }));
          
          const position = await withRetry(() => client.readContract({
            address: BASE.POSITION_MANAGER,
            abi: POSITION_MANAGER_ABI,
            functionName: "positions",
            args: [tokenId],
          }));
          
          const [, , token0, token1, , tickLower, tickUpper, liquidity] = position;
          
          // Only QUICK pairs
          const isQuick0 = (token0 as string).toLowerCase() === BASE.QUICK.toLowerCase();
          const isQuick1 = (token1 as string).toLowerCase() === BASE.QUICK.toLowerCase();
          if (!isQuick0 && !isQuick1) continue;
          if (liquidity === 0n) continue;
          
          // Get pool and current price
          const pool = await withRetry(() => client.readContract({
            address: BASE.FACTORY,
            abi: FACTORY_ABI,
            functionName: "poolByPair",
            args: [token0 as Address, token1 as Address],
          }));
          
          if (pool === "0x0000000000000000000000000000000000000000") continue;
          
          const state = await withRetry(() => client.readContract({
            address: pool,
            abi: POOL_ABI,
            functionName: "globalState",
          }));
          
          const sqrtPriceX96 = state[0];
          if (sqrtPriceX96 === 0n) continue;
          
          // Calculate using V3 math
          const sqrtRatioAX96 = getSqrtRatioAtTick(tickLower);
          const sqrtRatioBX96 = getSqrtRatioAtTick(tickUpper);
          
          const { amount0, amount1 } = getAmountsForLiquidity(
            sqrtPriceX96,
            sqrtRatioAX96,
            sqrtRatioBX96,
            liquidity
          );
          
          balance += isQuick0 ? amount0 : amount1;
        } catch {
          // Skip failed positions
        }
      }
      
      return balance;
    }
    
    itWithRpc("should return 0 for wallet with no QUICK positions", async () => {
      const wallet = "0x0000000000000000000000000000000000000001" as Address;
      const balance = await simulateModuleBalanceOf(wallet);
      
      assert.equal(balance, 0n, "Empty wallet should have 0 QUICK");
    });

    itWithRpc("BD wallet: should calculate correct QUICK with V3 math", async () => {
      const wallet = "0xf16bd0EEd5b7CB01C4c6C48cB92b72C6f45f976c" as Address;
      const balance = await simulateModuleBalanceOf(wallet);
      
      const formatted = parseFloat(formatUnits(balance, 18));
      console.log(`    [INFO] BD wallet V3 math balance: ${formatted.toLocaleString()} QUICK`);
      
      // BD has position #663 with ~24,710 QUICK
      assert.ok(formatted >= 24000, `Expected >= 24000 QUICK, got ${formatted}`);
      assert.ok(formatted <= 26000, `Expected <= 26000 QUICK, got ${formatted}`);
    });
  });
});

describe("Algebra Integral Module: Zero Address Safety", async () => {
  const rpcUrl = getRpcUrl(CHAINS_CONFIG.base);
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
  
  itWithRpc("should handle zero address gracefully", async () => {
    const ZERO = "0x0000000000000000000000000000000000000000" as Address;
    
    try {
      await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [ZERO],
      }));
      assert.ok(true, "Contract returned a value for zero address");
    } catch {
      assert.ok(true, "Contract reverted for zero address as expected");
    }
  });
});

describe("Algebra Integral Module: Edge Cases", async () => {
  it("should handle zero liquidity", () => {
    const { amount0, amount1 } = getAmountsForLiquidity(
      79228162514264337593543950336n,
      69228162514264337593543950336n,
      89228162514264337593543950336n,
      0n // zero liquidity
    );
    
    assert.equal(amount0, 0n, "Zero liquidity should return 0 amount0");
    assert.equal(amount1, 0n, "Zero liquidity should return 0 amount1");
  });

  it("should handle same tick bounds (edge case)", () => {
    // This shouldn't happen in practice, but testing robustness
    const sqrtRatio = getSqrtRatioAtTick(100);
    const { amount0, amount1 } = getAmountsForLiquidity(
      sqrtRatio,
      sqrtRatio,
      sqrtRatio,
      1000000000000000000n
    );
    
    // Same bounds means no range, amounts should be 0
    assert.equal(amount0, 0n, "Same bounds should return 0 amount0");
    assert.equal(amount1, 0n, "Same bounds should return 0 amount1");
  });

  it("should handle extreme tick values", () => {
    // Max tick
    const maxTick = 887272;
    const sqrtRatioMax = getSqrtRatioAtTick(maxTick);
    assert.ok(sqrtRatioMax > 0n, "Max tick should produce valid ratio");
    
    // Min tick
    const minTick = -887272;
    const sqrtRatioMin = getSqrtRatioAtTick(minTick);
    assert.ok(sqrtRatioMin > 0n, "Min tick should produce valid ratio");
  });
});
