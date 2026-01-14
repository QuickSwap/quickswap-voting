/**
 * Aggregator contract ABIs (PolygonAggregator, BaseAggregator)
 */
import { parseAbi } from "viem";

/** Common aggregator functions */
export const AGGREGATOR_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function getModuleScores(address) view returns (uint256, uint256, uint256, uint256, uint256, uint256)",
]);

/** PolygonAggregator.getModuleAddresses() */
export const POLYGON_AGGREGATOR_ABI = parseAbi([
  "function getModuleAddresses() view returns (address walletAndDQuick, address syrupStaking, address algebraV3, address liquidityManagers, address v2LPStaking)",
]);

/** BaseAggregator.getModuleAddresses() */
export const BASE_AGGREGATOR_ABI = parseAbi([
  "function getModuleAddresses() view returns (address walletQuick, address syrupStaking, address algebraIntegral, address liquidityManagers, address v2LPStaking)",
]);
