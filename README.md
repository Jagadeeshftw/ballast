# Ballast

**Ballast buys downside cover for your crypto automatically — a small, fixed payout that
lands if the price falls, bought fresh every trading window.** You deposit collateral once
and say how deep a fall you want covered; the chain does the rest, with no keeper, no cron
and nothing of ours running.

Live on Somnia Shannon testnet: **<https://ballast.0xo.in>** ·
dashboard **<https://ballast.0xo.in/app>**

| Contract | Address |
| --- | --- |
| BallastVault | [`0x9BC43B97…`](https://shannon-explorer.somnia.network/address/0x9BC43B97c94E23634A561a02EFce641C9e89fe63) |
| HedgeEngine (live) | [`0x9026b93d…`](https://shannon-explorer.somnia.network/address/0x9026b93dc240244A34B3568aF704a60f4703a115) |
| SpotExposureSource | [`0x7fE8B80F…`](https://shannon-explorer.somnia.network/address/0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb) |
| Collateral (tUSDC, 6dp) | [`0x70a86D88…`](https://shannon-explorer.somnia.network/address/0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E) |
| dreamDEX binary module | [`0x3ecC694C…`](https://shannon-explorer.somnia.network/address/0x3ecC694Cef705358864a646142ac17A90E29e388) |

Chain 50312 · RPC `https://dream-rpc.somnia.network/`

---

## Why a hedging product is in a prediction-market hackathon

None of the published categories is risk management, so the frame is worth stating outright.

Event Contracts are a prediction-market primitive: at-the-money binaries on a price, one
window at a time. Almost everything built on such a primitive is a way to *take* a view.
Ballast is the opposite — it is a **consumer** of the primitive that is not a bet. It buys
the Down side purely to offset spot exposure a user already holds, which means the same
market that serves speculators also serves someone trying to sleep through a drawdown.

That is the argument: a prediction market is more valuable if things that are not gambling
can be built on it, and this is one. The second half of the argument is Somnia-specific —
the venue's own event is the trigger. `MarketCreated` fires, and Ballast's handler runs **in
the same block**, so the product needs no operator at all. Those two things together are why
it belongs here rather than on a generic EVM chain with a keeper bot.

## It sells parametric cover, not a hedge

This distinction is the whole product and the README will not blur it.

Event Contracts are **at-the-money binaries**: one strike per window, struck at the window's
opening price, paying a fixed 1 collateral unit per winning contract. There is no strike
ladder — 562 markets checked, at most one strike per venue per window. So **no quantity of
Down contracts produces a flat net line**, and Ballast does not claim one.

What it produces is a fixed payout on a trigger. Cover is exact at the depth you choose and
imperfect on both sides of it:

| ETH falls | Spot loss | Cover pays | Net |
| --- | --- | --- | --- |
| 1% | −$50 | +$125 | **+$75** — over-compensated |
| 2.5% | −$125 | +$125 | **$0** — the make-whole point |
| 5% | −$250 | +$125 | **−$125** — under-compensated |

The gap either side is **basis risk**, and it is the defining property of **parametric
cover** — the same trade flight-delay insurance makes, paying the same amount whether you
missed a meeting or a wedding. It is not a defect to be engineered away here; it is what you
are buying. Ballast's job is to be honest about where the exact point sits, which is why the
UI always shows the make-whole point it **achieved**, never the one you asked for, whenever
liquidity bound the size.

Sizing: `N = exposure × x* / (1 − q)`, premium `N·q`, and the achieved point read back as
`qty·(1−q)·10000 / exposureAtOpen`.

## The economics, including the part that is bad for us

At-the-money cover is **the most expensive cover this instrument offers**. Because the strike
is the window's open, there is no cheaper out-of-the-money strike to buy, so you pay for the
very likely small moves too.

Premium is roughly fair in expectation — `q` is the market's own probability of Down — so the
structural cost is not the premium, it is **the spread, paid on every roll**. Observed
testnet spreads run 2.2% to 15.4% of mid. Rolling a 250 bps make-whole point every window:

| Interval | Windows/day | Spread cost / day | / year |
| --- | --- | --- | --- |
| 60 s | 1440 | 939% – 9720% | ruinous |
| 900 s | 96 | ~5% | ~1900% |
| 3600 s | 24 | 15% – 25% | 5500% – 9200% |
| **4 h** | 6 | **0.2% – 0.3%** | **79% – 110%** |
| **24 h** | 1 | **~0.1%** | **19% – 21%** |

**So the product defaults to the 4 h and 24 h windows. 60 s is unusable.** Testnet books are
thin, so treat the absolute figures as illustrative of structure rather than a mainnet
forecast — but the structure transfers: premium scales with `x*/(1−q)`, multiplied by windows
per day, with the spread as the real drag.

We did this arithmetic before building the thing, and it is why the premium ceiling is a
**per-window check** rather than a configuration constant. Full workings:
[`docs/instrument-economics.md`](docs/instrument-economics.md).

## Same-block reactivity

Somnia's reactivity precompile at `0x0100` triggers the engine. When dreamDEX emits
`MarketCreated`, the handler executes as a **separate synthetic transaction in the same
block**:

- trigger [`0x0434d364…`](https://shannon-explorer.somnia.network/tx/0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4)
- callback [`0x79bf978b…`](https://shannon-explorer.somnia.network/tx/0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1)

Both in block **476941284**. Zero blocks of latency.

**Correction to Phase 0.** That investigation recorded ~90 ms of callback latency, and it was
right about what it measured and wrong to generalise. The two differ by mechanism:

| Subscription | Waits for | Latency |
| --- | --- | --- |
| `Schedule` one-shot | a wall-clock timestamp to arrive | ~90 ms — the remainder of the block it lands in |
| **Event-triggered (ours)** | **nothing; the log already exists** | **0 blocks — same block as the trigger** |

A scheduled tick must wait for a time to come round. An event-triggered handler has nothing
to wait for, because the matching log is already in the block being built.

## The engine set

The vault approves a **set** of engines rather than one address, so a redeploy strands
nothing — a retired engine keeps the authority to settle cover it opened, while the live one
takes new enrolments.

**This is not a diagram; it happened.** A retired engine with zero balance and no
subscription settled a cover it had opened before the redeploy, crediting 200.00 tUSDC into
the user's vault balance while a different, live engine was taking enrolments:
[`0xdafa9556…`](https://shannon-explorer.somnia.network/tx/0xdafa9556f7f474c089b57293c2db3a62b426560a54bdcbb8e4b518e1a489d4c9)
— vault `4,677.40 → 4,877.40 tUSDC`.

Every redeploy recovered its runway first: 45.38, 43.05 and 39.14 STT swept back.

## Why it is not running right now

The engine is stopped, deliberately, and the reason is a measured property of the venue
rather than a fault. Stating it plainly because it is the most interesting number we found.

**Somnia bills a reactive callback at its gas *limit*, not at its usage.** Twenty callback
receipts: limit **10,000,000**, actually used **1,479,630 – 1,497,350**, at 7 gwei. That is
0.07 STT per wake — exactly `10,000,000 × 7 gwei` — for work costing about 0.010. A 6.7×
overpay that nobody had checked.

dreamDEX rolls about **147 windows an hour** across every series, and the subscription wakes
the engine for all of them, including the 60-second ones the economics above say never to
cover. Measured burn: **12.8 STT/hour, 308/day**. The Somnia faucet pays 0.5 a day.

The fix needs no new contract — `setSubscriptionFees` already sets the limit, and 4,000,000
is twice the worst path measured (`poke()` on a live window estimates 1,936,405). That cuts
the cost 2.5×, not the 10–20× first guessed: a discard-path callback genuinely costs ~1.5M
gas, because Somnia charges 200k per new non-zero SSTORE and the engine writes state on every
wake. That is the engine remembering what it did, not waste.

Applying it means closing and reopening the subscription, and `openSubscription` requires the
engine to hold **32 STT** — a floor checked once at creation, never escrowed and never
consumed. It holds 12.77. So the subscription was closed deliberately to preserve that
against the floor rather than spend it on an hour nobody would watch.

**`topUp()` on the engine is `payable` and permissionless.** Anyone can restart it; no
permission of ours is involved.

Narrowing the subscription instead is not available: `eventTopics` is a `bytes32[4]` so the
precompile does match beyond topic0, but `MarketCreated` indexes `marketId`, `market` and
`pool` — all per-market, all created fresh each window. None of them selects a series.

Because the live page reads a rolling ~1000-block tail (about 100 seconds), the whole run is
captured and committed as data: **6,706 events, 1–2 September**, in
[`docs/run-record.json`](docs/run-record.json). The page renders it when the live tail is
empty, labelled as the recorded run, and live wins whenever the engine is running.

## The latch sweep

After a real production failure — `pendingTickAt` was set by one path and cleared only by an
inbound callback, so one missed tick stalled the retry ladder **silently** for 62 windows —
every piece of state was swept with the same two questions:

> What clears this, and what happens if that thing never comes?

Three needed fixing, all now with a timeout or a permissionless escape:

| State | Failure | Fix |
| --- | --- | --- |
| `pendingTickAt` | stalled the ladder forever | expires after `tickGraceSeconds`, emits `TickExpired` |
| `activeSubscriptionId` | the protocol drops subscriptions on its own; the flag kept reporting `subscribed = true` | permissionless `reconcileSubscription()` |
| `pendingList` | grew without limit; 218 dead entries | permissionless `prunePending(max)` |

One is **documented rather than fixed**. `vault.reservedOf` has no user-side escape: if an
engine reserved and then stopped, collateral would be locked. It is currently unreachable —
the only caller pairs reserve with spend atomically and a revert rolls both back — and the
fix is a reservation expiry in the vault, which would mean redeploying a vault holding a live
user deposit. Redeploying it would strand that deposit, so it is written down instead. That
makes it a decision rather than an oversight.

Full sweep: [`docs/latch-sweep.md`](docs/latch-sweep.md).

## What is only proven in tests

Stated plainly, because everything else here links to a transaction.

- **A void has never happened on chain.** `voidExpired()` and the void settlement branch are
  covered by unit tests against a mock, and have never executed against a real voided market.
- **`poke()` at mainnet-scale liquidity is untested.** It is exercised on thin testnet books
  only. Behaviour under deep books — partial fills across levels in particular — is not
  demonstrated.
- The economics table is computed from **testnet** books, which are thin and erratic.

## Known limitation

Binary markets exist for **BTC and ETH only**. SOMI spot has no corresponding binary and
therefore **cannot be covered at all** — not partially, not approximately. The exposure
source returns zero for it rather than guessing, and the UI says the window was skipped.

## Build

```bash
forge build           # via_ir = true, optimizer_runs = 200
forge test            # 164 tests
cd probes && forge test   # 23 Phase 0 probes against live testnet state (see note)
cd web && npm i && npm run dev
```

**Note on the probes.** 21 of 23 pass. Two — `test_ContractCanPlaceRestingBid` and
`test_ContractCanMintCompleteSet` — are pinned to a specific BTC 24 h market that expired at
2026-09-02 00:00 UTC, and now revert with `TradingNotActive()` and `OrderAlreadyExpired()`.
That is a time-pinned probe decaying, not a product regression: the same assertions passed
against that market while it was live, and the write path they exercise is the one the engine
still uses. They would need repointing at a live market to run green again.

**`via_ir = true` at `optimizer_runs = 200` is required, not optional.** The engine is 24,162
bytes against the EIP-170 limit of 24,576; the legacy pipeline produces 24,902 and will not
deploy. A rebuild with the default profile produces a different artifact.

## Documents

| | |
| --- | --- |
| [`phase0-findings.md`](docs/phase0-findings.md) | Pre-build investigation: can a contract trade Event Contracts, and what the precompile actually guarantees |
| [`phase0-dashboard.md`](docs/phase0-dashboard.md) | Can a visitor with a browser wallet acquire exposure, mint collateral, and pay for gas |
| [`instrument-economics.md`](docs/instrument-economics.md) | Sizing, basis risk, spread drag, and why 4 h and 24 h |
| [`latch-sweep.md`](docs/latch-sweep.md) | Every piece of state, what clears it, what if that never arrives |
| [`onchain-lifecycle.md`](docs/onchain-lifecycle.md) | Full lifecycles with transaction hashes, including both settlements |
| [`somnia-feedback.md`](docs/somnia-feedback.md) | Findings written up for the Somnia team |
| [`run-record.json`](docs/run-record.json) | The complete on-chain record of the engine's run |

## Licence

MIT.
