// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SomniaExtensions} from
    "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

import {BallastVault} from "../src/BallastVault.sol";
import {HedgeEngine} from "../src/HedgeEngine.sol";
import {SpotExposureSource, ISpotPool, IAssetKeyRegistry} from "../src/SpotExposureSource.sol";
import {IExposureSource, IOutcomeToken6909} from "../src/interfaces/IDreamDex.sol";

/// @title Ballast deployment
///
/// @dev THE SEQUENCING THAT MATTERS. The 32-STT floor is on the SUBSCRIPTION OWNER, which
///      is the HedgeEngine contract — not the deployer EOA. Funding the EOA and calling
///      `openSubscription()` from it does nothing for the engine's balance and fails deep
///      inside the precompile with an opaque revert.
///
///      So the order is, and this script enforces it:
///        1. deploy BallastVault
///        2. deploy HedgeEngine
///        3. deploy SpotExposureSource (needs the engine's address as its registry)
///        4. wire them together
///        5. FUND THE ENGINE with 32 STT plus spending money
///        6. only then openSubscription()
///
///      Step 6 asserts the engine's balance first and fails loudly with a readable message
///      rather than reverting inside 0x0100.
///
///      Overfunding is safe — `sweepNative` can recover the excess — so size the ask
///      generously rather than exactly.
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy --rpc-url $SOMNIA_RPC --broadcast
///   forge script script/Deploy.s.sol:OpenSubscription --rpc-url $SOMNIA_RPC --broadcast
contract DeployConfig is Script {
    // ---- Somnia testnet (chain 50312). CREATE3, so identical on mainnet where noted.
    address internal constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;
    address internal constant OUTCOME_TOKEN = 0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9;
    address internal constant TUSDC = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E; // 6dp

    // Testnet spot pools (quote: USDso) and their tokens.
    //
    // READ OFF-CHAIN FROM `getPoolParams()` ON THE LIVE POOLS, not copied from the docs:
    // the Somnia docs' token table is MAINNET, and using those addresses on testnet gives
    // a silently wrong exposure of zero. Note WBTC is 8dp, not 18.
    address internal constant POOL_WETH = 0xD180195da5459C7a0DEA188ed61216ec43682b50;
    address internal constant POOL_WBTC = 0x3605f28aA7C50e7441211e77Cb0762d49539326C;

    address internal constant WETH_TESTNET = 0x4d8E02BBfCf205828A8352Af4376b165E123D7b0; // 18dp
    address internal constant WBTC_TESTNET = 0x4e85DC48a70DA1298489d5B6FC2492767d98f384; // 8dp
    address internal constant USDSO_TESTNET = 0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171; // 18dp

    uint16 internal constant MAX_SPREAD_BPS = 200; // live spot spreads run ~2bps

    /// @dev 32 is the floor; the rest is callback gas. Sized generously on purpose.
    uint256 internal constant RECOMMENDED_ENGINE_FUNDING = 40 ether;

    function _rpcChainOk() internal view {
        require(block.chainid == 50312 || block.chainid == 31337, "wrong chain: expected Somnia testnet 50312");
    }
}

contract Deploy is DeployConfig {
    function run() external {
        _rpcChainOk();

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address owner = vm.envOr("OWNER", deployer);

        console2.log("chain id      :", block.chainid);
        console2.log("deployer      :", deployer);
        console2.log("deployer bal  :", deployer.balance);
        console2.log("owner         :", owner);

        require(deployer.balance > 0.05 ether, "deployer has no gas");

        vm.startBroadcast(pk);

        // 1. Custody + consent. Makes no external venue calls.
        BallastVault vault = new BallastVault(IERC20(TUSDC), owner);
        console2.log("BallastVault  :", address(vault));

        // 2. The reactive brain. Trader of record; module address is immutable.
        HedgeEngine engine = new HedgeEngine(vault, BINARY_MODULE, owner);
        console2.log("HedgeEngine   :", address(engine));

        // 3. Measured exposure. Reads the asset key the engine decodes per window.
        SpotExposureSource source = new SpotExposureSource(
            IAssetKeyRegistry(address(engine)), IERC20(TUSDC), USDSO_TESTNET, owner
        );
        console2.log("ExposureSource:", address(source));

        vm.stopBroadcast();

        // 4. Wiring, as the owner. When OWNER is the deployer this runs here; otherwise
        //    these three calls have to be made by whoever holds the owner key.
        if (owner == deployer) {
            vm.startBroadcast(pk);
            vault.setEngineApproval(address(engine), true);
            engine.setExposureSource(IExposureSource(address(source)));
            engine.approveModuleForOutcomes(IOutcomeToken6909(OUTCOME_TOKEN));
            source.configureAsset(
                "ETH", IERC20(WETH_TESTNET), ISpotPool(POOL_WETH), MAX_SPREAD_BPS, true
            );
            source.configureAsset(
                "BTC", IERC20(WBTC_TESTNET), ISpotPool(POOL_WBTC), MAX_SPREAD_BPS, true
            );
            vm.stopBroadcast();
            console2.log("wiring        : done");
        } else {
            console2.log("wiring        : SKIPPED - owner is not the deployer, do it manually");
        }

        console2.log("");
        console2.log("=== NEXT STEP: FUND THE *ENGINE*, NOT THE DEPLOYER ===");
        console2.log("send at least 32 STT (recommended 40) to:", address(engine));
        console2.log("engine balance now:", address(engine).balance);
        console2.log("then run: forge script script/Deploy.s.sol:OpenSubscription --broadcast");
    }

}

/// @notice Step 6, separated so it can be re-run the moment the engine is funded without
///         redeploying anything.
contract OpenSubscription is DeployConfig {
    function run() external {
        _rpcChainOk();

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address engineAddr = vm.envAddress("ENGINE");
        HedgeEngine engine = HedgeEngine(payable(engineAddr));

        uint256 bal = engineAddr.balance;
        uint256 floor = SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE;

        console2.log("engine        :", engineAddr);
        console2.log("engine balance:", bal);
        console2.log("required floor:", floor);

        // FAIL LOUDLY HERE, not inside the precompile. This is the single most likely
        // way to lose an hour on deploy day.
        require(
            bal >= floor,
            "ENGINE UNDERFUNDED: the 32 STT floor is on the ENGINE CONTRACT, not the deployer EOA. Send STT to the engine address above, then re-run."
        );
        require(
            engine.activeSubscriptionId() == 0, "subscription already open; nothing to do"
        );
        require(address(engine.exposureSource()) != address(0), "exposure source not set");

        vm.startBroadcast(pk);
        uint256 id = engine.openSubscription();
        vm.stopBroadcast();

        console2.log("subscription  :", id);

        (uint256 b, uint256 costPerWindow, uint256 windows, bool subscribed,) =
            engine.subscriptionHealth();
        console2.log("balance       :", b);
        console2.log("cost/window   :", costPerWindow);
        console2.log("windows left  :", windows);
        console2.log("subscribed    :", subscribed);
        require(subscribed, "subscription did not open");
    }
}

/// @notice Read-only preflight. Run this BEFORE broadcasting anything to confirm the
///         environment is what you think it is.
contract Preflight is DeployConfig {
    function run() external view {
        console2.log("chain id            :", block.chainid);
        console2.log("block number        :", block.number);
        console2.log("block timestamp     :", block.timestamp);
        console2.log("basefee             :", block.basefee);

        console2.log("BinaryMarketsModule :", BINARY_MODULE);
        console2.log("  code size         :", BINARY_MODULE.code.length);
        require(BINARY_MODULE.code.length > 0, "module has no code - wrong chain?");

        console2.log("tUSDC               :", TUSDC);
        console2.log("  code size         :", TUSDC.code.length);
        require(TUSDC.code.length > 0, "collateral has no code");

        console2.log("WETH/USDso pool     :", POOL_WETH);
        console2.log("  code size         :", POOL_WETH.code.length);
        require(POOL_WETH.code.length > 0, "WETH pool has no code");

        // Confirm the token wiring against the pool itself rather than trusting constants.
        console2.log("WETH (testnet)      :", WETH_TESTNET);
        console2.log("  decimals          :", IERC20Metadata(WETH_TESTNET).decimals());
        console2.log("WBTC (testnet)      :", WBTC_TESTNET);
        console2.log("  decimals (expect 8):", IERC20Metadata(WBTC_TESTNET).decimals());
        console2.log("USDso (testnet)     :", USDSO_TESTNET);
        console2.log("  decimals          :", IERC20Metadata(USDSO_TESTNET).decimals());
        require(IERC20Metadata(WBTC_TESTNET).decimals() == 8, "WBTC scale changed - re-check");
        require(IERC20Metadata(TUSDC).decimals() == 6, "collateral scale changed - re-check");

        // The precompile is node-native: NO bytecode, yet it answers eth_call. If this
        // reads non-zero you are not on Somnia.
        console2.log("precompile 0x0100 code size (expect 0):", address(0x0100).code.length);
    }
}

/// @notice Redeploy the engine (and the source, whose REGISTRY is immutable) against an
///         EXISTING vault. This is why the vault approves a SET of engines: the new engine
///         takes new enrolments while the old one settles whatever it already opened.
///         Sweep the old engine's runway BEFORE running this — that STT is a day of faucet.
contract RedeployEngine is DeployConfig {
    function run() external {
        _rpcChainOk();

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        BallastVault vault = BallastVault(vm.envAddress("VAULT"));

        require(deployer.balance > 0.05 ether, "deployer has no gas");
        console2.log("vault (existing):", address(vault));

        vm.startBroadcast(pk);
        HedgeEngine engine = new HedgeEngine(vault, BINARY_MODULE, deployer);
        SpotExposureSource source = new SpotExposureSource(
            IAssetKeyRegistry(address(engine)), IERC20(TUSDC), USDSO_TESTNET, deployer
        );

        vault.setEngineApproval(address(engine), true);
        engine.setExposureSource(IExposureSource(address(source)));
        engine.approveModuleForOutcomes(IOutcomeToken6909(OUTCOME_TOKEN));
        source.configureAsset("ETH", IERC20(WETH_TESTNET), ISpotPool(POOL_WETH), MAX_SPREAD_BPS, true);
        source.configureAsset("BTC", IERC20(WBTC_TESTNET), ISpotPool(POOL_WBTC), MAX_SPREAD_BPS, true);
        vm.stopBroadcast();

        console2.log("HedgeEngine     :", address(engine));
        console2.log("ExposureSource  :", address(source));
        console2.log("");
        console2.log("FUND THE ENGINE, then OpenSubscription:", address(engine));
    }
}
