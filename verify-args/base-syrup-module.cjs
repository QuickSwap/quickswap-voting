/**
 * Constructor arguments for SyrupStakingModule on Base
 * ISSUE with "[]" empty list
 * 
 * Usage:
 *   pnpm exec hardhat verify --network base \
 *     --constructor-args-path verify-args/base-syrup-module.js \
 *     <CONTRACT_ADDRESS>
 * 
 * Current deployed: 0x4e0acd3980a601821b9724586cd3da81cdc7f33a
 */
module.exports = [
  "0xDA1077c4b0dd6da1BDF166F30aa4BDbF517d637b",  // owner (Governance Safe)
  "0x4880c9ff216ae69Cb1Fc717575d824314Ed862a9",  // factory (StakingRewardsFactory)
  []                                              // legacyPools (empty array for Base)
];
