// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract MockSyrupFactory {
    address[] private _rewardTokens;

    struct Info {
        address stakingRewards;
        uint256 rewardAmount;
        uint256 duration;
    }

    mapping(address => Info) public infoByRewardToken;

    function addRewardToken(
        address rewardToken,
        address stakingRewards,
        uint256 rewardAmount,
        uint256 duration
    ) external {
        _rewardTokens.push(rewardToken);
        infoByRewardToken[rewardToken] = Info({
            stakingRewards: stakingRewards,
            rewardAmount: rewardAmount,
            duration: duration
        });
    }

    function rewardTokens(uint256 index) external view returns (address) {
        require(index < _rewardTokens.length, "OOB");
        return _rewardTokens[index];
    }

    function stakingRewardsInfoByRewardToken(address rewardToken)
        external
        view
        returns (address stakingRewards, uint256 rewardAmount, uint256 duration)
    {
        Info memory i = infoByRewardToken[rewardToken];
        return (i.stakingRewards, i.rewardAmount, i.duration);
    }
}

