/**
 * Test all Snapshot strategies before applying changes
 * 
 * Run: pnpm exec tsx scripts/test-strategies.ts
 * 
 * Optional: TEST_ADDRESS=0x... pnpm exec tsx scripts/test-strategies.ts
 */
import { createPublicClient, http, parseAbi, formatEther, Address } from 'viem';
import { polygon, mainnet, base } from 'viem/chains';

const TEST_USER = (process.env.TEST_ADDRESS || '0x1f8d2668baab2b324f61fcf34730be8e79e8eccf') as Address;

const abi = parseAbi(['function balanceOf(address) view returns (uint256)']);

const strategies = [
  { 
    name: 'Polygon Aggregator', 
    network: 'polygon (137)',
    chain: polygon, 
    rpc: 'https://polygon-rpc.com', 
    addr: '0x3fe6dd5156e688c637d0701855b890544568b348' as Address
  },
  { 
    name: 'Ethereum WalletQuick', 
    network: 'ethereum (1)',
    chain: mainnet, 
    rpc: 'https://eth.llamarpc.com', 
    addr: '0x76ca31488f2ac0681299fb15509a57090d393764' as Address
  },
  { 
    name: 'Base Aggregator', 
    network: 'base (8453)',
    chain: base, 
    rpc: 'https://mainnet.base.org', 
    addr: '0x9975bc2fa6590620aeee87bd7e7e4bec0001095c' as Address
  },
];

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           Test Snapshot Strategies                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Test address:', TEST_USER);
  console.log('');

  let totalVotingPower = 0n;

  for (const s of strategies) {
    const client = createPublicClient({ chain: s.chain, transport: http(s.rpc) });
    
    try {
      const balance = await client.readContract({ 
        address: s.addr, 
        abi, 
        functionName: 'balanceOf', 
        args: [TEST_USER] 
      });
      
      const formatted = formatEther(balance);
      totalVotingPower += balance;
      
      console.log(`✅ ${s.name}`);
      console.log(`   Network:  ${s.network}`);
      console.log(`   Contract: ${s.addr}`);
      console.log(`   Balance:  ${formatted} QUICK`);
      console.log('');
    } catch (e: any) {
      console.log(`❌ ${s.name}`);
      console.log(`   Network:  ${s.network}`);
      console.log(`   Contract: ${s.addr}`);
      console.log(`   Error:    ${e.shortMessage || e.message.slice(0, 80)}`);
      console.log('');
    }
  }

  console.log('─'.repeat(50));
  console.log(`Total Voting Power: ${formatEther(totalVotingPower)} QUICK`);
  console.log('');

  console.log('📋 To test in Snapshot Playground:');
  console.log('   https://snapshot.org/#/playground/erc20-balance-of');
  console.log('');
  console.log('   Enter each contract address with its network to verify.');
}

main().catch(console.error);
