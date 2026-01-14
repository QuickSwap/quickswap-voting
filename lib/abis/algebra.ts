/**
 * Algebra V3 / Integral V4 ABIs
 */
import { parseAbi } from "viem";

/** NFT Position Manager (shared by V3 and Integral V4) */
export const NFT_POSITION_MANAGER_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
  "function positions(uint256) view returns (uint88 nonce, address operator, address token0, address token1, address deployer, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

/** Algebra Pool globalState */
export const ALGEBRA_POOL_ABI = parseAbi([
  "function liquidity() view returns (uint128)",
  "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
]);

/** Algebra Factory poolByPair */
export const ALGEBRA_FACTORY_ABI = parseAbi([
  "function poolByPair(address, address) view returns (address)",
]);
