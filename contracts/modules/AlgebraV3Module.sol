// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";

/**
 * @title AlgebraV3Module
 * @notice Counts QUICK in Algebra V3 liquidity positions
 * @dev Includes both wallet NFTs and FarmingCenter staked NFTs
 * 
 * Compatible chains: Polygon
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IAlgebraNFTPositionManager {
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function positions(uint256 tokenId) external view returns (
        uint96 nonce,
        address operator,
        address token0,
        address token1,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    );
}

interface IAlgebraFarmingCenter {
    function balanceOf(address account) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function l2Nfts(uint256) external view returns (uint96 nonce, address operator, uint256 tokenId);
}

interface IAlgebraPool {
    function liquidity() external view returns (uint128);
}

interface IPoolDeployer {
    function getPool(address tokenA, address tokenB) external view returns (address pool);
}

contract AlgebraV3Module is IVotingModule {
    
    /// @notice Max NFTs to enumerate per user (gas protection)
    uint256 public constant MAX_NFTS_PER_USER = 100;
    
    IERC20 public immutable QUICK;
    IAlgebraNFTPositionManager public immutable POSITION_MANAGER;
    IAlgebraFarmingCenter public immutable FARMING_CENTER;
    IPoolDeployer public immutable POOL_DEPLOYER;
    
    constructor(
        address _quick,
        address _positionManager,
        address _farmingCenter,
        address _poolDeployer
    ) {
        require(_quick != address(0), "ZERO_QUICK");
        require(_positionManager != address(0), "ZERO_POSITION_MANAGER");
        require(_farmingCenter != address(0), "ZERO_FARMING_CENTER");
        require(_poolDeployer != address(0), "ZERO_POOL_DEPLOYER");
        
        QUICK = IERC20(_quick);
        POSITION_MANAGER = IAlgebraNFTPositionManager(_positionManager);
        FARMING_CENTER = IAlgebraFarmingCenter(_farmingCenter);
        POOL_DEPLOYER = IPoolDeployer(_poolDeployer);
    }
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256 balance) {
        // 1. NFTs in wallet (bounded)
        uint256 walletNfts = POSITION_MANAGER.balanceOf(account);
        uint256 walletLimit = walletNfts > MAX_NFTS_PER_USER ? MAX_NFTS_PER_USER : walletNfts;
        for (uint256 i = 0; i < walletLimit; i++) {
            uint256 tokenId = POSITION_MANAGER.tokenOfOwnerByIndex(account, i);
            balance += _quickFromPosition(tokenId);
        }
        
        // 2. NFTs in FarmingCenter (bounded)
        uint256 farmingNfts = FARMING_CENTER.balanceOf(account);
        uint256 farmingLimit = farmingNfts > MAX_NFTS_PER_USER ? MAX_NFTS_PER_USER : farmingNfts;
        for (uint256 i = 0; i < farmingLimit; i++) {
            uint256 l2TokenId = FARMING_CENTER.tokenOfOwnerByIndex(account, i);
            (,, uint256 originalTokenId) = FARMING_CENTER.l2Nfts(l2TokenId);
            balance += _quickFromPosition(originalTokenId);
        }
    }
    
    // ===== Internal =====
    
    function _quickFromPosition(uint256 tokenId) internal view returns (uint256) {
        try POSITION_MANAGER.positions(tokenId) returns (
            uint96,
            address,
            address token0,
            address token1,
            int24,
            int24,
            uint128 liquidity,
            uint256,
            uint256,
            uint128,
            uint128
        ) {
            // Only QUICK pairs
            if (token0 != address(QUICK) && token1 != address(QUICK)) {
                return 0;
            }
            
            address pool = POOL_DEPLOYER.getPool(token0, token1);
            if (pool == address(0)) return 0;
            
            uint128 poolLiquidity = IAlgebraPool(pool).liquidity();
            if (poolLiquidity == 0) return 0;
            
            // User share = (position liquidity / pool liquidity) * pool QUICK
            uint256 poolQuick = QUICK.balanceOf(pool);
            return (uint256(liquidity) * poolQuick) / uint256(poolLiquidity);
            
        } catch {
            return 0;
        }
    }
}

