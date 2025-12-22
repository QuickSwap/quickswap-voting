// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";

/**
 * @title WalletAndDQuickModule
 * @notice Counts wallet QUICK balance + dQUICK (Dragon's Lair) staked balance
 * @dev Equivalent to QuickswapVoting8 logic
 * 
 * Compatible chains: Polygon
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IDragonLair {
    /// @notice Returns QUICK equivalent for user's dQUICK balance
    function QUICKBalance(address account) external view returns (uint256);
}

contract WalletAndDQuickModule is IVotingModule {
    
    IERC20 public immutable QUICK;
    IDragonLair public immutable DRAGON_LAIR;
    
    constructor(address _quick, address _dragonLair) {
        require(_quick != address(0), "ZERO_QUICK");
        require(_dragonLair != address(0), "ZERO_DRAGON_LAIR");
        
        QUICK = IERC20(_quick);
        DRAGON_LAIR = IDragonLair(_dragonLair);
    }
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256) {
        uint256 walletBalance = QUICK.balanceOf(account);
        uint256 dQuickAsQuick = DRAGON_LAIR.QUICKBalance(account);
        return walletBalance + dQuickAsQuick;
    }
}

