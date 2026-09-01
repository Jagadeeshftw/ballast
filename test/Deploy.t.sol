// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SomniaExtensions} from
    "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

import {BallastVault} from "../src/BallastVault.sol";
import {HedgeEngine} from "../src/HedgeEngine.sol";
import {SpotExposureSource, ISpotPool, IAssetKeyRegistry} from "../src/SpotExposureSource.sol";
import {IExposureSource} from "../src/interfaces/IDreamDex.sol";

/// @notice Rehearses the deploy against LIVE Somnia testnet state, so deploy day is a
///         re-run rather than a first attempt. Everything here is real except the
///         subscription itself, which cannot execute under a fork because the reactivity
///         precompile is node-native (Phase 0, Q5).
contract DeployRehearsalTest is Test {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address constant TUSDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;
    address constant POOL_WETH = 0xD180195da5459C7a0DEA188ed61216ec43682b50;
    address constant POOL_WBTC = 0x3605f28aA7C50e7441211e77Cb0762d49539326C;
    address constant WETH = 0x4d8E02BBfCf205828A8352Af4376b165E123D7b0;
    address constant WBTC = 0x4e85DC48a70DA1298489d5B6FC2492767d98f384;
    address constant USDSO = 0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171;

    address owner = makeAddr("owner");

    BallastVault vault;
    HedgeEngine engine;
    SpotExposureSource source;

    function setUp() public {
        vm.createSelectFork("https://dream-rpc.somnia.network/");

        vault = new BallastVault(IERC20(TUSDC), owner);
        engine = new HedgeEngine(vault, BINARY_MODULE, owner);
        source = new SpotExposureSource(
            IAssetKeyRegistry(address(engine)), IERC20(TUSDC), USDSO, owner
        );

        vm.startPrank(owner);
        vault.setEngineApproval(address(engine), true);
        engine.setExposureSource(IExposureSource(address(source)));
        source.configureAsset("ETH", IERC20(WETH), ISpotPool(POOL_WETH), 200, true);
        source.configureAsset("BTC", IERC20(WBTC), ISpotPool(POOL_WBTC), 200, true);
        vm.stopPrank();
    }

    /// The addresses baked into the deploy script are the TESTNET ones. The Somnia docs'
    /// token table is mainnet, and using it here would price every position at zero.
    function test_ConfiguredAddressesAreTheLiveTestnetOnes() public view {
        assertEq(IERC20Metadata(TUSDC).symbol(), "tUSDC");
        assertEq(IERC20Metadata(TUSDC).decimals(), 6, "collateral is 6dp on testnet");
        assertEq(IERC20Metadata(WETH).symbol(), "WETH");
        assertEq(IERC20Metadata(WETH).decimals(), 18);
        assertEq(IERC20Metadata(WBTC).symbol(), "WBTC");
        assertEq(IERC20Metadata(WBTC).decimals(), 8, "WBTC is 8dp, NOT 18");
        assertEq(IERC20Metadata(USDSO).symbol(), "USDso");
        assertEq(IERC20Metadata(USDSO).decimals(), 18);
        assertGt(BINARY_MODULE.code.length, 0, "module must have code");
    }

    function test_ScalesArePickedUpFromTheRealTokens() public view {
        assertEq(vault.COLLATERAL_DECIMALS(), 6);
        assertEq(source.COLLATERAL_ONE(), 1e6);
        assertEq(source.QUOTE_ONE(), 1e18);
        assertEq(engine.ONE(), 1e6);
    }

    /// Prices a position off the LIVE spot book, end to end.
    function test_PricesRealExposureAgainstTheLiveBook() public {
        address holder = makeAddr("holder");
        deal(WETH, holder, 3e18, true);

        (uint256 price, bool ok) = source.priceOf(source.assetKeyFor("ETH"));
        console2.log("live WETH/USDso mid:", price);
        assertTrue(ok, "the live book must be priceable");
        assertGt(price, 100e18, "sanity: ETH is not under $100");

        // The exposure source is keyed by marketId, so with no window registered it is 0.
        assertEq(source.exposureOf(holder, bytes32(uint256(1))), 0, "unknown window");
    }

    // ------------------------------------------- the funding trap, rehearsed

    /// THE MISTAKE THIS GUARDS. The 32-STT floor is on the ENGINE CONTRACT, not the
    /// deployer EOA. A funded deployer with an empty engine fails inside the precompile
    /// with nothing readable; the script must catch it before it gets there.
    function test_FundingTheDeployerDoesNothingForTheEngine() public {
        address deployer = makeAddr("deployer");
        vm.deal(deployer, 1000 ether); // deployer is rich...

        assertEq(address(engine).balance, 0, "...and the engine is still empty");
        assertLt(
            address(engine).balance,
            SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE,
            "engine is below the floor, so openSubscription would fail"
        );
    }

    function test_EngineBalanceIsTheThingToAssertBeforeSubscribing() public {
        uint256 floor = SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE;
        assertEq(floor, 32 ether, "floor is 32 STT");

        vm.deal(address(engine), floor - 1 wei);
        assertFalse(address(engine).balance >= floor, "one wei short still fails");

        vm.deal(address(engine), 40 ether); // the recommended, generous amount
        assertTrue(address(engine).balance >= floor, "40 STT clears the floor with runway");
    }

    /// Overfunding is safe, which is why the ask should be generous.
    function test_ExcessRunwayIsRecoverable() public {
        vm.deal(address(engine), 100 ether);
        uint256 before = owner.balance;

        vm.prank(owner);
        engine.sweepNative(payable(owner), 60 ether);

        assertEq(owner.balance, before + 60 ether, "excess comes back");
        assertEq(address(engine).balance, 40 ether, "runway kept");
    }

    /// Runway is reported in windows, using the live basefee.
    function test_HealthReadsRunwayAgainstTheLiveBasefee() public {
        vm.deal(address(engine), 40 ether);
        (uint256 bal, uint256 costPerWindow, uint256 windows,,) = engine.subscriptionHealth();

        console2.log("live basefee   :", block.basefee);
        console2.log("cost per window:", costPerWindow);
        console2.log("windows of runway:", windows);

        assertEq(bal, 40 ether);
        assertGt(costPerWindow, 0);
        assertGt(windows, 100, "40 STT should buy plenty of windows");
    }

    /// Under a fork the precompile has no code, so this is the one step deploy day
    /// cannot rehearse. Asserted so the limitation stays visible rather than surprising.
    function test_SubscriptionCannotBeRehearsedOnAFork() public {
        vm.deal(address(engine), 40 ether);
        assertEq(address(0x0100).code.length, 0, "precompile is node-native");

        vm.prank(owner);
        vm.expectRevert();
        engine.openSubscription();
    }

    function test_WiringIsComplete() public view {
        assertTrue(vault.isEngine(address(engine)), "vault approves the engine");
        assertEq(address(engine.exposureSource()), address(source));
        assertEq(address(engine.BINARY_MODULE()), BINARY_MODULE);
        assertEq(address(engine.VAULT()), address(vault));
        assertEq(engine.priorityFeePerGas(), 1 gwei, "non-zero priority fee");
        assertGt(engine.maxBatch(), 0);
    }
}
