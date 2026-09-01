// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {HandlerProbe} from "../src/HandlerProbe.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile as IP} from
    "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

/// @notice Stand-in for the node-native precompile, which has no EVM bytecode
///         and therefore does not exist under anvil or a Foundry fork.
contract MockPrecompile {
    uint256 public nextId; // etch copies code, not storage -> pre-increment
    mapping(uint256 => IP.SubscriptionData) data;
    mapping(uint256 => address) owners;

    function subscribe(IP.SubscriptionData calldata d) external returns (uint256 id) {
        id = ++nextId;
        data[id] = d;
        owners[id] = msg.sender;
    }

    function unsubscribe(uint256 id) external {
        require(owners[id] == msg.sender, "not owner");
        delete owners[id];
    }

    function getSubscriptionInfo(uint256 id)
        external view returns (IP.SubscriptionData memory, address)
    { return (data[id], owners[id]); }
}

contract Q5WithMock is Test {
    address constant PRECOMPILE = 0x0000000000000000000000000000000000000100;
    address constant SPOT = 0xD180195da5459C7a0DEA188ed61216ec43682b50;
    bytes32 constant MARK_PRICE_UPDATED =
        0x2f0f7e3d58a217d311f516b216fa2f75081e17821bebb5f007fa57ff4e71f888;

    HandlerProbe h;

    function setUp() public {
        // Install the mock at the precompile address, then deploy the handler.
        MockPrecompile m = new MockPrecompile();
        vm.etch(PRECOMPILE, address(m).code);
        h = new HandlerProbe();
        vm.deal(address(h), 32 ether);
    }

    function test_SubscribeThroughMock() public {
        uint256 id = h.subscribeTo(SPOT, MARK_PRICE_UPDATED);
        console2.log("mock subscription id:", id);
        assertGt(id, 0);
        assertEq(h.activeSubscriptionId(), id);
    }

    function test_Still_EnforcesMinimumBalance() public {
        HandlerProbe poor = new HandlerProbe();
        vm.deal(address(poor), 31.999 ether);
        vm.expectRevert(SomniaExtensions.InsufficientBalance.selector);
        poor.subscribeTo(SPOT, MARK_PRICE_UPDATED);
    }

    function test_UnauthorisedCallerRejected() public {
        h.subscribeTo(SPOT, MARK_PRICE_UPDATED);
        bytes32[] memory t = new bytes32[](1);
        t[0] = MARK_PRICE_UPDATED;
        vm.prank(address(0xBEEF));
        vm.expectRevert(); // OnlyReactivityPrecompile
        h.onEvent(SPOT, t, "");
        assertEq(h.callCount(), 0);
    }

    function test_PrecompileCallerAccepted() public {
        h.subscribeTo(SPOT, MARK_PRICE_UPDATED);
        bytes32[] memory t = new bytes32[](1);
        t[0] = MARK_PRICE_UPDATED;
        vm.prank(PRECOMPILE);
        h.onEvent(SPOT, t, "");
        assertEq(h.callCount(), 1);
        assertEq(h.lastEmitter(), SPOT);
        assertEq(h.lastTopic0(), MARK_PRICE_UPDATED);
        console2.log("callback executed; emitter and topic0 as delivered");
    }

    function test_NoActiveSubscription_Rejected() public {
        // Never subscribed -> activeSubscriptionId == 0
        bytes32[] memory t = new bytes32[](1);
        t[0] = MARK_PRICE_UPDATED;
        vm.prank(PRECOMPILE);
        vm.expectRevert(bytes("no active subscription"));
        h.onEvent(SPOT, t, "");
    }
}
