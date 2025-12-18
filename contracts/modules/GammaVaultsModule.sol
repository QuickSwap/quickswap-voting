// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "./Ownable.sol";

/**
 * @title GammaVaultsModule
 * @notice Counts QUICK in Gamma Hypervisor vaults
 * @dev Uses an admin-updatable allowlist of vault addresses
 * 
 * Compatible chains: Polygon, Base
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IGammaHypervisor {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getTotalAmounts() external view returns (uint256 total0, uint256 total1);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract GammaVaultsModule is IVotingModule, Ownable {
    
    /// @notice Max vaults to prevent oversized allowlist
    uint256 public constant MAX_VAULTS = 50;
    
    address public immutable QUICK;
    
    /// @notice Whitelisted Gamma vaults containing QUICK
    address[] public vaults;
    
    event VaultsUpdated(uint256 count);
    
    constructor(
        address _owner,
        address _quick,
        address[] memory _vaults
    ) Ownable(_owner) {
        require(_quick != address(0), "ZERO_QUICK");
        QUICK = _quick;
        vaults = _vaults;
    }
    
    // ===== Admin =====
    
    function setVaults(address[] calldata _vaults) external onlyOwner {
        require(_vaults.length <= MAX_VAULTS, "TOO_MANY_VAULTS");
        vaults = _vaults;
        emit VaultsUpdated(_vaults.length);
    }
    
    function vaultsLength() external view returns (uint256) {
        return vaults.length;
    }
    
    // ===== Scoring =====
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256 balance) {
        uint256 length = vaults.length;
        for (uint256 i = 0; i < length; i++) {
            balance += _quickFromVault(vaults[i], account);
        }
    }
    
    // ===== Internal =====
    
    function _quickFromVault(address vault, address account) internal view returns (uint256) {
        try IGammaHypervisor(vault).balanceOf(account) returns (uint256 userShares) {
            if (userShares == 0) return 0;
            
            address token0 = IGammaHypervisor(vault).token0();
            address token1 = IGammaHypervisor(vault).token1();
            
            // Only count vaults with QUICK
            if (token0 != QUICK && token1 != QUICK) {
                return 0;
            }
            
            (uint256 total0, uint256 total1) = IGammaHypervisor(vault).getTotalAmounts();
            uint256 totalSupply = IGammaHypervisor(vault).totalSupply();
            
            if (totalSupply == 0) return 0;
            
            // Calculate user's share of QUICK
            if (token0 == QUICK) {
                return (total0 * userShares) / totalSupply;
            } else {
                return (total1 * userShares) / totalSupply;
            }
            
        } catch {
            return 0;
        }
    }
}

