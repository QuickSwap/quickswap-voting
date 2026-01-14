// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract MockAlgebraIntegralPositionManager {
    struct Position {
        uint88 nonce;
        address operator;
        address token0;
        address token1;
        address deployer;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    mapping(uint256 => Position) private _positions;
    mapping(address => uint256[]) private _owned;

    function mintPosition(address owner, uint256 tokenId, Position calldata p) external {
        _positions[tokenId] = p;
        _owned[owner].push(tokenId);
    }

    function balanceOf(address owner) external view returns (uint256) {
        return _owned[owner].length;
    }

    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256) {
        return _owned[owner][index];
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
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
        )
    {
        Position memory p = _positions[tokenId];
        return (
            p.nonce,
            p.operator,
            p.token0,
            p.token1,
            p.deployer,
            p.tickLower,
            p.tickUpper,
            p.liquidity,
            p.feeGrowthInside0LastX128,
            p.feeGrowthInside1LastX128,
            p.tokensOwed0,
            p.tokensOwed1
        );
    }
}

