// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {HandlerProbe} from "../src/HandlerProbe.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

/// @notice Q5 — what the Reactivity precompile does and does not do under a fork.
/// These assertions ENCODE the finding: the precompile is node-native, has no EVM
/// bytecode, and therefore cannot execute under `forge` (fork or anvil). Reactivity
/// integration must be exercised either against real testnet or via a mock etched
/// at 0x0100 — see Q5Mock.t.sol for the working harness.
contract Q5ReactivityConstraints is Test {
    address constant PRECOMPILE = 0x0000000000000000000000000000000000000100;
    address constant SPOT = 0xD180195da5459C7a0DEA188ed61216ec43682b50;
    bytes32 constant MARK_PRICE_UPDATED =
        0x2f0f7e3d58a217d311f516b216fa2f75081e17821bebb5f007fa57ff4e71f888;

    HandlerProbe h;

    function setUp() public {
        vm.createSelectFork("https://dream-rpc.somnia.network/");
        h = new HandlerProbe();
    }

    /// The 32-STT floor is enforced in the LIBRARY, so it holds even in a fork.
    function test_MinimumBalanceEnforcedBeforePrecompileIsReached() public {
        vm.deal(address(h), 32 ether - 1 wei);
        vm.expectRevert(SomniaExtensions.InsufficientBalance.selector);
        h.subscribeTo(SPOT, MARK_PRICE_UPDATED);
    }

    /// The precompile address carries no code on the real chain.
    function test_PrecompileHasNoBytecode() public view {
        assertEq(PRECOMPILE.code.length, 0, "precompile unexpectedly has bytecode");
        console2.log("precompile code length:", PRECOMPILE.code.length);
    }

    /// Past the balance check, subscribe() reverts under a fork because the call
    /// to the codeless precompile returns empty data that cannot decode to uint256.
    function test_SubscribeUnavailableUnderFork() public {
        vm.deal(address(h), 32 ether);
        vm.expectRevert();
        h.subscribeTo(SPOT, MARK_PRICE_UPDATED);
        console2.log("confirmed: subscribe() cannot execute under a Foundry fork");
    }

    /// Access control needs no precompile — it is a plain msg.sender check,
    /// so the whole onEvent authorisation surface IS locally testable.
    function test_AccessControlIsLocallyTestable() public {
        bytes32[] memory t = new bytes32[](1);
        t[0] = MARK_PRICE_UPDATED;

        vm.prank(address(0xBEEF));
        vm.expectRevert(); // OnlyReactivityPrecompile
        h.onEvent(SPOT, t, "");

        vm.prank(PRECOMPILE);
        vm.expectRevert(bytes("no active subscription")); // our own gate, no sub yet
        h.onEvent(SPOT, t, "");

        assertEq(h.callCount(), 0);
    }
}
