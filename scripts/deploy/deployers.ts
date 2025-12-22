/**
 * Reusable deployer functions for voting modules.
 * Uses hardhat-viem helpers (attached to a network connection).
 */
import { type Address } from "viem";
import type { DeployContractConfig, HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";

export interface DeployResult {
  address: Address;
  name: string;
  args: any[];
}

export async function deployWalletQuickModule(
  viem: HardhatViemHelpers,
  quick: Address,
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract("WalletQuickModule", [quick], deployConfig);
  return {
    address: contract.address,
    name: "WalletQuickModule",
    args: [quick],
  };
}

export async function deployWalletAndDQuickModule(
  viem: HardhatViemHelpers,
  quick: Address,
  dragonLair: Address,
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract("WalletAndDQuickModule", [quick, dragonLair], deployConfig);
  return {
    address: contract.address,
    name: "WalletAndDQuickModule",
    args: [quick, dragonLair],
  };
}

export async function deploySyrupStakingModule(
  viem: HardhatViemHelpers,
  owner: Address,
  factory: Address,
  legacyPools: Address[],
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract("SyrupStakingModule", [owner, factory, legacyPools], deployConfig);
  return {
    address: contract.address,
    name: "SyrupStakingModule",
    args: [owner, factory, legacyPools],
  };
}

export async function deployAlgebraV3Module(
  viem: HardhatViemHelpers,
  quick: Address,
  positionManager: Address,
  farmingCenter: Address,
  poolDeployer: Address,
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract(
    "AlgebraV3Module",
    [quick, positionManager, farmingCenter, poolDeployer],
    deployConfig
  );
  return {
    address: contract.address,
    name: "AlgebraV3Module",
    args: [quick, positionManager, farmingCenter, poolDeployer],
  };
}

export async function deployAlgebraIntegralV4Module(
  viem: HardhatViemHelpers,
  quick: Address,
  positionManager: Address,
  factory: Address,
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract(
    "AlgebraIntegralV4Module",
    [quick, positionManager, factory],
    deployConfig
  );
  return {
    address: contract.address,
    name: "AlgebraIntegralV4Module",
    args: [quick, positionManager, factory],
  };
}

export async function deployLiquidityManagersModule(
  viem: HardhatViemHelpers,
  owner: Address,
  quick: Address,
  vaults: Address[],
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract("LiquidityManagersModule", [owner, quick, vaults], deployConfig);
  return {
    address: contract.address,
    name: "LiquidityManagersModule",
    args: [owner, quick, vaults],
  };
}

export async function deployV2LPStakingModule(
  viem: HardhatViemHelpers,
  owner: Address,
  quick: Address,
  pools: Address[],
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract("V2LPStakingModule", [owner, quick, pools], deployConfig);
  return {
    address: contract.address,
    name: "V2LPStakingModule",
    args: [owner, quick, pools],
  };
}

export async function deployPolygonAggregator(
  viem: HardhatViemHelpers,
  owner: Address,
  walletAndDQuick: Address,
  syrupStaking: Address,
  algebraV3: Address,
  liquidityManagers: Address,
  v2LPStaking: Address,
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract(
    "PolygonAggregator",
    [owner, walletAndDQuick, syrupStaking, algebraV3, liquidityManagers, v2LPStaking],
    deployConfig
  );
  return {
    address: contract.address,
    name: "PolygonAggregator",
    args: [owner, walletAndDQuick, syrupStaking, algebraV3, liquidityManagers, v2LPStaking],
  };
}

export async function deployBaseAggregator(
  viem: HardhatViemHelpers,
  owner: Address,
  walletQuick: Address,
  syrupStaking: Address,
  algebraIntegral: Address,
  liquidityManagers: Address,
  v2LPStaking: Address,
  deployConfig?: DeployContractConfig
): Promise<DeployResult> {
  const contract = await viem.deployContract(
    "BaseAggregator",
    [owner, walletQuick, syrupStaking, algebraIntegral, liquidityManagers, v2LPStaking],
    deployConfig
  );
  return {
    address: contract.address,
    name: "BaseAggregator",
    args: [owner, walletQuick, syrupStaking, algebraIntegral, liquidityManagers, v2LPStaking],
  };
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

