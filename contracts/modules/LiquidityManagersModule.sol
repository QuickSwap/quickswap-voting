// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/IVotingModule.sol";
import "./Ownable.sol";

/**
 * @title LiquidityManagersModule
 * @notice Counts QUICK in ALM vaults (Gamma, Steer, ICHI)
 * @dev Allowlist can be set at deploy or updated later via addVault()/setVaults()
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IALMVault {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getTotalAmounts() external view returns (uint256 total0, uint256 total1);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract LiquidityManagersModule is IVotingModule, Ownable {
    
    uint256 public constant MAX_VAULTS = 100;
    
    address public immutable QUICK;
    
    address[] private _vaults;
    mapping(address => bool) public isVault;
    
    event VaultAdded(address indexed vault, uint256 newCount);
    event VaultRemoved(address indexed vault, uint256 newCount);
    event VaultsReplaced(uint256 oldCount, uint256 newCount);
    
    error VaultAlreadyExists();
    error VaultNotFound();
    error MaxVaultsReached();
    error DuplicateVault();
    error ZeroQuickAddress();
    
    constructor(
        address _owner,
        address _quick,
        address[] memory vaults_
    ) Ownable(_owner) {
        if (_quick == address(0)) revert ZeroQuickAddress();
        QUICK = _quick;
        
        uint256 len = vaults_.length;
        for (uint256 i; i < len;) {
            _addVaultUnchecked(vaults_[i]);
            unchecked { ++i; }
        }
    }
    
    // ===== Admin =====
    
    function addVault(address vault) external onlyOwner {
        if (vault == address(0)) revert ZeroAddress();
        if (isVault[vault]) revert VaultAlreadyExists();
        if (_vaults.length >= MAX_VAULTS) revert MaxVaultsReached();
        
        _vaults.push(vault);
        isVault[vault] = true;
        
        emit VaultAdded(vault, _vaults.length);
    }
    
    function removeVault(address vault) external onlyOwner {
        if (!isVault[vault]) revert VaultNotFound();
        
        uint256 length = _vaults.length;
        for (uint256 i; i < length;) {
            if (_vaults[i] == vault) {
                _vaults[i] = _vaults[length - 1];
                _vaults.pop();
                isVault[vault] = false;
                emit VaultRemoved(vault, _vaults.length);
                return;
            }
            unchecked { ++i; }
        }
    }
    
    function setVaults(address[] calldata vaults_) external onlyOwner {
        if (vaults_.length > MAX_VAULTS) revert MaxVaultsReached();
        
        uint256 oldCount = _vaults.length;
        
        for (uint256 i; i < oldCount;) {
            isVault[_vaults[i]] = false;
            unchecked { ++i; }
        }
        delete _vaults;
        
        uint256 newLen = vaults_.length;
        for (uint256 i; i < newLen;) {
            _addVaultUnchecked(vaults_[i]);
            unchecked { ++i; }
        }
        
        emit VaultsReplaced(oldCount, _vaults.length);
    }
    
    // ===== View =====
    
    function getVaults() external view returns (address[] memory) {
        return _vaults;
    }
    
    function vaultsLength() external view returns (uint256) {
        return _vaults.length;
    }
    
    function vaults(uint256 index) external view returns (address) {
        return _vaults[index];
    }
    
    // ===== Scoring =====
    
    /// @inheritdoc IVotingModule
    function balanceOf(address account) external view override returns (uint256 balance) {
        uint256 length = _vaults.length;
        for (uint256 i; i < length;) {
            balance += _quickFromVault(_vaults[i], account);
            unchecked { ++i; }
        }
    }
    
    // ===== Internal =====
    
    function _addVaultUnchecked(address vault) internal {
        if (vault == address(0)) revert ZeroAddress();
        if (isVault[vault]) revert DuplicateVault();
        if (_vaults.length >= MAX_VAULTS) revert MaxVaultsReached();
        
        _vaults.push(vault);
        isVault[vault] = true;
    }
    
    function _quickFromVault(address vault, address account) internal view returns (uint256) {
        try IALMVault(vault).balanceOf(account) returns (uint256 userShares) {
            if (userShares == 0) return 0;
            
            address token0 = IALMVault(vault).token0();
            address token1 = IALMVault(vault).token1();
            
            if (token0 != QUICK && token1 != QUICK) {
                return 0;
            }
            
            (uint256 total0, uint256 total1) = IALMVault(vault).getTotalAmounts();
            uint256 totalSupply = IALMVault(vault).totalSupply();
            
            if (totalSupply == 0) return 0;
            
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
