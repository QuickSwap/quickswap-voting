// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "./Ownable.sol";

/**
 * @title V2LPStakingModule
 * @notice Counts QUICK in staked V2 LP positions
 * @dev Uses an admin-updatable allowlist of staking pool addresses
 * 
 * Compatible chains: Polygon, Base
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IStakingRewards {
    function stakingToken() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function totalSupply() external view returns (uint256);
}

contract V2LPStakingModule is IVotingModule, Ownable {
    
    /// @notice Max staking pools to prevent oversized allowlist
    uint256 public constant MAX_POOLS = 50;
    
    address public immutable QUICK;
    
    /// @notice Whitelisted V2 staking pools (StakingRewards contracts)
    address[] public stakingPools;
    
    event StakingPoolsUpdated(uint256 count);
    
    constructor(
        address _owner,
        address _quick,
        address[] memory _stakingPools
    ) Ownable(_owner) {
        require(_quick != address(0), "ZERO_QUICK");
        QUICK = _quick;
        stakingPools = _stakingPools;
    }
    
    // ===== Admin =====
    
    function setStakingPools(address[] calldata pools) external onlyOwner {
        require(pools.length <= MAX_POOLS, "TOO_MANY_POOLS");
        stakingPools = pools;
        emit StakingPoolsUpdated(pools.length);
    }
    
    function stakingPoolsLength() external view returns (uint256) {
        return stakingPools.length;
    }
    
    // ===== Scoring =====
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256 balance) {
        uint256 length = stakingPools.length;
        for (uint256 i = 0; i < length; i++) {
            balance += _quickFromStaking(stakingPools[i], account);
        }
    }
    
    // ===== Internal =====
    
    function _quickFromStaking(address stakingPool, address account) internal view returns (uint256) {
        try IStakingRewards(stakingPool).balanceOf(account) returns (uint256 stakedLp) {
            if (stakedLp == 0) return 0;
            
            address pair = IStakingRewards(stakingPool).stakingToken();
            
            address token0 = IUniswapV2Pair(pair).token0();
            address token1 = IUniswapV2Pair(pair).token1();
            
            // Only count pairs with QUICK
            if (token0 != QUICK && token1 != QUICK) {
                return 0;
            }
            
            (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();
            uint256 totalSupply = IUniswapV2Pair(pair).totalSupply();
            
            if (totalSupply == 0) return 0;
            
            // Calculate QUICK share: (staked LP / total LP) * QUICK reserve
            uint256 quickReserve = (token0 == QUICK) ? uint256(reserve0) : uint256(reserve1);
            return (stakedLp * quickReserve) / totalSupply;
            
        } catch {
            return 0;
        }
    }
}

