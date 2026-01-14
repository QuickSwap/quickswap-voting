/**
 * Inspect Algebra LP Positions
 * 
 * Shows detailed breakdown of LP positions for any user, including
 * which positions contribute to voting power and their QUICK amounts.
 * 
 * Usage:
 *   pnpm exec tsx scripts/inspect-positions.ts <address> [--chain <polygon|base>]
 * 
 * Examples:
 *   pnpm exec tsx scripts/inspect-positions.ts 0xf16bd0EEd5b7CB01C4c6C48cB92b72C6f45f976c
 *   pnpm exec tsx scripts/inspect-positions.ts 0x... --chain polygon
 */
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { polygon, base } from "viem/chains";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { 
  ERC20_ABI, 
  BALANCE_OF_ABI,
  NFT_POSITION_MANAGER_ABI, 
  ALGEBRA_POOL_ABI, 
  ALGEBRA_FACTORY_ABI 
} from "../lib/abis/index.js";

// ============================================================================
// Configuration (from config/chains.json)
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "config", "chains.json");

interface ChainConfig {
  chainId: number;
  name: string;
  rpcEnvVar: string;
  defaultRpc: string;
  tokens: { QUICK: string };
  contracts: Record<string, string>;
  deployed: Record<string, string>;
}

const CHAIN_MAP = {
  polygon: { chain: polygon, algebraType: "v3" },
  base: { chain: base, algebraType: "integralV4" },
} as const;

// ============================================================================
// ABIs (from centralized definitions)
// ============================================================================

const ABI = {
  nftManager: NFT_POSITION_MANAGER_ABI,
  pool: ALGEBRA_POOL_ABI,
  factory: ALGEBRA_FACTORY_ABI,
  erc20: ERC20_ABI,
  module: BALANCE_OF_ABI,
} as const;

// ============================================================================
// CLI Parsing
// ============================================================================

function parseArgs(): { user: Address; chainKey: keyof typeof CHAIN_MAP } {
  const args = process.argv.slice(2);
  
  // Find user address (first non-flag argument)
  const user = args.find(arg => arg.startsWith("0x") && arg.length === 42) as Address | undefined;
  
  if (!user) {
    console.error("❌ Usage: pnpm exec tsx scripts/inspect-positions.ts <address> [--chain <polygon|base>]");
    process.exit(1);
  }
  
  // Find chain flag
  const chainArg = args.find((_arg, i) => args[i - 1] === "--chain");
  const chainKey = (chainArg || "base") as keyof typeof CHAIN_MAP;
  
  if (!CHAIN_MAP[chainKey]) {
    console.error(`❌ Invalid chain: ${chainKey}`);
    console.error(`   Available: ${Object.keys(CHAIN_MAP).join(", ")}`);
    process.exit(1);
  }
  
  return { user, chainKey };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { user, chainKey } = parseArgs();
  
  // Load config
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const chainConfig: ChainConfig = config.chains[chainKey];
  
  if (!chainConfig) {
    console.error(`❌ Chain ${chainKey} not found in config/chains.json`);
    process.exit(1);
  }
  
  // Get addresses from config
  const QUICK = chainConfig.tokens.QUICK as Address;
  const NFT_MANAGER = chainConfig.contracts.nonfungiblePositionManager as Address;
  const FACTORY = chainConfig.contracts.factory || chainConfig.contracts.poolDeployer as Address;
  
  // Get deployed module address
  const moduleKey = chainKey === "polygon" ? "algebraV3" : "algebraIntegralV4";
  const ALGEBRA_MODULE = chainConfig.deployed?.[moduleKey] as Address | undefined;
  
  if (!NFT_MANAGER) {
    console.error(`❌ nonfungiblePositionManager not configured for ${chainKey}`);
    process.exit(1);
  }
  
  // Create client
  const { chain } = CHAIN_MAP[chainKey];
  const rpcUrl = process.env[chainConfig.rpcEnvVar] || chainConfig.defaultRpc;
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  
  // ========== Output ==========
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log(`║  Inspect Algebra Positions - ${chainConfig.name.padEnd(30)}║`);
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");
  
  console.log(`  User:    ${user}`);
  console.log(`  Chain:   ${chainConfig.name} (${chainConfig.chainId})`);
  console.log(`  QUICK:   ${QUICK}`);
  console.log(`  NPM:     ${NFT_MANAGER}`);
  if (ALGEBRA_MODULE) {
    console.log(`  Module:  ${ALGEBRA_MODULE}`);
  }
  console.log("");
  
  // 1. Get module balance (if deployed)
  if (ALGEBRA_MODULE) {
    console.log("▸ Module Balance");
    console.log("─".repeat(60));
    
    try {
      const moduleBalance = await client.readContract({
        address: ALGEBRA_MODULE,
        abi: ABI.module,
        functionName: "balanceOf",
        args: [user],
      });
      console.log(`  ${moduleKey}: ${formatUnits(moduleBalance, 18)} QUICK`);
    } catch (e: any) {
      console.log(`  Error: ${e.message?.slice(0, 60)}`);
    }
    console.log("");
  }
  
  // 2. Get all NFT positions
  console.log("▸ NFT Positions");
  console.log("─".repeat(60));
  
  const nftCount = await client.readContract({
    address: NFT_MANAGER,
    abi: ABI.nftManager,
    functionName: "balanceOf",
    args: [user],
  });
  console.log(`  Total NFTs: ${nftCount}\n`);
  
  let totalQuickPositions = 0;
  let totalNonQuickPositions = 0;
  
  for (let i = 0; i < Math.min(Number(nftCount), 20); i++) { // Limit to 20 for performance
    const tokenId = await client.readContract({
      address: NFT_MANAGER,
      abi: ABI.nftManager,
      functionName: "tokenOfOwnerByIndex",
      args: [user, BigInt(i)],
    });
    
    const position = await client.readContract({
      address: NFT_MANAGER,
      abi: ABI.nftManager,
      functionName: "positions",
      args: [tokenId],
    });
    
    const [, , token0, token1, , tickLower, tickUpper, liquidity] = position;
    
    // Get token symbols
    let symbol0 = token0.slice(0, 10) + "...";
    let symbol1 = token1.slice(0, 10) + "...";
    try {
      symbol0 = await client.readContract({ address: token0, abi: ABI.erc20, functionName: "symbol" });
    } catch { /* ignore */ }
    try {
      symbol1 = await client.readContract({ address: token1, abi: ABI.erc20, functionName: "symbol" });
    } catch { /* ignore */ }
    
    const isQuick0 = token0.toLowerCase() === QUICK.toLowerCase();
    const isQuick1 = token1.toLowerCase() === QUICK.toLowerCase();
    const isQuickPair = isQuick0 || isQuick1;
    
    if (isQuickPair) {
      totalQuickPositions++;
      console.log(`  ── Position #${tokenId} (${symbol0}/${symbol1}) ✅ QUICK`);
      console.log(`     Tick Range: [${tickLower}, ${tickUpper}]`);
      console.log(`     Liquidity:  ${liquidity.toString()}`);
      
      if (liquidity > 0n && FACTORY) {
        try {
          const pool = await client.readContract({
            address: FACTORY as Address,
            abi: ABI.factory,
            functionName: "poolByPair",
            args: [token0, token1],
          });
          
          if (pool && pool !== "0x0000000000000000000000000000000000000000") {
            const globalState = await client.readContract({
              address: pool,
              abi: ABI.pool,
              functionName: "globalState",
            });
            
            const currentTick = globalState[1];
            const inRange = currentTick >= tickLower && currentTick < tickUpper;
            
            console.log(`     Current Tick: ${currentTick}`);
            console.log(`     In Range: ${inRange ? "✅ YES" : "⚠️ NO (out of range)"}`);
            
            if (!inRange) {
              if (currentTick < tickLower) {
                console.log(`     Position: 100% ${isQuick0 ? "QUICK" : symbol0} (price below range)`);
              } else {
                console.log(`     Position: 100% ${isQuick1 ? "QUICK" : symbol1} (price above range)`);
              }
            }
          }
        } catch { /* ignore pool errors */ }
      }
      console.log("");
    } else {
      totalNonQuickPositions++;
    }
  }
  
  // 3. Summary
  console.log("▸ Summary");
  console.log("─".repeat(60));
  console.log(`  QUICK positions:     ${totalQuickPositions}`);
  console.log(`  Non-QUICK positions: ${totalNonQuickPositions}`);
  if (Number(nftCount) > 20) {
    console.log(`  (showing first 20 of ${nftCount} positions)`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
