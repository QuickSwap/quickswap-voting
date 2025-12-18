import 'dotenv/config';
import { defineConfig } from 'hardhat/config';
import hardhatViem from '@nomicfoundation/hardhat-viem';
import hardhatViemAssertions from '@nomicfoundation/hardhat-viem-assertions';
import hardhatNodeTestRunner from '@nomicfoundation/hardhat-node-test-runner';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';

// Note: For deployments, use scripts/utils/keystore.ts to load wallet from encrypted keystore
// The accounts array here is empty for read-only operations (tests, queries)
// Deploy scripts handle authentication via keystore prompt

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
      url: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
      chainId: 137,
    },
    ethereum: {
      type: 'http',
      chainType: 'l1',
      url: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
      chainId: 1,
    },
    base: {
      type: 'http',
      chainType: 'l1',
      url: process.env.BASE_RPC || 'https://mainnet.base.org',
      chainId: 8453,
    },
    manta: {
      type: 'http',
      chainType: 'l1',
      url: process.env.MANTA_RPC || 'https://pacific-rpc.manta.network/http',
      chainId: 169,
    }
  }
});
