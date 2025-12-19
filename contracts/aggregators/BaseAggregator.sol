// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "../modules/Ownable.sol";

/**
 * @title BaseAggregator
 * @notice Aggregates all QUICK voting power sources on Base
 * @dev Modules: WalletQuick, SyrupStaking, AlgebraIntegralV4, LiquidityManagers, V2LPStaking
 */
contract BaseAggregator is IVotingModule, Ownable {
    
    IVotingModule public walletQuickModule;
    IVotingModule public syrupStakingModule;
    IVotingModule public algebraIntegralModule;
    IVotingModule public liquidityManagersModule;
    IVotingModule public v2LPStakingModule;
    
    event ModuleUpdated(string name, address indexed module);
    
    constructor(
        address _owner,
        address _walletQuick,
        address _syrupStaking,
        address _algebraIntegral,
        address _liquidityManagers,
        address _v2LPStaking
    ) Ownable(_owner) {
        walletQuickModule = IVotingModule(_walletQuick);
        syrupStakingModule = IVotingModule(_syrupStaking);
        algebraIntegralModule = IVotingModule(_algebraIntegral);
        liquidityManagersModule = IVotingModule(_liquidityManagers);
        v2LPStakingModule = IVotingModule(_v2LPStaking);
    }
    
    // ===== Admin: Update individual modules =====
    
    function setWalletQuickModule(address module) external onlyOwner {
        walletQuickModule = IVotingModule(module);
        emit ModuleUpdated("WalletQuick", module);
    }
    
    function setSyrupStakingModule(address module) external onlyOwner {
        syrupStakingModule = IVotingModule(module);
        emit ModuleUpdated("SyrupStaking", module);
    }
    
    function setAlgebraIntegralModule(address module) external onlyOwner {
        algebraIntegralModule = IVotingModule(module);
        emit ModuleUpdated("AlgebraIntegral", module);
    }
    
    function setLiquidityManagersModule(address module) external onlyOwner {
        liquidityManagersModule = IVotingModule(module);
        emit ModuleUpdated("LiquidityManagers", module);
    }
    
    function setV2LPStakingModule(address module) external onlyOwner {
        v2LPStakingModule = IVotingModule(module);
        emit ModuleUpdated("V2LPStaking", module);
    }
    
    // ===== Scoring =====
    
    /// @inheritdoc IVotingModule
    /// @dev Sums all module balances. Zero address modules are skipped.
    function balanceOf(address account) external view override returns (uint256 total) {
        // Module 1: Wallet QUICK
        if (address(walletQuickModule) != address(0)) {
            total += _safeBalanceOf(walletQuickModule, account);
        }
        
        // Module 2: Syrup staking
        if (address(syrupStakingModule) != address(0)) {
            total += _safeBalanceOf(syrupStakingModule, account);
        }
        
        // Module 3: Algebra Integral positions
        if (address(algebraIntegralModule) != address(0)) {
            total += _safeBalanceOf(algebraIntegralModule, account);
        }
        
        // Module 4: ALM vaults (Gamma, Steer, ICHI)
        if (address(liquidityManagersModule) != address(0)) {
            total += _safeBalanceOf(liquidityManagersModule, account);
        }
        
        // Module 5: V2 LP staking
        if (address(v2LPStakingModule) != address(0)) {
            total += _safeBalanceOf(v2LPStakingModule, account);
        }
    }
    
    // ===== View: Module status =====
    
    /// @notice Returns which modules are configured (non-zero address)
    function getModuleStatus() external view returns (
        bool walletQuickActive,
        bool syrupStakingActive,
        bool algebraIntegralActive,
        bool liquidityManagersActive,
        bool v2LPStakingActive,
        uint256 activeCount
    ) {
        walletQuickActive = address(walletQuickModule) != address(0);
        syrupStakingActive = address(syrupStakingModule) != address(0);
        algebraIntegralActive = address(algebraIntegralModule) != address(0);
        liquidityManagersActive = address(liquidityManagersModule) != address(0);
        v2LPStakingActive = address(v2LPStakingModule) != address(0);
        
        if (walletQuickActive) activeCount++;
        if (syrupStakingActive) activeCount++;
        if (algebraIntegralActive) activeCount++;
        if (liquidityManagersActive) activeCount++;
        if (v2LPStakingActive) activeCount++;
    }
    
    /// @notice Returns all module addresses (zero if not configured)
    function getModuleAddresses() external view returns (
        address walletQuick,
        address syrupStaking,
        address algebraIntegral,
        address liquidityManagers,
        address v2LPStaking
    ) {
        walletQuick = address(walletQuickModule);
        syrupStaking = address(syrupStakingModule);
        algebraIntegral = address(algebraIntegralModule);
        liquidityManagers = address(liquidityManagersModule);
        v2LPStaking = address(v2LPStakingModule);
    }
    
    // ===== View: Get individual module scores =====
    
    function getModuleScores(address account) external view returns (
        uint256 walletQuick,
        uint256 syrupStaking,
        uint256 algebraIntegral,
        uint256 liquidityManagers,
        uint256 v2LPStaking,
        uint256 total
    ) {
        if (address(walletQuickModule) != address(0)) {
            walletQuick = _safeBalanceOf(walletQuickModule, account);
        }
        if (address(syrupStakingModule) != address(0)) {
            syrupStaking = _safeBalanceOf(syrupStakingModule, account);
        }
        if (address(algebraIntegralModule) != address(0)) {
            algebraIntegral = _safeBalanceOf(algebraIntegralModule, account);
        }
        if (address(liquidityManagersModule) != address(0)) {
            liquidityManagers = _safeBalanceOf(liquidityManagersModule, account);
        }
        if (address(v2LPStakingModule) != address(0)) {
            v2LPStaking = _safeBalanceOf(v2LPStakingModule, account);
        }
        total = walletQuick + syrupStaking + algebraIntegral + liquidityManagers + v2LPStaking;
    }
    
    // ===== Internal =====
    
    function _safeBalanceOf(IVotingModule module, address account) internal view returns (uint256) {
        try module.balanceOf(account) returns (uint256 bal) {
            return bal;
        } catch {
            return 0;
        }
    }
}

