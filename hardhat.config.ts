import 'dotenv/config';
import { defineConfig } from 'hardhat/config';
import hardhatViem from '@nomicfoundation/hardhat-viem';
import hardhatViemAssertions from '@nomicfoundation/hardhat-viem-assertions';
import hardhatVerify from '@nomicfoundation/hardhat-verify';
import hardhatNodeTestRunner from '@nomicfoundation/hardhat-node-test-runner';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';

// Note: For deployments, use scripts/utils/keystore.ts to load wallet from encrypted keystore
// The accounts array here is empty for read-only operations (tests, queries)
// Deploy scripts handle authentication via keystore prompt

export default defineConfig({
  plugins: [
    hardhatViem,
    hardhatViemAssertions,
    hardhatVerify,
    hardhatNodeTestRunner,
    hardhatNetworkHelpers,
  ],
  verify: {
    // hardhat-verify uses Etherscan API v2 (single key works across chains).
    // Keep backward-compat with existing env vars.
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || process.env.POLYGONSCAN_API_KEY || "",
    },
  },
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
      type: 'http' as const,
      url: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
      chainId: 137,
    },
    ethereum: {
      type: 'http' as const,
      url: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
      chainId: 1,
    },
    base: {
      type: 'http' as const,
      url: process.env.BASE_RPC || 'https://mainnet.base.org',
      chainId: 8453,
    },
    manta: {
      type: 'http' as const,
      url: process.env.MANTA_RPC || 'https://pacific-rpc.manta.network/http',
      chainId: 169,
    }
  }
});
