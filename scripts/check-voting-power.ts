/**
 * Diagnose Voting Power
 * 
 * Production-grade script to analyze voting power breakdown for any user.
 * Shows detailed information per module and per LP position.
 * 
 * Usage:
 *   pnpm exec tsx scripts/diagnose-voting-power.ts <address> [--chain <polygon|base>]
 * 
 * Examples:
 *   pnpm exec tsx scripts/diagnose-voting-power.ts 0xf16bd0EEd5b7CB01C4c6C48cB92b72C6f45f976c
 *   pnpm exec tsx scripts/diagnose-voting-power.ts 0x... --chain polygon
 */
import { createPublicClient, http, parseAbi, formatEther, Address, PublicClient } from "viem";
import { polygon, base, mainnet } from "viem/chains";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "config", "chains.json");

interface ChainConfig {
  chainId: number;
  name: string;
  defaultRpc: string;
  tokens: { QUICK: string };
  contracts: Record<string, string>;
  deployed: Record<string, string>;
}

interface ChainsConfig {
  chains: Record<string, ChainConfig>;
}

// ============================================================================
// ABIs
// ============================================================================

const ABI = {
  balanceOf: parseAbi(["function balanceOf(address) view returns (uint256)"]),
  
  aggregator: parseAbi([
    "function getModuleScores(address) view returns (uint256, uint256, uint256, uint256, uint256, uint256)",
    "function getModuleAddresses() view returns (address, address, address, address, address)",
  ]),
  
  nftManager: parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
    "function positions(uint256) view returns (uint88, address, address, address, address, int24, int24, uint128, uint256, uint256, uint128, uint128)",
  ]),
  
  pool: parseAbi([
    "function liquidity() view returns (uint128)",
    "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
  ]),
  
  factory: parseAbi([
    "function poolByPair(address, address) view returns (address)",
  ]),
  
  erc20: parseAbi([
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ]),
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface ModuleBreakdown {
  name: string;
  address: Address;
  balance: bigint;
  isActive: boolean;
}

interface PositionInfo {
  tokenId: bigint;
  token0: Address;
  token1: Address;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  quickAmount: bigint;
  isQuickPair: boolean;
  poolAddress: Address | null;
  currentTick: number | null;
  inRange: boolean;
}

interface DiagnosisResult {
  user: Address;
  chain: string;
  totalVotingPower: bigint;
  modules: ModuleBreakdown[];
  positions: PositionInfo[];
}

// ============================================================================
// UTILITIES
// ============================================================================

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

function loadConfig(): ChainsConfig {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function parseArgs(): { user: Address; chainKey: string } {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0].startsWith("--")) {
    console.error("Usage: pnpm exec tsx scripts/diagnose-voting-power.ts <address> [--chain <polygon|base>]");
    process.exit(1);
  }
  
  const user = args[0] as Address;
  const chainIndex = args.indexOf("--chain");
  const chainKey = chainIndex !== -1 ? args[chainIndex + 1] : "base";
  
  return { user, chainKey };
}

function formatQuick(wei: bigint): string {
  const num = Number(formatEther(wei));
  if (num === 0) return "0";
  if (num < 0.01) return "<0.01";
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function getViemChain(chainKey: string) {
  switch (chainKey) {
    case "polygon": return polygon;
    case "base": return base;
    case "ethereum": return mainnet;
    default: throw new Error(`Unknown chain: ${chainKey}`);
  }
}

// ============================================================================
// CORE LOGIC
// ============================================================================

async function getModuleBreakdown(
  client: PublicClient,
  aggregatorAddress: Address,
  user: Address,
  deployed: Record<string, string>
): Promise<ModuleBreakdown[]> {
  const moduleNames = ["walletQuick", "syrupStaking", "algebraIntegral", "liquidityManagers", "v2LPStaking"];
  const deployedKeys = ["walletQuick", "syrupStaking", "algebraIntegralV4", "liquidityManagers", "v2LPStaking"];
  
  try {
    const [scores, addresses] = await Promise.all([
      client.readContract({
        address: aggregatorAddress,
        abi: ABI.aggregator,
        functionName: "getModuleScores",
        args: [user],
      }),
      client.readContract({
        address: aggregatorAddress,
        abi: ABI.aggregator,
        functionName: "getModuleAddresses",
      }),
    ]);
    
    return moduleNames.map((name, i) => ({
      name,
      address: addresses[i] as Address,
      balance: scores[i] as bigint,
      isActive: addresses[i] !== ZERO_ADDRESS,
    }));
  } catch {
    // Fallback: query modules directly
    return await Promise.all(
      moduleNames.map(async (name, i) => {
        const addr = (deployed[deployedKeys[i]] || ZERO_ADDRESS) as Address;
        let balance = 0n;
        
        if (addr !== ZERO_ADDRESS) {
          try {
            balance = await client.readContract({
              address: addr,
              abi: ABI.balanceOf,
              functionName: "balanceOf",
              args: [user],
            });
          } catch {
            // Module call failed
          }
        }
        
        return { name, address: addr, balance, isActive: addr !== ZERO_ADDRESS };
      })
    );
  }
}

async function getPositionDetails(
  client: PublicClient,
  nftManagerAddress: Address,
  factoryAddress: Address,
  quickAddress: Address,
  user: Address
): Promise<PositionInfo[]> {
  const positions: PositionInfo[] = [];
  
  try {
    const nftCount = await client.readContract({
      address: nftManagerAddress,
      abi: ABI.nftManager,
      functionName: "balanceOf",
      args: [user],
    });
    
    const limit = Math.min(Number(nftCount), 20); // Limit for performance
    
    for (let i = 0; i < limit; i++) {
      try {
        const tokenId = await client.readContract({
          address: nftManagerAddress,
          abi: ABI.nftManager,
          functionName: "tokenOfOwnerByIndex",
          args: [user, BigInt(i)],
        });
        
        const position = await getPositionInfo(
          client,
          nftManagerAddress,
          factoryAddress,
          quickAddress,
          tokenId
        );
        
        positions.push(position);
      } catch {
        // Skip failed position reads
      }
    }
  } catch {
    // NFT enumeration not supported or failed
  }
  
  return positions;
}

async function getPositionInfo(
  client: PublicClient,
  nftManagerAddress: Address,
  factoryAddress: Address,
  quickAddress: Address,
  tokenId: bigint
): Promise<PositionInfo> {
  const positionData = await client.readContract({
    address: nftManagerAddress,
    abi: ABI.nftManager,
    functionName: "positions",
    args: [tokenId],
  });
  
  const [, , token0, token1, , tickLower, tickUpper, liquidity] = positionData;
  const isQuickPair = token0.toLowerCase() === quickAddress.toLowerCase() || 
                      token1.toLowerCase() === quickAddress.toLowerCase();
  
  let poolAddress: Address | null = null;
  let currentTick: number | null = null;
  let quickAmount = 0n;
  let inRange = false;
  
  if (isQuickPair && liquidity > 0n) {
    try {
      poolAddress = await client.readContract({
        address: factoryAddress,
        abi: ABI.factory,
        functionName: "poolByPair",
        args: [token0, token1],
      });
      
      if (poolAddress && poolAddress !== ZERO_ADDRESS) {
        // Get current tick
        const globalState = await client.readContract({
          address: poolAddress,
          abi: ABI.pool,
          functionName: "globalState",
        });
        currentTick = globalState[1];
        inRange = currentTick >= tickLower && currentTick < tickUpper;
        
        // Calculate QUICK amount
        const poolLiquidity = await client.readContract({
          address: poolAddress,
          abi: ABI.pool,
          functionName: "liquidity",
        });
        
        const poolQuickBalance = await client.readContract({
          address: quickAddress as Address,
          abi: ABI.balanceOf,
          functionName: "balanceOf",
          args: [poolAddress],
        });
        
        if (poolLiquidity > 0n) {
          quickAmount = (liquidity * poolQuickBalance) / poolLiquidity;
        }
      }
    } catch {
      // Pool query failed
    }
  }
  
  return {
    tokenId,
    token0: token0 as Address,
    token1: token1 as Address,
    tickLower,
    tickUpper,
    liquidity,
    quickAmount,
    isQuickPair,
    poolAddress,
    currentTick,
    inRange,
  };
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function printHeader(title: string): void {
  console.log("");
  console.log("╔" + "═".repeat(68) + "╗");
  console.log("║  " + title.padEnd(66) + "║");
  console.log("╚" + "═".repeat(68) + "╝");
}

function printSection(title: string): void {
  console.log("");
  console.log(`▸ ${title}`);
  console.log("─".repeat(70));
}

function printResult(result: DiagnosisResult): void {
  printHeader(`Voting Power Diagnosis - ${result.chain}`);
  
  console.log("");
  console.log(`  User:  ${result.user}`);
  console.log(`  Total: ${formatQuick(result.totalVotingPower)} QUICK`);
  
  // Module Breakdown
  printSection("Module Breakdown");
  
  const maxNameLen = Math.max(...result.modules.map(m => m.name.length));
  
  for (const mod of result.modules) {
    const status = !mod.isActive ? "⏸️  DISABLED" : 
                   mod.balance === 0n ? "   0" : 
                   `✅ ${formatQuick(mod.balance)}`;
    
    console.log(`  ${mod.name.padEnd(maxNameLen + 2)} ${status.padStart(20)} QUICK`);
  }
  
  const total = result.modules.reduce((sum, m) => sum + m.balance, 0n);
  console.log("  " + "─".repeat(maxNameLen + 28));
  console.log(`  ${"TOTAL".padEnd(maxNameLen + 2)} ${formatQuick(total).padStart(20)} QUICK`);
  
  // Module Addresses
  printSection("Module Addresses");
  
  for (const mod of result.modules) {
    const status = mod.isActive ? "✅" : "⏸️";
    console.log(`  ${status} ${mod.name.padEnd(maxNameLen + 2)} ${mod.address}`);
  }
  
  // Position Details
  if (result.positions.length > 0) {
    printSection(`LP Positions (${result.positions.length} found)`);
    
    const quickPositions = result.positions.filter(p => p.isQuickPair);
    const otherPositions = result.positions.filter(p => !p.isQuickPair);
    
    if (quickPositions.length > 0) {
      console.log("");
      console.log("  QUICK Pairs:");
      
      for (const pos of quickPositions) {
        const rangeStatus = pos.inRange ? "✅ IN RANGE" : "⚠️  OUT OF RANGE";
        console.log(`    Token #${pos.tokenId}`);
        console.log(`      Liquidity:  ${pos.liquidity.toString()}`);
        console.log(`      QUICK:      ${formatQuick(pos.quickAmount)} QUICK`);
        console.log(`      Tick Range: [${pos.tickLower}, ${pos.tickUpper}]`);
        console.log(`      Current:    ${pos.currentTick ?? "N/A"} ${rangeStatus}`);
        console.log("");
      }
      
      const totalQuickInLPs = quickPositions.reduce((sum, p) => sum + p.quickAmount, 0n);
      console.log(`  Total QUICK in LP positions: ${formatQuick(totalQuickInLPs)} QUICK`);
    }
    
    if (otherPositions.length > 0) {
      console.log("");
      console.log(`  Non-QUICK Pairs: ${otherPositions.length} positions (not counted)`);
    }
  }
  
  // Summary
  printSection("Summary");
  
  const algebraModule = result.modules.find(m => m.name === "algebraIntegral");
  const hasLPPositions = result.positions.some(p => p.isQuickPair);
  
  if (algebraModule && algebraModule.balance > 0n && hasLPPositions) {
    console.log("  ✅ LP positions are being counted correctly");
    console.log("");
    console.log("  ℹ️  Note: Concentrated liquidity positions show the CURRENT QUICK amount,");
    console.log("     not the originally deposited amount. This changes with price movement.");
  } else if (hasLPPositions && algebraModule?.balance === 0n) {
    console.log("  ⚠️  LP positions found but not counted!");
    console.log("     Check if the AlgebraIntegral module is configured correctly.");
  } else if (!hasLPPositions && algebraModule?.balance === 0n) {
    console.log("  ℹ️  No QUICK LP positions found for this user");
  }
  
  console.log("");
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const { user, chainKey } = parseArgs();
  const config = loadConfig();
  const chainConfig = config.chains[chainKey];
  
  if (!chainConfig) {
    console.error(`Chain "${chainKey}" not found in config. Available: ${Object.keys(config.chains).join(", ")}`);
    process.exit(1);
  }
  
  const client = createPublicClient({
    chain: getViemChain(chainKey),
    transport: http(chainConfig.defaultRpc),
  });
  
  const deployed = chainConfig.deployed;
  const aggregatorAddress = deployed.aggregator as Address;
  
  if (!aggregatorAddress) {
    console.error(`No aggregator deployed for ${chainKey}`);
    process.exit(1);
  }
  
  // Get total voting power
  const totalVotingPower = await client.readContract({
    address: aggregatorAddress,
    abi: ABI.balanceOf,
    functionName: "balanceOf",
    args: [user],
  });
  
  // Get module breakdown
  const modules = await getModuleBreakdown(client, aggregatorAddress, user, deployed);
  
  // Get position details (only for chains with NFT position manager)
  let positions: PositionInfo[] = [];
  
  if (chainConfig.contracts.nonfungiblePositionManager && chainConfig.contracts.factory) {
    positions = await getPositionDetails(
      client,
      chainConfig.contracts.nonfungiblePositionManager as Address,
      chainConfig.contracts.factory as Address,
      chainConfig.tokens.QUICK as Address,
      user
    );
  }
  
  const result: DiagnosisResult = {
    user,
    chain: chainConfig.name,
    totalVotingPower,
    modules,
    positions,
  };
  
  printResult(result);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
