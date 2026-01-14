// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract MockAlgebraIntegralPool {
    uint160 public price;
    int24 public tick;
    uint16 public fee;
    uint8 public pluginConfig;
    uint16 public communityFee;
    bool public unlocked;

    function setGlobalState(
        uint160 _price,
        int24 _tick,
        uint16 _fee,
        uint8 _pluginConfig,
        uint16 _communityFee,
        bool _unlocked
    ) external {
        price = _price;
        tick = _tick;
        fee = _fee;
        pluginConfig = _pluginConfig;
        communityFee = _communityFee;
        unlocked = _unlocked;
    }

    function globalState()
        external
        view
        returns (uint160, int24, uint16, uint8, uint16, bool)
    {
        return (price, tick, fee, pluginConfig, communityFee, unlocked);
    }
}

