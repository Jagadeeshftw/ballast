# A full lifecycle, on chain

Every hash below is a real transaction on Somnia Shannon testnet (chain 50312), captured on
1 Sep 2026. Nothing here is simulated, forked, or mocked. **This is the material the demo
video is cut from.**

Explorer: `https://shannon-explorer.somnia.network`

---

## Deployment

**These are the live addresses. Everything below happened on them.**

| Contract | Address |
| --- | --- |
| `BallastVault` | [`0x9BC43B97c94E23634A561a02EFce641C9e89fe63`](https://shannon-explorer.somnia.network/address/0x9BC43B97c94E23634A561a02EFce641C9e89fe63) |
| `HedgeEngine` | [`0x9026b93dc240244A34B3568aF704a60f4703a115`](https://shannon-explorer.somnia.network/address/0x9026b93dc240244A34B3568aF704a60f4703a115) |
| `SpotExposureSource` | [`0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb`](https://shannon-explorer.somnia.network/address/0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb) |

Reactivity subscription opened in
[`0xd9fe22a0…`](https://shannon-explorer.somnia.network/tx/0xd9fe22a0f5416ec41214fc5b1691ed8466f86fd6e656c09b94bdd73b1b63f0aa).
Filter: `emitter = BinaryMarketsModule`, `topic0 = MarketCreated`, handler = the engine,
gas limit 10,000,000, priority fee 1 gwei.

### Retired engines, still settling their own cover

The vault approves a **set** of engines, not one address, so a redeploy strands nothing:

| Engine | State | Still vault-approved |
| --- | --- | --- |
| [`0xB095Aacf…`](https://shannon-explorer.somnia.network/address/0xB095Aacf9D2e3B12717C2a58B4C6b3afdDf053b0) | retired, swept, unsubscribed | ✅ |
| [`0x9cf2fBC0…`](https://shannon-explorer.somnia.network/address/0x9cf2fBC0C2d6Db45799e52f54347ad7B97801581) | retired, swept, unsubscribed | ✅ |
| [`0x8ff05870…`](https://shannon-explorer.somnia.network/address/0x8ff058704823A6711A456beAfbEd6509F4845f13) | retired — stalled ladder, see below | ✅ |
| [`0x9026b93d…`](https://shannon-explorer.somnia.network/address/0x9026b93dc240244A34B3568aF704a60f4703a115) | **live**, funded, subscribed | ✅ |

**This is not a diagram — it happened.** A retired engine with **zero balance and no
subscription** settled a cover it had opened before the redeploy, crediting 200.00 tUSDC
straight into the user's vault balance, while the live engine was taking new enrolments:

[`0xdafa9556…`](https://shannon-explorer.somnia.network/tx/0xdafa9556f7f474c089b57293c2db3a62b426560a54bdcbb8e4b518e1a489d4c9)
— `settle()` on `0x9cf2fBC0…`, vault `4,677.40 → 4,877.40 tUSDC`.

Every redeploy in this session recovered its runway first: **45.38**, **43.05** and
**39.14 STT** swept back, nothing stranded.

### Why `0x8ff05870…` was retired: a latch that deadlocked

Its retry ladder stopped permanently. `pendingTickAt` was set when a tick was scheduled and
cleared **only** when that tick's callback arrived — and Phase 0 had already recorded that
reactive matches can be evicted from a full queue or deferred indefinitely. One missed tick
left the flag set, `_ensureTick` short-circuited on every later window, and the ladder
stalled **silently**: over twenty minutes, **62 windows enqueued, zero attempted, no event
to say why**. `pendingCount` reached 250.

Two of the design decisions in this project caught it on the same day:

- **Skip reasons are a visible interface state**, so an empty "windows it declined" panel on
  the front page was the symptom that led to the diagnosis.
- **`poke()` is permissionless**, so the product kept working by hand while the automatic
  path was dead.

That is also the honest answer to *why a no-keeper product ships a manual path*: reactive
delivery is best-effort, and we learned that on chain rather than assuming otherwise.

The fix, plus a sweep of every other latch of the same shape, is in
[`latch-sweep.md`](latch-sweep.md). A tick now expires after `tickGraceSeconds` and emits
`TickExpired`; `reconcileSubscription()` and `prunePending()` are permissionless escapes for
the two other latches the sweep found.

---

## The headline: reactivity fires in the SAME BLOCK

The strongest technical claim the project has, and it is verifiable in two clicks.

```
block 476941284   MarketCreated   tx 0x0434d364…      (dreamDEX rolls a new window)
block 476941284   CallbackRan     tx 0x79bf978b…      (Ballast reacts)
                  ^^^^^^^^^^^^^^ same block, separate synthetic transaction
```

- trigger: [`0x0434d364…`](https://shannon-explorer.somnia.network/tx/0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4)
- callback: [`0x79bf978b…`](https://shannon-explorer.somnia.network/tx/0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1)

**Zero blocks of latency.** No keeper, no cron, no process of ours running. Measured across
four consecutive windows, identical every time.

> Phase 0 originally reported ~90 ms. That figure is right for *scheduled one-shot*
> subscriptions, which must wait for a wall-clock target to arrive. An **event-triggered**
> subscription waits for nothing: the matching log and the handler execute in the same
> block. See `phase0-findings.md` Q5 for the correction.

---

## Lifecycle A — on engine `0x8ff05870…` (since retired)

Market `0x…010393`, an ETH window. **Cover opened**
[`0xa7398198…`](https://shannon-explorer.somnia.network/tx/0xa7398198a56e982b0a026a613cecfc269dd16a798a7e8522948901b10cf120cf)
(block 477005631).

| Field | Value |
| --- | --- |
| Quantity | 200 contracts |
| Cover price `q` | **0.627** |
| Premium paid | **125.40 tUSDC** |
| Requested make-whole | 250 bps |
| **Achieved make-whole** | **152 bps** |
| Degraded | **true** |
| Purchase delay | 16 s |
| **Open→purchase drift** | **−2 bps** (recorded, adverse) |

Same cause as Lifecycle B below — the book offered only 200 contracts — but the gap is
wider here because cover was dearer (`q = 0.627` against `0.494`), so the same 200 contracts
buy less protection. **The dial said 250; the interface says 152.**

### It LOST, and that is a successful settlement

The window closed at or above its opening price, so Up won and the cover paid nothing.
Settled in
[`0xac81f1fe…`](https://shannon-explorer.somnia.network/tx/0xac81f1fe91f1eb8d9e21f88140bce12abe23bef698f73760f5f6796f9960c2fb)
(block 477008897):

```
outcome            Lost (2)
proceeds           0
settled            true          <- a completed settlement, NOT an error
vault collateral   4,615.80 -> 4,615.80 tUSDC   (unchanged: nothing to credit)
engine tUSDC held  0
vault.surplus()    0
```

**Phase 0 established that redeeming a losing position succeeds and pays zero rather than
reverting.** Treating that zero as a failure would mark healthy settlements as errors, so
the engine records the outcome, marks the position settled, and skips the credit only
because there is nothing to move. Here is that path running on a real losing position.

The user paid 125.40 tUSDC for cover on a window that did not fall. That is what insurance
costs when the event does not happen, and the interface says so plainly.

---

## Lifecycle B — on retired engine `0x9cf2fBC0…`, settled end to end

Market `0x…0102ff` — an ETH window. Six seconds of real time, four transactions.

| Step | Block | Δ | Transaction |
| --- | --- | --- | --- |
| **1. Window created** by dreamDEX | 476975478 | — | [`0xb235ca1d…`](https://shannon-explorer.somnia.network/tx/0xb235ca1dd1398c37cb64ef15d157dbc2c1642eeb244683abc809752f4e3a6da5) |
| **2. Ballast reacts, enqueues it** | 476975478 | **+0 blocks** | [`0x2d0fa763…`](https://shannon-explorer.somnia.network/tx/0x2d0fa763d1eb3bd0bc9a5d328046fe693e09d3ed16ee2337c6b6e626d8614cff) |
| **3. Cover bought on the delayed tick** | 476975638 | +16 s | [`0xdf3cef7e…`](https://shannon-explorer.somnia.network/tx/0xdf3cef7e35293f516973eea140e76565162ba85dc5608b5d9112eac1c1ebc5b7) |
| **4. Settled, proceeds credited** | 476978853 | +321 s | [`0x5bbe1e60…`](https://shannon-explorer.somnia.network/tx/0x5bbe1e6005513a4d88ad993d4042f55bba86e9e0547fc3033a667f53c19c305a) |

### What the position actually was

| Field | Value |
| --- | --- |
| Quantity | 200 contracts |
| Cover price `q` | **0.494** |
| Premium paid | **98.80 tUSDC** |
| Requested make-whole | 250 bps |
| **Achieved make-whole** | **207 bps** |
| Degraded | **true** |
| Purchase delay | 16 s |
| Open→purchase drift | 0 bps |
| Outcome | **Won** (window closed below its open) |
| Proceeds | **200.00 tUSDC** |
| **Net on the position** | **+101.20 tUSDC** |

### Why it says 207 and not 250

**The book only had 200 contracts on offer.** Size was capped by available liquidity, so the
position delivers 207 bps of cover rather than the 250 the dial asked for — and it says so,
rather than reporting the number the user requested. That is interface rule R4 working on a
real position: *never show a number we cannot source.*

### Accounting, verified after settlement

```
vault.collateralOf(user)   4,602.80 -> 4,802.80 tUSDC   (+200.00 proceeds)
engine tUSDC balance       0                            (nothing stranded in transit)
vault.surplus()            0                            (books and custody in lockstep)
```

---

## Why buying is delayed, and why that is not a workaround

The engine reacts to `MarketCreated` in the same block. **A brand-new pool's book is empty at
that instant** — measured over 8 consecutive windows, market makers first quote **55–102
blocks (5.5–10.2 s) later**:

| | |
| --- | --- |
| Ballast reacts | 0 blocks after creation |
| First maker quote arrives | 55–102 blocks after creation |

So creation **enqueues**; a one-shot `Schedule` subscription buys ~15 s later. Buying at
creation would buy nothing; buying at the *first* quote would take the widest print of the
window. The ladder retries up to three times and then gives up, marking the window
uncovered — observed live:

```
WindowAttempted attempt=1 covered=0     (book still empty)
WindowAttempted attempt=2 covered=0
WindowAttempted attempt=3 covered=0
WindowGaveUp    attempts=3              (never bought into an empty book)
```

One tick serves every pending window, so the ladder costs **1.83 callbacks per window**
measured on chain, not 2 per window.

---

## Skip reasons are first-class, and they fire

Every one of these was observed on the deployed engine. None is an error path:

| Reason | Seen | Meaning |
| --- | --- | --- |
| `NoExposure` | ✅ | a WETH holder on a **BTC** window — correctly not covered |
| `NoLiquidity` | ✅ | the Down book was empty; refused rather than mispriced |
| `AttemptsExhausted` | ✅ | ladder bounded at three rungs |
| `PlacementFailed` | ✅ | the pool rejected one order; the batch continued |

The `NoExposure`/covered split is the asset decoder working: the engine reads `asset` out of
`MarketCreated`'s non-indexed data, so a BTC window and an ETH window are told apart. Without
it a WETH position would have been "covered" by a BTC contract.

---

## Runway

| | |
| --- | --- |
| Engine balance | 42.9 STT |
| Worst-case cost per callback | 0.07 STT |
| Observed callbacks per window | **1.62** (measured on chain) |
| Callbacks remaining | 611 |
| **Windows remaining** | **376** |

**The fix is live and visibly self-correcting.** Read off the deployed engine:

```
callbacksPerWindowX100 :  162        <- 1.62 callbacks per window, MEASURED
callbacksRemaining     :  611
windowsRemaining       :  376        <- 611 / 1.62, not 611
```

An earlier deployment reported the callback count and called it windows, overstating runway
by that ratio. `subscriptionHealth()` now divides by `windowsEnqueued / callbackCount`, so
it calibrates itself from what the engine has actually done rather than from an assumption.
The ratio starts at 1.00 on a fresh deployment and climbs as the retry ladder's shared ticks
accumulate — visible in the numbers above, taken minutes after deployment.

Runway is exactly the kind of number a user relies on, so it ships corrected or not at all.

---

## Settlement branches: three of four observed live

| Branch | Status | Evidence |
| --- | --- | --- |
| **Won** — Down paid, proceeds credited | ✅ **live** | [`0x5bbe1e60…`](https://shannon-explorer.somnia.network/tx/0x5bbe1e6005513a4d88ad993d4042f55bba86e9e0547fc3033a667f53c19c305a) (+200.00) and [`0xdafa9556…`](https://shannon-explorer.somnia.network/tx/0xdafa9556f7f474c089b57293c2db3a62b426560a54bdcbb8e4b518e1a489d4c9) (+200.00, from a *retired* engine) |
| **Lost** — succeeds, pays zero | ✅ **live** | [`0xac81f1fe…`](https://shannon-explorer.somnia.network/tx/0xac81f1fe91f1eb8d9e21f88140bce12abe23bef698f73760f5f6796f9960c2fb) |
| **Unsettled** — `NotSettleable` until resolved | ✅ **live** | rejected before both settlements above |
| **Voided** — both sides redeem at 0.5 | ⚠️ tested only | no live window has voided |

## What is still only proven in tests

Honest gaps, so nobody has to discover them:

- **`poke()` on mainnet-scale liquidity.** Exercised on testnet and in tests.
- **A void has not occurred and may never.** `voidExpired()` and the 0.5/0.5 redemption path
  are tested, and the backstop is exposed permissionlessly, but no live window has voided.
  That is the honest line for this one.
