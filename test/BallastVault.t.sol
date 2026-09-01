// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BallastVault} from "../src/BallastVault.sol";
import {MockERC20, FeeOnTransferERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BallastVaultTest is Test {
    BallastVault vault;
    MockERC20 usdc;

    address owner = makeAddr("owner");
    address engine = makeAddr("engine");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 constant WINDOW_A = bytes32(uint256(0xA));
    bytes32 constant WINDOW_B = bytes32(uint256(0xB));

    uint256 constant ONE = 1e6; // tUSDC is 6dp

    /// A representative exposure for premium-ceiling arithmetic: $10,000.
    uint256 constant EXPOSURE = 10_000 * ONE;

    function setUp() public {
        usdc = new MockERC20("Test USDC", "tUSDC", 6);
        vault = new BallastVault(IERC20(address(usdc)), owner);

        vm.prank(owner);
        vault.setEngineApproval(engine, true);

        usdc.mint(alice, 100_000 * ONE);
        usdc.mint(bob, 100_000 * ONE);

        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);

        // The engine is the trader of record: it receives premium from `spendForCover`
        // and the vault pulls settlement proceeds back from it.
        usdc.mint(engine, 100_000 * ONE);
        vm.prank(engine);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ------------------------------------------------------------- helpers

    function _deposit(address who, uint256 amt) internal {
        vm.prank(who);
        vault.deposit(amt);
    }

    /// Default policy: make whole at 250bps, premium ceiling 500bps of exposure,
    /// notional cap `cap`.
    function _policy(address who, uint256 cap, uint64 dur) internal {
        vm.prank(who);
        vault.setPolicy(250, 500, cap, uint64(block.timestamp) + dur);
    }

    function _policyFull(address who, uint16 mwBps, uint16 premBps, uint256 cap, uint64 dur)
        internal
    {
        vm.prank(who);
        vault.setPolicy(mwBps, premBps, cap, uint64(block.timestamp) + dur);
    }

    /// I1..I3 — asserted after every state-changing test.
    function _assertInvariants() internal view {
        address[2] memory users = [alice, bob];
        uint256 sum;
        for (uint256 i; i < users.length; ++i) {
            assertLe(vault.reservedOf(users[i]), vault.collateralOf(users[i]), "I1");
            sum += vault.collateralOf(users[i]);
        }
        assertEq(sum, vault.totalCollateral(), "I2");
        assertLe(vault.totalCollateral(), usdc.balanceOf(address(vault)), "I3");
    }

    // ------------------------------------------------------------ deposits

    function test_DepositCreditsBalance() public {
        _deposit(alice, 100 * ONE);
        assertEq(vault.collateralOf(alice), 100 * ONE);
        assertEq(vault.freeBalanceOf(alice), 100 * ONE);
        assertEq(vault.totalCollateral(), 100 * ONE);
        _assertInvariants();
    }

    function test_DepositZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(BallastVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_CollateralDecimalsCachedFromToken() public view {
        assertEq(vault.COLLATERAL_DECIMALS(), 6, "must read decimals(), never hardcode");
    }

    /// Correction 4: an 18dp collateral must be reported as 18dp, not assumed 6.
    function test_CollateralDecimalsFollowsAnEighteenDecimalToken() public {
        MockERC20 usdso = new MockERC20("USDso", "USDso", 18);
        BallastVault v18 = new BallastVault(IERC20(address(usdso)), owner);
        assertEq(v18.COLLATERAL_DECIMALS(), 18);
    }

    function test_FeeOnTransferCreditsOnlyWhatArrived() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20(100); // 1%
        BallastVault v = new BallastVault(IERC20(address(fee)), owner);
        fee.mint(alice, 1000 * ONE);

        vm.startPrank(alice);
        fee.approve(address(v), type(uint256).max);
        v.deposit(1000 * ONE);
        vm.stopPrank();

        assertEq(v.collateralOf(alice), 990 * ONE, "credited more than arrived");
        assertLe(v.totalCollateral(), fee.balanceOf(address(v)), "I3 broken by fee token");
    }

    // ----------------------------------------------------------- withdraws

    function test_WithdrawFreeBalance() public {
        _deposit(alice, 100 * ONE);
        vm.prank(alice);
        vault.withdraw(40 * ONE);
        assertEq(vault.collateralOf(alice), 60 * ONE);
        _assertInvariants();
    }

    function test_WithdrawCannotTouchReserved() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);

        vm.prank(engine);
        vault.reserve(alice, WINDOW_A, 60 * ONE, EXPOSURE);

        assertEq(vault.freeBalanceOf(alice), 40 * ONE);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                BallastVault.InsufficientFreeBalance.selector, 41 * ONE, 40 * ONE
            )
        );
        vault.withdraw(41 * ONE);

        vm.prank(alice);
        vault.withdraw(40 * ONE);
        assertEq(vault.freeBalanceOf(alice), 0);
        _assertInvariants();
    }

    function test_WithdrawWorksAfterRevoke() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);
        vm.prank(alice);
        vault.revoke();

        vm.prank(alice);
        vault.withdraw(100 * ONE);
        assertEq(vault.collateralOf(alice), 0);
        _assertInvariants();
    }

    // ------------------------------------------------------ policy lifecycle

    function test_PolicyStartsInactive() public view {
        (bool active,,,,) = vault.policyOf(alice);
        assertFalse(active);
        assertFalse(vault.isCoverable(alice));
    }

    function test_SetPolicyStoresBothCeilings() public {
        _deposit(alice, 100 * ONE);
        uint64 exp = uint64(block.timestamp) + 1 days;
        vm.prank(alice);
        vault.setPolicy(250, 500, 50 * ONE, exp);

        (bool active, uint16 mw, uint16 prem, uint64 expiry, uint256 cap) = vault.policyOf(alice);
        assertTrue(active);
        assertEq(mw, 250, "makeWholeBps");
        assertEq(prem, 500, "maxPremiumBpsPerWindow");
        assertEq(expiry, exp);
        assertEq(cap, 50 * ONE);
        assertTrue(vault.isCoverable(alice));
    }

    function test_SetPolicyRejectsZeroDial() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(BallastVault.MakeWholeOutOfRange.selector, 0, 10_000)
        );
        vault.setPolicy(0, 500, 50 * ONE, uint64(block.timestamp) + 1 days);
    }

    function test_SetPolicyRejectsDialAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(BallastVault.MakeWholeOutOfRange.selector, 10_001, 10_000)
        );
        vault.setPolicy(10_001, 500, 50 * ONE, uint64(block.timestamp) + 1 days);
    }

    function test_SetPolicyRejectsPremiumCeilingAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(BallastVault.PremiumCapOutOfRange.selector, 10_001, 10_000)
        );
        vault.setPolicy(250, 10_001, 50 * ONE, uint64(block.timestamp) + 1 days);
    }

    function test_SetPolicyAcceptsBoundaryValues() public {
        vm.prank(alice);
        vault.setPolicy(1, 0, 0, uint64(block.timestamp) + 60); // minimum everything
        (bool active, uint16 mw, uint16 prem,,) = vault.policyOf(alice);
        assertTrue(active);
        assertEq(mw, 1);
        assertEq(prem, 0);

        vm.prank(bob);
        vault.setPolicy(10_000, 10_000, type(uint256).max, uint64(block.timestamp) + 1 days);
        (, uint16 mw2, uint16 prem2,,) = vault.policyOf(bob);
        assertEq(mw2, 10_000);
        assertEq(prem2, 10_000);
    }

    function test_SetPolicyRejectsTooShortDuration() public {
        uint64 tooSoon = uint64(block.timestamp) + 59;
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                BallastVault.PolicyDurationTooShort.selector, tooSoon, block.timestamp + 60
            )
        );
        vault.setPolicy(250, 500, 50 * ONE, tooSoon);
    }

    function test_RevokeIsImmediateAndNobodyCanUndoIt() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);
        assertTrue(vault.isCoverable(alice));

        vm.prank(alice);
        vault.revoke();
        assertFalse(vault.isCoverable(alice));

        // setPolicy is msg.sender-scoped: the most owner or engine can do is set their own.
        vm.prank(owner);
        vault.setPolicy(250, 500, 1e18, uint64(block.timestamp) + 1 days);
        assertFalse(vault.isCoverable(alice), "alice must stay revoked");

        vm.prank(engine);
        vault.setPolicy(250, 500, 1e18, uint64(block.timestamp) + 1 days);
        assertFalse(vault.isCoverable(alice), "alice must stay revoked");
    }

    function test_RevokeIsIdempotent() public {
        _policy(alice, 100 * ONE, 1 days);
        vm.startPrank(alice);
        vault.revoke();
        vault.revoke();
        vm.stopPrank();
        assertFalse(vault.isCoverable(alice));
    }

    function test_PolicyExpiresOnItsOwn() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 hours);
        assertTrue(vault.isCoverable(alice));
        vm.warp(block.timestamp + 1 hours + 1);
        assertFalse(vault.isCoverable(alice));
    }

    // ------------------------------------------------- reserve: consent gate

    function test_ReserveRequiresActivePolicy() public {
        _deposit(alice, 100 * ONE);
        vm.prank(engine);
        vm.expectRevert(BallastVault.NoActivePolicy.selector);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
    }

    function test_RevokedUserNeverReceivesCover() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);
        vm.prank(alice);
        vault.revoke();

        vm.prank(engine);
        vm.expectRevert(BallastVault.NoActivePolicy.selector);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
    }

    function test_ExpiredPolicyNeverReceivesCover() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(engine);
        vm.expectRevert();
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
    }

    function test_PolicyValidAtExactExpirySecond() public {
        _deposit(alice, 100 * ONE);
        uint64 exp = uint64(block.timestamp) + 1 hours;
        vm.prank(alice);
        vault.setPolicy(250, 500, 100 * ONE, exp);

        vm.warp(exp); // inclusive boundary
        vm.prank(engine);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
        assertEq(vault.reservedOf(alice), 10 * ONE);
    }

    function test_OnlyEngineMayReserve() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);

        vm.prank(alice);
        vm.expectRevert(BallastVault.NotEngine.selector);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);

        vm.prank(owner);
        vm.expectRevert(BallastVault.NotEngine.selector);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
    }

    // ------------------------------------------- reserve: the two ceilings

    function test_NotionalCapBinds() public {
        _deposit(alice, 100_000 * ONE);
        // premium ceiling is generous (50% of 10k = 5000); notional cap is 100
        _policyFull(alice, 250, 5000, 100 * ONE, 1 days);

        vm.prank(engine);
        vault.reserve(alice, WINDOW_A, 100 * ONE, EXPOSURE); // exactly the cap

        vm.prank(engine);
        vm.expectRevert(
            abi.encodeWithSelector(
                BallastVault.NotionalCapExceeded.selector, 1, 100 * ONE, 100 * ONE
            )
        );
        vault.reserve(alice, WINDOW_A, 1, EXPOSURE);
        _assertInvariants();
    }

    /// The premium ceiling is the one that binds when the book is expensive — the
    /// normal case for at-the-money cover.
    function test_PremiumCapBindsWhenBookIsExpensive() public {
        _deposit(alice, 100_000 * ONE);
        // notional cap generous; premium ceiling 50bps of $10k = $50
        _policyFull(alice, 250, 50, 100_000 * ONE, 1 days);

        uint256 cap = vault.premiumCapFor(alice, EXPOSURE);
        assertEq(cap, 50 * ONE, "50bps of 10k exposure");

        vm.prank(engine);
        vault.reserve(alice, WINDOW_A, 50 * ONE, EXPOSURE); // exactly the ceiling

        vm.prank(engine);
        vm.expectRevert(
            abi.encodeWithSelector(
                BallastVault.PremiumCapExceeded.selector, 1, 50 * ONE, 50 * ONE
            )
        );
        vault.reserve(alice, WINDOW_A, 1, EXPOSURE);
        _assertInvariants();
    }

    /// Hazard 1: as the Down price q approaches 1, the size needed to make whole
    /// diverges. The premium ceiling must stop it rather than draining the user.
    function test_PremiumCapStopsDivergingSize() public {
        _deposit(alice, 100_000 * ONE);
        _policyFull(alice, 250, 100, 100_000 * ONE, 1 days); // 100bps ceiling = $100

        // Engine computes N = E*x/(1-q) with q = 0.99 -> premium far beyond the ceiling.
        uint256 wildPremium = 25_000 * ONE;

        (uint256 limit, BallastVault.Binding binding) =
            vault.bindingLimit(alice, WINDOW_A, EXPOSURE);
        assertEq(limit, 100 * ONE, "premium ceiling caps it");
        assertEq(uint256(binding), uint256(BallastVault.Binding.PremiumCap));

        vm.prank(engine);
        vm.expectRevert();
        vault.reserve(alice, WINDOW_A, wildPremium, EXPOSURE);

        // The engine's correct move is to buy `limit` and report a degraded make-whole.
        vm.prank(engine);
        vault.reserve(alice, WINDOW_A, limit, EXPOSURE);
        assertEq(vault.reservedOf(alice), 100 * ONE);
        _assertInvariants();
    }

    function test_ZeroPremiumCeilingBlocksAllCover() public {
        _deposit(alice, 100_000 * ONE);
        _policyFull(alice, 250, 0, 100_000 * ONE, 1 days);

        (uint256 limit, BallastVault.Binding binding) =
            vault.bindingLimit(alice, WINDOW_A, EXPOSURE);
        assertEq(limit, 0);
        assertEq(uint256(binding), uint256(BallastVault.Binding.PremiumCap));

        vm.prank(engine);
        vm.expectRevert();
        vault.reserve(alice, WINDOW_A, 1, EXPOSURE);
    }

    /// Zero exposure means the premium ceiling is zero, whatever the bps.
    function test_ZeroExposureBlocksCover() public {
        _deposit(alice, 100_000 * ONE);
        _policyFull(alice, 250, 5000, 100_000 * ONE, 1 days);

        vm.prank(engine);
        vm.expectRevert(
            abi.encodeWithSelector(BallastVault.PremiumCapExceeded.selector, 1, 0, 0)
        );
        vault.reserve(alice, WINDOW_A, 1, 0);
    }

    function test_ReserveCannotExceedFreeBalance() public {
        _deposit(alice, 50 * ONE);
        _policyFull(alice, 250, 10_000, type(uint256).max, 1 days);

        vm.prank(engine);
        vm.expectRevert(
            abi.encodeWithSelector(
                BallastVault.InsufficientFreeBalance.selector, 51 * ONE, 50 * ONE
            )
        );
        vault.reserve(alice, WINDOW_A, 51 * ONE, EXPOSURE);
    }

    function test_CapsArePerWindow() public {
        _deposit(alice, 100_000 * ONE);
        _policyFull(alice, 250, 5000, 100 * ONE, 1 days);

        vm.startPrank(engine);
        vault.reserve(alice, WINDOW_A, 100 * ONE, EXPOSURE);
        vault.reserve(alice, WINDOW_B, 100 * ONE, EXPOSURE); // its own window, its own caps
        vm.stopPrank();

        assertEq(vault.reservedOf(alice), 200 * ONE);
        _assertInvariants();
    }

    // ------------------------------------------------------- bindingLimit

    function test_BindingLimitIdentifiesTightestConstraint() public {
        // free balance binds
        _deposit(alice, 10 * ONE);
        _policyFull(alice, 250, 5000, 100_000 * ONE, 1 days);
        (uint256 l1, BallastVault.Binding b1) = vault.bindingLimit(alice, WINDOW_A, EXPOSURE);
        assertEq(l1, 10 * ONE);
        assertEq(uint256(b1), uint256(BallastVault.Binding.FreeBalance));

        // notional cap binds
        _deposit(bob, 100_000 * ONE);
        _policyFull(bob, 250, 5000, 75 * ONE, 1 days);
        (uint256 l2, BallastVault.Binding b2) = vault.bindingLimit(bob, WINDOW_A, EXPOSURE);
        assertEq(l2, 75 * ONE);
        assertEq(uint256(b2), uint256(BallastVault.Binding.NotionalCap));
    }

    function test_BindingLimitShrinksAsWindowIsCommitted() public {
        _deposit(alice, 100_000 * ONE);
        _policyFull(alice, 250, 100, 100_000 * ONE, 1 days); // $100 premium ceiling

        vm.prank(engine);
        vault.reserve(alice, WINDOW_A, 40 * ONE, EXPOSURE);

        (uint256 limit, BallastVault.Binding binding) =
            vault.bindingLimit(alice, WINDOW_A, EXPOSURE);
        assertEq(limit, 60 * ONE);
        assertEq(uint256(binding), uint256(BallastVault.Binding.PremiumCap));
    }

    /// Whatever `bindingLimit` reports must actually be reservable — otherwise the
    /// engine sizes to a number the vault then rejects.
    function testFuzz_BindingLimitIsAlwaysReservable(uint96 dep, uint96 cap, uint16 premBps)
        public
    {
        uint256 d = uint256(dep) % (50_000 * ONE) + 1;
        uint256 c = uint256(cap) % (50_000 * ONE);
        uint16 pb = uint16(bound(premBps, 0, 10_000));

        _deposit(alice, d);
        _policyFull(alice, 250, pb, c, 1 days);

        (uint256 limit,) = vault.bindingLimit(alice, WINDOW_A, EXPOSURE);
        if (limit > 0) {
            vm.prank(engine);
            vault.reserve(alice, WINDOW_A, limit, EXPOSURE);
            assertEq(vault.reservedOf(alice), limit);
        }
        // ...and one wei more must always fail.
        vm.prank(engine);
        vm.expectRevert();
        vault.reserve(alice, WINDOW_A, 1, EXPOSURE);
        _assertInvariants();
    }

    // ----------------------------------------------- release / spend / credit

    function test_ReleaseRestoresBalanceAndBothHeadrooms() public {
        _deposit(alice, 100_000 * ONE);
        _policyFull(alice, 250, 100, 100_000 * ONE, 1 days);

        vm.startPrank(engine);
        vault.reserve(alice, WINDOW_A, 100 * ONE, EXPOSURE);
        vault.releaseReservation(alice, WINDOW_A, 100 * ONE);
        vm.stopPrank();

        assertEq(vault.reservedOf(alice), 0);
        assertEq(vault.freeBalanceOf(alice), 100_000 * ONE);
        (uint256 limit,) = vault.bindingLimit(alice, WINDOW_A, EXPOSURE);
        assertEq(limit, 100 * ONE, "premium headroom restored");
        _assertInvariants();
    }

    function test_PartialFillLeavesCeilingsMeasuringActualSpend() public {
        _deposit(alice, 100_000 * ONE);
        _policyFull(alice, 250, 100, 100_000 * ONE, 1 days);

        vm.startPrank(engine);
        vault.reserve(alice, WINDOW_A, 100 * ONE, EXPOSURE);
        vault.spendForCover(alice, WINDOW_A, 60 * ONE); // only 60 filled
        vault.releaseReservation(alice, WINDOW_A, 40 * ONE);
        vm.stopPrank();

        assertEq(vault.reservedOf(alice), 0);
        assertEq(vault.collateralOf(alice), 100_000 * ONE - 60 * ONE);
        assertEq(vault.committedInWindow(alice, WINDOW_A), 60 * ONE, "ceilings count real spend");
        (uint256 limit,) = vault.bindingLimit(alice, WINDOW_A, EXPOSURE);
        assertEq(limit, 40 * ONE);
    }

    function test_RecordSpendDebitsBalanceAndReservation() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);

        vm.startPrank(engine);
        vault.reserve(alice, WINDOW_A, 50 * ONE, EXPOSURE);
        vault.spendForCover(alice, WINDOW_A, 50 * ONE);
        vm.stopPrank();

        assertEq(vault.reservedOf(alice), 0);
        assertEq(vault.collateralOf(alice), 50 * ONE);
        assertEq(usdc.balanceOf(engine), 100_000 * ONE + 50 * ONE, "premium reached the engine");
        assertEq(vault.surplus(), 0, "accounting and custody move together");
        _assertInvariants();
    }

    function test_CannotSpendMoreThanReserved() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);

        vm.startPrank(engine);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
        vm.expectRevert(
            abi.encodeWithSelector(
                BallastVault.InsufficientReservation.selector, 11 * ONE, 10 * ONE
            )
        );
        vault.spendForCover(alice, WINDOW_A, 11 * ONE);
        vm.stopPrank();
    }

    function test_CannotReleaseMoreThanReserved() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);

        vm.startPrank(engine);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
        vm.expectRevert(
            abi.encodeWithSelector(
                BallastVault.InsufficientReservation.selector, 11 * ONE, 10 * ONE
            )
        );
        vault.releaseReservation(alice, WINDOW_A, 11 * ONE);
        vm.stopPrank();
    }

    function test_CreditProceedsIncreasesClaim() public {
        _deposit(alice, 100 * ONE);

        vm.prank(engine);
        vault.creditProceeds(alice, WINDOW_A, 25 * ONE);

        assertEq(vault.collateralOf(alice), 125 * ONE);
        _assertInvariants();
    }

    function test_OnlyEngineMayMoveCollateral() public {
        _deposit(alice, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);

        vm.startPrank(alice);
        vm.expectRevert(BallastVault.NotEngine.selector);
        vault.spendForCover(alice, WINDOW_A, 1);
        vm.expectRevert(BallastVault.NotEngine.selector);
        vault.releaseReservation(alice, WINDOW_A, 1);
        vm.expectRevert(BallastVault.NotEngine.selector);
        vault.creditProceeds(alice, WINDOW_A, 1);
        vm.stopPrank();
    }

    function test_UsersAreIsolated() public {
        _deposit(alice, 100 * ONE);
        _deposit(bob, 100 * ONE);
        _policy(alice, 100 * ONE, 1 days);

        vm.startPrank(engine);
        vault.reserve(alice, WINDOW_A, 100 * ONE, EXPOSURE);
        vault.spendForCover(alice, WINDOW_A, 100 * ONE);
        vm.stopPrank();

        assertEq(vault.collateralOf(bob), 100 * ONE);
        vm.prank(bob);
        vault.withdraw(100 * ONE);
        _assertInvariants();
    }

    // ---------------------------------------------------------------- admin

    /// Two engines must be able to coexist: a redeployed engine takes new enrolments
    /// while the previous one settles the cover it already opened.
    function test_MultipleEnginesCanBeApproved() public {
        address engineB = makeAddr("engineB");
        vm.prank(owner);
        vault.setEngineApproval(engineB, true);

        assertTrue(vault.isEngine(engine));
        assertTrue(vault.isEngine(engineB));

        _deposit(alice, 1000 * ONE);
        _policy(alice, 1000 * ONE, 1 days);

        vm.prank(engine);
        vault.reserve(alice, WINDOW_A, 100 * ONE, EXPOSURE);
        vm.prank(engineB);
        vault.reserve(alice, WINDOW_B, 100 * ONE, EXPOSURE);
        assertEq(vault.reservedOf(alice), 200 * ONE, "both engines can act");
        _assertInvariants();
    }

    function test_RevokedEngineLosesAccess() public {
        _deposit(alice, 1000 * ONE);
        _policy(alice, 1000 * ONE, 1 days);

        vm.prank(owner);
        vault.setEngineApproval(engine, false);

        vm.prank(engine);
        vm.expectRevert(BallastVault.NotEngine.selector);
        vault.reserve(alice, WINDOW_A, 10 * ONE, EXPOSURE);
    }

    function test_OnlyOwnerSetsEngine() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setEngineApproval(alice, true);
    }

    function test_EngineCannotBeZero() public {
        vm.prank(owner);
        vm.expectRevert(BallastVault.ZeroAddress.selector);
        vault.setEngineApproval(address(0), true);
    }

    /// The owner has no path to user funds. This is the property that makes the vault
    /// safe to deposit into, so it is asserted rather than assumed.
    function test_OwnerCannotWithdrawUserFunds() public {
        _deposit(alice, 100 * ONE);
        uint256 ownerBefore = usdc.balanceOf(owner);

        vm.prank(owner);
        vm.expectRevert(BallastVault.NotEngine.selector);
        vault.spendForCover(alice, WINDOW_A, 100 * ONE);

        assertEq(usdc.balanceOf(owner), ownerBefore);
        assertEq(vault.collateralOf(alice), 100 * ONE);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_FreeBalanceNeverUnderflows(uint96 dep, uint96 res) public {
        uint256 d = uint256(dep) % (50_000 * ONE) + 1;
        _deposit(alice, d);
        _policyFull(alice, 250, 10_000, type(uint256).max, 1 days);

        uint256 r = uint256(res) % (d + 1);
        if (r > 0 && r <= EXPOSURE) {
            vm.prank(engine);
            vault.reserve(alice, WINDOW_A, r, EXPOSURE);
            assertEq(vault.freeBalanceOf(alice), d - r);
        }
        _assertInvariants();
    }

    function testFuzz_WithdrawableIsExactlyFree(uint96 dep, uint96 res) public {
        uint256 d = uint256(dep) % (50_000 * ONE) + 1;
        _deposit(alice, d);
        _policyFull(alice, 250, 10_000, type(uint256).max, 1 days);

        uint256 r = uint256(res) % (d + 1);
        if (r > 0 && r <= EXPOSURE) {
            vm.prank(engine);
            vault.reserve(alice, WINDOW_A, r, EXPOSURE);
        }
        uint256 free = vault.freeBalanceOf(alice);
        if (free > 0) {
            vm.prank(alice);
            vault.withdraw(free); // exactly free always succeeds
        }
        assertEq(vault.freeBalanceOf(alice), 0);
        _assertInvariants();
    }
}
