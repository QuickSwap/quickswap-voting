// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";

/**
 * @title WalletQuickModule
 * @notice Counts only wallet QUICK balance (no dQUICK)
 * @dev For chains without Dragon's Lair (Base, Ethereum)
 * 
 * Compatible chains: Base, Ethereum, Manta
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

contract WalletQuickModule is IVotingModule {
    
    IERC20 public immutable QUICK;
    
    constructor(address _quick) {
        require(_quick != address(0), "ZERO_QUICK");
        QUICK = IERC20(_quick);
    }
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256) {
        return QUICK.balanceOf(account);
    }
}

