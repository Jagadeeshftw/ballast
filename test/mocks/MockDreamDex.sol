// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    IBinaryPool,
    IBinaryMarket,
    IBinaryMarketsModule,
    IOutcomeToken6909,
    IExposureSource
} from "../../src/interfaces/IDreamDex.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice A binary pool faithful to the parts Ballast depends on: one book quoted in Up
///         terms, lot/tick grid, and collateral pulled from the caller on placement.
///         Behaviour verified against the real thing in `probes/test/Q1.t.sol`.
contract MockBinaryPool is IBinaryPool {
    MockERC20 public immutable TOKEN;
    uint256 public immutable ONE;

    Level[] internal _bids;
    BookParams public params;

    bool public rejectOrders;
    bool public revertOnPlace;

    uint128 public nextOrderId = 1;

    struct Placed {
        address who;
        uint8 kind;
        uint256 price;
        uint256 quantity;
        uint8 orderType;
    }

    Placed[] public placed;

    constructor(MockERC20 token_, uint256 tickSize, uint256 minQuantity, uint256 lotSize) {
        TOKEN = token_;
        ONE = 10 ** token_.decimals();
        params = BookParams({tickSize: tickSize, minQuantity: minQuantity, lotSize: lotSize});
    }

    function setBid(uint256 price, uint256 quantity) external {
        delete _bids;
        if (quantity > 0) _bids.push(Level({price: price, quantity: quantity}));
    }

    function clearBook() external {
        delete _bids;
    }

    function setRejectOrders(bool v) external {
        rejectOrders = v;
    }

    function setRevertOnPlace(bool v) external {
        revertOnPlace = v;
    }

    function getBookLevels(bool isBid, uint64) external view returns (Level[] memory) {
        if (!isBid) return new Level[](0);
        return _bids;
    }

    function getOrderBookParameters() external view returns (BookParams memory) {
        return params;
    }

    function collateralToken() external view returns (address) {
        return address(TOKEN);
    }

    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8,
        address,
        uint96,
        uint64
    ) external payable returns (bool, uint128) {
        if (revertOnPlace) revert("pool: reverted");
        require(expireTimestampNs > block.timestamp * 1e9, "OrderAlreadyExpired");
        require(quantity >= params.minQuantity, "size");
        require(params.lotSize == 0 || quantity % params.lotSize == 0, "lot");
        if (rejectOrders) return (false, 0);

        // Buying NO at Up-price `price` escrows (ONE - price) per contract.
        uint256 cost = (quantity * (ONE - price)) / ONE;
        require(TOKEN.transferFrom(msg.sender, address(this), cost), "transferFrom");

        placed.push(
            Placed({
                who: msg.sender,
                kind: kind,
                price: price,
                quantity: quantity,
                orderType: orderType
            })
        );
        return (true, nextOrderId++);
    }

    function placedCount() external view returns (uint256) {
        return placed.length;
    }
}

contract MockBinaryMarket is IBinaryMarket {
    uint8 public s = 1; // Trading
    bool public resolved;
    bool public voided;
    uint256[] internal _payouts;
    uint64 public expiry;
    uint64 public settlementWindow = 3600;
    bool public voidExpiredCalled;
    bool public blockVoidExpired;

    constructor() {
        expiry = uint64(block.timestamp + 1 days);
    }

    function setStatus(uint8 v) external {
        s = v;
    }

    function setExpiry(uint64 v) external {
        expiry = v;
    }

    function setBlockVoidExpired(bool v) external {
        blockVoidExpired = v;
    }

    /// @param downWins true -> payout vector [0, D]; false -> [D, 0], which is where a
    ///        FLAT CLOSE lands because the venue predicate is ">=".
    function resolveWith(bool downWins) external {
        resolved = true;
        voided = false;
        s = 4;
        delete _payouts;
        _payouts.push(downWins ? 0 : 10_000_000);
        _payouts.push(downWins ? 10_000_000 : 0);
    }

    function voidIt() external {
        voided = true;
        resolved = false;
        s = 5;
        delete _payouts;
        _payouts.push(5_000_000);
        _payouts.push(5_000_000);
    }

    function status() external view returns (uint8) {
        return s;
    }

    function payoutNumerators() external view returns (uint256[] memory) {
        return _payouts;
    }

    function isResolved() external view returns (bool) {
        return resolved;
    }

    function isVoided() external view returns (bool) {
        return voided;
    }

    function voidExpired() external {
        require(!blockVoidExpired, "not voidable yet");
        require(block.timestamp >= expiry + settlementWindow, "settlement window open");
        voidExpiredCalled = true;
        voided = true;
        s = 5;
        delete _payouts;
        _payouts.push(5_000_000);
        _payouts.push(5_000_000);
    }
}

/// @notice Module stand-in. `redeem` mirrors the two behaviours that matter most:
///         a LOSING redemption SUCCEEDS and pays zero, and a VOIDED market pays 0.5.
contract MockBinaryMarketsModule is IBinaryMarketsModule {
    MockERC20 public immutable TOKEN;
    uint256 public immutable ONE;

    struct Row {
        uint256 oracleQuestionId;
        uint32 operatorId;
        bytes32 venueId;
        address market;
        address pool;
        uint256 yesId;
        uint256 noId;
    }

    mapping(bytes32 => Row) public rows;
    uint256 public pokes;
    uint256 public finalizes;
    bool public finalizeReverts;
    bool public redeemReverts;

    constructor(MockERC20 token_) {
        TOKEN = token_;
        ONE = 10 ** token_.decimals();
    }

    function register(bytes32 marketId, address market, address pool, uint256 questionId)
        external
    {
        rows[marketId] = Row({
            oracleQuestionId: questionId,
            operatorId: 4,
            venueId: bytes32(uint256(0xBEE0)),
            market: market,
            pool: pool,
            yesId: 100,
            noId: 101
        });
    }

    function setFinalizeReverts(bool v) external {
        finalizeReverts = v;
    }

    /// @notice Simulates a systemic venue failure -- a missing ERC-6909 operator grant,
    ///         a wrong address -- where EVERY redemption fails for the same reason.
    function setRedeemReverts(bool v) external {
        redeemReverts = v;
    }

    function markets(bytes32 marketId) external view returns (MarketRow memory) {
        Row storage r = rows[marketId];
        return MarketRow({
            oracleQuestionId: r.oracleQuestionId,
            outcomeSlotCount: 2,
            voidPolicy: 0,
            collateral: address(TOKEN),
            originOperatorId: r.operatorId,
            originVenueId: r.venueId,
            oracleAdapter: address(0),
            creator: address(0),
            market: r.market,
            pool: r.pool,
            yesId: r.yesId,
            noId: r.noId,
            tradingStart: 0,
            expiry: 0
        });
    }

    function redeem(uint32, bytes32, bytes32 marketId, uint8 outcomeIdx, uint256 amount)
        external
    {
        require(!redeemReverts, "redeem: not an operator");
        MockBinaryMarket m = MockBinaryMarket(rows[marketId].market);
        uint256 payout;
        if (m.isVoided()) {
            payout = (amount * 5_000_000) / 10_000_000; // both sides at 0.5
        } else {
            require(m.isResolved(), "not resolved");
            uint256[] memory pn = m.payoutNumerators();
            payout = (amount * pn[outcomeIdx]) / 10_000_000; // zero for a loser, no revert
        }
        if (payout > 0) TOKEN.mint(msg.sender, payout);
    }

    function finalizeMarket(bytes32) external {
        require(!finalizeReverts, "finalize: reverted");
        ++finalizes;
    }

    function pokeOracle(uint256) external {
        ++pokes;
    }
}

contract MockExposureSource is IExposureSource {
    mapping(address => uint256) public exposure;
    bool public shouldRevert;

    function setExposure(address user, uint256 v) external {
        exposure[user] = v;
    }

    function setShouldRevert(bool v) external {
        shouldRevert = v;
    }

    mapping(address => mapping(bytes32 => uint256)) public perMarket;
    mapping(address => mapping(bytes32 => bool)) public perMarketSet;

    /// @notice Exposure for one specific window, so a BTC window and an ETH window can be
    ///         given different answers for the same user.
    function setExposureFor(address user, bytes32 marketId, uint256 v) external {
        perMarket[user][marketId] = v;
        perMarketSet[user][marketId] = true;
    }

    uint256 public price = 2000e18;
    bool public priceOk = true;

    function setPrice(uint256 v, bool ok) external {
        price = v;
        priceOk = ok;
    }

    function priceOf(bytes32) external view returns (uint256, bool) {
        return (price, priceOk);
    }

    /// @dev Faithful to the real source: exposure is holdings valued at the CURRENT
    ///      price, so it moves when the price moves. Amounts are set at the reference
    ///      price REF and scaled from there.
    uint256 public constant REF = 2000e18;

    function exposureOf(address user, bytes32 marketId) external view returns (uint256) {
        require(!shouldRevert, "exposure: down");
        uint256 base = perMarketSet[user][marketId] ? perMarket[user][marketId] : exposure[user];
        if (base == 0) return 0;
        return (base * price) / REF;
    }
}

/// @notice Stand-in for the node-native reactivity precompile, which has no EVM bytecode
///         and therefore does not exist under forge. Etch this at 0x0100.
///         NOTE: `vm.etch` copies runtime code but NOT constructor-initialised storage,
///         so ids are pre-incremented rather than seeded.
contract MockPrecompile {
    struct SubscriptionData {
        bytes32[4] eventTopics;
        address origin;
        address caller;
        address emitter;
        address handlerContractAddress;
        bytes4 handlerFunctionSelector;
        uint64 priorityFeePerGas;
        uint64 maxFeePerGas;
        uint64 gasLimit;
        bool isGuaranteed;
        bool isCoalesced;
    }

    uint256 public nextId;
    mapping(uint256 => address) public owners;
    mapping(uint256 => SubscriptionData) internal _data;

    function subscribe(SubscriptionData calldata d) external returns (uint256 id) {
        id = ++nextId;
        owners[id] = msg.sender;
        _data[id] = d;
    }

    function getSubscriptionInfo(uint256 id)
        external
        view
        returns (SubscriptionData memory, address)
    {
        return (_data[id], owners[id]);
    }

    function unsubscribe(uint256 id) external {
        require(owners[id] == msg.sender, "not owner");
        delete owners[id];
    }

    /// @notice The PROTOCOL dropping a subscription on its own — which it does when the
    ///         owner's balance cannot cover `gasLimit` at fire time. Not an owner action,
    ///         and the owner is never told.
    function protocolRemove(uint256 id) external {
        delete owners[id];
    }
}

/// @notice ERC-6909 outcome-token singleton stand-in. Ballast holds Down positions as ids
///         on this, and the module must be an operator to burn them on redemption.
contract MockOutcomeToken is IOutcomeToken6909 {
    mapping(address => mapping(uint256 => uint256)) internal _bal;
    mapping(address => mapping(address => bool)) public operators;

    function mint(address to, uint256 id, uint256 amount) external {
        _bal[to][id] += amount;
    }

    function balanceOf(address owner, uint256 id) external view returns (uint256) {
        return _bal[owner][id];
    }

    function setOperator(address spender, bool approved) external returns (bool) {
        operators[msg.sender][spender] = approved;
        return true;
    }
}
