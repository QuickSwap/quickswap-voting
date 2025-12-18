// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

/**
 * @title IVotingModule
 * @notice Common interface for all voting power modules
 * @dev Each module implements balanceOf() returning QUICK voting power (18 decimals)
 */
interface IVotingModule {
    /// @notice Returns voting power for an account
    /// @param account The address to query
    /// @return Voting power in QUICK (18 decimals)
    function balanceOf(address account) external view returns (uint256);
}

