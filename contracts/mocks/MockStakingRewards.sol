// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract MockStakingRewards {
    mapping(address => uint256) public balanceOf;

    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }
}

