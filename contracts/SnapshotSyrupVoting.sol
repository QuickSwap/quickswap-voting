// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

/**
 * Snapshot syrup-pools voting power wrapper.
 *
 * Goal:
 * - Expose `balanceOf(address)` (18 decimals) for Snapshot strategy consumption.
 * - Sum staking balances across:
 *   - a configurable list of legacy pools (optional)
 *   - a staking-rewards factory that can grow over time (bounded loop)
 *
 * Design notes / best practices:
 * - All loops are bounded by `factoryMaxPools` / `legacyPools.length`.
 * - Uses low-level `staticcall` to avoid a single bad pool reverting the whole score.
 * - Admin controls are isolated; scoring is read-only.
 */

interface IStakingRewardsFactory {
  // Synthetix-style SRF: rewardTokens(i) reverts out-of-bounds
  function rewardTokens(uint256 index) external view returns (address);

  // `stakingRewardsInfoByRewardToken(rewardToken).stakingRewards`
  function stakingRewardsInfoByRewardToken(address rewardToken)
    external
    view
    returns (address stakingRewards, uint256 rewardAmount, uint256 duration);
}

interface IStakingRewardsLike {
  function balanceOf(address account) external view returns (uint256);
}

abstract contract Ownable {
  address public owner;

  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  modifier onlyOwner() {
    require(msg.sender == owner, "ONLY_OWNER");
    _;
  }

  constructor(address _owner) {
    require(_owner != address(0), "BAD_OWNER");
    owner = _owner;
    emit OwnershipTransferred(address(0), _owner);
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "BAD_OWNER");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }
}

contract SnapshotSyrupVoting is Ownable {
  // Optional: factory can be zero if you only want legacy pools.
  address public factory;

  // Hard upper bound for factory enumeration to prevent unbounded loops.
  uint256 public factoryMaxPools;

  // Optional legacy pools list (eg. 19 pools) - configurable.
  address[] public legacyPools;

  event FactoryUpdated(address indexed factory);
  event FactoryMaxPoolsUpdated(uint256 factoryMaxPools);
  event LegacyPoolsUpdated(uint256 count);

  constructor(
    address _owner,
    address _factory,
    uint256 _factoryMaxPools,
    address[] memory _legacyPools
  ) Ownable(_owner) {
    factory = _factory;
    factoryMaxPools = _factoryMaxPools;
    legacyPools = _legacyPools;
  }

  function setFactory(address _factory) external onlyOwner {
    factory = _factory;
    emit FactoryUpdated(_factory);
  }

  function setFactoryMaxPools(uint256 _factoryMaxPools) external onlyOwner {
    factoryMaxPools = _factoryMaxPools;
    emit FactoryMaxPoolsUpdated(_factoryMaxPools);
  }

  function setLegacyPools(address[] calldata pools) external onlyOwner {
    legacyPools = pools;
    emit LegacyPoolsUpdated(pools.length);
  }

  function legacyPoolsLength() external view returns (uint256) {
    return legacyPools.length;
  }

  function _safeBalanceOf(address pool, address account) internal view returns (uint256 bal) {
    // balanceOf(address) selector: 0x70a08231
    (bool ok, bytes memory data) = pool.staticcall(abi.encodeWithSelector(0x70a08231, account));
    if (!ok || data.length < 32) return 0;
    return abi.decode(data, (uint256));
  }

  function balanceOf(address account) external view returns (uint256 balance_) {
    // 1) legacy pools (explicit allowlist)
    uint256 legacyLen = legacyPools.length;
    for (uint256 i = 0; i < legacyLen; i++) {
      balance_ += _safeBalanceOf(legacyPools[i], account);
    }

    // 2) factory pools (bounded enumeration)
    address f = factory;
    uint256 max = factoryMaxPools;
    if (f == address(0) || max == 0) return balance_;

    for (uint256 i = 0; i < max; i++) {
      // rewardTokens(i) out-of-bounds => revert, so we stop.
      (bool okTok, bytes memory tokData) = f.staticcall(
        abi.encodeWithSelector(IStakingRewardsFactory.rewardTokens.selector, i)
      );
      if (!okTok || tokData.length < 32) break;
      address rewardToken = abi.decode(tokData, (address));

      // stakingRewardsInfoByRewardToken(rewardToken)
      (bool okInfo, bytes memory infoData) = f.staticcall(
        abi.encodeWithSelector(IStakingRewardsFactory.stakingRewardsInfoByRewardToken.selector, rewardToken)
      );
      if (!okInfo || infoData.length < 32) continue;

      // Decode as the (address,uint256,uint256) tuple (matches interface)
      (address stakingRewards,,) = abi.decode(infoData, (address, uint256, uint256));
      if (stakingRewards == address(0)) continue;

      balance_ += _safeBalanceOf(stakingRewards, account);
    }
  }
}


