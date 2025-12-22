/**
 * Reusable deployer functions for voting modules.
 */
import { type Address } from "viem";

const hre = await import("hardhat");
const viem = (hre as any).viem;

export interface DeployResult {
  address: Address;
  name: string;
  args: any[];
}

export async function deployWalletQuickModule(
  quick: Address
): Promise<DeployResult> {
  const contract = await viem.deployContract("WalletQuickModule", [quick]);
  return {
    address: contract.address,
    name: "WalletQuickModule",
    args: [quick],
  };
}

export async function deployWalletAndDQuickModule(
  quick: Address,
  dragonLair: Address
): Promise<DeployResult> {
  const contract = await viem.deployContract("WalletAndDQuickModule", [
    quick,
    dragonLair,
  ]);
  return {
    address: contract.address,
    name: "WalletAndDQuickModule",
    args: [quick, dragonLair],
  };
}

export async function deploySyrupStakingModule(
  owner: Address,
  factory: Address,
  legacyPools: Address[]
): Promise<DeployResult> {
  const contract = await viem.deployContract("SyrupStakingModule", [
    owner,
    factory,
    legacyPools,
  ]);
  return {
    address: contract.address,
    name: "SyrupStakingModule",
    args: [owner, factory, legacyPools],
  };
}

export async function deployAlgebraV3Module(
  quick: Address,
  positionManager: Address,
  farmingCenter: Address,
  poolDeployer: Address
): Promise<DeployResult> {
  const contract = await viem.deployContract("AlgebraV3Module", [
    quick,
    positionManager,
    farmingCenter,
    poolDeployer,
  ]);
  return {
    address: contract.address,
    name: "AlgebraV3Module",
    args: [quick, positionManager, farmingCenter, poolDeployer],
  };
}

export async function deployAlgebraIntegralV4Module(
  quick: Address,
  positionManager: Address,
  factory: Address
): Promise<DeployResult> {
  const contract = await viem.deployContract("AlgebraIntegralV4Module", [
    quick,
    positionManager,
    factory,
  ]);
  return {
    address: contract.address,
    name: "AlgebraIntegralV4Module",
    args: [quick, positionManager, factory],
  };
}

export async function deployLiquidityManagersModule(
  owner: Address,
  quick: Address,
  vaults: Address[]
): Promise<DeployResult> {
  const contract = await viem.deployContract("LiquidityManagersModule", [
    owner,
    quick,
    vaults,
  ]);
  return {
    address: contract.address,
    name: "LiquidityManagersModule",
    args: [owner, quick, vaults],
  };
}

export async function deployV2LPStakingModule(
  owner: Address,
  quick: Address,
  pools: Address[]
): Promise<DeployResult> {
  const contract = await viem.deployContract("V2LPStakingModule", [
    owner,
    quick,
    pools,
  ]);
  return {
    address: contract.address,
    name: "V2LPStakingModule",
    args: [owner, quick, pools],
  };
}

export async function deployPolygonAggregator(
  owner: Address,
  walletAndDQuick: Address,
  syrupStaking: Address,
  algebraV3: Address,
  liquidityManagers: Address,
  v2LPStaking: Address
): Promise<DeployResult> {
  const contract = await viem.deployContract("PolygonAggregator", [
    owner,
    walletAndDQuick,
    syrupStaking,
    algebraV3,
    liquidityManagers,
    v2LPStaking,
  ]);
  return {
    address: contract.address,
    name: "PolygonAggregator",
    args: [owner, walletAndDQuick, syrupStaking, algebraV3, liquidityManagers, v2LPStaking],
  };
}

export async function deployBaseAggregator(
  owner: Address,
  walletQuick: Address,
  syrupStaking: Address,
  algebraIntegral: Address,
  liquidityManagers: Address,
  v2LPStaking: Address
): Promise<DeployResult> {
  const contract = await viem.deployContract("BaseAggregator", [
    owner,
    walletQuick,
    syrupStaking,
    algebraIntegral,
    liquidityManagers,
    v2LPStaking,
  ]);
  return {
    address: contract.address,
    name: "BaseAggregator",
    args: [owner, walletQuick, syrupStaking, algebraIntegral, liquidityManagers, v2LPStaking],
  };
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

