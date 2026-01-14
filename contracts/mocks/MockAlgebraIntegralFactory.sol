// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract MockAlgebraIntegralFactory {
    mapping(bytes32 => address) private _poolByPair;

    function _key(address a, address b) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(a, b));
    }

    function setPoolByPair(address tokenA, address tokenB, address pool) external {
        _poolByPair[_key(tokenA, tokenB)] = pool;
        _poolByPair[_key(tokenB, tokenA)] = pool;
    }

    function poolByPair(address tokenA, address tokenB) external view returns (address pool) {
        return _poolByPair[_key(tokenA, tokenB)];
    }
}

