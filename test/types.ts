// Type definitions for test configuration

export interface BlockNumbers {
  polygon: number;
  base: number;
  ethereum: number;
}

export interface TestWallet {
  address: string;
  label: string;
  expectedSources?: {
    polygon?: string[];
    base?: string[];
    ethereum?: string[];
  };
}

export interface WrapperConfig {
  address: string;
  description: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcEnvVar: string;
  defaultRpc: string;
  tokens: {
    QUICK: string;
  };
  contracts: Record<string, string>;
  wrappers: Record<string, WrapperConfig>;
  // Optional legacy wrapper addresses (historical reference only)
  legacy?: Record<string, string>;
}

export interface ChainsConfig {
  polygon: ChainConfig;
  base: ChainConfig;
  ethereum: ChainConfig;
}

export interface BaselineScore {
  raw: string;
  formatted: string;
}

export interface WalletScores {
  voting8: BaselineScore;
  voting10: BaselineScore;
  v3Pools1: BaselineScore;
  total: BaselineScore;
}
