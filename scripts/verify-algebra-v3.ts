/**
 * Verification script for AlgebraV3Module deployment
 * Shows exact values for documentation
 */
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { polygon } from "viem/chains";

const LEGACY_V3POOLS1 = "0x2fcb66504ea8ee541176662939ef0c53e95c4a19";
const NEW_ALGEBRA_V3 = "0xda047161ecb594af531751199bae733775175ce7";
const TEST_WALLET = "0x66Bf0d32cb0AC017f4629eE77895410a0b911Ef7";

const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function main() {
  const rpcUrl = process.env.POLYGON_RPC || "https://polygon-rpc.com";
  const client = createPublicClient({ chain: polygon, transport: http(rpcUrl) });
  
  const blockNumber = await client.getBlockNumber();
  console.log(`\n📊 AlgebraV3Module Verification @ block ${blockNumber}\n`);
  
  const [legacy, newModule] = await Promise.all([
    client.readContract({
      address: LEGACY_V3POOLS1,
      abi: BALANCE_ABI,
      functionName: "balanceOf",
      args: [TEST_WALLET],
      blockNumber,
    }),
    client.readContract({
      address: NEW_ALGEBRA_V3,
      abi: BALANCE_ABI,
      functionName: "balanceOf",
      args: [TEST_WALLET],
      blockNumber,
    }),
  ]);
  
  console.log(`Legacy V3Pools1:  ${formatUnits(legacy, 18)} QUICK`);
  console.log(`New AlgebraV3:    ${formatUnits(newModule, 18)} QUICK`);
  
  const diff = legacy > newModule ? legacy - newModule : newModule - legacy;
  const diffPct = Number(diff * 10000n / legacy) / 100;
  
  console.log(`\nDifference:       ${formatUnits(diff, 18)} QUICK (${diffPct}%)`);
  
  if (diffPct < 0.01) {
    console.log("Status:           ✅ EXACT PARITY (<0.01%)");
  } else if (diffPct < 1) {
    console.log("Status:           ✅ ACCEPTABLE (<1%)");
  } else {
    console.log("Status:           ❌ TOO LARGE (>1%)");
  }
  
  console.log("\n");
}

main().catch(console.error);

