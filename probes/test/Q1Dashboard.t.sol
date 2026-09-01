// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";

/// Phase 0 for the dashboard. Every assertion here is about a FRESH EXTERNALLY OWNED
/// ACCOUNT -- a judge opening the site with a browser wallet -- not about a contract.
/// That distinction is the whole question: the original Phase 0 proved a *contract* can
/// trade. It proved nothing about a visitor.

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface ITestToken {
    function faucet(uint256 amount) external;         // tUSDC only
    function mint(address to, uint256 amount) external; // WETH / WBTC / USDso
}

interface ISpotPool {
    struct Level { uint256 price; uint256 quantity; }
    function getBookLevels(bool isBid, uint64 numLevels) external view returns (Level[] memory);
    function placeOrder(
        bool isBid, uint64 userData, uint256 price, uint256 quantity,
        uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption,
        address builder, uint96 builderFeeBpsTimes1k
    ) external payable returns (uint128);
    function getAutoPullRequirement(address owner, bool isBid, uint256 price, uint256 quantity, uint96 fee)
        external view returns (address inputToken, uint256 requiredAmount, uint256 delta);
    function getWithdrawableBalance(address owner, address token) external view returns (uint256);
    function getManualVaultMode(address user) external view returns (bool);
}

interface IExposureSource {
    function exposureOf(address user, bytes32 marketId) external view returns (uint256);
    function priceOf(bytes32 assetKey) external view returns (uint256, bool);
    function assetKeyFor(string calldata) external pure returns (bytes32);
}

interface IVault {
    function deposit(uint256) external;
    function withdraw(uint256) external;
    function revoke() external;
    function setPolicy(uint16, uint16, uint256, uint64) external;
    function collateralOf(address) external view returns (uint256);
    function freeBalanceOf(address) external view returns (uint256);
    function policyOf(address) external view returns (bool, uint16, uint16, uint64, uint256);
}

interface IEngine {
    function enrol() external;
    function withdrawEnrolment() external;
    function enrolledCount() external view returns (uint256);
}

contract Q1Dashboard is Test {
    address constant TUSDC  = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E; // 6dp
    address constant WETH   = 0x4d8E02BBfCf205828A8352Af4376b165E123D7b0; // 18dp
    address constant USDSO  = 0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171; // 18dp
    address constant POOL   = 0xD180195da5459C7a0DEA188ed61216ec43682b50; // WETH/USDso spot
    address constant VAULT  = 0x9BC43B97c94E23634A561a02EFce641C9e89fe63;
    address constant ENGINE = 0x9026b93dc240244A34B3568aF704a60f4703a115;
    address constant SOURCE = 0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb;

    /// A live ETH window, confirmed to map to assetKey("ETH") via engine.assetKeyOf().
    bytes32 constant ETH_MARKET = bytes32(uint256(0x106d3));

    /// The judge. A fresh address with nothing in it.
    address judge = makeAddr("judge-with-a-browser-wallet");

    function setUp() public {
        vm.createSelectFork("https://dream-rpc.somnia.network/");
        console2.log("fork block:", block.number);
        console2.log("judge     :", judge);
        console2.log("judge code:", judge.code.length); // 0 == EOA
    }

    // ------------------------------------------------------------------ Q2

    function test_Q2_FreshEOA_CanFaucetTusdc() public {
        vm.prank(judge);
        ITestToken(TUSDC).faucet(10_000e6);
        assertEq(IERC20(TUSDC).balanceOf(judge), 10_000e6, "EOA could not faucet tUSDC");
    }

    function test_Q2_FaucetCapIsTenThousand() public {
        vm.prank(judge);
        vm.expectRevert();
        ITestToken(TUSDC).faucet(10_001e6);
    }

    function test_Q2_FaucetIsRepeatable() public {
        vm.startPrank(judge);
        ITestToken(TUSDC).faucet(10_000e6);
        ITestToken(TUSDC).faucet(10_000e6);
        vm.stopPrank();
        assertEq(IERC20(TUSDC).balanceOf(judge), 20_000e6, "faucet is not repeatable");
    }

    // ------------------------------------------------- Q1, route A: mint directly

    function test_Q1a_FreshEOA_CanMintWethDirectly() public {
        vm.prank(judge);
        ITestToken(WETH).mint(judge, 2e18);
        assertEq(IERC20(WETH).balanceOf(judge), 2e18, "EOA could not mint WETH");
    }

    function test_Q1a_FreshEOA_CanMintUsdso() public {
        vm.prank(judge);
        ITestToken(USDSO).mint(judge, 10_000e18);
        assertEq(IERC20(USDSO).balanceOf(judge), 10_000e18, "EOA could not mint USDso");
    }

    // ------------------------------------------- Q1, route B: buy on the spot pool

    function test_Q1b_FreshEOA_CanMarketBuyWethWithUsdso() public {
        ISpotPool.Level[] memory asks = ISpotPool(POOL).getBookLevels(false, 1);
        require(asks.length > 0 && asks[0].quantity > 0, "no ask to lift");
        uint256 price = asks[0].price;
        uint256 qty = asks[0].quantity;
        console2.log("best ask price:", price);
        console2.log("best ask qty  :", qty);

        vm.startPrank(judge);
        ITestToken(USDSO).mint(judge, 1_000_000e18);

        (address inTok, uint256 need,) =
            ISpotPool(POOL).getAutoPullRequirement(judge, true, price, qty, 0);
        console2.log("auto-pull token :", inTok);
        console2.log("auto-pull amount:", need);
        assertEq(inTok, USDSO, "buy leg should pull the quote token");

        IERC20(USDSO).approve(POOL, type(uint256).max);

        // Cross the touch, FILL_OR_KILL: it either really fills or the call reverts.
        ISpotPool(POOL).placeOrder(
            true, 0, price, qty, uint64(block.timestamp + 60) * 1e9, 1, 0, address(0), 0
        );
        vm.stopPrank();

        uint256 got = IERC20(WETH).balanceOf(judge)
            + ISpotPool(POOL).getWithdrawableBalance(judge, WETH);
        console2.log("WETH acquired :", got);
        assertGt(got, 0, "EOA lifted the ask but received no WETH");
    }

    function test_Q1b_NoOperatorGrantNeededForSelfTrade() public view {
        // Manual vault mode is per-user and defaults off, so fills land in the wallet.
        assertFalse(ISpotPool(POOL).getManualVaultMode(judge), "fresh EOA should be auto-pull");
    }

    // ----------------------------------------- Q1, the prize: measured exposure

    function test_Q1c_ExposureSourceMeasuresFreshEOA() public {
        (uint256 px, bool ok) = IExposureSource(SOURCE).priceOf(
            IExposureSource(SOURCE).assetKeyFor("ETH")
        );
        console2.log("ETH price / ok:", px, ok);

        assertEq(IExposureSource(SOURCE).exposureOf(judge, ETH_MARKET), 0, "should start at zero");

        vm.prank(judge);
        ITestToken(WETH).mint(judge, 1e18);

        uint256 exp = IExposureSource(SOURCE).exposureOf(judge, ETH_MARKET);
        console2.log("exposure after minting 1 WETH (tUSDC 6dp):", exp);
        assertGt(exp, 0, "source did not measure a fresh EOA's holding");
    }

    // ------------------------------------------------------------------ Q5

    function test_Q5_WritePathGas() public {
        vm.startPrank(judge);
        ITestToken(TUSDC).faucet(10_000e6);

        uint256 g = gasleft();
        IERC20(TUSDC).approve(VAULT, type(uint256).max);
        console2.log("gas approve        :", g - gasleft());

        g = gasleft();
        IVault(VAULT).deposit(1_000e6);
        console2.log("gas deposit (cold) :", g - gasleft());

        g = gasleft();
        IVault(VAULT).setPolicy(250, 300, 2_000e6, uint64(block.timestamp + 7 days));
        console2.log("gas setPolicy(cold):", g - gasleft());

        g = gasleft();
        IEngine(ENGINE).enrol();
        console2.log("gas enrol          :", g - gasleft());

        g = gasleft();
        IVault(VAULT).revoke();
        console2.log("gas revoke         :", g - gasleft());

        g = gasleft();
        IVault(VAULT).withdraw(1_000e6);
        console2.log("gas withdraw       :", g - gasleft());
        vm.stopPrank();

        assertEq(IVault(VAULT).collateralOf(judge), 0, "withdraw did not return everything");
    }
}

/// Does a visitor buying spot break the very measurement that decides their cover?
/// SpotExposureSource prices off the touch and refuses a book wider than maxSpreadBps.
/// A market buy eats the ask side. These two facts interact.
contract Q1DashboardBookImpact is Test {
    address constant WETH  = 0x4d8E02BBfCf205828A8352Af4376b165E123D7b0;
    address constant USDSO = 0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171;
    address constant POOL  = 0xD180195da5459C7a0DEA188ed61216ec43682b50;
    address constant SOURCE = 0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb;
    bytes32 constant ETH_MARKET = bytes32(uint256(0x106d3));

    address judge = makeAddr("judge-sweeping-the-book");

    function setUp() public { vm.createSelectFork("https://dream-rpc.somnia.network/"); }

    function test_SweepingTheAskBreaksPricing() public {
        bytes32 key = IExposureSource(SOURCE).assetKeyFor("ETH");
        (uint256 pxBefore, bool okBefore) = IExposureSource(SOURCE).priceOf(key);
        console2.log("before -> price, ok:", pxBefore, okBefore);
        assertTrue(okBefore, "book should start priceable");

        ISpotPool.Level[] memory asks = ISpotPool(POOL).getBookLevels(false, 5);
        uint256 worst = asks[asks.length - 1].price;
        uint256 total;
        for (uint256 i; i < asks.length; ++i) total += asks[i].quantity;
        console2.log("sweeping levels:", asks.length, "total qty:", total);

        vm.startPrank(judge);
        ITestToken(USDSO).mint(judge, 10_000_000e18);
        IERC20(USDSO).approve(POOL, type(uint256).max);
        // One marketable limit at the worst level, IOC, sized to eat the whole visible ask.
        ISpotPool(POOL).placeOrder(
            true, 0, worst, total, uint64(block.timestamp + 60) * 1e9, 1, 0, address(0), 0
        );
        vm.stopPrank();

        (uint256 pxAfter, bool okAfter) = IExposureSource(SOURCE).priceOf(key);
        console2.log("after  -> price, ok:", pxAfter, okAfter);
        uint256 exposure = IExposureSource(SOURCE).exposureOf(judge, ETH_MARKET);
        console2.log("judge WETH held    :", IERC20(WETH).balanceOf(judge));
        console2.log("measured exposure  :", exposure);

        if (!okAfter) {
            console2.log(">>> SWEEP BROKE PRICING: exposure reads 0, cover would be SKIPPED");
        }
    }
}
