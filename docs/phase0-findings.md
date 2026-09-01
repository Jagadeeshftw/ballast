# Phase 0 — findings

Investigation for Ballast, the auto-hedging vault for dreamDEX Event Contracts on Somnia.

- **Date:** 1 Sep 2026
- **Chain under test:** Somnia Shannon testnet, chain ID 50312 (`eth_chainId` → `0xc488`, verified)
- **RPC:** `https://dream-rpc.somnia.network/` (verified; client `somnia-51da1ad2477251c-release`)
- **Reproducible evidence:** [`probes/`](../probes) — 13 Foundry tests, all passing, run against live testnet state

**Recommendation up front: GO**, with five corrections to the build spec. Q1 (the kill
question) is answered affirmatively and *proven on-chain*, not inferred. The architecture in
§3 survives. The argument in §3.1 does not, and needs replacing before it reaches a README.

Confidence markers: **[VERIFIED]** = I executed it against the chain or read it in shipped
source. **[DOCUMENTED]** = stated in official docs, not independently executed.
**[UNRESOLVED]** = could not establish.

---

## Q1 — Are Event Contracts callable from a contract? **[KILL QUESTION → GO]**

**Yes. A smart contract can hold collateral, place orders, take liquidity, and mint complete
sets on Event Contracts entirely in its own name, with no allow-list, no operator grant, and
no signed off-chain API call.** **[VERIFIED]**

I did not take this from documentation. I deployed a contract into a fork of live testnet
state and made it trade. All four assertions pass ([`probes/test/Q1.t.sol`](../probes/test/Q1.t.sol)):

| Test | Result |
| --- | --- |
| Contract calls `tUSDC.faucet()` and is credited | 10,000 tUSDC to the contract |
| Contract places a resting bid and owns it | `getOwnOpenOrders()` → 1 |
| Contract crosses the touch, FILL_OR_KILL | real fill, collateral actually moved |
| Contract calls `mintSet` for a complete pair | 100 tUSDC drawn, YES+NO minted |

The write path is `placeBinaryOrder(uint8 kind, uint256 price, uint256 quantity,
uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder,
uint96 builderFeeBpsTimes1k, uint64 userData)` on the per-market binary pool. It is an
ordinary on-chain function. `msg.sender` becomes the order owner, and escrow is drawn from
`msg.sender`. That is exactly the BallastVault-as-trader-of-record model in §3.2.

Two details worth carrying into the build:

- The generic `placeOrder` / `placeOrderFor` **revert `UseBinaryPlacement` on a binary pool.**
  The YES/NO side is an explicit `kind` param (0 BUY_YES, 1 SELL_YES, 2 BUY_NO, 3 SELL_NO),
  and `price` is *always* the YES-side price. Down = 1 − Up. **[VERIFIED]**
- `builderFeeBpsTimes1k` must be `uint96`. It is selector-critical; `uint256` produces a
  different selector and will not find the function. **[VERIFIED]**

Sources: [`@somnia-chain/markets-sdk@0.28.1`](https://www.npmjs.com/package/@somnia-chain/markets-sdk)
`src/tradeAbi.ts`; live pools on testnet; `probes/test/Q1.t.sol`.

> The fallback in §9 is not needed. Do not spend the day on it.

---

## Q2 — Window mechanics

**Lifecycle** **[DOCUMENTED + VERIFIED on live markets]**

```
Listed → Trading → Locked → Resolved | Voided
  0        1          2         4        5
```

`Settling (3)` exists in the enum but is effectively never observable. **Only `Trading`
accepts orders.** Status is time-derived on-chain; the indexer lags by seconds, so every
write must gate on the live on-chain status, not the indexed one.

**Window durations offered.** Read live from the indexer, 562 binary markets present,
16 in `Trading` at time of reading: **[VERIFIED]**

| Interval | Assets |
| --- | --- |
| 60 s | BTC, ETH |
| 300 s (5 m) | BTC, ETH |
| 900 s (15 m) | BTC, ETH |
| 3600 s (1 h) | BTC, ETH |
| 14400 s (4 h) | BTC, ETH |
| 86400 s (24 h) | BTC, ETH |

Symbols look like `BTC-0-02SEP26/tUSDC` (strike `0` = "closes at or above its opening
price") and `ETH-247056-01SEP26-0525/tUSDC` (explicit strike).

**Collateral.** Per-venue, and it differs between networks: **[VERIFIED]**

| Network | Token | Address | Decimals |
| --- | --- | --- | --- |
| Testnet 50312 | tUSDC | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | **6** |
| Mainnet 5031 | USDso | `0x00000022dA000002656c64D9eA6011ea952D008A` | **18** |

I confirmed `decimals()` → 6 and `symbol()` → `tUSDC` on testnet. The 10^12 difference is a
live trap: a hardcoded constant that works on testnet misprices every order on mainnet and
nothing reverts to tell you. **Derive scale from `collateral.decimals()` at runtime.**

**Payout unit.** 1 USDso (or 1 tUSDC) per winning contract. dreamDEX sets maker, taker and
settlement fees all to **zero**, so winners redeem 1:1. Redeeming a *losing* position
succeeds and pays 0 — it does not revert. On a voided market both sides redeem at 0.5 and
must each be redeemed explicitly. **[DOCUMENTED]**

**Tick / lot / minimum.** Read per pool from `getOrderBookParameters()`, which returns
`(tickSize, minQuantity, lotSize)`. On the live binary pools I sampled, all three are `1000`
raw units (= 0.001 at 6 decimals). Prices are Up-probabilities expressed in collateral
units, so `0.68` is `680000`. **[VERIFIED]** These are admin-tunable — read at runtime.

**Order expiry is mandatory.** `expireTimestampNs` is unix nanoseconds, must be in the
future, and must not exceed the market's own expiry. Passing `0` reverts
`OrderAlreadyExpired`. There is no "no expiry" value. **[DOCUMENTED]**

**Settlement is already reactive.** Each market's settlement question is scheduled on the
OracleHub at creation with resolution gas reserved up front. When the oracle posts the
answer, **Somnia's on-chain reactivity delivers it to the hub's callback** — no keeper. Two
permissionless backstops exist: `pokeOracle(questionId)`, and `voidExpired()` once the
settlement window lapses. A market can never strand funds. **[DOCUMENTED]**

---

## Q3 — Event surface for Reactivity

Topic0 hashes below are computed from the shipped ABIs **and cross-checked against logs
actually emitted on testnet in the last few hundred blocks.** Ones I observed live are
marked ✓. **[VERIFIED]**

**Market lifecycle — `BinaryMarketsModule` `0x3ecC694Cef705358864a646142ac17A90E29e388`**

| Event | topic0 | Live |
| --- | --- | --- |
| `MarketCreated(bytes32,address,address,uint256,uint32,bytes32,address,address,uint256,uint256,uint64,uint8,uint8,uint64,uint64,uint8,string,uint256,string,bytes)` | `0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd` | ✓ |
| `MarketFinalized(bytes32,address,uint256)` | `0x8f396ac6cf2e01887362e2b39d8e56860042c604e5b1b481c87e6d9f90006e08` | ✓ |
| `PoolReleased(bytes32,address,address)` | `0xa389f948003aaa74e0c2c9cc8a98b4c16fd32b5c0d5d9885008046030daa429a` | ✓ |

**`MarketCreated` is the window-rollover trigger the spec asks for.** It fires when the
venue rolls a successor window. Two further module topics were observed live but are not in
the published ABIs: `0x4ca97661…` and `0x776d2687…`. **[UNRESOLVED]** — not blocking.

**Per-market state — market contract**

| Event | topic0 |
| --- | --- |
| `StatusChanged(uint8,uint8)` | `0xe1377aa21d49fa10bb9ece6a0cd4f75597a90a80c3750f7f7674967f49ab9a62` |
| `Resolved(uint32,uint256[])` | `0x54f8b431494130aaf7827023337336e584c3e73cd8f785a438f09feb95ff7578` |
| `Voided()` | `0x8532e58d991813980022f4053d2c415195cde8ae51cfca6a78dadcf03d61c465` |

`StatusChanged` is the precise Trading→Locked edge — a better hedge-close trigger than a
timestamp.

**Order book — binary pool (per-window, recycled)**

| Event | topic0 | Live |
| --- | --- | --- |
| `OrderPlaced(uint128,(uint128,bool,address,uint64,uint256,uint256,uint256,uint64))` | `0xd90f62f61ee2f606b132cfdfd883ddd079228b6fd6bffd9d7cf848daf824639d` | ✓ |
| `BinaryOrderPlaced(uint128,uint8)` | `0x74d63d9f1c4826854a227aa41c4a51723497a608aa14aa50e8153744f081d4e6` | ✓ |
| `OrderRested(uint128)` | `0xcdd45acd62788abc10f79d86fac34df2a63e1a3b20f061c5bcf431ff6a09b866` | ✓ |
| `OrderCancelled(uint128)` | `0x06ff08ed6b6987bb7df963009d8b54dc03988f4e465c009924929bb010fe03e7` | ✓ |
| **`OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)`** | `0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399` | |
| `OrderExpired(uint128)` | `0x6003d149bc2c6baa0780d4302ad5f925fef5715780d3b6f7d2da5476548da101` | |

**`OrderFilled` is the only honest source for interface rule R1** ("never render covered
unless confirmed on chain").

**Settlement — `BinarySettlement` / `OracleHub`**

| Event | topic0 |
| --- | --- |
| `AnswerDelivered(uint256,bytes32,uint32,uint256[],bool)` | `0x981074cb1e0ea7eac4cbc8c4c9ddbef8b964373e7e8cd0904c8e0951c4430541` |
| `Redeemed(uint256,address,address,uint8,uint256,uint256)` | `0xe31682dd835b7d7bcc4d22f343666af1cc50614bfa16f510ed812ad4ed56f3b4` |

**System events from the precompile `0x0100`** — these need no cooperation from dreamDEX at
all, which makes them the most robust trigger available: **[VERIFIED]**

| Event | topic0 |
| --- | --- |
| `Schedule(uint256)` | `0x67aa3d752967d87d8944b9c7adf73172518777fa4703f336edee81f0736d8987` |
| `BlockTick(uint64)` | `0x758ef516c6953f00626f7bc382a398f5ddc4e9b44c86035e7c0c0a7b8a9b46ae` |
| `SubscriptionCreated(...)` | `0xc338904b2660b1919e916da6c5c8a16f6410eb1930a1e41b3d22649c85041640` |
| `SubscriptionRemoved(uint256,address)` | `0x7b911629d9bc2f016c34a9deca518fb4574bb0b1e9a96b99bce95fb5ea1e4a27` |

### On `MarkPriceUpdated` — **the spec is half right**

`MarkPriceUpdated(address,uint256,uint256)` topic0
`0x2f0f7e3d58a217d311f516b216fa2f75081e17821bebb5f007fa57ff4e71f888` **[VERIFIED]** is real
and live: I counted 47 / 41 / 46 emissions in a 900-block (~90 s) window on the three
testnet SpotPools, i.e. roughly every two seconds.

I also confirmed the SpotStopOrderRegistry's live subscription filters on exactly this
topic, by reading the precompile directly:
`getSubscriptionInfo(2851633)` returns `eventTopics[0] = 0x2f0f7e3d…`. **[VERIFIED]**

**But `MarkPriceUpdated` is a *SpotPool* event. Binary/event-contract pools do not emit
it and have no mark price** — a binary price *is* the book's Up-probability. So:

- Use `MarkPriceUpdated` from the relevant SpotPool as the **spot-exposure price feed**.
- Do **not** expect it to price the hedge. Hedge sizing reads the binary book
  (`getBookLevels`) or a mid derived from it.
- §3.3 requirement 6's sanity band still applies, but it guards the *spot* feed, and
  separately the binary book should be checked for a crossed or absent touch.

Testnet SpotPools: SOMI/USDso `0x259fD6559214dd5aD3752322426eA9F9fABEFff4`,
WBTC/USDso `0x3605f28aA7C50e7441211e77Cb0762d49539326C`,
WETH/USDso `0xD180195da5459C7a0DEA188ed61216ec43682b50`. **[DOCUMENTED, addresses live]**

---

## Q4 — Order placement on behalf of a user

**Ballast does not need this, and should not use it.** §3.1's conclusion is correct. Its
*reasoning* is out of date and must not be published as written. See
[the correction](#correction-1--§31s-consent-argument-is-no-longer-true) below.

The facts as they stand today: **[DOCUMENTED]**

- Spot has an `OperatorPermissionsRegistry` — testnet `0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`
  **[VERIFIED live]**, mainnet `0xE7a190736B6024a4DbafadC04E283075877005ce`.
- Grants are **per function selector**: `placeOrderFor` `0x80054449`, `cancelOrderFor`
  `0xe37b444b`, `reduceOrderFor` `0x364c2587`. Approving one does not admit the others.
- Three scopes: global (all registered pools), per-pool, and a per-pool **denial** that
  trumps both — an explicit kill switch.
- Resolution: `isApproved = NOT perPoolDenied AND (perPoolApproved OR (globalApproved AND poolRegistered))`.
- **Revocation is immediate** and does not disturb already-resting orders.
- Operators can never move funds. Fills, cancels and reduces always pay the order owner.
- Verify what a pool actually enforces with
  `isOperatorAuthorized(address owner, address operator, bytes4 selector)`.

`placeOrderFor` *additionally* admits protocol system contracts via an owner-managed
allow-list (the error `OnlyApprovedContracts` exists in the shipped error table). That
residual admin path is real. But it is now a supplement to a genuine per-user consent
system, not a substitute for one.

**No equivalent gate blocks Ballast**, because Ballast never acts on behalf of a user — it
trades in its own name, which Q1 proves is unrestricted. We need nothing whitelisted, and
should assume nothing will be.

---

## Q5 — Reactivity economics

**Minimum balance: 32 SOMI/STT.** **[VERIFIED in source and by execution]**
`SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether`. My fork test asserts that
`subscribe()` reverts with `InsufficientBalance` at 32 ether − 1 wei and is satisfied at
32 ether.

Three corrections to how the spec frames this:

1. **It is not a subscription funding pool and not an escrow.** It is a floor on the
   *owner's ordinary balance*, checked **only at creation**. It is never consumed or locked.
2. **The subscription owner is whichever contract called `subscribe`** — for us, the
   HedgeEngine. Gas for each callback is billed to that contract's balance at the normal
   per-tx rate.
3. **A subscription keeps firing after the balance falls below 32**, as long as each
   individual invocation can be paid.

**Gas.** Creating a subscription costs a flat **210,000 gas**, charged to the caller.
`MAXIMUM_HANDLER_GAS_LIMIT` is **200,000,000**; the library default is **10,000,000**.
`MINIMUM_BASE_FEE_PER_GAS` is 6 gwei, default `maxFeePerGas` 20 gwei. **[VERIFIED in source]**

**Retry: there is none — confirmed.** **[DOCUMENTED, explicit]**

> "If the handler reverts, runs out of gas, or the owner can't pay, the reactive transaction
> fails in the ordinary way. A failure doesn't itself remove the subscription."

So a revert loses that window for everyone in the batch and is never retried, but the
subscription survives to the next window. **This validates §3.3 requirements 2–4 exactly as
written.** A subscription *is* auto-removed when it is one-shot and has fired, when it is
evicted from a full queue while one-shot, or when the owner's balance cannot cover
`(price + priorityFee) × gasLimit` at fire time.

**Observed callback latency: 90 ms for a scheduled one-shot — but 0 BLOCKS, same block,
for an event-triggered subscription.** **[VERIFIED — corrected 1 Sep 2026 from production]**

My original 90 ms figure was measured on one-shot `Schedule` subscriptions, and it is right
for those. **It is the wrong number to quote for Ballast**, and the difference is not noise:

| Subscription kind | Waits for | Observed latency |
| --- | --- | --- |
| `Schedule` one-shot | a wall-clock timestamp to arrive | ~90 ms (the remainder of the block it lands in) |
| **Event-triggered** (ours) | **nothing — the log already exists** | **0 blocks: same block as the trigger** |

A scheduled callback cannot fire before its target instant, so its measured latency is
really "time from target to the next block boundary". An event-triggered subscription has
no such wait: the matching log and the handler execute **in the same block**, as a separate
synthetic transaction.

Measured on the deployed engine over four consecutive windows, all identical:

```
trigger   MarketCreated  block 476941284  tx 0x0434d364…
callback  CallbackRan    block 476941284  tx 0x79bf978b…
                         ^ same block, separate synthetic tx
```

This is the strongest technical claim the project has, and it is stronger than what Phase 0
originally reported.

**Handler execution context** — this is where the spec has a factual error, see
[Correction 2](#correction-2--onevent-receives-no-subscription-id). Inside a callback:
`msg.sender == 0x0100`, `tx.origin == subscription owner`, `msg.value == 0`, and calldata is
`selector ++ abi.encode(address emitter, bytes32[] eventTopics, bytes data)`.

**Two hazards the spec does not mention:**

- **Recursive explosion.** Logs emitted *by* a reactive transaction are themselves matched
  against subscriptions in the same block. The docs state plainly that a subscription can
  "provoke a recursive explosion, unstoppably draining the owner's balance." HedgeEngine's
  filter must be provably incapable of matching HedgeEngine's own emissions.
- **Priority starvation.** Per-block caps exist on reactivity gas and transaction count.
  Matches are ordered by `priorityFeePerGas`, and the docs say low-fee matches "may be
  indefinitely deferred." A zero priority fee (the library default) is a real liveness risk
  at a window boundary when everyone rolls at once.

**`isGuaranteed` and `isCoalesced` are documented as reserved — pass `false`.** The
interface comments describe them as functional; the reference section overrides that. Do not
build on them. **[DOCUMENTED]**

### Reactivity cannot be tested locally **[VERIFIED — important for §6 and the schedule]**

The precompile is node-native. `eth_getCode(0x0100)` returns `0x` on the real chain, yet
`eth_call` against it works. Consequently **`subscribe()` cannot execute under a Foundry
fork or anvil** — the call to a codeless address returns empty data that cannot decode. The
markets SDK ships an `isLocalPrecompileUnavailable` helper and a `precompileAvailable` flag,
confirming this is a known condition rather than my misconfiguration.

The workable test strategy, already proven in [`probes/`](../probes):

| Layer | How |
| --- | --- |
| dreamDEX integration | Foundry **fork** against live testnet — real pools, real books |
| `onEvent` authorisation, batching, cursor | **mock precompile** etched at `0x0100` via `vm.etch` |
| End-to-end reactive hedge | **real testnet only** — needs 32 STT |

`probes/test/Q5Mock.t.sol` demonstrates the mock harness with 5 passing tests, including
unauthorised-caller rejection and callback execution. One gotcha: `vm.etch` copies runtime
code but **not** constructor-initialised storage, so a mock's counters start at zero.

This means §6's `onEvent` test list is fully achievable, and Day 2 ("contracts against
mocks, tests green") is realistic. Only the true end-to-end run needs testnet STT.

---

## Q6 — SDKs and endpoints

All three packages install clean and import without error, on Node 24.11.1. **[VERIFIED]**

| Package | Version | Note |
| --- | --- | --- |
| `@somnia-chain/markets-sdk` | **0.28.1** | Event Contracts live here. Use ≥ 0.28.0 |
| `@somnia-chain/reactivity` | **0.2.1** | TS, EOA-owned subscriptions |
| `@somnia-chain/reactivity-contracts` | **0.2.1** | Solidity, `SomniaEventHandler` + `SomniaExtensions` |
| `viem` | 2.56.1 | peer dep |

**Two hard version floors, both documented and both silent failures below them:** under
0.23.0 nothing reads at all (the indexer dropped a column those versions still request);
under 0.28.0 an ordinary float price lands off the tick grid and the pool rejects it with
`InvalidPrice`. The second only manifests on an 18-decimal venue, so **testnet looks clean
while every mainnet order fails.** Pin ≥ 0.28.0.

**Endpoints** **[VERIFIED unless noted]**

| Purpose | Testnet |
| --- | --- |
| JSON-RPC | `https://dream-rpc.somnia.network/` |
| Indexer (GraphQL) | `https://dev.smk.somnia.host/v1/graphql` |
| WebSocket RPC | `wss://api.infra.testnet.somnia.network/ws` **[DOCUMENTED]** |
| Explorer | `https://shannon-explorer.somnia.network` (Blockscout v10.2.6) |
| Oracle question explorer | `https://prd.oracle.somnia.host/questions/{oracleQuestionId}?view=graph` **[DOCUMENTED]** |

There is **no dreamDEX REST endpoint for Event Contracts** — the HTTP API is spot-only. The
SDK plus direct chain reads is the whole surface. The docs state there are no rate limits,
because "market data is the chain itself."

**Criterion-1 ammunition.** Legitimately usable, all confirmed present: the markets SDK
(unified verbs, raw trader tier, React hooks, live watches), the reactivity Solidity package,
the reactivity TS package, the GraphQL indexer, the WebSocket feed, ABI exports for non-JS
stacks (`binaryModuleReadAbi`, `binaryModuleWriteAbi`, `binarySettlementAbi`, `erc6909Abi`,
`oracleHubAbi`), and **CCXT support**. There is also a `somnia-chain/somnia-skills` repo with
a `dex-operator-trading` recipe. **[DOCUMENTED]**

### Protocol addresses — identical on testnet and mainnet (CREATE3)

All six verified to carry bytecode on testnet; `BinaryMarketsModule` is an ERC-1967 proxy
(implementation `0xdF87AC5C4760e2F1Dd78e054ce0629A26A4cA5cA`, unverified on the explorer).
**[VERIFIED]**

| Contract | Address |
| --- | --- |
| BinaryMarketsModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| MarketsCore | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` |
| BinarySettlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| OutcomeToken6909 | `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9` |
| OracleHub | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` |
| CollateralRouter | `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C` |

Per-market contracts (market + pool) come from `markets(marketId)` on the module.
**Never hardcode a pool address** — pools are recycled across successive windows, so a pool
address is a time-varying binding. **Key all state by `marketId`.**

---

## Q7 — Faucet **[RESOLVED — no longer a schedule risk]**

**Collateral (tUSDC) is solved and needs no human.** **[VERIFIED]** The testnet token mints
on demand: `faucet(uint256 amount)` credits `msg.sender`, capped at **10,000 tUSDC** per
call (above that reverts `FaucetCapExceeded`). There is no faucet page and no queue. My
probe contract called it directly and was credited — **a contract can self-fund its own
collateral**, which is convenient for demos.

**Native STT — SOLVED. My original finding was wrong.** **[VERIFIED — corrected 1 Sep 2026]**

I reported that there was "no self-serve route" and that every path to real amounts was
human. **That is incorrect and the correction matters, because acting on it would cost
someone a day waiting on a grant that is not needed.**

The faucet is a **bot command in the hackathon Telegram group**:

```
/faucet <address>
```

- **50 STT per claim**
- **24-hour cooldown per address**
- No human in the loop, no grant request, no ticket

Claimed successfully: 50 STT to `0x7caEb6fc664219306BBED42183a66282B78AEd96`. At one claim
a day this reaches ~150 STT by 4 Sep, comfortably above the 32 floor plus runway.

**Why I got it wrong:** I checked `https://testnet.somnia.network/` (now a landing page with
no claim form), the docs, and the Google Cloud faucet's documented 1 STT/day — and concluded
from their absence that no self-serve route existed. The route was in the hackathon Telegram
group, which I could not read. *Absence of evidence in the sources I could reach was not
evidence of absence*, and I should have marked it `[UNRESOLVED — check Telegram]` rather
than framing it as a schedule risk needing escalation.

**Sizing note.** The 32 STT is a balance check *at subscription creation only*. It is never
escrowed, locked, or consumed. Once the subscription exists the **entire** balance is
callback runway — do not hold 32 idle in the runway maths.

---

## Q8 — Field check **[UNRESOLVED]**

I could not enumerate submitted projects. `dorahacks.io` sits behind an AWS WAF human-
verification challenge on both the page and the API, and the audit host behind Cloudflare;
neither yields to a scripted fetch.

Established: the hackathon runs **25 Aug – 9 Sep 2026** with a **$5,000** prize pool, and
its stated targets are "consumer-facing trading applications, AI-powered trading agents,
analytics tools, social prediction products." **[DOCUMENTED]**

Nothing I saw suggests a hedging vault has been submitted, but **absence of evidence here is
weak** — I could not read the BUIDL list. **This needs five minutes in a normal browser at
`https://dorahacks.io/hackathon/event-contracts/buidl`.** It is worth doing before Day 2.

Note the framing: none of the four listed target categories is "risk management." That cuts
both ways — Ballast is differentiated, but it should open by explaining *why hedging belongs
in a prediction-market hackathon*, because a judge will not arrive with that frame.

---

# Corrections to the build spec

The spec asks that findings win and that I say so plainly. Five do.

## Correction 1 — §3.1's consent argument is no longer true

**The spec says:** `placeOrderFor` lets allow-listed addresses trade on behalf of arbitrary
users "without per-order user consent," the allow-list is owner-populated, the audit raised
absent consent and the team accepted it as a known risk. The spec then proposes Ballast's
explicit revocable on-chain consent as the differentiating idea, and calls it "the
highest-value paragraph in the whole submission."

**What is actually deployed today:** a full per-user consent system. The
`OperatorPermissionsRegistry` records user-signed, per-function-selector grants, at global
or per-pool scope, with an explicit per-pool **denial** that overrides any approval, and
**immediate revocation**. Operators cannot move funds. It is live on testnet at
`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`.

**Why this matters:** publishing "we added the consent layer dreamDEX left out" next to an
audit citation would assert something a judge can disprove in one click. It would achieve
the exact opposite of the intended effect on criterion 2 — it would read as not having read
the current system.

**What survives, and it is the better argument.** §3.1's *conclusion* — Ballast is the
trader of record and never acts on behalf of users — is not merely still correct, it is now
provably unconditional. Q1 shows we need no permission from anyone: not an allow-list, not
an operator grant, not a whitelist request with human latency. The honest paragraph is:

> Ballast holds its own positions. It never touches a user's dreamDEX account, needs no
> operator grant, and appears on no allow-list — verified by deploying a contract that
> trades Event Contracts in its own name. dreamDEX's own `OperatorPermissionsRegistry`
> would let us trade for users directly; we deliberately do not use it, because a hedging
> vault that cannot touch your account is a smaller thing to trust. Consent in Ballast is a
> `Policy` with a cap, an expiry, and a one-transaction `revoke()` no operator can block.

That still lands criterion 2, it is still cheap, and it is true.

**Requires:** re-reading the Hacken audit directly before writing the README section in §7.
I could not retrieve it (Cloudflare). Do not cite it from the spec's summary.

## Correction 2 — `_onEvent` receives no subscription ID

**The spec says (§3.3 req 1):** "`msg.sender == 0x0100` and gate on `activeSubscriptionId`.
Do both from the start."

**Fact:** the callback signature is `onEvent(address emitter, bytes32[] eventTopics, bytes
data)` and the documented calldata is exactly `selector ++ abi.encode(emitter, eventTopics,
data)`. **No subscription ID is delivered.** A handler cannot know which of its
subscriptions fired. **[VERIFIED in shipped source and docs]**

The reference contract does expose `activeSubscriptionId()` — I read `2851633` off the live
WETH registry — so the audit fix was almost certainly *"refuse callbacks when we have no
active subscription"*, not *"check which subscription this is."*

**Implement instead**, all three of which I have proven work locally:

1. `msg.sender == 0x0100` (free, in the base class).
2. `require(activeSubscriptionId != 0)` — inert whenever we hold no subscription.
3. **Gate on `emitter` and `eventTopics[0]`**, which *are* delivered. This is the real
   protection, and it doubles as the recursion guard.

## Correction 3 — the explorer URL in the spec is dead

`https://testnet.somniascan.io` does not resolve (connection failure, not a 404).
**[VERIFIED]** The working testnet explorer is **`https://shannon-explorer.somnia.network`**
(Blockscout v10.2.6, API at `/api/v2/…`). `somniascan.io` itself resolves but is the mainnet
property. Update §2 and any README/UI footer links.

## Correction 4 — testnet splits collateral across the two sides

The exposure source (dreamDEX **spot**) quotes in **USDso, 18 decimals**. The hedge
instrument (**Event Contracts**) settles in **tUSDC, 6 decimals** on testnet. They are
different tokens with a 10^12 scale difference. **[VERIFIED]**

Sizing a hedge therefore crosses a unit boundary that does not exist on mainnet, where both
are USDso at 18 decimals. Put the conversion in exactly one place, derive both scales from
`decimals()` at runtime, and unit-test the boundary — this is a silent-mispricing bug, not a
reverting one.

## Correction 5 — the schedule's dates do not match 2026

The table maps Day 1 to "Tue 2 Sep". In 2026, **2 Sep is a Wednesday**; that weekday mapping
belongs to 2025. Today, **1 Sep 2026, is a Tuesday** — so we are one day *earlier* than the
plan assumes, and Phase 0 is done on what the table calls Day 0.

The stated deadline (submit 8 Sep, hackathon closes 9 Sep) is consistent with the DoraHacks
listing. Please confirm which column binds; I have assumed the dates, not the weekdays. The
practical effect is one extra day of slack, which I would spend on the Q7 STT request.

---

# Answers to the open questions in §10

**1. Measured or declared exposure? → Measured. It is readable.** **[VERIFIED]**
On-chain reads exist for every component of a user's exposure: ERC-20 `balanceOf` for wallet
holdings, `getWithdrawableBalance(owner, token)` for pool vault balances, and — since perps
are live on testnet — `getPosition(account, perpPool)` returning a signed `int128 size`,
which is the cleanest exposure primitive available. §3.4 option (1) is viable, so the UI can
honestly say "measured." Recommend building measured-only and never shipping the "declared"
wording.

**2. Default coverage ratio?** — **SUPERSEDED.** A follow-up investigation established that
Event Contracts are at-the-money binaries with exactly one strike per window, so "coverage
ratio" is not a meaningful quantity: the payoff kink is pinned at a 0% move and cannot be
set. The dial is now `makeWholeBps` (the adverse move at which the payout offsets the loss)
with `maxPremiumBpsPerWindow` as an independent ceiling. See
[`instrument-economics.md`](instrument-economics.md), which also answers the window-length
question this one was really about: default to 4 h and 24 h, never 60 s.

**3. Sealed policies if days 5–7 free up?** Recommend **no**, and for a new reason: the
higher-value use of that time is the end-to-end reactive run on real testnet, which
[Q5](#reactivity-cannot-be-tested-locally-verified--important-for-6-and-the-schedule) shows
cannot be rehearsed locally and which gates the demo video's central claim. Leave sealed
policies in the README as future work.

---

# Naming

- **npm `ballast`** is **taken** — a `0.0.1-security` placeholder. npm may release it on
  request, but that is human latency we do not need. **[VERIFIED]**
- **`ballast-vault`** and **`counterweight`** are both **free** on npm. `keelson` and
  `offset` are taken. **[VERIFIED]**
- We publish nothing to npm, so this only matters for the repo name and branding.
  **Recommendation: keep Ballast**, name the repo `ballast`, and if a package name is ever
  needed use `ballast-vault`.

---

# Go / no-go

**GO.** Q1 clears decisively and by execution rather than inference. Every load-bearing
assumption in §3 either held or improved:

| Spec assumption | Outcome |
| --- | --- |
| Contract can trade Event Contracts | **Confirmed by execution.** No permission needed |
| Vault as trader of record works day one | **Confirmed** — stronger than hoped |
| No-retry callback semantics | **Confirmed.** §3.3 reqs 2–4 are exactly right |
| 32 STT subscription minimum | **Confirmed**, but it is a balance floor, not an escrow |
| Bounded batch + cursor is necessary | **Confirmed** — and the OracleHub already does this |
| Exposure measurable on-chain | **Confirmed.** Measured, not declared |
| Gate on `activeSubscriptionId` | **Not possible as written** → Correction 2 |
| Consent is dreamDEX's gap | **No longer true** → Correction 1 |
| `testnet.somniascan.io` | **Dead** → Correction 3 |

**Better than expected:** the OracleHub is a closer reference implementation than
`SpotStopOrderRegistry` for what §3.3 asks. Its events —
`DrainParamsUpdated(perMarketResolveGas, callbackBaseGas, maxResolvesPerCallback,
resolveGasReserve)`, `DrainContinuation(subscriptionId, pendingRemaining)` and
`CallbackAccounted(...)` — are precisely the bounded-batch, resumable-cursor, gas-accounting
design the spec specifies, shipped by the protocol team on this exact chain. Mirroring its
shape is both the safest engineering and a strong criterion-2 story. Read those two contracts
before writing HedgeEngine.

**Q7 is closed.** It was the one open schedule risk and it turned out not to be one: the
hackathon Telegram bot dispenses 50 STT per address per day, self-serve. See the correction
in Q7 — my original "no self-serve route" finding was wrong.

## Suggested Day 2, unchanged in spirit

1. Claim STT with `/faucet <address>` in the hackathon Telegram (50/day, self-serve).
2. Do the five-minute browser field check for Q8.
3. Build BallastVault + policy lifecycle against fork tests (`probes/` is the starting point).
4. Build HedgeEngine against the mocked precompile, mirroring the OracleHub drain pattern.
5. Keep the collateral-decimals conversion in one audited place.

---

## Evidence

Everything asserted **[VERIFIED]** above is reproducible:

```bash
cd probes && forge test -vv      # 13 tests, all passing, against live testnet state
```

| File | Establishes |
| --- | --- |
| `probes/test/Q1.t.sol` | The kill question — a contract trades Event Contracts |
| `probes/test/Q5.t.sol` | The 32 STT floor; the precompile's absence under a fork |
| `probes/test/Q5Mock.t.sol` | The mock-precompile harness the build will rely on |
| `probes/src/Probe.sol` | Minimal contract standing in for BallastVault |
| `probes/src/HandlerProbe.sol` | Minimal `SomniaEventHandler` standing in for HedgeEngine |

These are investigation artifacts, deliberately kept separate from `src/`. No product
contract code has been written, per §0.
