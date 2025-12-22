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
 * 4. LiquidityManagers - ALM vaults (Gamma, Steer, ICHI)
 * 5. V2LPStaking - V2 LP staking pools
 * 
 * @custom:security-contact security@quickswap.exchange
 */
contract PolygonAggregator is IVotingModule, Ownable {
    
    // ═══════════════════════════════════════════════════════════════
    //                           CONSTANTS
    // ═══════════════════════════════════════════════════════════════
    
    /// @notice Contract version for verification
    string public constant VERSION = "1.0.0";
    
    // ═══════════════════════════════════════════════════════════════
    //                            STORAGE
    // ═══════════════════════════════════════════════════════════════
    
    IVotingModule public walletAndDQuickModule;
    IVotingModule public syrupStakingModule;
    IVotingModule public algebraV3Module;
    IVotingModule public liquidityManagersModule;
    IVotingModule public v2LPStakingModule;
    
    // ═══════════════════════════════════════════════════════════════
    //                            EVENTS
    // ═══════════════════════════════════════════════════════════════
    
    event ModuleUpdated(
        string indexed name, 
        address indexed oldModule, 
        address indexed newModule
    );
    
    // ═══════════════════════════════════════════════════════════════
    //                            ERRORS
    // ═══════════════════════════════════════════════════════════════
    
    error InvalidModule();
    
    // ═══════════════════════════════════════════════════════════════
    //                         CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @param _owner Multisig owner address
     * @param _walletAndDQuick WalletAndDQuickModule address
     * @param _syrupStaking SyrupStakingModule address
     * @param _algebraV3 AlgebraV3Module address
     * @param _liquidityManagers LiquidityManagersModule address
     * @param _v2LPStaking V2LPStakingModule address
     */
    constructor(
        address _owner,
        address _walletAndDQuick,
        address _syrupStaking,
        address _algebraV3,
        address _liquidityManagers,
        address _v2LPStaking
    ) Ownable(_owner) {
        walletAndDQuickModule = IVotingModule(_walletAndDQuick);
        syrupStakingModule = IVotingModule(_syrupStaking);
        algebraV3Module = IVotingModule(_algebraV3);
        liquidityManagersModule = IVotingModule(_liquidityManagers);
        v2LPStakingModule = IVotingModule(_v2LPStaking);
    }
    
    // ═══════════════════════════════════════════════════════════════
    //                      ADMIN: UPDATE MODULES
    // ═══════════════════════════════════════════════════════════════
    
    function setWalletAndDQuickModule(address module) external onlyOwner {
        _validateModule(module);
        address oldModule = address(walletAndDQuickModule);
        walletAndDQuickModule = IVotingModule(module);
        emit ModuleUpdated("WalletAndDQuick", oldModule, module);
    }
    
    function setSyrupStakingModule(address module) external onlyOwner {
        _validateModule(module);
        address oldModule = address(syrupStakingModule);
        syrupStakingModule = IVotingModule(module);
        emit ModuleUpdated("SyrupStaking", oldModule, module);
    }
    
    function setAlgebraV3Module(address module) external onlyOwner {
        _validateModule(module);
        address oldModule = address(algebraV3Module);
        algebraV3Module = IVotingModule(module);
        emit ModuleUpdated("AlgebraV3", oldModule, module);
    }
    
    function setLiquidityManagersModule(address module) external onlyOwner {
        _validateModule(module);
        address oldModule = address(liquidityManagersModule);
        liquidityManagersModule = IVotingModule(module);
        emit ModuleUpdated("LiquidityManagers", oldModule, module);
    }
    
    function setV2LPStakingModule(address module) external onlyOwner {
        _validateModule(module);
        address oldModule = address(v2LPStakingModule);
        v2LPStakingModule = IVotingModule(module);
        emit ModuleUpdated("V2LPStaking", oldModule, module);
    }
    
    // ═══════════════════════════════════════════════════════════════
    //                           SCORING
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @inheritdoc IVotingModule
     * @dev Sums all module balances. Zero address modules are skipped.
     */
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
        
        // Module 4: ALM vaults (Gamma, Steer, ICHI)
        if (address(liquidityManagersModule) != address(0)) {
            total += _safeBalanceOf(liquidityManagersModule, account);
        }
        
        // Module 5: V2 LP staking
        if (address(v2LPStakingModule) != address(0)) {
            total += _safeBalanceOf(v2LPStakingModule, account);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    //                      VIEW: MODULE SCORES
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @notice Get individual module scores for debugging/verification
     * @param account Address to query
     * @return walletAndDQuick Wallet + dQUICK balance
     * @return syrupStaking Syrup staking balance
     * @return algebraV3 Algebra V3 positions balance
     * @return liquidityManagers ALM vaults balance
     * @return v2LPStaking V2 LP staking balance
     * @return total Sum of all modules
     */
    function getModuleScores(address account) external view returns (
        uint256 walletAndDQuick,
        uint256 syrupStaking,
        uint256 algebraV3,
        uint256 liquidityManagers,
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
        if (address(liquidityManagersModule) != address(0)) {
            liquidityManagers = _safeBalanceOf(liquidityManagersModule, account);
        }
        if (address(v2LPStakingModule) != address(0)) {
            v2LPStaking = _safeBalanceOf(v2LPStakingModule, account);
        }
        total = walletAndDQuick + syrupStaking + algebraV3 + liquidityManagers + v2LPStaking;
    }
    
    /**
     * @notice Get all module addresses for verification
     */
    function getModuleAddresses() external view returns (
        address walletAndDQuick,
        address syrupStaking,
        address algebraV3,
        address liquidityManagers,
        address v2LPStaking
    ) {
        return (
            address(walletAndDQuickModule),
            address(syrupStakingModule),
            address(algebraV3Module),
            address(liquidityManagersModule),
            address(v2LPStakingModule)
        );
    }
    
    /// @notice Returns which modules are configured (non-zero address)
    function getModuleStatus() external view returns (
        bool walletAndDQuickActive,
        bool syrupStakingActive,
        bool algebraV3Active,
        bool liquidityManagersActive,
        bool v2LPStakingActive,
        uint256 activeCount
    ) {
        walletAndDQuickActive = address(walletAndDQuickModule) != address(0);
        syrupStakingActive = address(syrupStakingModule) != address(0);
        algebraV3Active = address(algebraV3Module) != address(0);
        liquidityManagersActive = address(liquidityManagersModule) != address(0);
        v2LPStakingActive = address(v2LPStakingModule) != address(0);
        
        if (walletAndDQuickActive) activeCount++;
        if (syrupStakingActive) activeCount++;
        if (algebraV3Active) activeCount++;
        if (liquidityManagersActive) activeCount++;
        if (v2LPStakingActive) activeCount++;
    }
    
    // ═══════════════════════════════════════════════════════════════
    //                          INTERNAL
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * @dev Validate module address before setting
     * @param module Module address (can be address(0) to disable)
     */
    function _validateModule(address module) internal view {
        if (module == address(0)) return; // address(0) is valid (disables module)
        
        // Check it's a contract
        if (module.code.length == 0) revert InvalidModule();
        
        // Check it implements IVotingModule (try calling balanceOf)
        try IVotingModule(module).balanceOf(address(0)) {} 
        catch {
            revert InvalidModule();
        }
    }
    
    /**
     * @dev Safe balance query that returns 0 on any error
     */
    function _safeBalanceOf(IVotingModule module, address account) internal view returns (uint256) {
        try module.balanceOf(account) returns (uint256 bal) {
            return bal;
        } catch {
            return 0;
        }
    }
}
