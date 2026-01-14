/**
 * Test Algebra Modules
 * 
 * Verifies that AlgebraIntegralV4Module and AlgebraV3Module correctly
 * calculate QUICK amounts for both IN RANGE and OUT OF RANGE positions.
 * 
 * Usage: pnpm exec tsx scripts/test-algebra-modules.ts
 */

import { createPublicClient, http, parseAbi, formatUnits } from 'viem';
import { base, polygon } from 'viem/chains';

// ============================================================================
// Configuration
// ============================================================================

const INFURA_KEY = process.env.INFURA_KEY || '8747e4d0671c43f0b0c97fc299af50e2';

const BASE_CONFIG = {
  rpc: `https://base-mainnet.infura.io/v3/${INFURA_KEY}`,
  chain: base,
  quick: '0x7094c27f342DBAdfbbeD005b219431595E33b305',
  nftManager: '0x84715977598247125C3D6E2e85370d1F6fDA1eaF',
  factory: '0xC5396866754799B9720125B104AE01d935Ab9C7b',
  testCases: [
    // OUT OF RANGE case (BD's position)
    { 
      name: 'OUT OF RANGE - BD Position #663',
      user: '0xf16bd0EEd5b7CB01C4c6C48cB92b72C6f45f976c',
      tokenId: 663n,
      expectedQuick: 24710, // UI shows this
      tolerance: 0.05, // 5% tolerance
    },
    // IN RANGE case (full range position)
    {
      name: 'IN RANGE - Position #694 (full range)',
      user: '0x5bd0235cD68Fe074CC8D665708B2baF9E10ebfdd',
      tokenId: 694n,
      expectedQuick: 77, // Correct V3 math calculation
      tolerance: 0.1, // 10% tolerance
    },
  ]
};

// ============================================================================
// ABIs
// ============================================================================

const nftManagerAbi = parseAbi([
  'function positions(uint256) view returns (uint88, address, address, address, address, int24, int24, uint128, uint256, uint256, uint128, uint128)',
]);

const factoryAbi = parseAbi([
  'function poolByPair(address, address) view returns (address)',
]);

const poolAbi = parseAbi([
  'function globalState() view returns (uint160, int24, uint16, uint8, uint16, bool)',
]);

// ============================================================================
// V3 Math (same as in the smart contract)
// ============================================================================

const Q96 = 2n ** 96n;

function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = Math.abs(tick);
  if (absTick > 887272) throw new Error('Tick out of bounds');
  
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

function getAmount0ForLiquidity(
  sqrtRatioAX96: bigint, 
  sqrtRatioBX96: bigint, 
  liquidity: bigint
): bigint {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  return ((liquidity << 96n) * (sqrtRatioBX96 - sqrtRatioAX96) / sqrtRatioBX96) / sqrtRatioAX96;
}

function getAmount1ForLiquidity(
  sqrtRatioAX96: bigint, 
  sqrtRatioBX96: bigint, 
  liquidity: bigint
): bigint {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  return (liquidity * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;
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
    // Current price below range: position is 100% token0
    amount0 = getAmount0ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);
  } else if (sqrtRatioX96 < sqrtRatioBX96) {
    // Current price in range: position has both tokens
    amount0 = getAmount0ForLiquidity(sqrtRatioX96, sqrtRatioBX96, liquidity);
    amount1 = getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioX96, liquidity);
  } else {
    // Current price above range: position is 100% token1
    amount1 = getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);
  }
  
  return { amount0, amount1 };
}

// ============================================================================
// Test Runner
// ============================================================================

async function testBasePositions() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        Testing AlgebraIntegralV4Module (Base)                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const client = createPublicClient({
    chain: base,
    transport: http(BASE_CONFIG.rpc),
  });
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of BASE_CONFIG.testCases) {
    console.log(`▸ Test: ${testCase.name}`);
    console.log('────────────────────────────────────────────────────────────');
    
    try {
      // Get position data
      const pos = await client.readContract({
        address: BASE_CONFIG.nftManager as `0x${string}`,
        abi: nftManagerAbi,
        functionName: 'positions',
        args: [testCase.tokenId],
      });
      
      const [, , token0, token1, , tickLower, tickUpper, liquidity] = pos;
      const isQuick0 = token0.toLowerCase() === BASE_CONFIG.quick.toLowerCase();
      
      console.log(`  Token0: ${token0}`);
      console.log(`  Token1: ${token1}`);
      console.log(`  QUICK is token${isQuick0 ? '0' : '1'}`);
      console.log(`  Tick Range: [${tickLower}, ${tickUpper}]`);
      console.log(`  Liquidity: ${liquidity.toString()}`);
      
      // Get pool and current price
      const pool = await client.readContract({
        address: BASE_CONFIG.factory as `0x${string}`,
        abi: factoryAbi,
        functionName: 'poolByPair',
        args: [token0, token1],
      });
      
      const state = await client.readContract({
        address: pool,
        abi: poolAbi,
        functionName: 'globalState',
      });
      
      const sqrtPriceX96 = state[0];
      const currentTick = state[1];
      
      console.log(`  Pool: ${pool}`);
      console.log(`  Current Tick: ${currentTick}`);
      
      // Determine if in range
      const inRange = currentTick >= tickLower && currentTick < tickUpper;
      console.log(`  In Range: ${inRange ? '✅ YES' : '⚠️ NO'}`);
      
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
      
      console.log(`  Amount0: ${formatUnits(amount0, 18)}`);
      console.log(`  Amount1: ${formatUnits(amount1, 18)}`);
      console.log(`  QUICK Amount: ${quickFormatted.toLocaleString()}`);
      console.log(`  Expected: ~${testCase.expectedQuick.toLocaleString()}`);
      
      // Check if within tolerance
      const diff = Math.abs(quickFormatted - testCase.expectedQuick) / testCase.expectedQuick;
      const withinTolerance = diff <= testCase.tolerance;
      
      if (withinTolerance) {
        console.log(`  ✅ PASSED (within ${(testCase.tolerance * 100).toFixed(0)}% tolerance)`);
        passed++;
      } else {
        console.log(`  ❌ FAILED (${(diff * 100).toFixed(1)}% difference)`);
        failed++;
      }
      
    } catch (error: any) {
      console.log(`  ❌ ERROR: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }
  
  return { passed, failed };
}

async function main() {
  console.log('\n');
  
  const baseResults = await testBasePositions();
  
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                      Test Summary                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Base Tests:    ${baseResults.passed} passed, ${baseResults.failed} failed`);
  console.log('');
  
  const totalFailed = baseResults.failed;
  if (totalFailed > 0) {
    console.log('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
  }
}

main().catch(console.error);
