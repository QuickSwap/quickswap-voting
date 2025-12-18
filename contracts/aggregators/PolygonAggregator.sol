// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "../modules/Ownable.sol";

/**
 * @title PolygonAggregator
 * @notice Aggregates all QUICK voting power sources on Polygon
 * @dev Composes multiple voting modules into a single balanceOf() call
 * 
 * Modules:
 * 1. WalletAndDQuick - wallet QUICK + dQUICK (Dragon's Lair)
 * 2. SyrupStaking - syrup staking pools
 * 3. AlgebraV3 - Algebra V3 liquidity positions
 * 4. GammaVaults - Gamma hypervisor vaults
 * 5. V2LPStaking - V2 LP staking pools
 */
contract PolygonAggregator is IVotingModule, Ownable {
    
    IVotingModule public walletAndDQuickModule;
    IVotingModule public syrupStakingModule;
    IVotingModule public algebraV3Module;
    IVotingModule public gammaVaultsModule;
    IVotingModule public v2LPStakingModule;
    
    event ModuleUpdated(string name, address indexed module);
    
    constructor(
        address _owner,
        address _walletAndDQuick,
        address _syrupStaking,
        address _algebraV3,
        address _gammaVaults,
        address _v2LPStaking
    ) Ownable(_owner) {
        walletAndDQuickModule = IVotingModule(_walletAndDQuick);
        syrupStakingModule = IVotingModule(_syrupStaking);
        algebraV3Module = IVotingModule(_algebraV3);
        gammaVaultsModule = IVotingModule(_gammaVaults);
        v2LPStakingModule = IVotingModule(_v2LPStaking);
    }
    
    // ===== Admin: Update individual modules =====
    
    function setWalletAndDQuickModule(address module) external onlyOwner {
        walletAndDQuickModule = IVotingModule(module);
        emit ModuleUpdated("WalletAndDQuick", module);
    }
    
    function setSyrupStakingModule(address module) external onlyOwner {
        syrupStakingModule = IVotingModule(module);
        emit ModuleUpdated("SyrupStaking", module);
    }
    
    function setAlgebraV3Module(address module) external onlyOwner {
        algebraV3Module = IVotingModule(module);
        emit ModuleUpdated("AlgebraV3", module);
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
        // Module 1: Wallet QUICK + dQUICK
        if (address(walletAndDQuickModule) != address(0)) {
            total += _safeBalanceOf(walletAndDQuickModule, account);
        }
        
        // Module 2: Syrup staking
        if (address(syrupStakingModule) != address(0)) {
            total += _safeBalanceOf(syrupStakingModule, account);
        }
        
        // Module 3: Algebra V3 positions
        if (address(algebraV3Module) != address(0)) {
            total += _safeBalanceOf(algebraV3Module, account);
        }
        
        // Module 4: Gamma vaults
        if (address(gammaVaultsModule) != address(0)) {
            total += _safeBalanceOf(gammaVaultsModule, account);
        }
        
        // Module 5: V2 LP staking
        if (address(v2LPStakingModule) != address(0)) {
            total += _safeBalanceOf(v2LPStakingModule, account);
        }
    }
    
    // ===== View: Get individual module scores =====
    
    function getModuleScores(address account) external view returns (
        uint256 walletAndDQuick,
        uint256 syrupStaking,
        uint256 algebraV3,
        uint256 gammaVaults,
        uint256 v2LPStaking,
        uint256 total
    ) {
        if (address(walletAndDQuickModule) != address(0)) {
            walletAndDQuick = _safeBalanceOf(walletAndDQuickModule, account);
        }
        if (address(syrupStakingModule) != address(0)) {
            syrupStaking = _safeBalanceOf(syrupStakingModule, account);
        }
        if (address(algebraV3Module) != address(0)) {
            algebraV3 = _safeBalanceOf(algebraV3Module, account);
        }
        if (address(gammaVaultsModule) != address(0)) {
            gammaVaults = _safeBalanceOf(gammaVaultsModule, account);
        }
        if (address(v2LPStakingModule) != address(0)) {
            v2LPStaking = _safeBalanceOf(v2LPStakingModule, account);
        }
        total = walletAndDQuick + syrupStaking + algebraV3 + gammaVaults + v2LPStaking;
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

