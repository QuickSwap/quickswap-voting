// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";

/**
 * @title AlgebraIntegralV4Module
 * @notice Counts QUICK in Algebra Integral v4 liquidity positions
 * @dev Compatible with Base, Somnia, and future Algebra v4 deployments
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
}

interface IAlgebraFactoryIntegral {
    function poolByPair(address tokenA, address tokenB) external view returns (address pool);
}

interface IAlgebraPoolIntegral {
    function globalState() external view returns (
        uint160 price,
        int24 tick,
        uint16 fee,
        uint8 pluginConfig,
        uint16 communityFee,
        bool unlocked
    );
}

contract AlgebraIntegralV4Module is IVotingModule {
    
    /// @notice Max NFTs to enumerate per user (gas protection)
    uint256 public constant MAX_NFTS_PER_USER = 100;
    
    address public immutable QUICK;
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
        
        QUICK = _quick;
        POSITION_MANAGER = IAlgebraPositionManagerIntegral(_positionManager);
        FACTORY = IAlgebraFactoryIntegral(_factory);
    }
    
    /// @inheritdoc IVotingModule
    /// @dev Counts QUICK in all NFT positions owned by account
    function balanceOf(address account) external view override returns (uint256 balance) {
        uint256 nftCount = POSITION_MANAGER.balanceOf(account);
        uint256 limit = nftCount > MAX_NFTS_PER_USER ? MAX_NFTS_PER_USER : nftCount;
        
        for (uint256 i; i < limit;) {
            balance += _quickFromPosition(POSITION_MANAGER.tokenOfOwnerByIndex(account, i));
            unchecked { ++i; }
        }
    }
    
    // ===== Internal =====
    
    /// @dev Struct to avoid stack too deep
    struct PositionData {
        address token0;
        address token1;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        bool isQuick0;
    }
    
    function _quickFromPosition(uint256 tokenId) internal view returns (uint256) {
        PositionData memory pos = _getPositionData(tokenId);
        if (pos.liquidity == 0) return 0;
        
        // Get pool and current price
        address pool = FACTORY.poolByPair(pos.token0, pos.token1);
        if (pool == address(0)) return 0;
        
        return _calculateQuickAmount(pool, pos);
    }
    
    function _getPositionData(uint256 tokenId) internal view returns (PositionData memory pos) {
        try POSITION_MANAGER.positions(tokenId) returns (
            uint88,          // nonce
            address,         // operator
            address token0,
            address token1,
            address,         // deployer
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256,         // feeGrowthInside0LastX128
            uint256,         // feeGrowthInside1LastX128
            uint128,         // tokensOwed0
            uint128          // tokensOwed1
        ) {
            bool isQuick0 = token0 == QUICK;
            if (!isQuick0 && token1 != QUICK) {
                return pos; // Not a QUICK pair, return empty
            }
            
            pos.token0 = token0;
            pos.token1 = token1;
            pos.tickLower = tickLower;
            pos.tickUpper = tickUpper;
            pos.liquidity = liquidity;
            pos.isQuick0 = isQuick0;
        } catch {
            // Return empty pos with liquidity = 0
        }
    }
    
    function _calculateQuickAmount(address pool, PositionData memory pos) internal view returns (uint256) {
        try IAlgebraPoolIntegral(pool).globalState() returns (
            uint160 sqrtPriceX96,
            int24,   // tick
            uint16,  // fee
            uint8,   // pluginConfig
            uint16,  // communityFee
            bool     // unlocked
        ) {
            if (sqrtPriceX96 == 0) return 0;
            
            // Calculate actual token amounts using V3 math
            (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity(
                sqrtPriceX96,
                _getSqrtRatioAtTick(pos.tickLower),
                _getSqrtRatioAtTick(pos.tickUpper),
                pos.liquidity
            );
            
            return pos.isQuick0 ? amount0 : amount1;
        } catch {
            return 0;
        }
    }
    
    /// @dev Calculate sqrt(1.0001^tick) * 2^96
    function _getSqrtRatioAtTick(int24 tick) internal pure returns (uint160) {
        unchecked {
            uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
            require(absTick <= 887272, "T");
            
            uint256 ratio = (absTick & 0x1) != 0 
                ? 0xfffcb933bd6fad37aa2d162d1a594001 
                : 0x100000000000000000000000000000000;
            
            if ((absTick & 0x2) != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
            if ((absTick & 0x4) != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if ((absTick & 0x8) != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if ((absTick & 0x10) != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if ((absTick & 0x20) != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if ((absTick & 0x40) != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if ((absTick & 0x80) != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if ((absTick & 0x100) != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if ((absTick & 0x200) != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if ((absTick & 0x400) != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if ((absTick & 0x800) != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if ((absTick & 0x1000) != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if ((absTick & 0x2000) != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if ((absTick & 0x4000) != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if ((absTick & 0x8000) != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if ((absTick & 0x10000) != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if ((absTick & 0x20000) != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if ((absTick & 0x40000) != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if ((absTick & 0x80000) != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
            
            if (tick > 0) ratio = type(uint256).max / ratio;
            return uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
        }
    }
    
    /// @dev Calculate token amounts for a liquidity position
    function _getAmountsForLiquidity(
        uint160 sqrtRatioX96,
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        unchecked {
            // Ensure A < B
            if (sqrtRatioAX96 > sqrtRatioBX96) {
                (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);
            }
            
            if (sqrtRatioX96 <= sqrtRatioAX96) {
                // Current price below range: position is 100% token0
                amount0 = _mulDiv(uint256(liquidity) << 96, sqrtRatioBX96 - sqrtRatioAX96, sqrtRatioBX96) / sqrtRatioAX96;
            } else if (sqrtRatioX96 < sqrtRatioBX96) {
                // Current price in range: position has both tokens
                amount0 = _mulDiv(uint256(liquidity) << 96, sqrtRatioBX96 - sqrtRatioX96, sqrtRatioBX96) / sqrtRatioX96;
                amount1 = _mulDiv(liquidity, sqrtRatioX96 - sqrtRatioAX96, 0x1000000000000000000000000);
            } else {
                // Current price above range: position is 100% token1
                amount1 = _mulDiv(liquidity, sqrtRatioBX96 - sqrtRatioAX96, 0x1000000000000000000000000);
            }
        }
    }
    
    /// @dev Full precision multiplication followed by division
    function _mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        uint256 prod0;
        uint256 prod1;
        assembly {
            let mm := mulmod(a, b, not(0))
            prod0 := mul(a, b)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }
        require(denominator > prod1, "OVERFLOW");
        
        if (prod1 == 0) {
            assembly { result := div(prod0, denominator) }
            return result;
        }
        
        uint256 remainder;
        assembly {
            remainder := mulmod(a, b, denominator)
            prod1 := sub(prod1, gt(remainder, prod0))
            prod0 := sub(prod0, remainder)
        }
        
        unchecked {
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            
            result = prod0 * inv;
        }
    }
}
