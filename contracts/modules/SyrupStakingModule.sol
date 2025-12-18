// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "./Ownable.sol";

/**
 * @title SyrupStakingModule
 * @notice Counts QUICK staked in syrup pools
 * @dev Uses unbounded factory enumeration (like Voting10) + legacy allowlist
 * 
 * Compatible chains: Polygon
 */

interface IStakingRewardsFactory {
    function rewardTokens(uint256 index) external view returns (address);
    function stakingRewardsInfoByRewardToken(address rewardToken)
        external view returns (address stakingRewards, uint256 rewardAmount, uint256 duration);
}

contract SyrupStakingModule is IVotingModule, Ownable {
    
    /// @notice Max factory pools to enumerate (gas protection + alert threshold)
    uint256 public constant MAX_FACTORY_POOLS = 100;
    
    /// @notice Max legacy pools allowed
    uint256 public constant MAX_LEGACY_POOLS = 50;
    
    /// @notice Syrup factory for dynamic enumeration
    address public factory;
    
    /// @notice Legacy pools not in factory
    address[] public legacyPools;
    
    event FactoryUpdated(address indexed factory);
    event LegacyPoolsUpdated(uint256 count);
    
    constructor(
        address _owner,
        address _factory,
        address[] memory _legacyPools
    ) Ownable(_owner) {
        factory = _factory;
        legacyPools = _legacyPools;
    }
    
    // ===== Admin =====
    
    function setFactory(address _factory) external onlyOwner {
        factory = _factory;
        emit FactoryUpdated(_factory);
    }
    
    function setLegacyPools(address[] calldata pools) external onlyOwner {
        require(pools.length <= MAX_LEGACY_POOLS, "TOO_MANY_LEGACY_POOLS");
        legacyPools = pools;
        emit LegacyPoolsUpdated(pools.length);
    }
    
    function legacyPoolsLength() external view returns (uint256) {
        return legacyPools.length;
    }
    
    // ===== Scoring =====
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256 balance) {
        // 1. Legacy pools (allowlist)
        uint256 legacyLen = legacyPools.length;
        for (uint256 i = 0; i < legacyLen; i++) {
            balance += _safeBalanceOf(legacyPools[i], account);
        }
        
        // 2. Factory pools (bounded enumeration)
        address f = factory;
        if (f == address(0)) return balance;
        
        for (uint256 i = 0; i < MAX_FACTORY_POOLS; i++) {
            (bool okTok, bytes memory tokData) = f.staticcall(
                abi.encodeWithSelector(IStakingRewardsFactory.rewardTokens.selector, i)
            );
            if (!okTok || tokData.length < 32) break;
            
            address rewardToken = abi.decode(tokData, (address));
            
            (bool okInfo, bytes memory infoData) = f.staticcall(
                abi.encodeWithSelector(
                    IStakingRewardsFactory.stakingRewardsInfoByRewardToken.selector,
                    rewardToken
                )
            );
            if (!okInfo || infoData.length < 32) continue;
            
            (address stakingRewards,,) = abi.decode(infoData, (address, uint256, uint256));
            if (stakingRewards == address(0)) continue;
            
            balance += _safeBalanceOf(stakingRewards, account);
        }
    }
    
    // ===== Monitoring =====
    
    /// @notice Returns factory pool count and alert status
    /// @dev Use this for monitoring/alerting when approaching limit
    function getFactoryStatus() external view returns (
        uint256 currentCount,
        uint256 maxCount,
        bool nearLimit
    ) {
        maxCount = MAX_FACTORY_POOLS;
        address f = factory;
        if (f == address(0)) return (0, maxCount, false);
        
        for (uint256 i = 0; i < MAX_FACTORY_POOLS + 10; i++) {
            (bool ok,) = f.staticcall(
                abi.encodeWithSelector(IStakingRewardsFactory.rewardTokens.selector, i)
            );
            if (!ok) {
                currentCount = i;
                break;
            }
        }
        nearLimit = currentCount >= MAX_FACTORY_POOLS - 10;
    }
    
    // ===== Internal =====
    
    function _safeBalanceOf(address token, address account) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(
            abi.encodeWithSelector(0x70a08231, account) // balanceOf(address)
        );
        if (!ok || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }
}

