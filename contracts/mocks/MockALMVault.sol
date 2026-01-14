// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract MockALMVault {
    address public token0;
    address public token1;

    uint256 public total0;
    uint256 public total1;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function setTotals(uint256 _total0, uint256 _total1, uint256 _totalSupply) external {
        total0 = _total0;
        total1 = _total1;
        totalSupply = _totalSupply;
    }

    function setUserShares(address account, uint256 shares) external {
        balanceOf[account] = shares;
    }

    function getTotalAmounts() external view returns (uint256, uint256) {
        return (total0, total1);
    }
}

