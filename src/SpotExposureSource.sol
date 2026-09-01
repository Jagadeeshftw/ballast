// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IExposureSource} from "./interfaces/IDreamDex.sol";

/// @notice The dreamDEX spot pool surface this source reads. Signatures verified against
///         markets-sdk 0.28.1 and exercised against live testnet pools.
interface ISpotPool {
    struct Level {
        uint256 price;
        uint256 quantity;
    }

    function getBookLevels(bool isBid, uint64 numLevels)
        external
        view
        returns (Level[] memory);

    /// @notice A user's claimable balance sitting in the pool's vault. Reads 0 in normal
    ///         operation — the vault is a payout fallback — but it is still the user's.
    function getWithdrawableBalance(address owner, address token)
        external
        view
        returns (uint256);
}

interface IAssetKeyRegistry {
    function assetKeyOf(bytes32 marketId) external view returns (bytes32);
}

/// @title  SpotExposureSource
/// @notice Measures a user's dreamDEX spot exposure on-chain and values it in collateral
///         units, so Ballast covers MEASURED exposure. The word "declared" appears nowhere
///         in this product.
///
/// @dev    WHY THE BOOK AND NOT A MARK PRICE. Phase 0 §3.3 asks for the post-audit smoothed
///         mark. `MarkPriceUpdated` is emitted by spot pools roughly every two seconds and
///         the stop registries trigger on it — but there is NO on-chain view that returns
///         it. `getMarkPrice()` / `tryGetMarkPrice()` exist only on perp pools; both revert
///         on all three live testnet spot pools, verified.
///
///         Subscribing to `MarkPriceUpdated` to cache it would mean ~45,000 reactive
///         callbacks a day, which is not affordable. So this source prices off the book and
///         carries the sanity band the spec actually wanted:
///
///           - both sides must be present, or it refuses to price;
///           - the spread must be inside `maxSpreadBps`, or it refuses to price.
///
///         Observed live spot spreads are ~2 bps, so a wide or one-sided book is a real
///         signal that something is wrong rather than a normal state to trade through.
///
///         REFUSING TO PRICE RETURNS ZERO. The engine treats zero exposure as "skip this
///         window", which is the safe direction: no cover is bought, no collateral moves,
///         and the position is shown as uncovered rather than optimistically covered.
contract SpotExposureSource is IExposureSource, Ownable2Step {
    // ---------------------------------------------------------------- types

    /// @param token          The spot asset the user holds (WETH for "ETH").
    /// @param pool           The SpotPool quoting it, used only as a price source.
    /// @param tokenDecimals  Cached `decimals()` of `token`.
    /// @param maxSpreadBps   Refuse to price a book wider than this.
    /// @param enabled        Assets are opt-in; an unconfigured asset prices as zero.
    struct AssetConfig {
        IERC20 token;
        ISpotPool pool;
        uint8 tokenDecimals;
        uint16 maxSpreadBps;
        bool enabled;
    }

    // ------------------------------------------------------------ constants

    uint256 internal constant BPS = 10_000;

    // ---------------------------------------------------------------- state

    /// @notice The engine that decodes a window's asset out of `MarketCreated`.
    IAssetKeyRegistry public immutable REGISTRY;

    /// @notice Collateral the answer is denominated in, and its scale.
    IERC20 public immutable COLLATERAL;
    uint256 public immutable COLLATERAL_ONE;

    /// @notice Scale of the pools' quote currency (USDso, 18dp on both networks).
    /// @dev    Read at construction rather than assumed. Correction 4: testnet collateral
    ///         is 6dp and mainnet is 18dp, and nothing reverts if you get it wrong.
    uint256 public immutable QUOTE_ONE;

    mapping(bytes32 assetKey => AssetConfig) public configOf;

    // --------------------------------------------------------------- events

    event AssetConfigured(
        bytes32 indexed assetKey,
        string symbol,
        address token,
        address pool,
        uint16 maxSpreadBps,
        bool enabled
    );

    // --------------------------------------------------------------- errors

    error ZeroAddress();
    error BadParameter();

    // ---------------------------------------------------------- constructor

    constructor(IAssetKeyRegistry registry_, IERC20 collateral_, address quoteToken_, address owner_)
        Ownable(owner_)
    {
        if (
            address(registry_) == address(0) || address(collateral_) == address(0)
                || quoteToken_ == address(0) || owner_ == address(0)
        ) revert ZeroAddress();

        REGISTRY = registry_;
        COLLATERAL = collateral_;
        COLLATERAL_ONE = 10 ** IERC20Metadata(address(collateral_)).decimals();
        QUOTE_ONE = 10 ** IERC20Metadata(quoteToken_).decimals();
    }

    // ---------------------------------------------------------------- admin

    /// @param symbol The asset string exactly as the venue emits it ("BTC", "ETH").
    function configureAsset(
        string calldata symbol,
        IERC20 token,
        ISpotPool pool,
        uint16 maxSpreadBps,
        bool enabled
    ) external onlyOwner {
        if (address(token) == address(0) || address(pool) == address(0)) revert ZeroAddress();
        if (maxSpreadBps == 0 || maxSpreadBps >= BPS) revert BadParameter();

        bytes32 key = _hashSymbol(bytes(symbol));
        configOf[key] = AssetConfig({
            token: token,
            pool: pool,
            tokenDecimals: IERC20Metadata(address(token)).decimals(),
            maxSpreadBps: maxSpreadBps,
            enabled: enabled
        });

        emit AssetConfigured(key, symbol, address(token), address(pool), maxSpreadBps, enabled);
    }

    // ----------------------------------------------------------------- reads

    /// @inheritdoc IExposureSource
    function exposureOf(address user, bytes32 marketId) external view returns (uint256) {
        bytes32 key = REGISTRY.assetKeyOf(marketId);
        if (key == bytes32(0)) return 0;

        AssetConfig memory cfg = configOf[key];
        if (!cfg.enabled) return 0;

        (uint256 price, bool ok) = _priceOf(cfg);
        if (!ok) return 0;

        uint256 held = cfg.token.balanceOf(user)
            + cfg.pool.getWithdrawableBalance(user, address(cfg.token));
        if (held == 0) return 0;

        // held (tokenDecimals) * price (QUOTE_ONE) -> collateral units.
        // Multiply before dividing; every scale is read, never assumed.
        return (held * price * COLLATERAL_ONE) / (QUOTE_ONE * (10 ** cfg.tokenDecimals));
    }

    /// @notice The price this source would use, and whether it considers it usable.
    /// @dev    Exposed so the UI can show *why* a window was skipped rather than rendering
    ///         a bare zero — interface rule R4, never show a number we cannot source.
    function priceOf(bytes32 assetKey) external view returns (uint256 price, bool ok) {
        AssetConfig memory cfg = configOf[assetKey];
        if (!cfg.enabled) return (0, false);
        return _priceOf(cfg);
    }

    function assetKeyFor(string calldata symbol) external pure returns (bytes32) {
        return _hashSymbol(bytes(symbol));
    }

    /// @dev Assembly keccak: the symbol bytes are already contiguous in memory, so the
    ///      built-in's extra copy buys nothing.
    function _hashSymbol(bytes memory b) private pure returns (bytes32 h) {
        assembly {
            h := keccak256(add(b, 0x20), mload(b))
        }
    }

    // -------------------------------------------------------------- internal

    /// @dev Mid of the touch, refused outright when the book is one-sided, crossed, or
    ///      wider than `maxSpreadBps`.
    function _priceOf(AssetConfig memory cfg) internal view returns (uint256 price, bool ok) {
        ISpotPool.Level[] memory bids = cfg.pool.getBookLevels(true, 1);
        ISpotPool.Level[] memory asks = cfg.pool.getBookLevels(false, 1);

        if (bids.length == 0 || asks.length == 0) return (0, false);
        uint256 bid = bids[0].price;
        uint256 ask = asks[0].price;
        if (bid == 0 || ask == 0 || bids[0].quantity == 0 || asks[0].quantity == 0) {
            return (0, false);
        }
        if (ask <= bid) return (0, false); // crossed or locked book

        uint256 mid = (bid + ask) / 2;
        if (((ask - bid) * BPS) / mid > cfg.maxSpreadBps) return (0, false);

        return (mid, true);
    }
}
