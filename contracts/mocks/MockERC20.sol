// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract MockERC20 {
    mapping(address => uint256) public balanceOf;

    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }
}

