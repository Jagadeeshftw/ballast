// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {ContractTrader, IBinaryPool, IERC20} from "../src/Probe.sol";

contract Q1KillQuestion is Test {
    address constant TUSDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;
    address constant POOL  = 0x2e50436AFC71fC5eB1b2d81F060FA8D20B3f5819; // BTC-0-02SEP26, 24h window
    uint64  constant MARKET_EXPIRY = 1788307200;

    ContractTrader trader;

    function setUp() public {
        vm.createSelectFork("https://dream-rpc.somnia.network/");
        trader = new ContractTrader();
        console2.log("fork block   :", block.number);
        console2.log("fork time    :", block.timestamp);
        console2.log("trader addr  :", address(trader));
        console2.log("trader code? :", address(trader).code.length > 0);
    }

    function test_ContractCanObtainCollateral() public {
        trader.getCollateral(TUSDC, 10_000e6);
        uint256 bal = IERC20(TUSDC).balanceOf(address(trader));
        console2.log("tUSDC balance of CONTRACT:", bal);
        assertEq(bal, 10_000e6, "contract could not mint testnet collateral");
    }

    function test_ContractCanPlaceRestingBid() public {
        trader.getCollateral(TUSDC, 10_000e6);
        trader.approvePool(TUSDC, POOL);

        IBinaryPool.BookParams memory p = IBinaryPool(POOL).getOrderBookParameters();
        console2.log("tick/minQty/lot:", p.tickSize, p.minQuantity, p.lotSize);

        IBinaryPool.Level[] memory bids = IBinaryPool(POOL).getBookLevels(true, 1);
        uint256 restPrice = bids.length > 0 ? bids[0].price - p.tickSize * 5 : 50_000;
        restPrice = (restPrice / p.tickSize) * p.tickSize;

        uint64 expNs = uint64(MARKET_EXPIRY - 60) * 1e9;

        (bool ok, uint128 id) =
            trader.place(POOL, 0 /*BUY_YES*/, restPrice, p.lotSize * 5, expNs, 0 /*LIMIT*/);

        console2.log("placed ok:", ok, "orderId:", id);
        uint128[] memory open = trader.openOrders(POOL);
        console2.log("contract open orders:", open.length);

        assertTrue(ok, "pool rejected placement by a contract");
        assertGt(open.length, 0, "no resting order owned by the contract");
    }

    function test_ContractCanCrossAndFill() public {
        trader.getCollateral(TUSDC, 10_000e6);
        trader.approvePool(TUSDC, POOL);

        IBinaryPool.BookParams memory p = IBinaryPool(POOL).getOrderBookParameters();
        IBinaryPool.Level[] memory asks = IBinaryPool(POOL).getBookLevels(false, 1);
        if (asks.length == 0) { console2.log("no asks resting; skipping cross"); return; }

        console2.log("best ask price/qty:", asks[0].price, asks[0].quantity);
        uint256 qty = asks[0].quantity < p.lotSize * 5 ? asks[0].quantity : p.lotSize * 5;
        uint256 before_ = IERC20(TUSDC).balanceOf(address(trader));
        uint64 expNs = uint64(MARKET_EXPIRY - 60) * 1e9;

        // Cross the touch, FILL_OR_KILL so it either really fills or reverts.
        (bool ok, uint128 id) =
            trader.place(POOL, 0 /*BUY_YES*/, asks[0].price, qty, expNs, 1 /*FILL_OR_KILL*/);

        uint256 spent = before_ - IERC20(TUSDC).balanceOf(address(trader));
        console2.log("cross ok:", ok, "orderId:", id);
        console2.log("collateral spent by contract:", spent);
        assertTrue(ok, "contract could not take liquidity");
        assertGt(spent, 0, "no collateral moved -> no real fill");
    }

    function test_ContractCanMintCompleteSet() public {
        trader.getCollateral(TUSDC, 10_000e6);
        trader.approvePool(TUSDC, POOL);
        uint256 before_ = IERC20(TUSDC).balanceOf(address(trader));
        trader.mint(POOL, 100e6);
        uint256 spent = before_ - IERC20(TUSDC).balanceOf(address(trader));
        console2.log("collateral spent minting complete set:", spent);
        assertEq(spent, 100e6, "mintSet did not draw the expected collateral");
    }
}
