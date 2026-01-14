/**
 * Centralized ABI exports for scripts and tests
 * 
 * Usage (from scripts/):
 *   import { ERC20_ABI } from "../lib/abis/index.js";
 *   import { AGGREGATOR_ABI } from "../lib/abis/index.js";
 * 
 * Usage (from test/):
 *   import { BALANCE_OF_ABI } from "../lib/abis/index.js";
 *   import { NFT_POSITION_MANAGER_ABI } from "../lib/abis/index.js";
 */

// Common
export { ERC20_ABI, BALANCE_OF_ABI, DRAGON_LAIR_ABI } from "./common.js";

// Aggregators
export { AGGREGATOR_ABI, POLYGON_AGGREGATOR_ABI, BASE_AGGREGATOR_ABI } from "./aggregator.js";

// Algebra V3/V4
export { NFT_POSITION_MANAGER_ABI, ALGEBRA_POOL_ABI, ALGEBRA_FACTORY_ABI } from "./algebra.js";

// Syrup Staking
export { STAKING_REWARDS_FACTORY_ABI, STAKING_REWARDS_ABI } from "./syrup.js";
