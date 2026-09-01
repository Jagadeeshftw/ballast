// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

/// @notice Minimal stand-in for HedgeEngine: does it subscribe, and what gates it?
contract HandlerProbe is SomniaEventHandler {
    uint256 public activeSubscriptionId;
    uint256 public callCount;
    address public lastEmitter;
    bytes32 public lastTopic0;

    event Fired(address emitter, bytes32 topic0, uint256 n);

    receive() external payable {}

    function subscribeTo(address emitter, bytes32 topic0) external returns (uint256 id) {
        SomniaExtensions.SubscriptionFilter memory f = SomniaExtensions.SubscriptionFilter({
            eventTopics: [topic0, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: emitter
        });
        id = SomniaExtensions.subscribe(
            address(this), f, SomniaExtensions.defaultSubscriptionOptions()
        );
        activeSubscriptionId = id;
    }

    function scheduleAt(uint256 timestampMillis) external returns (uint256 id) {
        id = SomniaExtensions.scheduleSubscriptionAtTimestamp(
            address(this), timestampMillis, SomniaExtensions.defaultSubscriptionOptions()
        );
        activeSubscriptionId = id;
    }

    function _onEvent(address emitter, bytes32[] calldata topics, bytes calldata) internal override {
        // The callback carries NO subscription id — gate on what we DO get.
        require(activeSubscriptionId != 0, "no active subscription");
        callCount++;
        lastEmitter = emitter;
        lastTopic0 = topics.length > 0 ? topics[0] : bytes32(0);
        emit Fired(emitter, lastTopic0, callCount);
    }
}
