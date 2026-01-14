/**
 * Syrup Staking ABIs (StakingRewardsFactory, StakingRewards)
 */
import { parseAbi } from "viem";

/** StakingRewardsFactory */
export const STAKING_REWARDS_FACTORY_ABI = parseAbi([
  "function rewardTokens(uint256 index) view returns (address)",
  "function stakingRewardsInfoByRewardToken(address) view returns (address stakingRewards, uint256 rewardAmount, uint256 duration)",
]);

/** StakingRewards pool */
export const STAKING_REWARDS_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function stakingToken() view returns (address)",
  "function rewardsToken() view returns (address)",
]);
