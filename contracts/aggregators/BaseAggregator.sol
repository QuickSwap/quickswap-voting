// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "../modules/Ownable.sol";

/**
 * @title BaseAggregator
 * @notice Aggregates all QUICK voting power sources on Base
 * @dev Composes multiple voting modules into a single balanceOf() call
 * 
 * Current modules:
 * 1. WalletQuick - wallet QUICK balance only (no dQUICK on Base)
 * 2. GammaVaults - Gamma hypervisor vaults (when available)
 * 3. V2LPStaking - V2 LP staking pools (when available)
 * 
 * Future modules:
 * - SyrupStaking (when factory deployed on Base)
 * - InsuranceVaults (future)
 */
contract BaseAggregator is IVotingModule, Ownable {
    
    IVotingModule public walletQuickModule;
    IVotingModule public gammaVaultsModule;
    IVotingModule public v2LPStakingModule;
    
    event ModuleUpdated(string name, address indexed module);
    
    constructor(
        address _owner,
        address _walletQuick,
        address _gammaVaults,
        address _v2LPStaking
    ) Ownable(_owner) {
        walletQuickModule = IVotingModule(_walletQuick);
        gammaVaultsModule = IVotingModule(_gammaVaults);
        v2LPStakingModule = IVotingModule(_v2LPStaking);
    }
    
    // ===== Admin: Update individual modules =====
    
    function setWalletQuickModule(address module) external onlyOwner {
        walletQuickModule = IVotingModule(module);
        emit ModuleUpdated("WalletQuick", module);
    }
    
    function setGammaVaultsModule(address module) external onlyOwner {
        gammaVaultsModule = IVotingModule(module);
        emit ModuleUpdated("GammaVaults", module);
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
        
        // Module 2: Gamma vaults
        if (address(gammaVaultsModule) != address(0)) {
            total += _safeBalanceOf(gammaVaultsModule, account);
        }
        
        // Module 3: V2 LP staking
        if (address(v2LPStakingModule) != address(0)) {
            total += _safeBalanceOf(v2LPStakingModule, account);
        }
    }
    
    // ===== View: Get individual module scores =====
    
    function getModuleScores(address account) external view returns (
        uint256 walletQuick,
        uint256 gammaVaults,
        uint256 v2LPStaking,
        uint256 total
    ) {
        if (address(walletQuickModule) != address(0)) {
            walletQuick = _safeBalanceOf(walletQuickModule, account);
        }
        if (address(gammaVaultsModule) != address(0)) {
            gammaVaults = _safeBalanceOf(gammaVaultsModule, account);
        }
        if (address(v2LPStakingModule) != address(0)) {
            v2LPStaking = _safeBalanceOf(v2LPStakingModule, account);
        }
        total = walletQuick + gammaVaults + v2LPStaking;
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

