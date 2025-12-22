// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "./Ownable.sol";

/**
 * @title V2LPStakingModule
 * @notice Counts QUICK in staked V2 LP positions
 * @dev Allowlist can be set at deploy or updated later via addPool()/setPools()
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
    
    uint256 public constant MAX_POOLS = 50;
    
    address public immutable QUICK;
    
    address[] private _pools;
    mapping(address => bool) public isPool;
    
    event PoolAdded(address indexed pool, uint256 newCount);
    event PoolRemoved(address indexed pool, uint256 newCount);
    event PoolsReplaced(uint256 oldCount, uint256 newCount);
    
    error PoolAlreadyExists();
    error PoolNotFound();
    error MaxPoolsReached();
    error DuplicatePool();
    
    constructor(
        address _owner,
        address _quick,
        address[] memory pools_
    ) Ownable(_owner) {
        require(_quick != address(0), "ZERO_QUICK");
        QUICK = _quick;
        
        for (uint256 i = 0; i < pools_.length; i++) {
            _addPoolUnchecked(pools_[i]);
        }
    }
    
    // ===== Admin =====
    
    function addPool(address pool) external onlyOwner {
        if (pool == address(0)) revert ZeroAddress();
        if (isPool[pool]) revert PoolAlreadyExists();
        if (_pools.length >= MAX_POOLS) revert MaxPoolsReached();
        
        _pools.push(pool);
        isPool[pool] = true;
        
        emit PoolAdded(pool, _pools.length);
    }
    
    function removePool(address pool) external onlyOwner {
        if (!isPool[pool]) revert PoolNotFound();
        
        uint256 length = _pools.length;
        for (uint256 i = 0; i < length; i++) {
            if (_pools[i] == pool) {
                _pools[i] = _pools[length - 1];
                _pools.pop();
                isPool[pool] = false;
                emit PoolRemoved(pool, _pools.length);
                return;
            }
        }
    }
    
    function setPools(address[] calldata pools_) external onlyOwner {
        if (pools_.length > MAX_POOLS) revert MaxPoolsReached();
        
        uint256 oldCount = _pools.length;
        
        for (uint256 i = 0; i < oldCount; i++) {
            isPool[_pools[i]] = false;
        }
        delete _pools;
        
        for (uint256 i = 0; i < pools_.length; i++) {
            _addPoolUnchecked(pools_[i]);
        }
        
        emit PoolsReplaced(oldCount, _pools.length);
    }
    
    // ===== View =====
    
    function getPools() external view returns (address[] memory) {
        return _pools;
    }
    
    function poolsLength() external view returns (uint256) {
        return _pools.length;
    }
    
    function pools(uint256 index) external view returns (address) {
        return _pools[index];
    }
    
    // ===== Scoring =====
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256 balance) {
        uint256 length = _pools.length;
        for (uint256 i = 0; i < length; i++) {
            balance += _quickFromStaking(_pools[i], account);
        }
    }
    
    // ===== Internal =====
    
    function _addPoolUnchecked(address pool) internal {
        if (pool == address(0)) revert ZeroAddress();
        if (isPool[pool]) revert DuplicatePool();
        if (_pools.length >= MAX_POOLS) revert MaxPoolsReached();
        
        _pools.push(pool);
        isPool[pool] = true;
    }
    
    function _quickFromStaking(address pool, address account) internal view returns (uint256) {
        try IStakingRewards(pool).balanceOf(account) returns (uint256 stakedLp) {
            if (stakedLp == 0) return 0;
            
            address pair = IStakingRewards(pool).stakingToken();
            
            address token0 = IUniswapV2Pair(pair).token0();
            address token1 = IUniswapV2Pair(pair).token1();
            
            if (token0 != QUICK && token1 != QUICK) {
                return 0;
            }
            
            (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();
            uint256 totalSupply = IUniswapV2Pair(pair).totalSupply();
            
            if (totalSupply == 0) return 0;
            
            uint256 quickReserve = (token0 == QUICK) ? uint256(reserve0) : uint256(reserve1);
            return (stakedLp * quickReserve) / totalSupply;
            
        } catch {
            return 0;
        }
    }
}
