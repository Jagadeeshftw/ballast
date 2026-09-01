// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SpotExposureSource, ISpotPool, IAssetKeyRegistry} from "../src/SpotExposureSource.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockSpotPool is ISpotPool {
    Level[] internal _bids;
    Level[] internal _asks;
    mapping(address => mapping(address => uint256)) public vaultBal;

    function setBook(uint256 bid, uint256 ask, uint256 qty) external {
        delete _bids;
        delete _asks;
        if (bid > 0) _bids.push(Level({price: bid, quantity: qty}));
        if (ask > 0) _asks.push(Level({price: ask, quantity: qty}));
    }

    function setVaultBalance(address who, address token, uint256 v) external {
        vaultBal[who][token] = v;
    }

    function getBookLevels(bool isBid, uint64) external view returns (Level[] memory) {
        return isBid ? _bids : _asks;
    }

    function getWithdrawableBalance(address owner, address token)
        external
        view
        returns (uint256)
    {
        return vaultBal[owner][token];
    }
}

contract MockRegistry is IAssetKeyRegistry {
    mapping(bytes32 => bytes32) public keys;

    function set(bytes32 marketId, string memory sym) external {
        keys[marketId] = keccak256(bytes(sym));
    }

    function assetKeyOf(bytes32 marketId) external view returns (bytes32) {
        return keys[marketId];
    }
}

contract SpotExposureSourceTest is Test {
    SpotExposureSource src;
    MockRegistry registry;
    MockSpotPool ethPool;
    MockSpotPool btcPool;
    MockERC20 weth; // 18dp
    MockERC20 wbtc; // 8dp — deliberately not 18, to catch scale bugs
    MockERC20 usdso; // 18dp quote
    MockERC20 tusdc; // 6dp collateral

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");

    bytes32 ethMarket = bytes32(uint256(0xE7A));
    bytes32 btcMarket = bytes32(uint256(0xB7C));

    function setUp() public {
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        wbtc = new MockERC20("Wrapped Bitcoin", "WBTC", 8);
        usdso = new MockERC20("USDso", "USDso", 18);
        tusdc = new MockERC20("Test USDC", "tUSDC", 6);

        registry = new MockRegistry();
        ethPool = new MockSpotPool();
        btcPool = new MockSpotPool();

        src = new SpotExposureSource(
            IAssetKeyRegistry(address(registry)), IERC20(address(tusdc)), address(usdso), owner
        );

        vm.startPrank(owner);
        src.configureAsset("ETH", IERC20(address(weth)), ISpotPool(address(ethPool)), 200, true);
        src.configureAsset("BTC", IERC20(address(wbtc)), ISpotPool(address(btcPool)), 200, true);
        vm.stopPrank();

        registry.set(ethMarket, "ETH");
        registry.set(btcMarket, "BTC");

        // ETH at 2455.17 (18dp quote), a ~2bp spread like the live book.
        ethPool.setBook(2454.91e18, 2455.42e18, 100e18);
        // BTC at 79000, 8dp base.
        btcPool.setBook(78_990e18, 79_010e18, 100e8);
    }

    // ------------------------------------------------------------ valuation

    function test_ValuesEthExposureInCollateralUnits() public {
        weth.mint(alice, 10e18); // 10 WETH
        uint256 e = src.exposureOf(alice, ethMarket);
        // 10 * 2455.165 = 24551.65 tUSDC, at 6dp
        assertApproxEqRel(e, 24_551_650_000, 0.0001e18, "10 WETH valued in tUSDC");
    }

    /// WBTC is 8dp while the quote is 18dp and collateral is 6dp. Correction 4: a
    /// hardcoded scale misprices silently, so this asserts the arithmetic end to end.
    function test_ValuesEightDecimalAssetCorrectly() public {
        wbtc.mint(alice, 1e8); // exactly 1 WBTC
        uint256 e = src.exposureOf(alice, btcMarket);
        assertApproxEqRel(e, 79_000_000_000, 0.001e18, "1 WBTC ~= 79,000 tUSDC");
    }

    function test_IncludesPoolVaultBalance() public {
        weth.mint(alice, 5e18);
        ethPool.setVaultBalance(alice, address(weth), 5e18);
        uint256 e = src.exposureOf(alice, ethMarket);
        assertApproxEqRel(e, 24_551_650_000, 0.0001e18, "wallet + pool vault both count");
    }

    function test_ZeroHoldingsIsZeroExposure() public view {
        assertEq(src.exposureOf(alice, ethMarket), 0);
    }

    // ------------------------------------------------- per-market resolution

    /// The bug this whole design exists to prevent: a WETH holder must read as zero
    /// exposure on a BTC window, not as covered.
    function test_EthHolderHasNoExposureOnABtcWindow() public {
        weth.mint(alice, 10e18);
        assertGt(src.exposureOf(alice, ethMarket), 0, "covered on the ETH window");
        assertEq(src.exposureOf(alice, btcMarket), 0, "NOT covered on the BTC window");
    }

    function test_UnknownMarketPricesAsZero() public {
        weth.mint(alice, 10e18);
        assertEq(src.exposureOf(alice, bytes32(uint256(0xDEAD))), 0, "unregistered window");
    }

    function test_DisabledAssetPricesAsZero() public {
        weth.mint(alice, 10e18);
        vm.prank(owner);
        src.configureAsset("ETH", IERC20(address(weth)), ISpotPool(address(ethPool)), 200, false);
        assertEq(src.exposureOf(alice, ethMarket), 0);
    }

    // ------------------------------------------------------- the sanity band

    function test_RefusesOneSidedBook() public {
        weth.mint(alice, 10e18);
        ethPool.setBook(2454.91e18, 0, 100e18); // no ask
        assertEq(src.exposureOf(alice, ethMarket), 0, "cannot price a one-sided book");
        (, bool ok) = src.priceOf(src.assetKeyFor("ETH"));
        assertFalse(ok);
    }

    function test_RefusesEmptyBook() public {
        weth.mint(alice, 10e18);
        ethPool.setBook(0, 0, 0);
        assertEq(src.exposureOf(alice, ethMarket), 0);
    }

    function test_RefusesZeroQuantityLevels() public {
        weth.mint(alice, 10e18);
        ethPool.setBook(2454.91e18, 2455.42e18, 0);
        assertEq(src.exposureOf(alice, ethMarket), 0, "a level with no size is not a price");
    }

    function test_RefusesCrossedBook() public {
        weth.mint(alice, 10e18);
        ethPool.setBook(2456e18, 2455e18, 100e18); // bid above ask
        assertEq(src.exposureOf(alice, ethMarket), 0, "crossed book is not a price");
    }

    /// §3.3 requirement 6: do not size off a suspect print. A book far wider than the
    /// ~2bp norm is the readable signal that something is wrong.
    function test_RefusesBookWiderThanTheSanityBand() public {
        weth.mint(alice, 10e18);
        ethPool.setBook(2400e18, 2500e18, 100e18); // ~408 bps, band is 200
        assertEq(src.exposureOf(alice, ethMarket), 0, "refuse to price a suspect book");

        // Inside the band it prices normally again.
        ethPool.setBook(2450e18, 2460e18, 100e18); // ~41 bps
        assertGt(src.exposureOf(alice, ethMarket), 0);
    }

    function test_PriceOfExposesWhyForTheUI() public {
        (uint256 p, bool ok) = src.priceOf(src.assetKeyFor("ETH"));
        assertTrue(ok);
        assertEq(p, (2454.91e18 + 2455.42e18) / 2);

        ethPool.setBook(2400e18, 2500e18, 100e18);
        (uint256 p2, bool ok2) = src.priceOf(src.assetKeyFor("ETH"));
        assertFalse(ok2, "the UI can say WHY rather than render a bare zero");
        assertEq(p2, 0);
    }

    // ---------------------------------------------------------------- admin

    function test_OnlyOwnerConfigures() public {
        vm.prank(alice);
        vm.expectRevert();
        src.configureAsset("ETH", IERC20(address(weth)), ISpotPool(address(ethPool)), 200, true);
    }

    function test_RejectsNonsenseSpreadBand() public {
        vm.startPrank(owner);
        vm.expectRevert(SpotExposureSource.BadParameter.selector);
        src.configureAsset("ETH", IERC20(address(weth)), ISpotPool(address(ethPool)), 0, true);
        vm.expectRevert(SpotExposureSource.BadParameter.selector);
        src.configureAsset("ETH", IERC20(address(weth)), ISpotPool(address(ethPool)), 10_000, true);
        vm.stopPrank();
    }

    function test_ScalesReadFromTokensNotAssumed() public view {
        assertEq(src.COLLATERAL_ONE(), 1e6, "tUSDC is 6dp");
        assertEq(src.QUOTE_ONE(), 1e18, "USDso is 18dp");
    }
}
