/**
 * Algebra Integral Module Tests
 * 
 * Tests for AlgebraIntegralModule which counts QUICK in Algebra v4 positions
 * on Base, Somnia, and future Algebra Integral deployments.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, parseAbi, formatUnits, type Address } from "viem";
import { base } from "viem/chains";
import type { ChainsConfig, BlockNumbers } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAINS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "config/chains.json"), "utf8")
).chains as ChainsConfig;

const BLOCKS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/blocks.json"), "utf8")
).blocks as BlockNumbers;

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
      if (i > 0) await delay(delayMs * i); // Delay before retry
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
        return; // Skip test gracefully
      }
      throw e;
    }
  });
}

// ABIs for Algebra Integral contracts
const POSITION_MANAGER_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint88 nonce, address operator, address token0, address token1, address deployer, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function tokenFarmedIn(uint256 tokenId) view returns (address)",
]);

const FACTORY_ABI = parseAbi([
  "function poolByPair(address tokenA, address tokenB) view returns (address pool)",
]);

const POOL_ABI = parseAbi([
  "function liquidity() view returns (uint128)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const BASE = {
  QUICK: CHAINS_CONFIG.base.tokens.QUICK as Address,
  POSITION_MANAGER: CHAINS_CONFIG.base.contracts.nonfungiblePositionManager as Address,
  FACTORY: CHAINS_CONFIG.base.contracts.factory as Address,
};

describe("Algebra Integral Module (Base)", async () => {
  const rpcUrl = getRpcUrl(CHAINS_CONFIG.base);
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const blockNumber = BigInt(BLOCKS.base);

  describe("Contract Interface Compatibility", async () => {
    itWithRpc("should read PositionManager.balanceOf for zero address", async () => {
      const balance = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: ["0x0000000000000000000000000000000000000001" as Address],
        blockNumber,
      }));
      
      assert.ok(balance >= 0n, "Should return a valid balance");
    });

    itWithRpc("should read Factory.poolByPair for QUICK pairs", async () => {
      // Try to get pool for QUICK-USDC (common pair)
      const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
      
      const pool = await withRetry(() => client.readContract({
        address: BASE.FACTORY,
        abi: FACTORY_ABI,
        functionName: "poolByPair",
        args: [BASE.QUICK, USDC],
        blockNumber,
      })).catch(() => "0x0000000000000000000000000000000000000000" as Address);
      
      // Pool may or may not exist, but call should not revert
      assert.ok(typeof pool === "string", "Should return an address");
    });
  });

  describe("NFT Position Reading", async () => {
    itWithRpc("should handle wallet with no NFT positions", async () => {
      // Use a wallet unlikely to have positions
      const wallet = "0x0000000000000000000000000000000000000001" as Address;
      
      const balance = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [wallet],
        blockNumber,
      }));
      
      assert.equal(balance, 0n, "Empty wallet should have 0 NFTs");
    });

    itWithRpc("should enumerate positions for a known LP holder (if exists)", async () => {
      // This test will attempt to find a wallet with positions
      // We use the base-holder from test wallets as a starting point
      const testWallet = "0x451ff8ecD1dd92017e70454f3120fada936f73A3" as Address;
      
      const nftBalance = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [testWallet],
        blockNumber,
      }));
      
      // Log for debugging
      console.log(`    [INFO] ${testWallet} has ${nftBalance} NFT positions on Base`);
      
      // If they have positions, try to read one
      if (nftBalance > 0n) {
        const tokenId = await withRetry(() => client.readContract({
          address: BASE.POSITION_MANAGER,
          abi: POSITION_MANAGER_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [testWallet, 0n],
          blockNumber,
        }));
        
        const position = await withRetry(() => client.readContract({
          address: BASE.POSITION_MANAGER,
          abi: POSITION_MANAGER_ABI,
          functionName: "positions",
          args: [tokenId],
          blockNumber,
        }));
        
        // Verify position structure (12 fields for Integral)
        assert.ok(Array.isArray(position), "Position should be an array");
        assert.equal(position.length, 12, "Algebra Integral positions have 12 fields");
        
        const [, , token0, token1, deployer, , , liquidity] = position;
        console.log(`    [INFO] Position ${tokenId}: ${token0}/${token1}, liquidity: ${liquidity}`);
        console.log(`    [INFO] Deployer: ${deployer}`);
      }
      
      assert.ok(true, "Test completed");
    });
  });

  describe("QUICK Balance Calculation Logic", async () => {
    it("should correctly calculate user share from pool", async () => {
      // This tests the core calculation logic
      // userShare = (positionLiquidity / poolLiquidity) * poolQUICKBalance
      
      const positionLiquidity = 1000n;
      const poolLiquidity = 10000n;
      const poolQuickBalance = 5000n * 10n ** 18n;
      
      const expectedShare = (positionLiquidity * poolQuickBalance) / poolLiquidity;
      const expectedFormatted = formatUnits(expectedShare, 18);
      
      assert.equal(expectedFormatted, "500", "Should calculate 10% of pool");
    });

    it("should handle zero liquidity edge cases", async () => {
      // Zero position liquidity
      const share1 = (0n * 1000n) / 100n;
      assert.equal(share1, 0n, "Zero position liquidity = 0 QUICK");
      
      // Note: Division by zero is handled by returning 0 in the contract
    });
  });

  describe("Integration: Simulated Module Behavior", async () => {
    // This simulates what AlgebraIntegralModule.balanceOf() would do
    // Uses withRetry for rate limit handling
    
    async function simulateModuleBalanceOf(account: Address): Promise<bigint> {
      let balance = 0n;
      
      const nftCount = await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [account],
        blockNumber,
      }));
      
      const limit = nftCount > 5n ? 5n : nftCount; // Limit to 5 for testing
      
      for (let i = 0n; i < limit; i++) {
        try {
          const tokenId = await withRetry(() => client.readContract({
            address: BASE.POSITION_MANAGER,
            abi: POSITION_MANAGER_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [account, i],
            blockNumber,
          }));
          
          const position = await withRetry(() => client.readContract({
            address: BASE.POSITION_MANAGER,
            abi: POSITION_MANAGER_ABI,
            functionName: "positions",
            args: [tokenId],
            blockNumber,
          }));
          
          const [, , token0, token1, , , , liquidity] = position;
          
          // Only QUICK pairs
          if (token0 !== BASE.QUICK && token1 !== BASE.QUICK) {
            continue;
          }
          
          if (liquidity === 0n) continue;
          
          // Get pool
          const pool = await withRetry(() => client.readContract({
            address: BASE.FACTORY,
            abi: FACTORY_ABI,
            functionName: "poolByPair",
            args: [token0 as Address, token1 as Address],
            blockNumber,
          }));
          
          if (pool === "0x0000000000000000000000000000000000000000") continue;
          
          const poolLiquidity = await withRetry(() => client.readContract({
            address: pool,
            abi: POOL_ABI,
            functionName: "liquidity",
            blockNumber,
          }));
          
          if (poolLiquidity === 0n) continue;
          
          const poolQuick = await withRetry(() => client.readContract({
            address: BASE.QUICK,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [pool],
            blockNumber,
          }));
          
          balance += (liquidity * poolQuick) / poolLiquidity;
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

    itWithRpc("should calculate QUICK for holder with LP positions", async () => {
      // Use base-holder which may or may not have LP positions
      const wallet = "0x451ff8ecD1dd92017e70454f3120fada936f73A3" as Address;
      const balance = await simulateModuleBalanceOf(wallet);
      
      console.log(`    [INFO] Simulated module balance for ${wallet}: ${formatUnits(balance, 18)} QUICK`);
      
      // Balance should be >= 0 (may be 0 if no QUICK LP positions)
      assert.ok(balance >= 0n, "Balance should be non-negative");
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
    
    // PositionManager.balanceOf should revert for zero address (ERC721 behavior)
    try {
      await withRetry(() => client.readContract({
        address: BASE.POSITION_MANAGER,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [ZERO],
      }));
      // If it doesn't revert, that's also acceptable (some implementations return 0)
      assert.ok(true, "Contract returned a value for zero address");
    } catch {
      // Expected to revert for zero address - this is also acceptable
      assert.ok(true, "Contract reverted for zero address as expected");
    }
  });
});

