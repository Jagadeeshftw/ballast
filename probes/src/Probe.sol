// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function faucet(uint256 amount) external;               // testnet tUSDC mint-on-demand
}

interface IBinaryPool {
    function placeBinaryOrder(
        uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs,
        uint8 orderType, uint8 selfMatchingOption, address builder,
        uint96 builderFeeBpsTimes1k, uint64 userData
    ) external payable returns (bool success, uint128 id);
    function cancelOrder(uint128 orderId) external;
    function getBookLevels(bool isBid, uint64 numLevels)
        external view returns (Level[] memory);
    function getOrderBookParameters() external view returns (BookParams memory);
    function getOwnOpenOrders() external view returns (uint128[] memory);
    function collateralToken() external view returns (address);
    function mintSet(address yesTo, address noTo, uint256 amount) external;
    struct Level { uint256 price; uint256 quantity; }
    struct BookParams { uint256 tickSize; uint256 minQuantity; uint256 lotSize; }
}

/// @notice Stands in for BallastVault: a *contract* acting as trader of record.
contract ContractTrader {
    function getCollateral(address usdc, uint256 amt) external {
        IERC20(usdc).faucet(amt);
    }

    function approvePool(address usdc, address pool) external {
        IERC20(usdc).approve(pool, type(uint256).max);
    }

    function place(
        address pool, uint8 kind, uint256 price, uint256 qty,
        uint64 expNs, uint8 orderType
    ) external returns (bool ok, uint128 id) {
        (ok, id) = IBinaryPool(pool).placeBinaryOrder(
            kind, price, qty, expNs, orderType, 0, address(0), 0, 0
        );
    }

    function cancel(address pool, uint128 id) external {
        IBinaryPool(pool).cancelOrder(id);
    }

    function openOrders(address pool) external view returns (uint128[] memory) {
        return IBinaryPool(pool).getOwnOpenOrders();
    }

    function mint(address pool, uint256 amount) external {
        IBinaryPool(pool).mintSet(address(this), address(this), amount);
    }
}
