// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";

/**
 * @title AlgebraIntegralModule
 * @notice Counts QUICK in Algebra Integral (v4) liquidity positions
 * @dev Compatible with Base, Somnia, and future Algebra Integral deployments
 * 
 * Key differences from AlgebraV3Module:
 * - positions() returns `deployer` field (12 fields vs 11)
 * - Uses factory.poolByPair() instead of poolDeployer.getPool()
 * - FarmingCenter is integrated in PositionManager (tokenFarmedIn mapping)
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IAlgebraPositionManagerIntegral {
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    
    /// @notice Returns position data (Algebra Integral format with deployer field)
    function positions(uint256 tokenId) external view returns (
        uint88 nonce,
        address operator,
        address token0,
        address token1,
        address deployer,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    );
    
    /// @notice Returns the farming address where this token is deposited, or address(0)
    function tokenFarmedIn(uint256 tokenId) external view returns (address);
}

interface IAlgebraFactoryIntegral {
    /// @notice Returns the pool address for a given pair of tokens
    function poolByPair(address tokenA, address tokenB) external view returns (address pool);
}

interface IAlgebraPool {
    function liquidity() external view returns (uint128);
}

contract AlgebraIntegralModule is IVotingModule {
    
    /// @notice Max NFTs to enumerate per user (gas protection)
    uint256 public constant MAX_NFTS_PER_USER = 100;
    
    IERC20 public immutable QUICK;
    IAlgebraPositionManagerIntegral public immutable POSITION_MANAGER;
    IAlgebraFactoryIntegral public immutable FACTORY;
    
    constructor(
        address _quick,
        address _positionManager,
        address _factory
    ) {
        require(_quick != address(0), "ZERO_QUICK");
        require(_positionManager != address(0), "ZERO_POSITION_MANAGER");
        require(_factory != address(0), "ZERO_FACTORY");
        
        QUICK = IERC20(_quick);
        POSITION_MANAGER = IAlgebraPositionManagerIntegral(_positionManager);
        FACTORY = IAlgebraFactoryIntegral(_factory);
    }
    
    /// @inheritdoc IVotingModule
    /// @dev Counts QUICK in all NFT positions owned by account (wallet + farmed)
    function balanceOf(address account) external view override returns (uint256 balance) {
        uint256 nftCount = POSITION_MANAGER.balanceOf(account);
        uint256 limit = nftCount > MAX_NFTS_PER_USER ? MAX_NFTS_PER_USER : nftCount;
        
        for (uint256 i = 0; i < limit; i++) {
            uint256 tokenId = POSITION_MANAGER.tokenOfOwnerByIndex(account, i);
            balance += _quickFromPosition(tokenId);
        }
        
        // Note: In Algebra Integral, farmed NFTs remain in user's wallet
        // but are tracked via tokenFarmedIn mapping. The balanceOf above
        // already includes them since the user still owns the NFT.
    }
    
    // ===== Internal =====
    
    function _quickFromPosition(uint256 tokenId) internal view returns (uint256) {
        try POSITION_MANAGER.positions(tokenId) returns (
            uint88,          // nonce
            address,         // operator
            address token0,
            address token1,
            address,         // deployer (new in Integral)
            int24,           // tickLower
            int24,           // tickUpper
            uint128 liquidity,
            uint256,         // feeGrowthInside0LastX128
            uint256,         // feeGrowthInside1LastX128
            uint128,         // tokensOwed0
            uint128          // tokensOwed1
        ) {
            // Only count QUICK pairs
            if (token0 != address(QUICK) && token1 != address(QUICK)) {
                return 0;
            }
            
            if (liquidity == 0) return 0;
            
            // Get pool address from factory
            address pool = FACTORY.poolByPair(token0, token1);
            if (pool == address(0)) return 0;
            
            uint128 poolLiquidity = IAlgebraPool(pool).liquidity();
            if (poolLiquidity == 0) return 0;
            
            // User's share = (position liquidity / pool liquidity) * pool QUICK balance
            uint256 poolQuick = QUICK.balanceOf(pool);
            return (uint256(liquidity) * poolQuick) / uint256(poolLiquidity);
            
        } catch {
            return 0;
        }
    }
}

