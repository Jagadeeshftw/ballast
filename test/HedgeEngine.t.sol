// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {BallastVault} from "../src/BallastVault.sol";
import {HedgeEngine} from "../src/HedgeEngine.sol";
import {IExposureSource} from "../src/interfaces/IDreamDex.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {
    MockBinaryPool,
    MockBinaryMarket,
    MockBinaryMarketsModule,
    MockExposureSource,
    MockOutcomeToken,
    MockPrecompile
} from "./mocks/MockDreamDex.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev The reactivity precompile is node-native and has NO bytecode, so it does not exist
///      under forge (Phase 0, Q5). Everything below the subscription call is still fully
///      testable: `onEvent` is a plain function whose only gate is `msg.sender == 0x0100`,
///      so the batch, cursor, gating and skip paths are exercised by pranking that address.
contract HedgeEngineTest is Test {
    address constant PRECOMPILE = 0x0000000000000000000000000000000000000100;

    bytes32 constant MARKET_CREATED =
        0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd;

    uint256 constant ONE = 1e6;
    uint256 constant EXPOSURE = 10_000 * ONE;

    BallastVault vault;
    HedgeEngine engine;
    MockERC20 usdc;
    MockBinaryPool pool;
    MockBinaryMarket market;
    MockBinaryMarketsModule module;
    MockExposureSource exposure;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    bytes32 marketId = bytes32(uint256(0xFEED));

    function setUp() public {
        usdc = new MockERC20("Test USDC", "tUSDC", 6);
        vault = new BallastVault(IERC20(address(usdc)), owner);
        module = new MockBinaryMarketsModule(usdc);
        engine = new HedgeEngine(vault, address(module), owner);

        pool = new MockBinaryPool(usdc, 1000, 1000, 1000);
        market = new MockBinaryMarket();
        exposure = new MockExposureSource();
        module.register(marketId, address(market), address(pool), 777);

        vm.startPrank(owner);
        vault.setEngineApproval(address(engine), true);
        engine.setExposureSource(IExposureSource(address(exposure)));
        vm.stopPrank();

        for (uint256 i; i < 3; ++i) {
            address u = [alice, bob, carol][i];
            usdc.mint(u, 100_000 * ONE);
            vm.startPrank(u);
            usdc.approve(address(vault), type(uint256).max);
            vault.deposit(50_000 * ONE);
            vault.setPolicy(250, 1000, 100_000 * ONE, uint64(block.timestamp) + 30 days);
            vm.stopPrank();
            exposure.setExposure(u, EXPOSURE);
        }

        // Down ask 0.30  =>  best Up bid is 0.70
        pool.setBid(700_000, 1_000_000 * ONE);

        // The precompile is node-native and absent under forge, so etch a stand-in and
        // open the subscription through the REAL code path.
        vm.etch(PRECOMPILE, address(new MockPrecompile()).code);
        vm.deal(address(engine), 32 ether); // SUBSCRIPTION_OWNER_MINIMUM_BALANCE
        vm.prank(owner);
        engine.openSubscription();
        assertGt(engine.activeSubscriptionId(), 0, "subscription must be open");
    }

    // ------------------------------------------------------------- helpers

    function _enrolAll() internal {
        vm.prank(alice);
        engine.enrol();
        vm.prank(bob);
        engine.enrol();
        vm.prank(carol);
        engine.enrol();
    }

    function _topics() internal view returns (bytes32[] memory t) {
        t = new bytes32[](4);
        t[0] = MARKET_CREATED;
        t[1] = marketId;
        t[2] = bytes32(uint256(uint160(address(market))));
        t[3] = bytes32(uint256(uint160(address(pool))));
    }

    string internal asset = "ETH";

    bytes32 constant SCHEDULE_TOPIC =
        0x67aa3d752967d87d8944b9c7adf73172518777fa4703f336edee81f0736d8987;

    /// @dev Window creation only. A fresh pool has no book, so this never buys.
    function _deliverCreated() internal {
        vm.prank(PRECOMPILE);
        engine.onEvent(address(module), _topics(), _marketCreatedData(asset));
    }

    /// @dev The precompile's one-shot cron firing, which is when buying happens.
    function _tick() internal {
        vm.warp(block.timestamp + 20);
        bytes32[] memory t = new bytes32[](2);
        t[0] = SCHEDULE_TOPIC;
        t[1] = bytes32(uint256(block.timestamp) * 1000);
        vm.prank(PRECOMPILE);
        engine.onEvent(PRECOMPILE, t, "");
    }

    /// @dev Point the harness at a fresh window: new market contract, registered in the
    ///      module, and reflected in `_topics()`.
    function _useWindow(bytes32 id) internal {
        marketId = id;
        market = new MockBinaryMarket();
        module.register(id, address(market), address(pool), 1);
    }

    /// @dev The whole automatic path: created, then covered on the delayed tick.
    function _fire() internal {
        _deliverCreated();
        _tick();
    }

    /// @dev Builds the non-indexed tail of `MarketCreated` exactly as the venue encodes it:
    ///      thirteen static words, then offsets for `asset`, `strike`, `question`,
    ///      `context`. The engine reads word 13 to find `asset`, so the layout has to be
    ///      real rather than approximated.
    function _marketCreatedData(string memory a) internal pure returns (bytes memory) {
        bytes memory statics = abi.encode(
            uint256(777), // oracleQuestionId
            uint32(4), // operatorId
            bytes32(uint256(0xBEE0)), // venueId
            address(0), // creator
            address(0), // collateral
            uint256(100), // yesId
            uint256(101), // noId
            uint64(1), // nonce
            uint8(2), // outcomeSlotCount
            uint8(0), // marketType
            uint64(0), // tradingStart
            uint64(0), // expiry
            uint8(0) // voidPolicy
        );

        bytes memory assetTail = _dyn(bytes(a));
        bytes memory questionTail = _dyn(bytes("q"));
        bytes memory contextTail = _dyn(bytes(""));

        uint256 head = 17 * 32; // 13 statics + assetOff + strike + questionOff + contextOff
        return abi.encodePacked(
            statics,
            uint256(head), // asset offset
            uint256(0), // strike
            uint256(head + assetTail.length), // question offset
            uint256(head + assetTail.length + questionTail.length), // context offset
            assetTail,
            questionTail,
            contextTail
        );
    }

    /// @dev length word + right-padded contents, the ABI encoding of a dynamic value.
    function _dyn(bytes memory b) internal pure returns (bytes memory out) {
        // Rounding UP to the next 32-byte word is the intent, not a rounding accident.
        // forge-lint: disable-next-line(divide-before-multiply)
        uint256 padded = ((b.length + 31) / 32) * 32;
        out = abi.encodePacked(uint256(b.length), b, new bytes(padded - b.length));
    }

    // ------------------------------------------------------- authorisation

    function test_OnlyPrecompileMayInvokeOnEvent() public {
        _enrolAll();
        vm.prank(address(0xBEEF));
        vm.expectRevert(); // OnlyReactivityPrecompile, from the base class
        engine.onEvent(address(module), _topics(), "");
        assertEq(engine.callbackCount(), 0);
    }

    /// Phase 0 Correction 2: the callback carries no subscription id, so the real gate is
    /// an open subscription plus emitter plus topic0.
    function test_InertWithoutAnActiveSubscription() public {
        _enrolAll();
        vm.prank(owner);
        engine.closeSubscription();
        _fire();
        assertEq(engine.callbackCount(), 0, "must not act with no subscription");
        assertEq(engine.pendingCount(), 0);
        assertEq(pool.placedCount(), 0);
    }

    function test_IgnoresWrongEmitter() public {
        _enrolAll();
        vm.prank(PRECOMPILE);
        engine.onEvent(address(0xDEAD), _topics(), "");
        assertEq(engine.pendingCount(), 0, "foreign emitter must not drive the batch");
        assertEq(pool.placedCount(), 0);
    }

    function test_IgnoresWrongTopic() public {
        _enrolAll();
        bytes32[] memory t = _topics();
        t[0] = keccak256("SomethingElse()");
        vm.prank(PRECOMPILE);
        engine.onEvent(address(module), t, "");
        assertEq(engine.pendingCount(), 0, "unknown topic must not enqueue");
        assertEq(pool.placedCount(), 0);
    }

    function test_IgnoresTruncatedTopics() public {
        _enrolAll();
        bytes32[] memory t = new bytes32[](2);
        t[0] = MARKET_CREATED;
        t[1] = marketId;
        vm.prank(PRECOMPILE);
        engine.onEvent(address(module), t, ""); // must not index out of bounds
        assertEq(engine.pendingCount(), 0);
        assertEq(pool.placedCount(), 0);
    }

    // ------------------------------------------------------- happy path

    function test_BuysCoverForEnrolledUsers() public {
        _enrolAll();
        _fire();

        assertEq(pool.placedCount(), 3, "one order per enrolled user");
        assertEq(engine.coversOpened(), 3);

        (uint256 qty, uint256 premium, uint16 requested, uint16 achieved, bool degraded,,,,,) =
            engine.coverOf(alice, marketId);
        assertGt(qty, 0);
        assertGt(premium, 0);
        assertEq(requested, 250);
        // Down at 0.30, so making whole at 250bps costs ~ exposure*0.025*0.30/0.70
        assertApproxEqRel(premium, (EXPOSURE * 250 * 3) / (10_000 * 7), 0.01e18, "premium");
        assertApproxEqAbs(achieved, 250, 2, "achieved should match the dial when unbound");
        assertFalse(degraded);
    }

    function test_PremiumLeavesTheVaultAndReachesThePool() public {
        _enrolAll();
        uint256 aliceBefore = vault.collateralOf(alice);
        _fire();

        (, uint256 premium,,,,,,,,) = engine.coverOf(alice, marketId);
        assertEq(vault.collateralOf(alice), aliceBefore - premium, "user debited exactly");
        assertEq(vault.reservedOf(alice), 0, "nothing left reserved after a full spend");
        assertEq(usdc.balanceOf(address(pool)), engine.premiumPaidTotal(), "pool holds premium");
        assertEq(vault.surplus(), 0, "books and custody stay together");
    }

    function test_CumulativePremiumIsTracked() public {
        _enrolAll();
        _fire();
        uint256 first = engine.premiumPaidBy(alice);
        assertGt(first, 0);

        // A second window: same user, different market id.
        _useWindow(bytes32(uint256(0xBEE5)));
        _fire();
        assertGt(engine.premiumPaidBy(alice), first, "premium must accumulate across windows");
    }

    // ------------------------------------------ requested vs achieved (R4)

    /// When a ceiling binds, the achieved make-whole point is worse than the dial and the
    /// position must be marked degraded. Showing the dial here would violate R4.
    function test_DegradedWhenPremiumCeilingBinds() public {
        // Ceiling of 10bps of exposure = $10, far below what 250bps needs.
        vm.prank(alice);
        vault.setPolicy(250, 10, 100_000 * ONE, uint64(block.timestamp) + 30 days);
        vm.prank(alice);
        engine.enrol();

        _fire();

        (, uint256 premium, uint16 requested, uint16 achieved, bool degraded,,,,,) =
            engine.coverOf(alice, marketId);
        assertLe(premium, (EXPOSURE * 10) / 10_000, "premium ceiling respected");
        assertEq(requested, 250);
        assertLt(achieved, requested, "achieved must be worse than requested");
        assertTrue(degraded, "must be flagged degraded");
    }

    function test_NotDegradedWhenNothingBinds() public {
        vm.prank(alice);
        engine.enrol();
        _fire();
        (,,, uint16 achieved, bool degraded,,,,,) = engine.coverOf(alice, marketId);
        assertFalse(degraded);
        assertApproxEqAbs(achieved, 250, 2);
    }

    // ------------------------------------------------- skips are first-class

    function test_SkipsUnpriceableWindow() public {
        _enrolAll();
        pool.clearBook(); // one-sided/empty book — normal on a thin venue

        _fire();

        assertEq(pool.placedCount(), 0, "must not trade an unpriceable window");
        assertEq(vault.reservedOf(alice), 0, "no collateral left stranded");
        assertEq(vault.collateralOf(alice), 50_000 * ONE, "user untouched");
        (uint256 qty,,,,,,,,,) = engine.coverOf(alice, marketId);
        assertEq(qty, 0, "never optimistically covered -- rule R1");
    }

    function test_SkipsWhenCoverTooExpensive() public {
        _enrolAll();
        // Up bid 0.005 => Down ask 0.995, the q=0.995 case observed live on a 60s market.
        pool.setBid(5_000, 1_000_000 * ONE);

        _fire();

        assertEq(pool.placedCount(), 0, "must refuse cover where size diverges");
        assertEq(vault.collateralOf(alice), 50_000 * ONE);
    }

    function test_SkipsUserWithNoExposure() public {
        _enrolAll();
        exposure.setExposure(alice, 0);
        _fire();
        (uint256 qty,,,,,,,,,) = engine.coverOf(alice, marketId);
        assertEq(qty, 0);
        assertEq(pool.placedCount(), 2, "the other two are unaffected");
    }

    /// Exposure must be resolved PER WINDOW. A user long WETH and flat BTC must be
    /// covered on the ETH window and skipped on the BTC one -- an engine that passed a
    /// stubbed asset would happily cover the wrong market.
    function test_ExposureIsResolvedPerMarketNotGlobally() public {
        vm.prank(alice);
        engine.enrol();

        bytes32 ethWindow = bytes32(uint256(0xE7A));
        bytes32 btcWindow = bytes32(uint256(0xB7C));
        exposure.setExposureFor(alice, ethWindow, EXPOSURE);
        exposure.setExposureFor(alice, btcWindow, 0);

        _useWindow(ethWindow);
        _fire();
        (uint256 qEth,,,,,,,,,) = engine.coverOf(alice, ethWindow);
        assertGt(qEth, 0, "ETH window covered against ETH exposure");

        _useWindow(btcWindow);
        asset = "BTC";
        _fire();
        (uint256 qBtc,,,,,,,,,) = engine.coverOf(alice, btcWindow);
        assertEq(qBtc, 0, "BTC window must NOT be covered against ETH exposure");
        assertEq(pool.placedCount(), 1, "exactly one order, for the right window");
    }

    function test_SkipsRevokedUserButServesTheRest() public {
        _enrolAll();
        vm.prank(bob);
        vault.revoke();

        _fire();

        assertEq(pool.placedCount(), 2, "bob skipped, alice and carol served");
        (uint256 q,,,,,,,,,) = engine.coverOf(bob, marketId);
        assertEq(q, 0, "revoked user never receives cover");
    }

    function test_SkipsExpiredPolicy() public {
        _enrolAll();
        vm.warp(block.timestamp + 31 days);
        _fire();
        assertEq(pool.placedCount(), 0, "every policy has expired");
    }

    function test_DoesNotDoubleCoverTheSameWindow() public {
        vm.prank(alice);
        engine.enrol();
        _fire();
        assertEq(pool.placedCount(), 1);
        _fire(); // same marketId again
        assertEq(pool.placedCount(), 1, "already covered");
    }

    function test_SkipsWhenMarketIsNotTrading() public {
        _enrolAll();
        market.setStatus(2); // Locked
        _fire();
        assertEq(pool.placedCount(), 0);
    }

    function test_SkipsBelowMinimumLot() public {
        vm.prank(alice);
        engine.enrol();
        exposure.setExposure(alice, 1); // dust exposure -> size floors to zero
        _fire();
        assertEq(pool.placedCount(), 0);
    }

    // ---------------------------------------- one failure never aborts a batch

    function test_OneFailingPositionDoesNotAbortTheBatch() public {
        _enrolAll();
        pool.setRevertOnPlace(true);

        _fire(); // must not revert

        assertEq(engine.coversOpened(), 0, "callback completed despite every failure");
        assertEq(engine.coversOpened(), 0);
        // Failure rolled back cleanly: no collateral consumed, nothing left reserved.
        assertEq(vault.collateralOf(alice), 50_000 * ONE);
        assertEq(vault.reservedOf(alice), 0);
    }

    function test_ExposureSourceFailureDoesNotAbortTheBatch() public {
        _enrolAll();
        exposure.setShouldRevert(true);
        _fire();
        assertEq(vault.reservedOf(alice), 0);
    }

    function test_PoolRejectionRollsBackThatUserOnly() public {
        _enrolAll();
        pool.setRejectOrders(true); // returns (false, 0) rather than reverting
        _fire();
        assertEq(engine.coversOpened(), 0);
        assertEq(vault.collateralOf(alice), 50_000 * ONE, "collateral returned");
        assertEq(vault.collateralOf(bob), 50_000 * ONE);
    }

    // ------------------------------------------------- batch cap and cursor

    function test_BatchCapIsHonoured() public {
        _enrolAll();
        vm.prank(owner);
        engine.setBatchParams(2, 400_000);

        _fire();
        assertEq(pool.placedCount(), 2, "maxBatch respected");
        assertEq(engine.cursor(), 2);
    }

    /// The cursor must resume where it stopped, so nobody is permanently starved.
    function test_CursorResumesAcrossThreeConsecutivePartialBatches() public {
        _enrolAll();
        vm.prank(owner);
        engine.setBatchParams(1, 400_000);

        address[3] memory order = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            _useWindow(bytes32(uint256(0x100 + i)));
            _fire();
            (uint256 qty,,,,,,,,,) = engine.coverOf(order[i], marketId);
            assertGt(qty, 0, "each window must serve the next user in rotation");
            assertEq(engine.cursor(), (i + 1) % 3, "cursor advanced by exactly one");
        }
        assertEq(pool.placedCount(), 3);
    }

    function test_CursorWrapsAndStaysInRange() public {
        _enrolAll();
        vm.prank(owner);
        engine.setBatchParams(2, 400_000);

        _useWindow(bytes32(uint256(1)));
        _fire();
        assertEq(engine.cursor(), 2);

        _useWindow(bytes32(uint256(2)));
        _fire();
        assertLt(engine.cursor(), engine.enrolledCount(), "cursor stays inside the set");
    }

    /// Spec section 4: callback gas exhausted mid-batch must not revert and must not
    /// advance past anyone -- the cursor resumes next window, nobody is starved.
    function test_GasReserveStopsBatchCleanlyWithoutReverting() public {
        _enrolAll();
        vm.prank(owner);
        engine.setBatchParams(20, type(uint64).max); // reserve can never be satisfied

        _fire(); // must not revert

        assertEq(pool.placedCount(), 0, "nothing bought");
        assertEq(pool.placedCount(), 0, "no work attempted without gas headroom");
        assertEq(engine.cursor(), 0, "cursor did not advance past anyone");
        assertEq(vault.reservedOf(alice), 0, "nothing left reserved");

        // The window stays queued rather than being lost.
        assertEq(engine.pendingCount(), 1, "stalled window keeps its place in the ladder");

        // Restore headroom: the ladder retries the stalled window AND serves the new one.
        vm.prank(owner);
        engine.setBatchParams(20, 400_000);
        _useWindow(bytes32(uint256(0xBEEF01)));
        _fire();
        assertEq(pool.placedCount(), 6, "3 for the retried window + 3 for the new one");
        assertEq(engine.pendingCount(), 0, "both windows resolved");
    }

    function test_EmptySetIsANoOp() public {
        _fire();
        assertEq(pool.placedCount(), 0, "nobody enrolled, nothing bought");
        assertEq(engine.coversOpened(), 0);
    }

    // -------------------------------------------------------- enrolment

    function test_EnrolRequiresPolicyAndCapital() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(HedgeEngine.NotEligible.selector);
        engine.enrol();
    }

    function test_EnrolRequiresMinimumCollateral() public {
        vm.prank(owner);
        engine.setGuards(9000, 60_000 * ONE); // above what anyone deposited

        vm.prank(alice);
        vm.expectRevert(HedgeEngine.NotEligible.selector);
        engine.enrol();
    }

    function test_CannotEnrolTwice() public {
        vm.prank(alice);
        engine.enrol();
        vm.prank(alice);
        vm.expectRevert(HedgeEngine.AlreadyEnrolled.selector);
        engine.enrol();
    }

    function test_UserCanAlwaysLeave() public {
        vm.prank(alice);
        engine.enrol();
        assertTrue(engine.isEnrolled(alice));
        vm.prank(alice);
        engine.withdrawEnrolment();
        assertFalse(engine.isEnrolled(alice));
    }

    function test_KickIsPermissionlessOnceIneligible() public {
        _enrolAll();
        vm.prank(bob);
        vault.revoke();

        vm.prank(makeAddr("anyone"));
        engine.kick(bob);
        assertFalse(engine.isEnrolled(bob));
        assertEq(engine.enrolledCount(), 2);
    }

    function test_CannotKickAnEligibleUser() public {
        _enrolAll();
        vm.expectRevert(HedgeEngine.NotEligible.selector);
        engine.kick(alice);
    }

    function test_RemovalKeepsCursorInRange() public {
        _enrolAll();
        vm.prank(owner);
        engine.setBatchParams(3, 400_000);
        _fire();

        vm.prank(alice);
        engine.withdrawEnrolment();
        vm.prank(bob);
        engine.withdrawEnrolment();
        vm.prank(carol);
        engine.withdrawEnrolment();

        assertEq(engine.enrolledCount(), 0);
        assertEq(engine.cursor(), 0, "cursor reset when the set empties");
        _fire(); // must not revert on an empty set
    }

    // ------------------------------------------------ subscription health

    function test_HealthReportsRunwayInWindows() public {
        vm.deal(address(engine), 100 ether);
        vm.fee(6 gwei);

        (uint256 bal, uint256 costPerCallback, uint256 windows, bool subscribed,) =
            engine.subscriptionHealth();

        assertEq(bal, 100 ether);
        assertEq(costPerCallback, uint256(engine.callbackGasLimit()) * (6 gwei + 1 gwei));
        assertEq(windows, bal / costPerCallback, "no windows seen yet: 1:1");
        assertTrue(subscribed);
        assertGt(windows, 0, "runway must be expressed in windows, not wei");
    }

    /// A window costs more than one callback, so runway must be divided by the observed
    /// ratio. Reporting raw callbacks as windows would overstate it.
    function test_RunwayIsDividedByObservedCallbacksPerWindow() public {
        vm.deal(address(engine), 100 ether);
        vm.fee(6 gwei);
        _enrolAll();
        _fire(); // one window, two callbacks (create + tick)

        assertEq(engine.windowsEnqueued(), 1);
        assertGt(engine.callbacksPerWindowX100(), 100, "more than one callback per window");

        (,, uint256 windows,,) = engine.subscriptionHealth();
        uint256 callbacks = engine.callbacksRemaining();
        assertLt(windows, callbacks, "windows must be fewer than callbacks");
        assertEq(windows, (callbacks * engine.windowsEnqueued()) / engine.callbackCount());
    }

    function test_HealthShowsUnsubscribed() public {
        vm.prank(owner);
        engine.closeSubscription();
        (,,, bool subscribed,) = engine.subscriptionHealth();
        assertFalse(subscribed);
    }

    function test_HealthGoesStaleWhenCallbacksStop() public {
        _enrolAll();
        _fire(); // sets lastCallbackAt
        (,,,, bool staleNow) = engine.subscriptionHealth();
        assertFalse(staleNow);

        vm.warp(block.timestamp + 2 days);
        (,,,, bool staleLater) = engine.subscriptionHealth();
        assertTrue(staleLater, "a stale badge, not a confident 'covered'");
    }

    function test_TopUpIsPermissionless() public {
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 5 ether);
        uint256 before = address(engine).balance;
        vm.prank(stranger);
        engine.topUp{value: 5 ether}();
        assertEq(address(engine).balance, before + 5 ether);

        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(engine).call{value: 1 ether}("");
        assertTrue(ok, "plain transfers must also extend runway");
        assertEq(address(engine).balance, before + 6 ether);
    }

    // ------------------------------------------------------------- admin

    /// A zero priority fee risks indefinite deferral at exactly the window boundary where
    /// every user rolls at once, so it is refused outright.
    function test_ZeroPriorityFeeRejected() public {
        vm.prank(owner);
        vm.expectRevert(HedgeEngine.BadParameter.selector);
        engine.setSubscriptionFees(0, 40 gwei, 10_000_000);
    }

    function test_PriorityFeeDefaultsNonZero() public view {
        assertGt(engine.priorityFeePerGas(), 0);
    }

    function test_GasLimitCannotExceedProtocolMaximum() public {
        vm.prank(owner);
        vm.expectRevert(HedgeEngine.BadParameter.selector);
        engine.setSubscriptionFees(1 gwei, 40 gwei, 200_000_001);
    }

    function test_OnlyOwnerAdmin() public {
        vm.startPrank(alice);
        vm.expectRevert();
        engine.setBatchParams(5, 400_000);
        vm.expectRevert();
        engine.setGuards(9000, 0);
        vm.expectRevert();
        engine.setExposureSource(IExposureSource(address(exposure)));
        vm.stopPrank();
    }

    function test_CoverOneIsNotCallableFromOutside() public {
        vm.prank(alice);
        vm.expectRevert(HedgeEngine.OnlySelf.selector);
        engine.coverOne(alice, marketId, address(pool));
    }

    function test_EngineCannotMoveUserCollateralToItself() public {
        // The only vault functions the engine can reach move collateral to a pool or back
        // into the vault. There is no path to an arbitrary recipient.
        vm.prank(owner);
        engine.sweepNative(payable(owner), 1 ether); // native runway only
        assertEq(vault.collateralOf(alice), 50_000 * ONE, "user collateral untouchable");
    }

    // =====================================================================
    //                          SETTLEMENT
    // =====================================================================

    function _openCoverFor(address u) internal returns (uint256 qty, uint256 premium) {
        vm.prank(u);
        engine.enrol();
        if (!engine.coverWindowSeen(marketId)) _deliverCreated();
        vm.warp(block.timestamp + 20);
        engine.poke(marketId); // permissionless, same path as the scheduled tick
        (qty, premium,,,,,,,,) = engine.coverOf(u, marketId);
        assertGt(qty, 0, "cover must be open before settling");
    }

    /// Down wins: the window closed below its opening price.
    function test_SettleWonCreditsProceeds() public {
        (uint256 qty,) = _openCoverFor(alice);
        uint256 balBefore = vault.collateralOf(alice);

        market.resolveWith(true);
        uint256 proceeds = engine.settle(alice, marketId);

        assertEq(proceeds, qty, "a winning binary pays 1 per contract");
        assertEq(vault.collateralOf(alice), balBefore + proceeds, "credited to the user");

        (,,,,, bool settled, HedgeEngine.Outcome outcome, uint256 recorded,,) =
            engine.coverOf(alice, marketId);
        assertTrue(settled);
        assertEq(uint256(outcome), uint256(HedgeEngine.Outcome.Won));
        assertEq(recorded, proceeds);
    }

    /// A LOSING redemption succeeds and pays zero. It must not be treated as a failure.
    function test_SettleLostSucceedsAndPaysZero() public {
        _openCoverFor(alice);
        uint256 balBefore = vault.collateralOf(alice);

        market.resolveWith(false); // Up won
        uint256 proceeds = engine.settle(alice, marketId);

        assertEq(proceeds, 0, "loser pays zero");
        assertEq(vault.collateralOf(alice), balBefore, "nothing credited, nothing lost");

        (,,,,, bool settled, HedgeEngine.Outcome outcome,,,) = engine.coverOf(alice, marketId);
        assertTrue(settled, "a zero payout is still a completed settlement");
        assertEq(uint256(outcome), uint256(HedgeEngine.Outcome.Lost));
    }

    /// THE ZERO-MOVE CASE. The venue predicate is ">=", so a flat close resolves Up and
    /// the cover pays nothing. Ballast derives this from the payout VECTOR, so there is
    /// no < / <= anywhere for a flat close to fall through.
    function test_FlatCloseResolvesUpAndCoverPaysNothing() public {
        _openCoverFor(alice);

        // A flat close satisfies ">=", so the venue writes the Up-wins vector.
        market.resolveWith(false);

        assertEq(
            uint256(engine.outcomeOf(marketId)),
            uint256(HedgeEngine.Outcome.Lost),
            "a flat close must be Lost, never Won"
        );

        uint256 proceeds = engine.settle(alice, marketId);
        assertEq(proceeds, 0, "ties go against the cover holder");

        (,,,,,, HedgeEngine.Outcome outcome,,,) = engine.coverOf(alice, marketId);
        assertEq(uint256(outcome), uint256(HedgeEngine.Outcome.Lost));
    }

    /// A voided window must not silently strand the position.
    function test_SettleVoidedRedeemsAtHalf() public {
        (uint256 qty,) = _openCoverFor(alice);
        uint256 balBefore = vault.collateralOf(alice);

        market.voidIt();
        uint256 proceeds = engine.settle(alice, marketId);

        assertEq(proceeds, qty / 2, "voided markets redeem at 0.5");
        assertGt(proceeds, 0, "a voided window must never strand the position");
        assertEq(vault.collateralOf(alice), balBefore + proceeds);

        (,,,,,, HedgeEngine.Outcome outcome,,,) = engine.coverOf(alice, marketId);
        assertEq(uint256(outcome), uint256(HedgeEngine.Outcome.Voided));
    }

    function test_CannotSettleTwice() public {
        _openCoverFor(alice);
        market.resolveWith(true);
        engine.settle(alice, marketId);

        vm.expectRevert(HedgeEngine.AlreadySettled.selector);
        engine.settle(alice, marketId);
    }

    /// Settlement while a batch is mid-flight must not double-claim.
    function test_SettlementIsIdempotentAcrossReentrantAttempts() public {
        (uint256 qty,) = _openCoverFor(alice);
        market.resolveWith(true);

        uint256 first = engine.settle(alice, marketId);
        assertEq(first, qty);
        assertEq(engine.coversSettled(), 1);

        address[] memory users = new address[](1);
        users[0] = alice;
        (uint256 n, uint256 failed) = engine.settleMany(users, marketId);
        assertEq(n, 0, "already-settled cover contributes nothing");
        assertEq(failed, 1);
        assertEq(engine.coversSettled(), 1, "no double claim");
    }

    function test_CannotSettleBeforeResolution() public {
        _openCoverFor(alice);
        vm.expectRevert(HedgeEngine.NotSettleable.selector);
        engine.settle(alice, marketId);
    }

    function test_CannotSettleWithoutCover() public {
        vm.expectRevert(HedgeEngine.NoCover.selector);
        engine.settle(bob, marketId);
    }

    /// Anyone can settle -- including a judge poking the deployed contracts.
    function test_SettlementIsPermissionless() public {
        (uint256 qty,) = _openCoverFor(alice);
        market.resolveWith(true);

        vm.prank(makeAddr("a passing judge"));
        uint256 proceeds = engine.settle(alice, marketId);
        assertEq(proceeds, qty);
    }

    function test_SettleManyIsBestEffort() public {
        _openCoverFor(alice);
        _openCoverFor(bob); // bob enrols after alice; both covered in the same window
        market.resolveWith(true);

        address[] memory users = new address[](3);
        users[0] = alice;
        users[1] = carol; // no cover -> reverts internally, must not abort the rest
        users[2] = bob;

        (uint256 n, uint256 failed) = engine.settleMany(users, marketId);
        assertEq(n, 2, "one bad entry must not block the others");
        assertEq(failed, 1);
    }

    // -------------------------------------------------- asset decoding

    function test_DecodesAssetFromEventData() public {
        _enrolAll();
        _fire();
        assertEq(engine.assetKeyOf(marketId), keccak256(bytes("ETH")), "asset decoded");
    }

    function test_DistinguishesBtcFromEthWindows() public {
        _enrolAll();
        _fire();
        bytes32 ethKey = engine.assetKeyOf(marketId);

        _useWindow(bytes32(uint256(0xB7C)));
        asset = "BTC";
        _fire();

        assertEq(engine.assetKeyOf(marketId), keccak256(bytes("BTC")));
        assertTrue(engine.assetKeyOf(marketId) != ethKey, "BTC and ETH must not collide");
    }

    /// A window whose asset cannot be read is not tradeable: covering it would mean
    /// guessing whether a WETH position should be covered by a BTC contract.
    function test_RefusesWindowWithUndecodableAsset() public {
        _enrolAll();
        vm.prank(PRECOMPILE);
        engine.onEvent(address(module), _topics(), ""); // no data at all

        assertEq(pool.placedCount(), 0, "must not trade an unidentified window");
        assertEq(engine.assetKeyOf(marketId), bytes32(0), "nothing recorded");
        assertEq(engine.coversOpened(), 0);

        // The callback DID arrive and is counted: liveness is real even when we decline
        // to act, and zeroing it here would make `subscriptionHealth().stale` lie.
        assertEq(engine.callbackCount(), 1);
        assertEq(engine.lastCallbackAt(), uint64(block.timestamp));
        assertEq(engine.pendingCount(), 0, "an unidentified window is not enqueued");
    }

    function test_RefusesMalformedAssetData() public {
        _enrolAll();
        // Truncated: too short to contain the static head, let alone an asset.
        vm.prank(PRECOMPILE);
        engine.onEvent(address(module), _topics(), abi.encode(uint256(1), uint256(2)));
        assertEq(pool.placedCount(), 0);
    }

    /// THE REASON THIS EVENT EXISTS. A broken operator grant or a wrong address makes
    /// every redemption fail, and without a reason that is indistinguishable from a batch
    /// of users who simply had no cover. These two cases must look different on chain.
    function test_SystemicFailureIsDistinguishableFromUnluckyIndividuals() public {
        _openCoverFor(alice);
        _openCoverFor(bob);
        market.resolveWith(true);

        // Case 1: individuals. carol never had cover; the other two settle fine.
        address[] memory mixed = new address[](3);
        mixed[0] = alice;
        mixed[1] = carol;
        mixed[2] = bob;

        vm.recordLogs();
        (uint256 okCount, uint256 failCount) = engine.settleMany(mixed, marketId);
        assertEq(okCount, 2);
        assertEq(failCount, 1);
        assertEq(
            uint256(_onlyFailureKind()),
            uint256(HedgeEngine.SettleFailure.NoCover),
            "an individual gap reads as NoCover"
        );

        // Case 2: systemic. A fresh window where the venue call itself fails for everyone.
        _useWindow(bytes32(uint256(0xDEAD01)));
        _fire();
        (uint256 aQty,,,,,,,,,) = engine.coverOf(alice, marketId);
        assertGt(aQty, 0, "both users must hold cover in the new window");
        market.resolveWith(true);
        module.setRedeemReverts(true); // e.g. a missing ERC-6909 operator grant

        address[] memory all = new address[](2);
        all[0] = alice;
        all[1] = bob;

        vm.recordLogs();
        (uint256 ok2, uint256 fail2) = engine.settleMany(all, marketId);
        assertEq(ok2, 0);
        assertEq(fail2, 2);
        assertEq(
            uint256(_onlyFailureKind()),
            uint256(HedgeEngine.SettleFailure.External),
            "a systemic venue failure reads as External, not as missing cover"
        );
    }

    /// @dev Returns the single distinct SettleFailure kind across the recorded logs.
    function _onlyFailureKind() internal returns (HedgeEngine.SettleFailure kind) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("SettleFailed(address,bytes32,uint8,bytes4)");
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != sig) continue;
            (uint8 k,) = abi.decode(logs[i].data, (uint8, bytes4));
            if (seen) require(uint8(kind) == k, "mixed failure kinds");
            kind = HedgeEngine.SettleFailure(k);
            seen = true;
        }
        require(seen, "no SettleFailed emitted");
    }

    function test_SettleManyIsBoundedByMaxBatch() public {
        _openCoverFor(alice);
        _openCoverFor(bob);
        _openCoverFor(carol);
        market.resolveWith(true);

        vm.prank(owner);
        engine.setBatchParams(2, 400_000);

        address[] memory users = new address[](3);
        users[0] = alice;
        users[1] = bob;
        users[2] = carol;

        (uint256 ok,) = engine.settleMany(users, marketId);
        assertEq(ok, 2, "gas is capped however long the array is");
        assertEq(engine.coversSettled(), 2);
    }

    /// A market that resolved without finalising must still redeem.
    function test_FinalizeFailureDoesNotBlockRedemption() public {
        (uint256 qty,) = _openCoverFor(alice);
        module.setFinalizeReverts(true);
        market.resolveWith(true);

        uint256 proceeds = engine.settle(alice, marketId);
        assertEq(proceeds, qty, "finalize is best-effort, not a gate");
    }

    // ------------------------------------------------------------ backstops

    function test_PokeOracleIsPermissionless() public {
        vm.prank(makeAddr("anyone"));
        engine.pokeOracle(marketId);
        assertEq(module.pokes(), 1, "anyone can unstick a market");
    }

    function test_VoidExpiredIsPermissionlessAfterTheWindowLapses() public {
        _openCoverFor(alice);

        // Too early: the oracle still has time to answer.
        vm.expectRevert();
        engine.voidExpired(marketId);

        uint64 voidableAt = engine.voidableAt(marketId);
        assertGt(voidableAt, block.timestamp, "expiry + settlementWindow");

        vm.warp(voidableAt);
        vm.prank(makeAddr("anyone"));
        engine.voidExpired(marketId);
        assertTrue(market.voidExpiredCalled());

        // ...and the stranded position can now be redeemed at 0.5.
        uint256 proceeds = engine.settle(alice, marketId);
        assertGt(proceeds, 0, "a lapsed market must never strand funds");
    }

    // -------------------------------- owner has no path to user collateral

    /// Collateral now passes THROUGH the engine, so the claim has to hold here too.
    function test_OwnerCannotReachUserCollateralViaTheEngine() public {
        _enrolAll();
        _fire();

        // At rest the engine holds no collateral at all: premium goes straight to the pool.
        assertEq(usdc.balanceOf(address(engine)), 0, "engine holds no collateral at rest");

        // sweepNative moves NATIVE runway only, never the collateral token.
        vm.deal(address(engine), 5 ether);
        uint256 ownerCollateralBefore = usdc.balanceOf(owner);
        vm.prank(owner);
        engine.sweepNative(payable(owner), 5 ether);
        assertEq(usdc.balanceOf(owner), ownerCollateralBefore, "no collateral followed it");

        // And the users' claims are untouched.
        assertGt(vault.collateralOf(alice), 0);
        assertGt(vault.collateralOf(bob), 0);
    }

    /// Proceeds are credited to the covered user, never to the owner or the engine.
    function test_ProceedsCannotBeDivertedToTheOwner() public {
        (uint256 qty,) = _openCoverFor(alice);
        market.resolveWith(true);

        uint256 ownerBefore = usdc.balanceOf(owner);
        engine.settle(alice, marketId);

        assertEq(usdc.balanceOf(owner), ownerBefore, "owner receives nothing");
        assertEq(usdc.balanceOf(address(engine)), 0, "engine keeps nothing");
        assertEq(vault.collateralOf(alice), 50_000 * ONE - _premiumOf(alice) + qty);
    }

    function _premiumOf(address u) internal view returns (uint256 p) {
        (, p,,,,,,,,) = engine.coverOf(u, marketId);
    }

    /// The module address is immutable, so nobody can point redemption at a contract
    /// that could take this engine's outcome tokens.
    function test_ModuleIsImmutable() public view {
        assertEq(address(engine.BINARY_MODULE()), address(module));
    }

    /// The outcome-token operator grant is scoped to the immutable module and nothing
    /// else, so it cannot be aimed at an arbitrary spender.
    function test_OutcomeApprovalIsScopedToTheModule() public {
        MockOutcomeToken outcomes = new MockOutcomeToken();

        vm.prank(alice);
        vm.expectRevert();
        engine.approveModuleForOutcomes(outcomes);

        vm.prank(owner);
        engine.approveModuleForOutcomes(outcomes);

        assertTrue(outcomes.operators(address(engine), address(module)), "module approved");
        assertFalse(outcomes.operators(address(engine), owner), "owner is NOT an operator");
        assertFalse(outcomes.operators(address(engine), alice));
    }

    // =====================================================================
    //              THE RETRY LADDER, DRIFT, AND POKE
    // =====================================================================

    /// Creation must NOT buy. Measured on chain: makers first quote 55-102 blocks
    /// (5.5-10.2s) after MarketCreated, while the callback fires in the same block.
    function test_CreationEnqueuesButDoesNotBuy() public {
        _enrolAll();
        _deliverCreated();

        assertEq(pool.placedCount(), 0, "a fresh pool has no book; buying now buys nothing");
        assertEq(engine.pendingCount(), 1, "the window is queued instead");
        (uint64 createdAt, uint64 nextAt, uint8 attempts, bool active) =
            engine.pendingOf(marketId);
        assertTrue(active);
        assertEq(attempts, 0);
        assertEq(createdAt, uint64(block.timestamp));
        assertEq(nextAt, uint64(block.timestamp) + engine.initialDelaySeconds());
    }

    function test_OpeningPriceIsCapturedAtCreation() public {
        exposure.setPrice(2000e18, true);
        _deliverCreated();
        assertEq(engine.openPriceOf(marketId), 2000e18, "the window's open is recorded");

        // Later price moves must not rewrite it.
        exposure.setPrice(1900e18, true);
        assertEq(engine.openPriceOf(marketId), 2000e18, "open price is immutable");
    }

    /// A book that is still unpriceable must be retried, not abandoned.
    function test_LadderRetriesAnUnpriceableBook() public {
        _enrolAll();
        pool.clearBook();
        _deliverCreated();

        _tick();
        assertEq(pool.placedCount(), 0);
        (,, uint8 a1,) = engine.pendingOf(marketId);
        assertEq(a1, 1, "attempt 1 used");
        assertEq(engine.pendingCount(), 1, "still queued");

        // Liquidity arrives; the next rung buys.
        pool.setBid(700_000, 1_000_000 * ONE);
        _tick();
        assertEq(pool.placedCount(), 3, "covered on the retry");
        assertEq(engine.pendingCount(), 0, "window resolved");
    }

    /// Bounded: three attempts, then give up and say so.
    function test_LadderGivesUpAfterMaxAttempts() public {
        _enrolAll();
        pool.clearBook(); // never becomes priceable
        _deliverCreated();

        for (uint256 i; i < 3; ++i) _tick();

        assertEq(engine.pendingCount(), 0, "dropped from the queue");
        assertEq(pool.placedCount(), 0, "never bought into an empty book");
        (,, uint8 attempts, bool active) = engine.pendingOf(marketId);
        assertFalse(active);
        assertEq(attempts, 3, "capped at maxAttempts");
    }

    /// The ladder must refuse a diverging book rather than buy at any price.
    function test_LadderRefusesADivergingBookAcrossEveryRung() public {
        _enrolAll();
        pool.setBid(5_000, 1_000_000 * ONE); // Up bid 0.005 => cover at 0.995
        _deliverCreated();

        for (uint256 i; i < 3; ++i) _tick();

        assertEq(pool.placedCount(), 0, "never buys cover at 0.995");
        assertEq(vault.collateralOf(alice), 50_000 * ONE, "no collateral touched");
    }

    function test_DelaysAreConfigurable() public {
        vm.prank(owner);
        engine.setLadder(120, 60, 5, 45);
        assertEq(engine.initialDelaySeconds(), 120, "15s is a quarter of a 60s window");
        assertEq(engine.retryDelaySeconds(), 60);
        assertEq(engine.maxAttempts(), 5);
        assertEq(engine.tickGraceSeconds(), 45, "grace is tunable alongside the delays");

        _deliverCreated();
        (, uint64 nextAt,,) = engine.pendingOf(marketId);
        assertEq(nextAt, uint64(block.timestamp) + 120);
    }

    // ------------------------------------------------------- purchase drift

    /// Coverage is measured from the WINDOW'S OPEN. Holdings are therefore valued at the
    /// open, not at the purchase price -- otherwise a late buy silently undersizes.
    /// Drift and purchase delay are recorded on the position either way.
    function test_CoverageIsSizedFromTheOpenNotThePurchasePrice() public {
        vm.prank(alice);
        engine.enrol();

        exposure.setPrice(2000e18, true);
        _deliverCreated();
        exposure.setPrice(1900e18, true); // -5% before a book exists
        _tick();

        (uint256 qty,, uint16 requested, uint16 achieved,,,,, uint32 delay, int32 drift) =
            engine.coverOf(alice, marketId);

        assertEq(drift, -500, "-5% recorded in bps");
        assertGt(delay, 0, "purchase delay recorded");
        assertEq(requested, 250);
        assertEq(achieved, requested, "sized from the open, so the dial is still met");

        // Sized from the OPEN: strictly more contracts than the purchase price implies.
        vm.prank(bob);
        engine.enrol();
        _useWindow(bytes32(uint256(0xD41F7)));
        exposure.setPrice(1900e18, true);
        _deliverCreated(); // open == purchase price, no drift
        _tick();
        (uint256 qtyNoDrift,,,,,,,,, int32 drift2) = engine.coverOf(bob, marketId);
        assertEq(drift2, 0);
        assertGt(qty, qtyNoDrift, "drifted window buys MORE, because the open is higher");
    }

    /// Where adverse drift DOES bite: a fallen price makes Down dearer, the premium rises,
    /// and the user's own ceiling binds. That is the degradation, and it says so.
    function test_AdverseDriftDegradesThroughThePremiumCeiling() public {
        vm.prank(alice);
        vault.setPolicy(250, 60, 100_000 * ONE, uint64(block.timestamp) + 30 days);
        vm.prank(alice);
        engine.enrol();

        exposure.setPrice(2000e18, true);
        _deliverCreated();

        // Price falls and Down gets dearer, as it must when a fall becomes more likely.
        exposure.setPrice(1900e18, true);
        pool.setBid(400_000, 1_000_000 * ONE); // cover price 0.60
        _tick();

        (,, uint16 requested, uint16 achieved, bool degraded,,,,, int32 drift) =
            engine.coverOf(alice, marketId);
        assertEq(drift, -500);
        assertLt(achieved, requested, "the ceiling bound; the dial was not reached");
        assertTrue(degraded, "and the position says so");
    }

    function test_NoDriftReportsTheDialExactly() public {
        vm.prank(alice);
        engine.enrol();
        exposure.setPrice(2000e18, true);
        _deliverCreated();
        _tick(); // same price

        (,, uint16 requested, uint16 achieved, bool degraded,,,,, int32 drift) =
            engine.coverOf(alice, marketId);
        assertEq(drift, 0);
        assertEq(achieved, requested, "no drift, no ceiling: exactly the dial");
        assertFalse(degraded);
    }

    /// Favourable drift is not degradation.
    function test_FavourableDriftIsNotDegraded() public {
        vm.prank(alice);
        engine.enrol();
        exposure.setPrice(2000e18, true);
        _deliverCreated();
        exposure.setPrice(2100e18, true); // price rose
        _tick();

        (,,, uint16 achieved, bool degraded,,,,, int32 drift) = engine.coverOf(alice, marketId);
        assertEq(drift, 500, "+5%");
        assertGe(achieved, 250);
        assertFalse(degraded);
    }

    function test_RefusesWindowWithNoRecordedOpenPrice() public {
        vm.prank(alice);
        engine.enrol();
        exposure.setPrice(0, false); // spot unpriceable at creation
        _deliverCreated();
        assertEq(engine.openPriceOf(marketId), 0);

        exposure.setPrice(2000e18, true);
        _tick();
        assertEq(pool.placedCount(), 0, "cannot measure cover without the window's open");
    }

    // --------------------------------------------------------------- poke

    /// A poked window and a callback-driven window must produce identical state.
    function test_PokeAndScheduledTickProduceIdenticalState() public {
        // Window A: covered by the scheduled tick.
        vm.prank(alice);
        engine.enrol();
        _deliverCreated();
        _tick();
        (uint256 qA, uint256 pA, uint16 rA, uint16 aA, bool dA,,,,, int32 drA) =
            engine.coverOf(alice, marketId);

        // Window B: identical setup, covered by poke instead.
        _useWindow(bytes32(uint256(0xB0B0)));
        _deliverCreated();
        vm.warp(block.timestamp + 20);
        engine.poke(marketId);
        (uint256 qB, uint256 pB, uint16 rB, uint16 aB, bool dB,,,,, int32 drB) =
            engine.coverOf(alice, marketId);

        assertEq(qA, qB, "quantity identical");
        assertEq(pA, pB, "premium identical");
        assertEq(rA, rB, "requested identical");
        assertEq(aA, aB, "achieved identical");
        assertEq(dA, dB, "degraded identical");
        assertEq(drA, drB, "drift identical");
    }

    function test_PokeIsPermissionless() public {
        _enrolAll();
        _deliverCreated();
        vm.warp(block.timestamp + 20);

        vm.prank(makeAddr("a passing judge"));
        uint256 covered = engine.poke(marketId);
        assertEq(covered, 3);
        assertEq(pool.placedCount(), 3);
    }

    /// Existence and status come from the module, never from the caller.
    function test_PokeVerifiesTheMarketFromTheModule() public {
        _enrolAll();
        vm.expectRevert(HedgeEngine.UnknownMarket.selector);
        engine.poke(bytes32(uint256(0xDEADDEAD)));

        _deliverCreated();
        market.setStatus(2); // Locked
        vm.expectRevert(HedgeEngine.MarketNotTrading.selector);
        engine.poke(marketId);
    }

    /// Poke is the backstop for exactly the state subscriptionHealth() models: an engine
    /// below the 32 STT floor can no longer schedule ticks, but poke still works.
    function test_PokeWorksWhenTheLadderCannotSchedule() public {
        _enrolAll();
        _deliverCreated();

        vm.deal(address(engine), 1 ether); // below the floor
        assertFalse(engine.canSchedule(), "ladder is disabled");

        vm.warp(block.timestamp + 20);
        engine.poke(marketId);
        assertEq(pool.placedCount(), 3, "poke is the backstop and still covers");
    }

    function test_ScheduleUnavailableIsSurfacedNotSilent() public {
        _enrolAll();
        vm.deal(address(engine), 1 ether);
        vm.recordLogs();
        _deliverCreated();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("ScheduleUnavailable(uint256,uint256)");
        bool seen;
        for (uint256 i; i < logs.length; ++i) if (logs[i].topics[0] == sig) seen = true;
        assertTrue(seen, "a disabled ladder must be visible, not silent");
    }

    /// THE DEADLOCK THIS PREVENTS. A scheduled tick can be evicted from a full reactivity
    /// queue or deferred indefinitely. If `pendingTickAt` never expired, one missed tick
    /// would short-circuit `_ensureTick` forever and the ladder would stall silently —
    /// windows piling up, nothing attempted, no event to show why. Observed in production
    /// before this guard existed: 62 windows enqueued, zero attempted.
    function test_AMissedTickDoesNotDeadlockTheLadder() public {
        _enrolAll();
        _deliverCreated();
        uint256 scheduledFor = engine.pendingTickAt();
        assertGt(scheduledFor, 0, "a tick was scheduled");

        // The tick's moment passes and it never arrives.
        vm.warp(scheduledFor / 1000 + engine.tickGraceSeconds() + 1);

        // A later window must be able to schedule a replacement rather than short-circuit.
        _useWindow(bytes32(uint256(0xFEEDBEEF)));
        _deliverCreated();

        assertGt(engine.pendingTickAt(), 0, "a replacement tick exists");
        assertTrue(engine.pendingTickAt() != scheduledFor, "and it is a NEW one");

        // And the ladder still covers when a tick finally does arrive.
        _tick();
        assertGt(pool.placedCount(), 0, "windows are covered again, not stalled forever");
    }

    function test_PendingTickIsNotReplacedWhileStillInItsGracePeriod() public {
        _enrolAll();
        _deliverCreated();
        uint256 first = engine.pendingTickAt();

        // Still within grace: a second window must reuse the outstanding tick.
        _useWindow(bytes32(uint256(0xC0FFEE)));
        _deliverCreated();
        assertEq(engine.pendingTickAt(), first, "one tick still serves both windows");
    }

    // ------------------------------------ permissionless escapes from the sweep

    /// `activeSubscriptionId` is set by the owner and cleared by the owner — but the
    /// PROTOCOL removes a subscription on its own when the balance cannot cover a
    /// callback. Without reconciliation the engine keeps reporting `subscribed: true`.
    function test_ReconcileClearsASubscriptionTheProtocolRemoved() public {
        assertGt(engine.activeSubscriptionId(), 0);
        (,,, bool subscribedBefore,) = engine.subscriptionHealth();
        assertTrue(subscribedBefore);

        // The protocol drops it from under us. No owner action, no notification.
        MockPrecompile(PRECOMPILE).protocolRemove(engine.activeSubscriptionId());

        bool live = engine.reconcileSubscription();
        assertFalse(live, "reconcile reports it is gone");
        assertEq(engine.activeSubscriptionId(), 0, "and the flag is corrected");

        (,,, bool subscribedAfter,) = engine.subscriptionHealth();
        assertFalse(subscribedAfter, "health stops claiming a subscription that is gone");
    }

    function test_ReconcileIsPermissionlessAndLeavesALiveSubscriptionAlone() public {
        uint256 id = engine.activeSubscriptionId();
        vm.prank(makeAddr("anyone"));
        bool live = engine.reconcileSubscription();
        assertTrue(live);
        assertEq(engine.activeSubscriptionId(), id, "a live subscription is untouched");
    }

    /// `pendingList` only shrank when a window was attempted. If ticks stop, it grows
    /// without limit — 218 dead entries accumulated in production. Pruning is
    /// permissionless and can only drop windows the module says are no longer Trading.
    function test_PrunePendingDropsDeadWindowsAndOnlyDeadOnes() public {
        _enrolAll();
        _deliverCreated(); // window 1, still Trading
        _useWindow(bytes32(uint256(0xDEAD1)));
        _deliverCreated(); // window 2
        _useWindow(bytes32(uint256(0xDEAD2)));
        _deliverCreated(); // window 3
        assertEq(engine.pendingCount(), 3);

        // Window 3's market locks; the other two are still open.
        market.setStatus(2);

        vm.prank(makeAddr("anyone"));
        uint256 pruned = engine.prunePending(10);

        assertEq(pruned, 1, "only the dead window went");
        assertEq(engine.pendingCount(), 2, "live windows keep their place");
    }

    function test_PrunePendingIsBounded() public {
        _enrolAll();
        for (uint256 i; i < 4; ++i) {
            _useWindow(bytes32(uint256(0xB000 + i)));
            _deliverCreated();
            market.setStatus(2); // each one dead immediately
        }
        assertEq(engine.pendingCount(), 4);
        uint256 pruned = engine.prunePending(2);
        assertEq(pruned, 2, "respects the cap");
        assertEq(engine.pendingCount(), 2);
    }

    function test_OneTickServesManyWindows() public {
        _enrolAll();
        _deliverCreated();
        uint256 firstTick = engine.pendingTickAt();

        _useWindow(bytes32(uint256(0xAAA1)));
        _deliverCreated();
        _useWindow(bytes32(uint256(0xAAA2)));
        _deliverCreated();

        assertEq(engine.pendingCount(), 3, "three windows queued");
        assertEq(engine.pendingTickAt(), firstTick, "still ONE tick, not three");
    }
}
