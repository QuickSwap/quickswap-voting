import 'dotenv/config';
import { defineConfig } from 'hardhat/config';
import hardhatViem from '@nomicfoundation/hardhat-viem';
import hardhatViemAssertions from '@nomicfoundation/hardhat-viem-assertions';
import hardhatNodeTestRunner from '@nomicfoundation/hardhat-node-test-runner';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';

function getAccounts(): string[] {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) return [];
  return [pk.startsWith('0x') ? pk : `0x${pk}`];
}

export default defineConfig({
  plugins: [
    hardhatViem,
    hardhatViemAssertions,
    hardhatNodeTestRunner,
    hardhatNetworkHelpers,
  ],
  solidity: {
    version: '0.8.11',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    tests: {
      nodejs: './test'
    }
  },
  networks: {
    polygon: {
      type: 'http',
      chainType: 'l1',
      url: process.env.POLYGON_RPC || process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      chainId: 137,
      accounts: getAccounts()
    },
    ethereum: {
      type: 'http',
      chainType: 'l1',
      url: process.env.ETH_RPC || process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      chainId: 1,
      accounts: getAccounts()
    },
    base: {
      type: 'http',
      chainType: 'l1',
      url: process.env.BASE_RPC || process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      chainId: 8453,
      accounts: getAccounts()
    },
    manta: {
      type: 'http',
      chainType: 'l1',
      url: process.env.MANTA_RPC || process.env.MANTA_RPC_URL || 'https://pacific-rpc.manta.network/http',
      chainId: 169,
      accounts: getAccounts()
    }
  }
});
