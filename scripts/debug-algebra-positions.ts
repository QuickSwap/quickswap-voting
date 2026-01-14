/**
 * Debug Algebra positions in detail
 * Shows exactly where QUICK is being counted from
 * 
 * Run: pnpm exec tsx scripts/debug-algebra-positions.ts <address>
 */
import { createPublicClient, http, parseAbi, formatEther, Address } from "viem";
import { base } from "viem/chains";

const USER = (process.argv[2] || "0xf16bd0EEd5b7CB01C4c6C48cB92b72C6f45f976c") as Address;

// Use Infura for better reliability
const RPC_URL = "https://base-mainnet.infura.io/v3/8747e4d0671c43f0b0c97fc299af50e2";

// Addresses from config
const QUICK = "0x7094c27f342DBAdfbbeD005b219431595E33b305" as Address;
const NFT_MANAGER = "0x84715977598247125C3D6E2e85370d1F6fDA1eaF" as Address;
const FACTORY = "0xC5396866754799B9720125B104AE01d935Ab9C7b" as Address;
const ALGEBRA_MODULE = "0xacd0d266d504ebbdf4ccd141673a8bd9630b97c8" as Address;

const nftAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
  "function positions(uint256) view returns (uint88 nonce, address operator, address token0, address token1, address deployer, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

const poolAbi = parseAbi([
  "function liquidity() view returns (uint128)",
  "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
]);

const factoryAbi = parseAbi([
  "function poolByPair(address, address) view returns (address)",
]);

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
]);

const moduleAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║           Debug Algebra V4 Positions                          ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log("User:", USER);
  console.log("RPC:", RPC_URL.replace(/\/[a-f0-9]{32}$/, "/***"));
  console.log("");

  // 1. Get module balance
  console.log("▸ AlgebraIntegralV4Module Result");
  console.log("─".repeat(60));
  
  const moduleBalance = await client.readContract({
    address: ALGEBRA_MODULE,
    abi: moduleAbi,
    functionName: "balanceOf",
    args: [USER],
  });
  console.log(`  Module reports: ${formatEther(moduleBalance)} QUICK`);
  console.log("");

  // 2. Get all NFTs
  console.log("▸ NFT Positions Owned");
  console.log("─".repeat(60));

  const nftCount = await client.readContract({
    address: NFT_MANAGER,
    abi: nftAbi,
    functionName: "balanceOf",
    args: [USER],
  });
  console.log(`  Total NFTs: ${nftCount}`);
  console.log("");

  let totalCalculatedQuick = 0n;

  for (let i = 0; i < Number(nftCount); i++) {
    const tokenId = await client.readContract({
      address: NFT_MANAGER,
      abi: nftAbi,
      functionName: "tokenOfOwnerByIndex",
      args: [USER, BigInt(i)],
    });

    console.log(`  ── Position #${tokenId} ──`);

    const position = await client.readContract({
      address: NFT_MANAGER,
      abi: nftAbi,
      functionName: "positions",
      args: [tokenId],
    });

    const [nonce, operator, token0, token1, deployer, tickLower, tickUpper, liquidity] = position;

    // Get token symbols
    let symbol0 = "???", symbol1 = "???";
    try {
      symbol0 = await client.readContract({ address: token0, abi: erc20Abi, functionName: "symbol" });
    } catch {}
    try {
      symbol1 = await client.readContract({ address: token1, abi: erc20Abi, functionName: "symbol" });
    } catch {}

    const isQuickPair = token0.toLowerCase() === QUICK.toLowerCase() || 
                        token1.toLowerCase() === QUICK.toLowerCase();

    console.log(`     Pair: ${symbol0}/${symbol1}`);
    console.log(`     Token0: ${token0}`);
    console.log(`     Token1: ${token1}`);
    console.log(`     QUICK Pair: ${isQuickPair ? "✅ YES" : "❌ NO"}`);
    console.log(`     Tick Range: [${tickLower}, ${tickUpper}]`);
    console.log(`     Liquidity: ${liquidity.toString()}`);

    if (isQuickPair && liquidity > 0n) {
      // Get pool
      const pool = await client.readContract({
        address: FACTORY,
        abi: factoryAbi,
        functionName: "poolByPair",
        args: [token0, token1],
      });
      console.log(`     Pool: ${pool}`);

      if (pool && pool !== "0x0000000000000000000000000000000000000000") {
        // Get pool state
        const [poolLiquidity, globalState] = await Promise.all([
          client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" }),
          client.readContract({ address: pool, abi: poolAbi, functionName: "globalState" }),
        ]);

        const currentTick = globalState[1];
        const inRange = currentTick >= tickLower && currentTick < tickUpper;

        console.log(`     Current Tick: ${currentTick}`);
        console.log(`     In Range: ${inRange ? "✅ YES" : "⚠️ NO"}`);
        console.log(`     Pool Liquidity: ${poolLiquidity.toString()}`);

        // Get pool QUICK balance
        const poolQuickBalance = await client.readContract({
          address: QUICK,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [pool],
        });
        console.log(`     Pool QUICK: ${formatEther(poolQuickBalance)}`);

        // Calculate user's share (same formula as contract)
        if (poolLiquidity > 0n) {
          const userQuick = (liquidity * poolQuickBalance) / poolLiquidity;
          totalCalculatedQuick += userQuick;
          console.log(`     Calculated QUICK: ${formatEther(userQuick)}`);
          console.log(`     Formula: (${liquidity} * ${poolQuickBalance}) / ${poolLiquidity}`);
        }
      }
    }
    console.log("");
  }

  // 3. Summary
  console.log("▸ Summary");
  console.log("─".repeat(60));
  console.log(`  Module reports:     ${formatEther(moduleBalance)} QUICK`);
  console.log(`  Our calculation:    ${formatEther(totalCalculatedQuick)} QUICK`);
  
  const diff = moduleBalance > totalCalculatedQuick 
    ? moduleBalance - totalCalculatedQuick 
    : totalCalculatedQuick - moduleBalance;
  
  if (diff > 0n) {
    console.log(`  Difference:         ${formatEther(diff)} QUICK`);
    console.log("");
    console.log("  ⚠️ There's a difference! Possible causes:");
    console.log("     - Pool state changed between calls");
    console.log("     - Rounding differences");
    console.log("     - Positions in farming contracts");
  } else {
    console.log("  ✅ Values match!");
  }
  console.log("");
}

main().catch(console.error);
