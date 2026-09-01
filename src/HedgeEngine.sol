// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from
    "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from
    "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {BallastVault} from "./BallastVault.sol";
import {
    IBinaryPool,
    IBinaryMarket,
    IBinaryMarketsModule,
    IOutcomeToken6909,
    IExposureSource
} from "./interfaces/IDreamDex.sol";

/// @title  HedgeEngine
/// @notice The reactive brain. Somnia's validators invoke it through the reactivity
///         precompile at 0x0100 when dreamDEX rolls a new Event Contract window, and it
///         buys parametric cover for enrolled users out of their vault collateral.
///
/// @dev    SHAPE TAKEN FROM THE ORACLEHUB DRAIN PATTERN. dreamDEX's own OracleHub solves
///         exactly this problem on this chain — `maxResolvesPerCallback`, a persistent
///         cursor, `resolveGasReserve`, and `DrainContinuation` when it runs out of room.
///         Ballast mirrors that shape, for the reasons the Hacken audit gives:
///
///           F-2026-1647 (High, fixed) — an unbounded loop in `onEvent` combined with
///           no-retry precompile semantics let an attacker grief stop-order execution by
///           stuffing the queue. Hence `maxBatch`, a resumable `cursor`, and fair rotation.
///
///           F-2026-1656 (Medium, mitigated) — the precompile drains the contract's balance
///           with no on-chain accounting. Hence this contract owns its own balance and
///           reports runway through `subscriptionHealth()`.
///
///         NO RETRY. Phase 0 confirmed a failed reactive transaction is never retried: a
///         revert loses the window for everyone in that batch. So `_onEvent` must never
///         revert — every per-user step is wrapped in try/catch, and every skip is an
///         event rather than a failure.
///
///         CALLBACKS ARE OPERATOR-SUBSIDISED. There is deliberately no per-user gas
///         metering. One callback serves many positions and the base cost is shared;
///         attributing it per user means metering `gasleft()` deltas per iteration and then
///         defending how the shared overhead was split. That is a number nobody can defend
///         and no judging criterion rewards. Metered per-user gas is named as future work
///         in the README instead.
///
///         GRIEFING. Because callbacks are free to the user, a cursor slot must cost real
///         capital: enrolment requires an active policy and at least
///         `minEnrolmentCollateral` of free balance, re-checked cheaply on every visit,
///         and `kick()` is permissionless for anyone who no longer qualifies. Nothing is
///         locked — the user can always withdraw, which simply makes their slot kickable.
contract HedgeEngine is SomniaEventHandler, Ownable2Step {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    /// @notice Why a user got no cover this window. Every one of these is a first-class
    ///         state with a UI rendering, not an error branch.
    enum SkipReason {
        None,
        PolicyInactiveOrExpired, // revoked, expired, or never opted in
        BelowEnrolmentFloor, // withdrew below the floor; slot is kickable
        NoExposure, // nothing to cover
        NoLiquidity, // one-sided or empty book — normal on a thin venue
        CoverTooExpensive, // Down price above maxCoverPrice; size would diverge
        NoHeadroom, // both ceilings already committed this window
        BelowMinimumLot, // affordable size rounds to zero on the lot grid
        AlreadyCovered, // this window already has cover for this user
        PlacementFailed, // the pool rejected the order
        NoOpenPrice, // the window's opening price was never recorded; cannot measure cover
        WouldMisrepresent, // drift/ceilings leave the position delivering nothing
        AttemptsExhausted // the retry ladder ran out; window left uncovered
    }

    /// @param quantity     Down contracts held.
    /// @param premium      Collateral actually spent.
    /// @param requestedBps The dial the user asked for.
    /// @param achievedBps  What the purchase actually delivers. Lower than requested
    ///                     whenever a ceiling bound. THIS is the number the UI shows.
    /// @param degraded     True when achieved < requested.
    struct Cover {
        uint256 quantity;
        uint256 premium;
        uint16 requestedBps;
        /// @dev Measured against the WINDOW'S OPENING PRICE, never the price at purchase.
        ///      "Covered down to -2.5%" is only true if -2.5% is measured from the strike,
        ///      and the strike is the open.
        uint16 achievedBps;
        bool degraded;
        bool settled;
        Outcome outcome;
        uint256 proceeds;
        /// @dev Seconds between window creation and the purchase that filled.
        uint32 purchaseDelaySeconds;
        /// @dev Signed drift from open to purchase, in bps. Negative = price fell, which
        ///      is adverse: that part of the move was eaten uncovered.
        int32 driftBps;
    }

    /// @notice A window waiting to be covered, and how many attempts it has had.
    /// @dev    A fresh pool's book is EMPTY: measured on chain, makers first quote 55-102
    ///         blocks (5.5-10.2s) after `MarketCreated`, while the callback fires in the
    ///         same block. So creation enqueues; buying happens on a later tick.
    struct Pending {
        uint64 createdAt;
        uint64 nextAttemptAt;
        uint8 attempts;
        bool active;
    }

    /// @notice Why one user's settlement did not complete inside a batch.
    enum SettleFailure {
        None,
        NoCover, // individual: nothing was ever opened for this window
        AlreadySettled, // individual: someone already settled it
        NotSettleable, // shared: the market has not resolved or voided yet
        External // SYSTEMIC SUSPECT: the venue call itself failed
    }

    /// @notice How a window ended for the cover holder.
    /// @dev    Derived from the market's payout VECTOR, never from a price comparison.
    ///         That is what makes the zero-move case correct by construction: a flat close
    ///         satisfies the venue's `>=` predicate, Up wins, and the Down entry is zero,
    ///         so it lands in `Lost` without any `<` / `<=` in Ballast to get wrong.
    enum Outcome {
        Unsettled,
        Won, // Down paid out: the window closed below its opening price
        Lost, // Up won. INCLUDES A FLAT CLOSE. Redemption succeeds and pays zero.
        Voided // no reliable settlement price; both sides redeem at 0.5
    }

    // ------------------------------------------------------------ constants

    uint256 internal constant BPS = 10_000;
    int256 internal constant BPS_INT = 10_000;

    /// @dev topic0 of `MarketCreated(...)`, verified against live testnet logs. Its
    ///      marketId / market / pool are all indexed, so the callback needs no decoding
    ///      of `data` at all.
    bytes32 public constant MARKET_CREATED_TOPIC =
        0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd;

    uint8 internal constant KIND_BUY_NO = 2;
    uint8 internal constant ORDER_TYPE_FOK = 1;
    uint8 internal constant SELF_MATCH_CANCEL_TAKER = 0;
    uint8 internal constant STATUS_TRADING = 1;

    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000100;
    /// @dev keccak256("Schedule(uint256)"), the precompile's one-shot cron system event.
    bytes32 internal constant SCHEDULE_TOPIC =
        0x67aa3d752967d87d8944b9c7adf73172518777fa4703f336edee81f0736d8987;

    // ---------------------------------------------------------------- state

    BallastVault public immutable VAULT;
    IERC20 public immutable COLLATERAL;
    uint256 public immutable ONE; // 10 ** collateral decimals

    /// @notice The BinaryMarketsModule whose `MarketCreated` we react to. Gating on this
    ///         plus topic0 is the real authorisation, because the callback carries no
    ///         subscription id (Phase 0, Correction 2).
    /// @dev    IMMUTABLE on purpose. It is deployed via CREATE3 so the address is
    ///         identical on testnet and mainnet and never needs changing — and a mutable
    ///         module would be a path for the owner to point redemption at a contract
    ///         that could take this engine's outcome tokens.
    IBinaryMarketsModule public immutable BINARY_MODULE;

    IExposureSource public exposureSource;

    /// @notice Non-zero while a subscription is live. `_onEvent` refuses to act when this
    ///         is zero, which is the only "which subscription" check the precompile makes
    ///         possible.
    uint256 public activeSubscriptionId;

    // -- subscription economics. A zero priority fee risks indefinite deferral exactly at
    //    a window boundary, when every user rolls at once, so it defaults non-zero.
    uint64 public priorityFeePerGas = 1 gwei;
    uint64 public maxFeePerGas = 40 gwei;
    uint64 public callbackGasLimit = 10_000_000;

    // -- batching
    uint32 public maxBatch = 20;
    uint256 public cursor;
    uint64 public gasReservePerEntry = 400_000;

    address[] public enrolled;
    mapping(address user => uint256 indexPlusOne) internal _enrolledAt;

    // -- guards
    /// @notice Refuse to buy Down above this price. Size goes as 1/(1-q), so near q=1 the
    ///         premium explodes — observed live at q=0.995 on a 60s market, where a 250bps
    ///         make-whole point would have cost 497% of exposure.
    uint256 public maxCoverPriceBps = 9_000;
    uint256 public minEnrolmentCollateral;

    // -- observability
    uint64 public lastCallbackAt;
    uint256 public callbackCount;
    uint256 public windowsEnqueued;
    uint256 public coversOpened;
    uint256 public coversSettled;
    uint256 public premiumPaidTotal;
    uint256 public proceedsPaidTotal;

    mapping(address user => mapping(bytes32 marketId => Cover)) public coverOf;
    mapping(address user => uint256) public premiumPaidBy;

    /// @dev Guards against re-enqueueing a window we have already worked.
    mapping(bytes32 marketId => bool) public coverWindowSeen;

    /// @notice `keccak256(bytes(asset))` for each window, decoded from `MarketCreated`.
    /// @dev    The module's `markets()` row does NOT carry the asset — it is only in the
    ///         event's non-indexed data. Without this an exposure source cannot tell a BTC
    ///         window from an ETH one, which is precisely how a WETH position ends up
    ///         "covered" by a BTC contract. Stored as a hash so it costs one word.
    mapping(bytes32 marketId => bytes32 assetKey) public assetKeyOf;

    /// @notice The window's OPENING PRICE, captured in the same block it was created.
    /// @dev    542 of 562 markets are strike-0 ("closes at or above its opening price"),
    ///         so the strike is implicit and this is the only on-chain record of it. Every
    ///         coverage claim is measured against this number.
    mapping(bytes32 marketId => uint256 openPrice) public openPriceOf;

    /// @notice Windows enqueued at creation, waiting for a book to exist.
    mapping(bytes32 marketId => Pending) public pendingOf;
    bytes32[] public pendingList;
    mapping(bytes32 marketId => uint256 indexPlusOne) internal _pendingIdx;

    /// @notice Millisecond timestamp of the one-shot tick we have already scheduled.
    ///         One tick serves every pending window, however many were created at once.
    uint256 public pendingTickAt;

    // -- the retry ladder. Parameters, not constants: 15s is a quarter of a 60s window
    //    and nothing at all in a 4h one.
    uint64 public initialDelaySeconds = 15;
    uint64 public retryDelaySeconds = 15;
    uint8 public maxAttempts = 3;

    /// @notice Seconds past a scheduled tick's moment before it is presumed lost.
    /// @dev    A PARAMETER, not a constant: 30s of grace on top of a 15s initial delay is
    ///         most of a 60-second window and nothing at all in a four-hour one. It must
    ///         be tunable alongside the delays it interacts with.
    uint64 public tickGraceSeconds = 20;

    // --------------------------------------------------------------- events

    event Enrolled(address indexed user);
    event Kicked(address indexed user, SkipReason reason);
    event SubscriptionOpened(uint256 indexed subscriptionId, address emitter, bytes32 topic0);
    event SubscriptionClosed(uint256 indexed subscriptionId);
    event ToppedUp(address indexed from, uint256 amount, uint256 balance);

    event CallbackRan(
        bytes32 indexed marketId, uint256 scanned, uint256 covered, uint256 cursorAfter
    );
    /// @dev Emitted when the batch stopped before scanning everyone — the cursor resumes
    ///      here next window, so nobody is permanently starved. Mirrors OracleHub's
    ///      `DrainContinuation`.
    event BatchContinuation(bytes32 indexed marketId, uint256 cursorAfter, uint256 remaining);

    /// @dev `requestedBps` vs `achievedBps` is the R4 disclosure: when they differ the UI
    ///      must show `achievedBps` and mark the position degraded.
    event CoverOpened(
        address indexed user,
        bytes32 indexed marketId,
        uint256 quantity,
        uint256 premium,
        uint256 coverPrice,
        uint16 requestedBps,
        uint16 achievedBps,
        bool degraded
    );
    event CoverSkipped(address indexed user, bytes32 indexed marketId, SkipReason reason);

    /// @dev `proceeds == 0` with `outcome == Lost` is a SUCCESSFUL settlement, not a
    ///      failure. Anything reading this must not treat zero as an error.
    event CoverSettled(
        address indexed user,
        bytes32 indexed marketId,
        Outcome outcome,
        uint256 quantity,
        uint256 premium,
        uint256 proceeds
    );
    /// @dev Two distinct events rather than one carrying a string literal: the strings
    ///      cost real bytecode, and this contract sits close to the 24,576-byte limit.
    event OraclePoked(bytes32 indexed marketId, address indexed by);
    event ExpiredVoided(bytes32 indexed marketId, address indexed by);

    event WindowEnqueued(
        bytes32 indexed marketId, bytes32 assetKey, uint256 openPrice, uint64 firstAttemptAt
    );
    event TickScheduled(uint256 timestampMillis, uint256 pendingWindows);
    /// @dev Scheduling needs the 32 STT floor. Below it the LADDER stops even though the
    ///      main subscription keeps firing — which is exactly when `poke` matters.
    event ScheduleUnavailable(uint256 balance, uint256 required);
    /// @dev A scheduled tick never arrived and has been replaced. Frequent occurrences
    ///      mean the priority fee is too low for the boundary contention.
    event TickExpired(uint256 wasScheduledFor, uint256 pendingWindows);
    /// @dev The protocol removed our subscription without telling us; the flag is corrected.
    event SubscriptionReconciled(uint256 subscriptionId);
    /// @dev A queued window that can no longer be covered has been dropped.
    event PendingPruned(bytes32 indexed marketId);
    event WindowAttempted(bytes32 indexed marketId, uint8 attempt, uint256 covered);
    event WindowGaveUp(bytes32 indexed marketId, uint8 attempts);
    event Poked(bytes32 indexed marketId, address indexed by, uint256 covered);

    /// @dev The point of carrying a reason is NOT legibility, it is telling a systemic
    ///      failure apart from a batch of unlucky individuals. Twenty `External` failures
    ///      sharing one selector means the operator grant or an address is wrong; a mix of
    ///      `NoCover` and `AlreadySettled` means the batch simply had nothing to do.
    ///      Without it, both look identical: "nothing settled".
    event SettleFailed(
        address indexed user, bytes32 indexed marketId, SettleFailure kind, bytes4 selector
    );

    // --------------------------------------------------------------- errors

    error ZeroAddress();
    error AlreadyEnrolled();
    error NotEnrolled();
    error NotEligible();
    error SubscriptionAlreadyOpen();
    error NoSubscription();
    error BadParameter();
    error OnlySelf();
    error NoCover();
    error AlreadySettled();
    error NotSettleable();
    error MarketNotTrading();
    error UnknownMarket();

    // ---------------------------------------------------------- constructor

    constructor(BallastVault vault_, address binaryModule_, address owner_) Ownable(owner_) {
        if (address(vault_) == address(0) || binaryModule_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        VAULT = vault_;
        BINARY_MODULE = IBinaryMarketsModule(binaryModule_);
        COLLATERAL = vault_.COLLATERAL_TOKEN();
        ONE = 10 ** vault_.COLLATERAL_DECIMALS();

        // The vault pulls proceeds from us on settlement.
        COLLATERAL.forceApprove(address(vault_), type(uint256).max);
    }

    /// @notice Anyone may extend the engine's runway. Native balance funds every callback.
    receive() external payable {
        emit ToppedUp(msg.sender, msg.value, address(this).balance);
    }

    function topUp() external payable {
        emit ToppedUp(msg.sender, msg.value, address(this).balance);
    }

    // ---------------------------------------------------- subscription mgmt

    /// @notice Open the reactivity subscription. Requires this contract to hold at least
    ///         32 STT (`SUBSCRIPTION_OWNER_MINIMUM_BALANCE`) — a balance floor checked only
    ///         at creation, not an escrow, and never consumed.
    function openSubscription() external onlyOwner returns (uint256 id) {
        if (activeSubscriptionId != 0) revert SubscriptionAlreadyOpen();

        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [MARKET_CREATED_TOPIC, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: address(BINARY_MODULE)
        });

        id = SomniaExtensions.subscribe(
            address(this),
            filter,
            SomniaExtensions.SubscriptionOptions({
                priorityFeePerGas: priorityFeePerGas,
                maxFeePerGas: maxFeePerGas,
                gasLimit: callbackGasLimit
            })
        );

        activeSubscriptionId = id;
        emit SubscriptionOpened(id, address(BINARY_MODULE), MARKET_CREATED_TOPIC);
    }

    /// @notice Close the subscription. All cover goes inert immediately; the UI must show
    ///         that rather than a confident "covered".
    function closeSubscription() external onlyOwner {
        uint256 id = activeSubscriptionId;
        if (id == 0) revert NoSubscription();
        activeSubscriptionId = 0; // cleared first: _onEvent is inert from this point
        SomniaExtensions.unsubscribe(id);
        emit SubscriptionClosed(id);
    }

    /// @notice Runway expressed in WINDOWS REMAINING, not raw wei — the only unit that
    ///         answers "how much longer am I covered?".
    /// @dev    A window costs MORE THAN ONE CALLBACK: one for `MarketCreated` plus a share
    ///         of the ticks the retry ladder schedules (measured at ~1.83 on testnet, since
    ///         one tick serves several windows at once). Dividing the balance by the cost
    ///         of a single callback would overstate the runway by that factor, so the ratio
    ///         is measured on-chain and applied here. Reporting a number we know to be
    ///         optimistic would be an R4 violation in the one place it matters most.
    /// @return balance          Native balance funding callbacks.
    /// @return costPerCallback  Worst-case cost of ONE callback at current fees.
    /// @return windowsRemaining Windows the balance can pay for, at the observed ratio.
    /// @return subscribed      Whether a subscription is actually open.
    /// @return stale           True when a callback was expected but has not arrived.
    function subscriptionHealth()
        external
        view
        returns (
            uint256 balance,
            uint256 costPerCallback,
            uint256 windowsRemaining,
            bool subscribed,
            bool stale
        )
    {
        balance = address(this).balance;

        uint256 feePerGas = block.basefee + priorityFeePerGas;
        if (feePerGas > maxFeePerGas) feePerGas = maxFeePerGas;
        costPerCallback = uint256(callbackGasLimit) * feePerGas;

        uint256 callbacksLeft =
            costPerCallback == 0 ? type(uint256).max : balance / costPerCallback;

        // Self-calibrating: divide by the callbacks-per-window we have actually observed.
        windowsRemaining = (windowsEnqueued == 0 || callbackCount == 0)
            ? callbacksLeft
            : (callbacksLeft * windowsEnqueued) / callbackCount;
        subscribed = activeSubscriptionId != 0;
        // 24h with no callback while subscribed means the precompile stopped delivering.
        stale = subscribed && lastCallbackAt != 0 && block.timestamp > lastCallbackAt + 1 days;
    }

    /// @notice Callbacks the balance can still pay for, before the per-window ratio.
    function callbacksRemaining() external view returns (uint256) {
        uint256 feePerGas = block.basefee + priorityFeePerGas;
        if (feePerGas > maxFeePerGas) feePerGas = maxFeePerGas;
        uint256 cost = uint256(callbackGasLimit) * feePerGas;
        return cost == 0 ? type(uint256).max : address(this).balance / cost;
    }

    /// @notice Callbacks consumed per window, scaled by 100. Measured, not assumed.
    function callbacksPerWindowX100() external view returns (uint256) {
        if (windowsEnqueued == 0) return 0;
        return (callbackCount * 100) / windowsEnqueued;
    }

    // ---------------------------------------------------------- enrolment

    /// @notice Join the cursor set. A slot costs real capital: an active policy plus
    ///         `minEnrolmentCollateral` of free balance, re-checked on every visit.
    function enrol() external {
        if (_enrolledAt[msg.sender] != 0) revert AlreadyEnrolled();
        if (!_eligible(msg.sender)) revert NotEligible();
        enrolled.push(msg.sender);
        _enrolledAt[msg.sender] = enrolled.length;
        emit Enrolled(msg.sender);
    }

    /// @notice Leave the cursor set. Always available to the user.
    function withdrawEnrolment() external {
        _remove(msg.sender, SkipReason.None);
    }

    /// @notice Permissionless eviction of a slot whose holder no longer qualifies. This is
    ///         what keeps the batch from being padded with dead entries.
    function kick(address user) external {
        if (_enrolledAt[user] == 0) revert NotEnrolled();
        if (_eligible(user)) revert NotEligible();
        _remove(user, _skipReasonFor(user));
    }

    function enrolledCount() external view returns (uint256) {
        return enrolled.length;
    }

    function isEnrolled(address user) external view returns (bool) {
        return _enrolledAt[user] != 0;
    }

    // ------------------------------------------------------------- callback

    /// @dev Never reverts. `msg.sender == 0x0100` is enforced by the base class; the rest
    ///      of the authorisation is emitter + topic0 + an open subscription, because the
    ///      callback carries no subscription id.
    ///
    ///      TWO TRIGGERS ARRIVE HERE:
    ///        `MarketCreated` from the module -> enqueue the window, record its open price
    ///        `Schedule` from the precompile  -> drain the queue, buying what is ready
    ///
    ///      Creation does NOT buy. A fresh pool's book is empty; makers first quote
    ///      5.5-10.2s later (measured on chain over 8 consecutive windows). Buying at
    ///      creation would mean buying nothing, and buying at the FIRST quote would mean
    ///      taking the widest print of the window.
    function _onEvent(address emitter, bytes32[] calldata topics, bytes calldata data)
        internal
        override
    {
        if (activeSubscriptionId == 0) return;
        if (topics.length == 0) return;

        lastCallbackAt = uint64(block.timestamp);
        unchecked {
            ++callbackCount;
        }

        if (emitter == address(BINARY_MODULE) && topics[0] == MARKET_CREATED_TOPIC) {
            if (topics.length < 4) return;
            _enqueue(topics[1], data);
            return;
        }

        if (emitter == PRECOMPILE && topics[0] == SCHEDULE_TOPIC) {
            pendingTickAt = 0; // one-shot subscriptions are removed after they fire
            _drainPending();
            return;
        }
    }

    /// @dev Records the window and the price it opened at, then makes sure a tick exists.
    function _enqueue(bytes32 marketId, bytes calldata data) internal {
        if (pendingOf[marketId].active || coverWindowSeen[marketId]) return;

        bytes32 assetKey = _decodeAssetKey(data);
        if (assetKey == bytes32(0)) return; // cannot tell BTC from ETH -> do not trade
        assetKeyOf[marketId] = assetKey;

        // Capture the OPENING PRICE now, in the creation block. Every coverage claim for
        // this window is measured against it.
        (uint256 open, bool ok) = exposureSource.priceOf(assetKey);
        if (ok) openPriceOf[marketId] = open;

        uint64 first = uint64(block.timestamp) + initialDelaySeconds;
        pendingOf[marketId] =
            Pending({createdAt: uint64(block.timestamp), nextAttemptAt: first, attempts: 0, active: true});
        pendingList.push(marketId);
        _pendingIdx[marketId] = pendingList.length;
        coverWindowSeen[marketId] = true;
        unchecked {
            ++windowsEnqueued;
        }

        emit WindowEnqueued(marketId, assetKey, open, first);
        _ensureTick(first);
    }

    /// @dev At most one tick outstanding, however many windows are waiting. Scheduling
    ///      needs the 32 STT floor, so a depleted engine loses the ladder while the main
    ///      subscription keeps firing — surfaced rather than silent.
    ///
    ///      A PENDING TICK EXPIRES. Phase 0 established that reactive matches can be
    ///      evicted from a full queue or deferred indefinitely when they pay a low
    ///      priority fee. Without an expiry, one missed tick would leave `pendingTickAt`
    ///      set forever, `_ensureTick` would short-circuit on every later window, and the
    ///      ladder would deadlock silently — no event, no signal, just windows piling up
    ///      uncovered. Observed in production: 62 windows enqueued and not one attempted.
    ///      So a tick whose moment has passed is treated as lost and replaced.
    function _ensureTick(uint64 whenSeconds) internal {
        uint256 outstanding = pendingTickAt;
        if (outstanding != 0) {
            if (block.timestamp <= outstanding / 1000 + tickGraceSeconds) return;
            emit TickExpired(outstanding, pendingList.length);
            pendingTickAt = 0;
        }

        uint256 required = SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE;
        if (address(this).balance < required) {
            emit ScheduleUnavailable(address(this).balance, required);
            return;
        }

        uint256 ms_ = (uint256(whenSeconds) + 1) * 1000;
        try this.scheduleTick(ms_) {
            pendingTickAt = ms_;
            emit TickScheduled(ms_, pendingList.length);
        } catch {
            emit ScheduleUnavailable(address(this).balance, required);
        }
    }

    /// @notice Internal-only; external so `_ensureTick` can try/catch it. A failed
    ///         schedule must never take the callback down with it.
    function scheduleTick(uint256 timestampMillis) external {
        if (msg.sender != address(this)) revert OnlySelf();
        SomniaExtensions.scheduleSubscriptionAtTimestamp(
            address(this),
            timestampMillis,
            SomniaExtensions.SubscriptionOptions({
                priorityFeePerGas: priorityFeePerGas,
                maxFeePerGas: maxFeePerGas,
                gasLimit: callbackGasLimit
            })
        );
    }

    /// @dev Works the queue, bounded by `maxBatch` and a gas reserve. Windows that are not
    ///      ready yet, or that failed and have attempts left, keep their place and a
    ///      fresh tick is scheduled for them.
    function _drainPending() internal {
        uint256 n = pendingList.length;
        if (n == 0) return;

        uint256 processed;
        uint64 soonest = type(uint64).max;

        for (uint256 i = n; i > 0 && processed < maxBatch; --i) {
            if (gasleft() < gasReservePerEntry) break;

            bytes32 marketId = pendingList[i - 1];
            Pending storage p = pendingOf[marketId];

            if (block.timestamp < p.nextAttemptAt) {
                if (p.nextAttemptAt < soonest) soonest = p.nextAttemptAt;
                continue;
            }

            unchecked {
                ++processed;
                ++p.attempts;
            }

            uint256 covered = _processWindow(marketId, false);
            emit WindowAttempted(marketId, p.attempts, covered);

            if (covered > 0 || p.attempts >= maxAttempts) {
                if (covered == 0) emit WindowGaveUp(marketId, p.attempts);
                _dequeue(marketId);
            } else {
                p.nextAttemptAt = uint64(block.timestamp) + retryDelaySeconds;
                if (p.nextAttemptAt < soonest) soonest = p.nextAttemptAt;
            }
        }

        if (pendingList.length > 0) {
            _ensureTick(soonest == type(uint64).max ? uint64(block.timestamp) + retryDelaySeconds : soonest);
        }
    }

    /// @notice Force an attempt on one window. Permissionless.
    /// @dev    The backstop for a stale, unfunded, or below-the-floor subscription — a
    ///         state `subscriptionHealth()` already models. Shares `_processWindow` with
    ///         the scheduled path, so a poked window and a callback-driven window produce
    ///         identical state. Existence and Trading status are verified from the module,
    ///         never taken from the caller.
    function poke(bytes32 marketId) external returns (uint256 covered) {
        IBinaryMarketsModule.MarketRow memory row = BINARY_MODULE.markets(marketId);
        if (row.market == address(0) || row.pool == address(0)) revert UnknownMarket();
        if (IBinaryMarket(row.market).status() != STATUS_TRADING) revert MarketNotTrading();

        covered = _processWindow(marketId, true);

        Pending storage p = pendingOf[marketId];
        if (p.active) {
            unchecked {
                ++p.attempts;
            }
            if (covered > 0 || p.attempts >= maxAttempts) _dequeue(marketId);
            else p.nextAttemptAt = uint64(block.timestamp) + retryDelaySeconds;
        }

        emit Poked(marketId, msg.sender, covered);
    }

    /// @dev The single covering path. Both the scheduled tick and `poke` run exactly this.
    function _processWindow(bytes32 marketId, bool verified) internal returns (uint256 covered) {
        IBinaryMarketsModule.MarketRow memory row = BINARY_MODULE.markets(marketId);
        if (row.market == address(0) || row.pool == address(0)) return 0;

        if (!verified) {
            try IBinaryMarket(row.market).status() returns (uint8 st) {
                if (st != STATUS_TRADING) return 0;
            } catch {
                return 0;
            }
        }

        uint256 total = enrolled.length;
        if (total == 0) return 0;

        uint256 idx = cursor % total;
        uint256 scanned;

        while (scanned < maxBatch && scanned < total) {
            if (gasleft() < gasReservePerEntry) break;

            address user = enrolled[idx];
            if (VAULT.isCoverable(user)) {
                try this.coverOne(user, marketId, row.pool) returns (bool ok) {
                    if (ok) {
                        unchecked {
                            ++covered;
                        }
                    }
                } catch {
                    emit CoverSkipped(user, marketId, SkipReason.PlacementFailed);
                }
            } else {
                emit CoverSkipped(user, marketId, SkipReason.PolicyInactiveOrExpired);
            }

            unchecked {
                ++scanned;
            }
            idx = idx + 1 == total ? 0 : idx + 1;
        }

        cursor = idx;
        emit CallbackRan(marketId, scanned, covered, idx);
        if (scanned < total) emit BatchContinuation(marketId, idx, total - scanned);
    }

    function _dequeue(bytes32 marketId) internal {
        uint256 pos = _pendingIdx[marketId];
        if (pos == 0) return;
        uint256 last = pendingList.length;
        if (pos != last) {
            bytes32 moved = pendingList[last - 1];
            pendingList[pos - 1] = moved;
            _pendingIdx[moved] = pos;
        }
        pendingList.pop();
        delete _pendingIdx[marketId];
        pendingOf[marketId].active = false;
    }

    /// @dev Pulls `asset` out of `MarketCreated`'s non-indexed data and hashes it.
    ///      Layout of the non-indexed tail, in order: oracleQuestionId, operatorId,
    ///      venueId, creator, collateral, yesId, noId, nonce, outcomeSlotCount,
    ///      marketType, tradingStart, expiry, voidPolicy  (13 static words), then `asset`
    ///      as a dynamic offset at word 13. Returns 0 on anything malformed, and the
    ///      caller treats 0 as "do not trade this window" rather than guessing.
    function _decodeAssetKey(bytes calldata data) internal pure returns (bytes32) {
        if (data.length < 14 * 32) return bytes32(0);

        uint256 off;
        assembly {
            off := calldataload(add(data.offset, 416)) // 13 * 32
        }
        if (off + 32 > data.length) return bytes32(0);

        uint256 len;
        assembly {
            len := calldataload(add(data.offset, off))
        }
        // Asset symbols are short; a long value is malformed, not an asset.
        if (len == 0 || len > 32 || off + 32 + len > data.length) return bytes32(0);

        bytes32 key;
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, add(add(data.offset, off), 32), len)
            key := keccak256(ptr, len)
        }
        return key;
    }

    function pendingCount() external view returns (uint256) {
        return pendingList.length;
    }

    /// @notice Whether the retry ladder can still schedule ticks.
    function canSchedule() external view returns (bool) {
        return address(this).balance >= SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE;
    }

    /// @notice One user's cover purchase. External so the callback can `try/catch` it and
    ///         roll back only this user's state on failure. Not callable from outside.
    function coverOne(address user, bytes32 marketId, address pool) external returns (bool) {
        if (msg.sender != address(this)) revert OnlySelf();
        return _coverOne(user, marketId, pool);
    }

    // -------------------------------------------------------------- internal

    /// @dev Sizing intermediates, kept in one memory struct so the placement path stays
    ///      within stack limits without reaching for via-ir.
    struct Sizing {
        uint256 exposure; // holdings valued at the WINDOW'S OPEN, not at purchase
        uint256 exposureNow; // holdings valued at the purchase price, for reference
        uint256 openPrice;
        uint256 spotNow;
        int256 driftBps;
        uint256 upBid; // best resting Up bid; a Buy-Down crosses it by mint-a-pair
        uint256 coverPrice; // q = ONE - upBid
        uint256 qty;
        uint256 premium; // what we can actually spend
        uint256 desiredPremium; // what making whole at the dial would have cost
        uint256 limit; // most the ceilings and free balance allow this window
        uint256 oneUnit; // 10 ** collateral decimals, carried so sizing stays pure
        uint16 requestedBps;
    }

    function _coverOne(address user, bytes32 marketId, address pool) internal returns (bool) {
        if (coverOf[user][marketId].quantity != 0) {
            emit CoverSkipped(user, marketId, SkipReason.AlreadyCovered);
            return false;
        }

        (Sizing memory z, SkipReason reason) = _quote(user, marketId, pool);
        if (reason != SkipReason.None) {
            emit CoverSkipped(user, marketId, reason);
            return false;
        }

        // Decide what this purchase would actually deliver BEFORE committing any funds.
        uint16 achievedBps = _achievedBps(z);
        if (achievedBps == 0) {
            // Refusing beats opening a position that cannot describe itself honestly.
            emit CoverSkipped(user, marketId, SkipReason.WouldMisrepresent);
            return false;
        }

        // `degraded` fires on either binding condition:
        //   - a CEILING bound the purchase (the user's own limits), or
        //   - ADVERSE DRIFT between the window's open and the purchase pushed the
        //     achievable coverage below the dial.
        // It deliberately does NOT fire on lot-grid rounding, which costs a fraction of a
        // basis point: a badge on every healthy position would carry no information.
        bool degraded = z.desiredPremium > z.limit || achievedBps < z.requestedBps;

        // Consent, both ceilings and the free balance are all enforced here.
        VAULT.reserve(user, marketId, z.premium, z.exposure);
        VAULT.spendForCover(user, marketId, z.premium);

        _place(pool, z);

        coverOf[user][marketId] = Cover({
            quantity: z.qty,
            premium: z.premium,
            requestedBps: z.requestedBps,
            achievedBps: achievedBps,
            degraded: degraded,
            settled: false,
            outcome: Outcome.Unsettled,
            proceeds: 0,
            purchaseDelaySeconds: _delaySince(pendingOf[marketId].createdAt),
            driftBps: _toInt32(z.driftBps)
        });

        unchecked {
            ++coversOpened;
            premiumPaidTotal += z.premium;
            premiumPaidBy[user] += z.premium;
        }

        emit CoverOpened(
            user, marketId, z.qty, z.premium, z.coverPrice, z.requestedBps, achievedBps, degraded
        );
        return true;
    }

    /// @dev Seconds since the window was created. A window poked without ever having been
    ///      enqueued has no creation record, so it reports 0 rather than an epoch-sized
    ///      number.
    function _delaySince(uint64 createdAt) internal view returns (uint32) {
        if (createdAt == 0 || block.timestamp <= createdAt) return 0;
        uint256 d = block.timestamp - createdAt;
        if (d >= type(uint32).max) return type(uint32).max;
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint32(d);
    }

    /// @dev Clamped rather than reverting: a nonsensical price should not cost a user
    ///      their cover, and the clamped value still reads as "extreme drift".
    function _toInt32(int256 v) internal pure returns (int32) {
        if (v > type(int32).max) return type(int32).max;
        if (v < type(int32).min) return type(int32).min;
        // forge-lint: disable-next-line(unsafe-typecast)
        return int32(v);
    }

    /// @dev What the purchase actually delivers, measured against the WINDOW'S OPENING
    ///      PRICE. Net is zero at qty*(1-q)/exposureAtOpen. Rounded to nearest, not
    ///      floored: flooring costs a fraction of a bp and would otherwise report every
    ///      healthy position as one bp short of its dial.
    function _achievedBps(Sizing memory z) internal pure returns (uint16) {
        uint256 denom = z.exposure * z.oneUnit;
        if (denom == 0) return 0;
        uint256 achieved = (z.qty * z.upBid * BPS + denom / 2) / denom;
        // Clamp rather than revert: an unusually cheap book can produce cover worth more
        // than 655% of exposure, and losing the position to a cast is the worse outcome.
        if (achieved >= type(uint16).max) return type(uint16).max;
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(achieved);
    }

    /// @dev Pure read path: decides what can be bought, or why nothing can be.
    function _quote(address user, bytes32 marketId, address pool)
        internal
        view
        returns (Sizing memory z, SkipReason reason)
    {
        z.oneUnit = ONE;
        (, z.requestedBps,,,) = VAULT.policyOf(user);

        z.exposureNow = exposureSource.exposureOf(user, marketId);
        if (z.exposureNow == 0) return (z, SkipReason.NoExposure);

        // PURCHASE DRIFT. The strike is the window's open, but we buy seconds or minutes
        // later. Any adverse move in between was eaten uncovered, and sizing off the
        // price at purchase would silently undersize the cover. So value the holdings at
        // the OPEN, which is the basis the instrument actually settles against.
        z.openPrice = openPriceOf[marketId];
        if (z.openPrice == 0) return (z, SkipReason.NoOpenPrice);

        bool priceOk;
        (z.spotNow, priceOk) = exposureSource.priceOf(assetKeyOf[marketId]);
        if (!priceOk || z.spotNow == 0) return (z, SkipReason.NoLiquidity);

        z.exposure = (z.exposureNow * z.openPrice) / z.spotNow;
        if (z.exposure == 0) return (z, SkipReason.NoExposure);

        z.driftBps =
            ((int256(z.spotNow) - int256(z.openPrice)) * BPS_INT) / int256(z.openPrice);

        // The book is quoted in Up terms; a Buy-Down crosses a resting Buy-Up by
        // mint-a-pair, so the price to buy cover is ONE - bestUpBid.
        IBinaryPool.Level[] memory bids = IBinaryPool(pool).getBookLevels(true, 1);
        if (bids.length == 0 || bids[0].price == 0 || bids[0].quantity == 0) {
            return (z, SkipReason.NoLiquidity);
        }
        z.upBid = bids[0].price;
        if (z.upBid >= ONE) return (z, SkipReason.NoLiquidity);
        z.coverPrice = ONE - z.upBid;

        if (z.coverPrice * BPS > maxCoverPriceBps * ONE) {
            return (z, SkipReason.CoverTooExpensive);
        }

        // Size to make whole at x*: N = exposure * x* / (1 - q), premium = N * q.
        // Expanded to a single division so no precision is lost on the way:
        //   premium = exposure * requestedBps * coverPrice / (BPS * upBid)
        z.desiredPremium = (z.exposure * z.requestedBps * z.coverPrice) / (BPS * z.upBid);

        (z.limit,) = VAULT.bindingLimit(user, marketId, z.exposure);
        if (z.limit == 0) return (z, SkipReason.NoHeadroom);

        z.premium = z.desiredPremium > z.limit ? z.limit : z.desiredPremium;
        z.qty = (z.premium * ONE) / z.coverPrice;

        // Snap to the venue's lot grid, then recompute the premium from what we can
        // actually buy — never from what we wanted.
        IBinaryPool.BookParams memory p = IBinaryPool(pool).getOrderBookParameters();
        if (p.lotSize != 0) {
            // Flooring to the lot grid is the point, not a rounding accident: a quantity
            // off the grid is rejected by the pool outright.
            // forge-lint: disable-next-line(divide-before-multiply)
            z.qty = (z.qty / p.lotSize) * p.lotSize;
            if (z.qty > bids[0].quantity) {
                // forge-lint: disable-next-line(divide-before-multiply)
                z.qty = (bids[0].quantity / p.lotSize) * p.lotSize;
            }
        } else if (z.qty > bids[0].quantity) {
            z.qty = bids[0].quantity;
        }
        if (z.qty == 0 || z.qty < p.minQuantity) return (z, SkipReason.BelowMinimumLot);

        z.premium = (z.qty * z.coverPrice) / ONE;
        if (z.premium == 0 || z.premium > z.limit) return (z, SkipReason.BelowMinimumLot);

        return (z, SkipReason.None);
    }

    function _place(address pool, Sizing memory z) internal {
        COLLATERAL.forceApprove(pool, z.premium);
        (bool ok,) = IBinaryPool(pool).placeBinaryOrder(
            KIND_BUY_NO,
            z.upBid,
            z.qty,
            _orderExpiry(),
            ORDER_TYPE_FOK, // fill-or-kill: it either really fills or it reverts
            SELF_MATCH_CANCEL_TAKER,
            address(0),
            0,
            0
        );
        COLLATERAL.forceApprove(pool, 0);
        // Caught by the batch's try/catch, which rolls back only this user.
        if (!ok) revert BadParameter();
    }

    function _orderExpiry() internal view returns (uint64) {
        // Nanoseconds, mandatory, must be in the future. FOK never rests, so a short
        // horizon is enough and acts as a dead-man's switch.
        return uint64((block.timestamp + 60) * 1e9);
    }

    function _eligible(address user) internal view returns (bool) {
        return VAULT.isCoverable(user) && VAULT.freeBalanceOf(user) >= minEnrolmentCollateral;
    }

    function _skipReasonFor(address user) internal view returns (SkipReason) {
        if (!VAULT.isCoverable(user)) return SkipReason.PolicyInactiveOrExpired;
        return SkipReason.BelowEnrolmentFloor;
    }

    function _remove(address user, SkipReason reason) internal {
        uint256 pos = _enrolledAt[user];
        if (pos == 0) revert NotEnrolled();

        uint256 last = enrolled.length;
        if (pos != last) {
            address moved = enrolled[last - 1];
            enrolled[pos - 1] = moved;
            _enrolledAt[moved] = pos;
        }
        enrolled.pop();
        delete _enrolledAt[user];

        // Keep the cursor inside the set after a shrink.
        uint256 n = enrolled.length;
        cursor = n == 0 ? 0 : cursor % n;

        emit Kicked(user, reason);
    }

    // ------------------------------------------------------------ settlement

    /// @notice Settle one user's cover for a window and credit them the proceeds.
    /// @dev    PERMISSIONLESS. Anyone can trigger it, including a judge poking at the
    ///         deployed contracts — no operator is in the loop and nothing waits on us.
    ///
    ///         All four branches the instrument actually has are handled explicitly:
    ///           Won     Down paid out; proceeds credited to the user.
    ///           Lost    Up won, INCLUDING A FLAT CLOSE. Redemption succeeds and pays
    ///                   zero; this is a healthy settlement, not an error.
    ///           Voided  no reliable settlement price; the position redeems at 0.5.
    ///           neither Not resolved yet -> `NotSettleable`, try a backstop.
    function settle(address user, bytes32 marketId) public returns (uint256 proceeds) {
        Cover storage c = coverOf[user][marketId];
        if (c.quantity == 0) revert NoCover();
        if (c.settled) revert AlreadySettled();

        IBinaryMarketsModule.MarketRow memory row = BINARY_MODULE.markets(marketId);
        if (row.market == address(0)) revert NotSettleable();

        Outcome outcome = _outcomeOf(row.market);
        if (outcome == Outcome.Unsettled) revert NotSettleable();

        // Finalisation normally happens in the resolve flow; poke it best-effort so a
        // market that resolved without finalising cannot block redemption.
        try BINARY_MODULE.finalizeMarket(marketId) {} catch {}

        // Mark settled BEFORE the external redeem: no re-entrant double-claim, and the
        // window is idempotent even if it settles while a batch is mid-flight.
        c.settled = true;
        c.outcome = outcome;

        uint256 before = COLLATERAL.balanceOf(address(this));
        // Down is outcome index 1. A losing redeem returns zero rather than reverting.
        BINARY_MODULE.redeem(row.originOperatorId, row.originVenueId, marketId, 1, c.quantity);
        proceeds = COLLATERAL.balanceOf(address(this)) - before;

        c.proceeds = proceeds;

        // Zero proceeds is a valid, successful outcome. Only skip the credit because
        // there is nothing to move, never because it looks like a failure.
        if (proceeds > 0) VAULT.creditProceeds(user, marketId, proceeds);

        unchecked {
            ++coversSettled;
            proceedsPaidTotal += proceeds;
        }

        emit CoverSettled(user, marketId, outcome, c.quantity, c.premium, proceeds);
    }

    /// @notice Settle many users for one window. Best-effort per user, so one failure
    ///         never blocks the rest, and every failure says why.
    /// @dev    Bounded by `maxBatch` so the gas is capped however long the array is.
    ///         Deliberately does not revert: a batch that settles nine and reports one
    ///         failure is more useful than one that settles none.
    function settleMany(address[] calldata users, bytes32 marketId)
        external
        returns (uint256 settledCount, uint256 failedCount)
    {
        uint256 n = users.length;
        if (n > maxBatch) n = maxBatch;

        for (uint256 i; i < n; ++i) {
            try this.settle(users[i], marketId) returns (uint256) {
                unchecked {
                    ++settledCount;
                }
            } catch (bytes memory err) {
                unchecked {
                    ++failedCount;
                }
                bytes4 sel = _selectorOf(err);
                emit SettleFailed(users[i], marketId, _classify(sel), sel);
            }
        }
    }

    function _selectorOf(bytes memory err) internal pure returns (bytes4 sel) {
        if (err.length >= 4) {
            assembly {
                sel := mload(add(err, 32))
            }
        }
    }

    /// @dev Anything that is not one of our own errors came from the venue, and that is
    ///      the signal worth paging on.
    function _classify(bytes4 sel) internal pure returns (SettleFailure) {
        if (sel == NoCover.selector) return SettleFailure.NoCover;
        if (sel == AlreadySettled.selector) return SettleFailure.AlreadySettled;
        if (sel == NotSettleable.selector) return SettleFailure.NotSettleable;
        return SettleFailure.External;
    }

    /// @dev Reads the payout VECTOR, never a price comparison.
    function _outcomeOf(address market) internal view returns (Outcome) {
        if (IBinaryMarket(market).isVoided()) return Outcome.Voided;
        if (!IBinaryMarket(market).isResolved()) return Outcome.Unsettled;

        uint256[] memory pn = IBinaryMarket(market).payoutNumerators();
        // Index 1 is Down. Non-zero means the cover paid; zero means Up won, which is
        // exactly where a flat close lands.
        if (pn.length > 1 && pn[1] > 0) return Outcome.Won;
        return Outcome.Lost;
    }

    /// @notice What a window would settle as right now, without writing anything.
    function outcomeOf(bytes32 marketId) external view returns (Outcome) {
        address market = BINARY_MODULE.markets(marketId).market;
        if (market == address(0)) return Outcome.Unsettled;
        return _outcomeOf(market);
    }

    // ------------------------------------------------------------- backstops

    /// @notice Pull a posted oracle answer and resolve a stuck market. Permissionless by
    ///         design at the protocol level, and exposed here so nothing about Ballast
    ///         requires us to be alive.
    function pokeOracle(bytes32 marketId) external {
        BINARY_MODULE.pokeOracle(BINARY_MODULE.markets(marketId).oracleQuestionId);
        emit OraclePoked(marketId, msg.sender);
    }

    /// @notice Void a market whose settlement window lapsed with no answer. Callable by
    ///         anyone from `expiry + settlementWindow`. Both sides then redeem at 0.5.
    function voidExpired(bytes32 marketId) external {
        address market = BINARY_MODULE.markets(marketId).market;
        if (market == address(0)) revert NotSettleable();
        IBinaryMarket(market).voidExpired();
        emit ExpiredVoided(marketId, msg.sender);
    }

    /// @notice When `voidExpired` becomes callable for a window.
    function voidableAt(bytes32 marketId) external view returns (uint64) {
        address market = BINARY_MODULE.markets(marketId).market;
        if (market == address(0)) return 0;
        return IBinaryMarket(market).expiry() + IBinaryMarket(market).settlementWindow();
    }

    /// @notice Let the module burn this engine's outcome tokens on redemption.
    /// @dev    Scoped to the module alone, and the module address is immutable, so this
    ///         cannot be pointed at an arbitrary spender.
    function approveModuleForOutcomes(IOutcomeToken6909 outcomeToken) external onlyOwner {
        if (address(outcomeToken) == address(0)) revert ZeroAddress();
        outcomeToken.setOperator(address(BINARY_MODULE), true);
    }

    // -------------------------------------------------- permissionless escapes

    /// @notice Reconcile `activeSubscriptionId` against what the precompile actually holds.
    /// @dev    THE LATCH: `activeSubscriptionId` is set by `openSubscription` and cleared
    ///         only by the owner. But the protocol removes a subscription on its own when
    ///         the owner's balance cannot cover `gasLimit` at fire time. After that the
    ///         engine still believes it is subscribed and `subscriptionHealth().subscribed`
    ///         reports true — a number a user relies on, now wrong, with no way back except
    ///         an owner who may not be watching.
    ///
    ///         Permissionless, because the whole point is that it must not depend on us.
    function reconcileSubscription() external returns (bool stillLive) {
        uint256 id = activeSubscriptionId;
        if (id == 0) return false;

        try this.subscriptionOwner(id) returns (address owner_) {
            stillLive = owner_ == address(this);
        } catch {
            // Cannot read the precompile: leave the flag alone rather than guess.
            return true;
        }

        if (!stillLive) {
            activeSubscriptionId = 0;
            emit SubscriptionReconciled(id);
        }
    }

    /// @notice Internal-only; external so `reconcileSubscription` can try/catch the read.
    function subscriptionOwner(uint256 id) external view returns (address) {
        if (msg.sender != address(this)) revert OnlySelf();
        (, address owner_) = SomniaExtensions.getSubscriptionInfo(id);
        return owner_;
    }

    /// @notice Drop queued windows that can no longer be covered, bounded by `max`.
    /// @dev    THE LATCH: `pendingList` only shrinks when a window is attempted. If ticks
    ///         stop arriving the queue grows without limit and every entry is dead weight —
    ///         218 of them accumulated in production before the tick expiry existed.
    ///         `poke()` clears one window at a time and needs its marketId; this clears the
    ///         expired ones in bulk without needing to know anything.
    ///
    ///         Permissionless and read-gated: it only removes windows the module says are
    ///         no longer Trading, so it can never drop a window still worth covering.
    function prunePending(uint256 max) external returns (uint256 pruned) {
        uint256 n = pendingList.length;
        if (n == 0 || max == 0) return 0;

        for (uint256 i = n; i > 0 && pruned < max; --i) {
            if (gasleft() < gasReservePerEntry) break;
            bytes32 marketId = pendingList[i - 1];

            bool dead;
            IBinaryMarketsModule.MarketRow memory row = BINARY_MODULE.markets(marketId);
            if (row.market == address(0)) {
                dead = true;
            } else {
                try IBinaryMarket(row.market).status() returns (uint8 st) {
                    dead = st != STATUS_TRADING;
                } catch {
                    dead = true;
                }
            }

            if (dead) {
                _dequeue(marketId);
                unchecked {
                    ++pruned;
                }
                emit PendingPruned(marketId);
            }
        }
    }

    // ----------------------------------------------------------------- admin

    function setExposureSource(IExposureSource s) external onlyOwner {
        if (address(s) == address(0)) revert ZeroAddress();
        exposureSource = s;
    }

    function setBatchParams(uint32 maxBatch_, uint64 gasReservePerEntry_) external onlyOwner {
        if (maxBatch_ == 0 || gasReservePerEntry_ == 0) revert BadParameter();
        maxBatch = maxBatch_;
        gasReservePerEntry = gasReservePerEntry_;
    }

    /// @dev A zero priority fee is refused: Phase 0 found low-fee matches can be deferred
    ///      indefinitely, and every user's window rolls at the same boundary.
    function setSubscriptionFees(uint64 priority, uint64 maxFee, uint64 gasLimit_)
        external
        onlyOwner
    {
        if (priority == 0 || maxFee < priority || gasLimit_ == 0) revert BadParameter();
        if (gasLimit_ > SomniaExtensions.MAXIMUM_HANDLER_GAS_LIMIT) revert BadParameter();
        priorityFeePerGas = priority;
        maxFeePerGas = maxFee;
        callbackGasLimit = gasLimit_;
    }

    /// @dev The ladder is parameterised, not constant: 15s is a quarter of a 60s window
    ///      and nothing at all in a 4h one.
    function setLadder(uint64 initialDelay, uint64 retryDelay, uint8 attempts, uint64 grace)
        external
        onlyOwner
    {
        if (initialDelay == 0 || retryDelay == 0 || attempts == 0 || grace == 0) {
            revert BadParameter();
        }
        initialDelaySeconds = initialDelay;
        retryDelaySeconds = retryDelay;
        maxAttempts = attempts;
        tickGraceSeconds = grace;
    }

    function setGuards(uint256 maxCoverPriceBps_, uint256 minEnrolmentCollateral_)
        external
        onlyOwner
    {
        if (maxCoverPriceBps_ == 0 || maxCoverPriceBps_ >= BPS) revert BadParameter();
        maxCoverPriceBps = maxCoverPriceBps_;
        minEnrolmentCollateral = minEnrolmentCollateral_;
    }

    /// @notice Recover native runway. Deliberately owner-only and native-only: the engine
    ///         must never be able to move user collateral anywhere but the vault or a pool.
    function sweepNative(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert BadParameter();
    }
}
