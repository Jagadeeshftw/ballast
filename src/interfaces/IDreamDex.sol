// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The slice of dreamDEX's binary (Event Contract) surface Ballast uses.
/// @dev    Signatures taken from `@somnia-chain/markets-sdk@0.28.1` and exercised against
///         live testnet pools in `probes/test/Q1.t.sol`. Two details are load-bearing:
///
///         - The generic `placeOrder` reverts `UseBinaryPlacement` on a binary pool. The
///           Up/Down side is an explicit `kind`, and `price` is ALWAYS the Up-side price.
///         - `builderFeeBpsTimes1k` must be `uint96`. It is selector-critical; `uint256`
///           produces a different selector that does not exist on the pool.
interface IBinaryPool {
    struct Level {
        uint256 price;
        uint256 quantity;
    }

    struct BookParams {
        uint256 tickSize;
        uint256 minQuantity;
        uint256 lotSize;
    }

    /// @param kind 0 BUY_YES, 1 SELL_YES, 2 BUY_NO, 3 SELL_NO
    /// @param price Always the Up-side price, in collateral units.
    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k,
        uint64 userData
    ) external payable returns (bool success, uint128 id);

    /// @notice One book, quoted in Up terms. The Down ask is `ONE - bestUpBid`, because a
    ///         Buy-Down crosses a resting Buy-Up by mint-a-pair.
    function getBookLevels(bool isBid, uint64 numLevels)
        external
        view
        returns (Level[] memory);

    function getOrderBookParameters() external view returns (BookParams memory);

    function collateralToken() external view returns (address);
}

interface IBinaryMarket {
    /// @notice 0 Listed, 1 Trading, 2 Locked, 3 Settling, 4 Resolved, 5 Voided.
    ///         Only `Trading` accepts orders, and status is time-derived on-chain, so it
    ///         must be read live rather than taken from an indexer.
    function status() external view returns (uint8);

    /// @notice The market stores a payout VECTOR, not a single winner —
    ///         `winningOutcome()` was removed in the payout-vector refactor. Index 0 is
    ///         Up, index 1 is Down. Empty until resolved.
    /// @dev    Reading the vector is what keeps the zero-move case honest: there is no
    ///         `<` / `<=` comparison anywhere in Ballast that a flat close could fall
    ///         through. A flat close satisfies the venue's `>=` predicate, so Up wins and
    ///         the Down vector entry is zero.
    function payoutNumerators() external view returns (uint256[] memory);

    function isResolved() external view returns (bool);
    function isVoided() external view returns (bool);

    /// @notice `expiry + settlementWindow` is the instant `voidExpired()` becomes callable.
    function expiry() external view returns (uint64);
    function settlementWindow() external view returns (uint64);

    /// @notice Permissionless backstop: once the settlement window lapses with no oracle
    ///         answer, anyone may void the market. Both sides then redeem at 0.5.
    function voidExpired() external;
}

interface IBinaryMarketsModule {
    /// @dev The on-chain function returns fourteen values. Every field is a static type,
    ///      so a struct return is byte-identical to the tuple and decodes the same — but
    ///      it keeps callers off the stack limit and reads far better at the call site.
    struct MarketRow {
        uint256 oracleQuestionId;
        uint8 outcomeSlotCount;
        uint8 voidPolicy;
        address collateral;
        uint32 originOperatorId;
        bytes32 originVenueId;
        address oracleAdapter;
        address creator;
        address market;
        address pool;
        uint256 yesId;
        uint256 noId;
        uint64 tradingStart;
        uint64 expiry;
    }

    function markets(bytes32 marketId) external view returns (MarketRow memory);

    /// @notice Burns `amount` of the caller's outcome tokens and pays the settled value.
    /// @dev    Redeeming a LOSING position SUCCEEDS and pays zero — it does not revert.
    ///         Treating a zero payout as a failure would mark healthy settlements as
    ///         errors, so callers must not.
    function redeem(
        uint32 operatorId,
        bytes32 venueId,
        bytes32 marketId,
        uint8 outcomeIdx,
        uint256 amount
    ) external;

    function finalizeMarket(bytes32 marketId) external;

    /// @notice Permissionless backstop: pulls a posted oracle answer and resolves.
    function pokeOracle(uint256 oracleQuestionId) external;
}

interface IOutcomeToken6909 {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
    function setOperator(address spender, bool approved) external returns (bool);
}

/// @notice Ballast's measured view of a user's spot exposure.
/// @dev    Phase 0 established exposure IS readable on-chain (wallet balances, pool vault
///         balances, and signed perp position size), so Ballast covers MEASURED exposure.
///         The word "declared" must never appear in any surface.
interface IExposureSource {
    /// @param user     The covered user.
    /// @param marketId  The window being covered. The source resolves it to an asset via
    ///                  the module's `markets(marketId)` — the engine deliberately does
    ///                  NOT pass an asset string, because `MarketCreated` carries `asset`
    ///                  in non-indexed data and a stubbed value would silently cover a
    ///                  BTC window against ETH exposure.
    /// @return exposure The user's spot exposure valued in COLLATERAL units.
    function exposureOf(address user, bytes32 marketId)
        external
        view
        returns (uint256 exposure);

    /// @notice The spot price the source would use for `assetKey`, and whether it is
    ///         usable. The engine records this at window creation to fix the window's
    ///         OPENING PRICE, which is the basis every coverage claim is measured against.
    function priceOf(bytes32 assetKey) external view returns (uint256 price, bool ok);
}
