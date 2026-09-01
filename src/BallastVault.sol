// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title  BallastVault
/// @notice Custody, per-user accounting, and the consent layer for Ballast.
///
/// @dev    WHAT BALLAST SELLS IS PARAMETRIC COVER, NOT A HEDGE.
///
///         dreamDEX Event Contracts are at-the-money binaries: one strike per window,
///         struck at the window's opening price, paying a fixed 1 collateral unit per
///         winning contract (docs/phase0-findings.md, Q1/Q2). There is no strike ladder
///         and never has been — 562 markets checked, at most one strike per venue per
///         window. So no quantity of Down contracts produces a flat net line, and the
///         product must not claim one.
///
///         What it produces is a fixed payout on a trigger, with basis risk as the gap
///         between the payout and the realised loss — the same instrument class as
///         weather, crop and flight-delay cover. The payoff has THREE regions:
///
///           move < makeWholeBps   over-compensated (the payout exceeds the loss)
///           move = makeWholeBps   exact
///           move > makeWholeBps   under-compensated (the loss outruns the payout)
///
///         TIES GO AGAINST THE COVER HOLDER. Every market settles on "closes at or
///         above its opening price" — the predicate is `>=`, unanimous across all 562
///         markets indexed. A flat close therefore resolves Up and the cover pays
///         nothing. A zero move must be handled explicitly, never left to fall through
///         a comparison.
///
///         Ballast is the trader of record: it opens positions in its own name and keeps
///         internal per-user accounting. It never touches a user's dreamDEX account and
///         holds no operator grant — verified in Phase 0 by trading Event Contracts from
///         a contract with no allow-list entry.
///
///         Three invariants hold at every point:
///           I1  reserved[u] <= collateral[u]              (cannot lock what is not there)
///           I2  sum(collateral[u]) == totalCollateral     (internal books balance)
///           I3  totalCollateral <= token.balanceOf(this)  (books never exceed custody)
///
///         Consent is a Policy the user signs into: two independent ceilings, an expiry,
///         and a one-transaction revoke() that no operator can block or delay. Without an
///         active, unexpired policy the engine can do nothing on a user's behalf. Ever.
contract BallastVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    /// @param active                 User has opted in. Cleared instantly by revoke().
    /// @param makeWholeBps            The dial: the adverse move, in bps, at which the
    ///                                cover payout exactly offsets the spot loss. The
    ///                                engine sizes N = exposure * makeWholeBps / (1 - q),
    ///                                where q is the Down price read from the book.
    /// @param maxPremiumBpsPerWindow  Hard ceiling on premium spend per window, in bps of
    ///                                exposure. Independent of `makeWholeBps` and binds
    ///                                first when the book is expensive — which is the
    ///                                normal case, because an at-the-money binary is the
    ///                                most expensive cover the instrument can offer.
    /// @param expiry                  Unix seconds after which the policy is inert.
    /// @param maxNotionalPerWindow    Absolute ceiling on collateral committed per window.
    ///
    /// @dev Both ceilings are enforced at `reserve`, the single chokepoint. When either
    ///      binds, the achieved make-whole point is WORSE than `makeWholeBps`. The engine
    ///      must compute and surface the achieved figure rather than the requested one —
    ///      showing the dial's number at that moment would violate interface rule R4.
    struct Policy {
        bool active;
        uint16 makeWholeBps;
        uint16 maxPremiumBpsPerWindow;
        uint64 expiry;
        uint256 maxNotionalPerWindow;
    }

    /// @notice Which limit stops the engine from buying more cover this window.
    enum Binding {
        None, // nothing binds; free balance is ample and both ceilings have headroom
        FreeBalance,
        NotionalCap,
        PremiumCap
    }

    // ------------------------------------------------------------ constants

    uint16 public constant BPS = 10_000;

    /// @notice Ceiling on the dial. A 100% adverse move is the largest cover that can be
    ///         coherently requested; the premium ceiling is what makes it affordable.
    uint16 public constant MAX_MAKE_WHOLE_BPS = 10_000;

    /// @notice Ceiling on the premium ceiling. Spending more than the exposure itself on
    ///         one window's cover is never a policy a user meant to write.
    uint16 public constant MAX_PREMIUM_BPS = 10_000;

    /// @notice A policy must be good for at least this long, so revoke() is always the
    ///         user's decision rather than something that quietly lapses mid-window.
    uint64 public constant MIN_POLICY_DURATION = 1 minutes;

    // ---------------------------------------------------------------- state

    /// @notice The collateral users deposit and the vault trades with (tUSDC on testnet).
    IERC20 public immutable COLLATERAL_TOKEN;

    /// @notice Cached `decimals()` of the collateral. Phase 0 Correction 4: testnet tUSDC
    ///         is 6dp and mainnet USDso is 18dp, a 10^12 difference that misprices
    ///         silently. Read once here so no call site ever hardcodes a scale.
    uint8 public immutable COLLATERAL_DECIMALS;

    /// @notice Engines allowed to move user funds into and out of cover.
    /// @dev    A SET, not a single address, so a redeployed engine can take new enrolments
    ///         while the previous one settles the cover it already opened. Revoking an
    ///         engine would strand open positions, so removal is a deliberate act.
    mapping(address engine => bool) public isEngine;

    /// @notice User's total claim on the vault's collateral.
    mapping(address user => uint256) public collateralOf;

    /// @notice Portion of `collateralOf` earmarked against in-flight or open cover.
    mapping(address user => uint256) public reservedOf;

    /// @notice Consent record. No policy, no action.
    mapping(address user => Policy) public policyOf;

    /// @notice Collateral committed per user per window, measured against both ceilings.
    mapping(address user => mapping(bytes32 marketId => uint256)) public committedInWindow;

    /// @notice Sum of every `collateralOf`. Kept explicit so I3 is checkable on-chain.
    uint256 public totalCollateral;

    // --------------------------------------------------------------- events

    event Deposited(address indexed user, uint256 amount, uint256 balance);
    event Withdrawn(address indexed user, uint256 amount, uint256 balance);
    event PolicySet(
        address indexed user,
        uint16 makeWholeBps,
        uint16 maxPremiumBpsPerWindow,
        uint256 maxNotionalPerWindow,
        uint64 expiry
    );
    event PolicyRevoked(address indexed user);
    event Reserved(address indexed user, bytes32 indexed marketId, uint256 amount);
    event ReservationReleased(address indexed user, bytes32 indexed marketId, uint256 amount);
    event Spent(address indexed user, bytes32 indexed marketId, uint256 amount);
    event ProceedsCredited(address indexed user, bytes32 indexed marketId, uint256 amount);
    event EngineApprovalSet(address indexed engine, bool allowed);

    // --------------------------------------------------------------- errors

    error ZeroAddress();
    error ZeroAmount();
    error NotEngine();
    error InsufficientFreeBalance(uint256 requested, uint256 available);
    error InsufficientReservation(uint256 requested, uint256 reserved);
    error NoActivePolicy();
    error PolicyExpired(uint64 expiry, uint256 nowTs);
    error MakeWholeOutOfRange(uint16 given, uint16 max);
    error PremiumCapOutOfRange(uint16 given, uint16 max);
    error PolicyDurationTooShort(uint64 expiry, uint256 earliest);
    error NotionalCapExceeded(uint256 requested, uint256 committed, uint256 cap);
    error PremiumCapExceeded(uint256 requested, uint256 committed, uint256 cap);

    // ---------------------------------------------------------- constructor

    constructor(IERC20 collateral_, address owner_) Ownable(owner_) {
        if (address(collateral_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        COLLATERAL_TOKEN = collateral_;
        COLLATERAL_DECIMALS = IERC20Metadata(address(collateral_)).decimals();
    }

    // ------------------------------------------------------------ modifiers

    modifier onlyEngine() {
        _onlyEngine();
        _;
    }

    function _onlyEngine() internal view {
        if (!isEngine[msg.sender]) revert NotEngine();
    }

    // ---------------------------------------------------------------- admin

    /// @notice Approve or revoke an engine.
    /// @dev    Approving a second engine is how a redeploy happens: the new engine takes
    ///         new enrolments while the old one keeps settling its open cover. Revoking an
    ///         engine that still holds open positions would strand them, so revocation is
    ///         for engines that have finished settling.
    ///
    ///         An engine can only move collateral between a user's free and reserved
    ///         buckets, out to a venue it is buying cover on, and back in as proceeds.
    ///         There is no path from here to the owner.
    function setEngineApproval(address engine_, bool allowed) external onlyOwner {
        if (engine_ == address(0)) revert ZeroAddress();
        isEngine[engine_] = allowed;
        emit EngineApprovalSet(engine_, allowed);
    }

    // ------------------------------------------------------------- user API

    /// @notice Deposit collateral. Balance is credited on the amount actually received,
    ///         so a fee-on-transfer collateral could never over-credit the books (I3).
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 before = COLLATERAL_TOKEN.balanceOf(address(this));
        COLLATERAL_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = COLLATERAL_TOKEN.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        collateralOf[msg.sender] += received;
        totalCollateral += received;

        emit Deposited(msg.sender, received, collateralOf[msg.sender]);
    }

    /// @notice Withdraw unreserved collateral. Always available — a user is never locked
    ///         in by our automation, whatever the policy says and whoever the operator is.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 free = freeBalanceOf(msg.sender);
        if (amount > free) revert InsufficientFreeBalance(amount, free);

        collateralOf[msg.sender] -= amount;
        totalCollateral -= amount;
        COLLATERAL_TOKEN.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, collateralOf[msg.sender]);
    }

    /// @notice Opt in, or amend an existing opt-in. This is the consent record: until it
    ///         exists the engine cannot act for this user at all.
    /// @param makeWholeBps_           Adverse move at which cover should exactly offset loss.
    /// @param maxPremiumBpsPerWindow_ Premium ceiling per window, in bps of exposure.
    /// @param maxNotionalPerWindow_   Absolute collateral ceiling per window.
    /// @param expiry                  Unix seconds; the policy is inert after this.
    function setPolicy(
        uint16 makeWholeBps_,
        uint16 maxPremiumBpsPerWindow_,
        uint256 maxNotionalPerWindow_,
        uint64 expiry
    ) external {
        // A zero dial is not a paused policy — revoke() is how you pause. Rejecting it
        // keeps "active" meaning something.
        if (makeWholeBps_ == 0 || makeWholeBps_ > MAX_MAKE_WHOLE_BPS) {
            revert MakeWholeOutOfRange(makeWholeBps_, MAX_MAKE_WHOLE_BPS);
        }
        if (maxPremiumBpsPerWindow_ > MAX_PREMIUM_BPS) {
            revert PremiumCapOutOfRange(maxPremiumBpsPerWindow_, MAX_PREMIUM_BPS);
        }

        uint256 earliest = block.timestamp + MIN_POLICY_DURATION;
        if (expiry < earliest) revert PolicyDurationTooShort(expiry, earliest);

        policyOf[msg.sender] = Policy({
            active: true,
            makeWholeBps: makeWholeBps_,
            maxPremiumBpsPerWindow: maxPremiumBpsPerWindow_,
            expiry: expiry,
            maxNotionalPerWindow: maxNotionalPerWindow_
        });

        emit PolicySet(
            msg.sender, makeWholeBps_, maxPremiumBpsPerWindow_, maxNotionalPerWindow_, expiry
        );
    }

    /// @notice Withdraw consent. One transaction, immediate, and there is no operator
    ///         path that can block, delay, or reverse it. Cover already open runs to
    ///         settlement and releases normally; no new cover is opened after this.
    function revoke() external {
        policyOf[msg.sender].active = false;
        emit PolicyRevoked(msg.sender);
    }

    // ----------------------------------------------------------- engine API

    /// @notice Earmark collateral to buy cover in `marketId`.
    /// @param exposure The user's measured spot exposure for this window, in COLLATERAL
    ///                 units. Used only to evaluate the premium ceiling.
    /// @dev    The single chokepoint: consent, both ceilings, and the free balance are all
    ///         enforced here, so everything downstream may assume it passed. Reverts
    ///         rather than clamps — only the engine knows the pool's lot grid, so only
    ///         the engine can size down correctly. Call `bindingLimit` first.
    function reserve(address user, bytes32 marketId, uint256 amount, uint256 exposure)
        external
        onlyEngine
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();

        Policy memory p = policyOf[user];
        if (!p.active) revert NoActivePolicy();
        if (block.timestamp > p.expiry) revert PolicyExpired(p.expiry, block.timestamp);

        uint256 committed = committedInWindow[user][marketId];

        if (committed + amount > p.maxNotionalPerWindow) {
            revert NotionalCapExceeded(amount, committed, p.maxNotionalPerWindow);
        }

        uint256 premiumCap = (exposure * p.maxPremiumBpsPerWindow) / BPS;
        if (committed + amount > premiumCap) {
            revert PremiumCapExceeded(amount, committed, premiumCap);
        }

        uint256 free = freeBalanceOf(user);
        if (amount > free) revert InsufficientFreeBalance(amount, free);

        reservedOf[user] += amount;
        committedInWindow[user][marketId] = committed + amount;

        emit Reserved(user, marketId, amount);
    }

    /// @notice Give back an earmark that was not spent — cover skipped, order rejected,
    ///         or only partially filled. Frees the collateral for withdrawal immediately
    ///         and restores the user's headroom under both ceilings.
    function releaseReservation(address user, bytes32 marketId, uint256 amount)
        external
        onlyEngine
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();

        uint256 reserved = reservedOf[user];
        if (amount > reserved) revert InsufficientReservation(amount, reserved);

        reservedOf[user] = reserved - amount;

        uint256 committed = committedInWindow[user][marketId];
        committedInWindow[user][marketId] = amount > committed ? 0 : committed - amount;

        emit ReservationReleased(user, marketId, amount);
    }

    /// @notice Move premium out to the engine to open cover, and debit the user for it.
    /// @dev    Accounting and custody move together in one call, so the books and the
    ///         token balance can never drift apart. Debits the reservation and the
    ///         balance, then transfers to the engine, which is the trader of record.
    ///
    ///         The window commitment is deliberately NOT reduced — it is the spend record
    ///         both ceilings measure. Unspent reservation comes back via
    ///         `releaseReservation`, which does restore headroom.
    function spendForCover(address user, bytes32 marketId, uint256 amount)
        external
        onlyEngine
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();

        uint256 reserved = reservedOf[user];
        if (amount > reserved) revert InsufficientReservation(amount, reserved);

        reservedOf[user] = reserved - amount;
        collateralOf[user] -= amount;
        totalCollateral -= amount;

        COLLATERAL_TOKEN.safeTransfer(msg.sender, amount);

        emit Spent(user, marketId, amount);
    }

    /// @notice Pull settlement proceeds in from the engine and credit them to a user.
    /// @dev    Pulls the tokens as part of the same call, so custody and books move
    ///         together. The engine must have approved the vault. Idempotency is the
    ///         engine's responsibility — a window can settle while a batch is mid-flight.
    function creditProceeds(address user, bytes32 marketId, uint256 amount)
        external
        onlyEngine
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();

        COLLATERAL_TOKEN.safeTransferFrom(msg.sender, address(this), amount);

        collateralOf[user] += amount;
        totalCollateral += amount;

        emit ProceedsCredited(user, marketId, amount);
    }

    // ---------------------------------------------------------------- views

    /// @notice Collateral a user may withdraw right now.
    function freeBalanceOf(address user) public view returns (uint256) {
        return collateralOf[user] - reservedOf[user]; // I1 makes this safe
    }

    /// @notice Whether the engine may open NEW cover for this user right now.
    ///         A view so the UI renders true state rather than inferring it — rule R4.
    function isCoverable(address user) external view returns (bool) {
        Policy memory p = policyOf[user];
        return p.active && block.timestamp <= p.expiry && freeBalanceOf(user) > 0;
    }

    /// @notice The most premium the engine may still commit this window, and which limit
    ///         stops it going further.
    /// @dev    The engine uses `limit` to size the order and `binding` to decide whether
    ///         the achieved make-whole point is degraded — when `binding` is anything but
    ///         `None`, the achieved figure is worse than `policy.makeWholeBps` and the UI
    ///         must show the achieved one.
    function bindingLimit(address user, bytes32 marketId, uint256 exposure)
        public
        view
        returns (uint256 limit, Binding binding)
    {
        Policy memory p = policyOf[user];
        uint256 committed = committedInWindow[user][marketId];

        uint256 notionalRoom =
            committed >= p.maxNotionalPerWindow ? 0 : p.maxNotionalPerWindow - committed;

        uint256 premiumCap = (exposure * p.maxPremiumBpsPerWindow) / BPS;
        uint256 premiumRoom = committed >= premiumCap ? 0 : premiumCap - committed;

        uint256 free = freeBalanceOf(user);

        limit = free;
        binding = Binding.FreeBalance;
        if (notionalRoom < limit) {
            limit = notionalRoom;
            binding = Binding.NotionalCap;
        }
        if (premiumRoom < limit) {
            limit = premiumRoom;
            binding = Binding.PremiumCap;
        }
    }

    /// @notice Premium ceiling for one window, in collateral units.
    function premiumCapFor(address user, uint256 exposure) external view returns (uint256) {
        return (exposure * policyOf[user].maxPremiumBpsPerWindow) / BPS;
    }

    /// @notice Collateral held beyond what the books claim. Reads zero in normal
    ///         operation, because every accounting move now carries its own transfer;
    ///         a non-zero value means tokens arrived outside `deposit`.
    function surplus() external view returns (uint256) {
        uint256 held = COLLATERAL_TOKEN.balanceOf(address(this));
        return held > totalCollateral ? held - totalCollateral : 0;
    }
}
