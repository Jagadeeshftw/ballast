<p align="center">
  <img src="assets/ballast_logo.png" alt="Ballast" width="180">
</p>

# Ballast

**Ballast buys downside cover for your crypto automatically — a small, fixed payout that
lands if the price falls, bought fresh every trading window.** You deposit collateral once
and say how deep a fall you want covered; the chain does the rest, with no keeper, no cron
and nothing of ours running.

Live on Somnia Shannon testnet: **<https://ballast.0xo.in>** ·
Documentation: **<https://ballast.0xo.in/docs>** (the markdown in [`docs/`](docs/) is its source) ·
dashboard **<https://ballast.0xo.in/app>**

| Contract | Address |
| --- | --- |
| BallastVault | [`0x9BC43B97…`](https://shannon-explorer.somnia.network/address/0x9BC43B97c94E23634A561a02EFce641C9e89fe63) |
| HedgeEngine (live) | [`0xFE725050…`](https://shannon-explorer.somnia.network/address/0xFE7250509634ABb94b3cDbd72eb122feCcaC157c) |
| SpotExposureSource | [`0x83923535…`](https://shannon-explorer.somnia.network/address/0x83923535ff800b60cb892d4EC2AbE8cb0e9C949a) |
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
block**.

What the trigger transaction actually is matters, because its summary page does not show a
market being created. **dreamDEX creates markets from inside a reactive callback of its
own** — so the transaction below is dreamDEX's callback, and `MarketCreated` is emitted by
`BinaryMarketsModule` ([`0x3ecC694C…`](https://shannon-explorer.somnia.network/address/0x3ecC694Cef705358864a646142ac17A90E29e388))
*inside* it, at **log index 75**. Ballast's handler then runs in the same block, on the
market that event created. Two reactive systems chained inside one block.

- trigger [`0x0434d364…`](https://shannon-explorer.somnia.network/tx/0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4) — dreamDEX's own callback; open the **Logs** tab and find
  `MarketCreated` at log 75 (market `0x…010253`; the transaction creates two)
- callback [`0x79bf978b…`](https://shannon-explorer.somnia.network/tx/0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1) — Ballast's handler, whose `CallbackRan` carries that same
  market id

Both in block **476941284**. Zero blocks of latency.

The two are tied together by the subscription itself, not merely by sharing a block: the
engine's own `SubscriptionOpened` records emitter `0x3ecC694C…` and topic0 `0xb5ec75cd…`,
which is exactly the emitter and topic of log 75.

**Be warned before you click.** `BinaryMarketsModule` is **unverified** on
shannon-explorer, so log 75 renders with no event name and no decoded parameters — raw
topics and about twenty lines of hex. To confirm it yourself, match the log's topic0 against

```
MarketCreated(bytes32,address,address,uint256,uint32,bytes32,address,address,uint256,uint256,uint64,uint8,uint8,uint64,uint64,uint8,string,uint256,string,bytes)
keccak256 = 0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd
```

and topic1, the market id, against the `CallbackRan` in our callback. The **callback**
transaction reads cleanly on its summary page — our contract, method `onEvent`, block
476941284 — so that is the one to open. Reported to Somnia as
[finding 6](docs/somnia-feedback.md).

Two honest notes on this exemplar. The handler **declined** on this window —
`CoverSkipped … NoLiquidity`, a one-sided Down book at creation, and `CallbackRan` reports
`covered 0`. It demonstrates the handler running and refusing, which is the behaviour this
project argues for, but it bought nothing. And the callback is on
[`0xB095Aacf…`](https://shannon-explorer.somnia.network/address/0xB095Aacf9D2e3B12717C2a58B4C6b3afdDf053b0),
which is now a **retired** engine; it was the live one on 1 September, and the vault
approving an engine *set* is exactly why a redeploy strands nothing.

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

Every redeploy recovered its runway first: 45.38, 43.05, 39.14, 150.02 and 136.53 STT swept back.

## A gas limit below ~1,000,000 cannot write a new storage slot, whatever the work costs

Somnia enforces a **gas-remaining** floor: a write that touches a new non-zero storage slot
requires roughly 1,000,000 gas still *available* at that point. The check is against what is
left, not what is used — so under that limit the transaction can never pass however cheap it
actually is. It burns the entire limit, and **the receipt reports `status: reverted`**, so it
looks like a revert rather than an out-of-gas.

Proven with two brand-new wallets making an identical `approve`:

| Gas limit | Result | Gas used |
| --- | --- | --- |
| 900,000 | reverted | **900,000** — the whole limit |
| 1,100,000 | success | **259,745** |

The call needs 259,745. It fails at 900,000 anyway.

This cost us a real deposit: `approve` was provisioned at 600,000, measured against warm
accounts where it was never going to be exercised, and a first-time wallet's approval consumed
all 600,000 and failed. Two more writes were under the same floor and had simply not been hit.

Two consequences worth carrying: **provision a floor, not a multiple of measured usage** — a
limit sized from a gas estimate will be far too small if the work is cheap. And **`reverted` is
ambiguous on this chain**: the only way to distinguish out-of-gas from an actual revert is to
compare `gasUsed` against the limit sent, which is what this interface now does before telling
anyone to go looking for a revert reason that does not exist.

## The record is committed, so most of the site needs no chain read

The engine's whole run is captured as JSON and committed to this repository, so the history it
wrote is part of the site rather than something the site fetches. Positions, totals, the
cumulative chart, every refusal with its reason, the block ranges and the transaction hashes
all come from that file.

**Only three figures on the entire site are genuinely live:** the vault balance, the engine's
counters, and the spot price used to measure exposure.

That is why the site stays up when the testnet does not. With Somnia's RPC endpoint returning
502 — which it did for an extended period on 4 September — every page still rendered
server-side with its full content, and `/app/cover` and `/app/activity` were complete with
nothing missing and no notice at all, because neither needs a network. The three live figures
show an em dash and say what could not be read, rather than a zero nobody measured.

## Why it stopped in September

The engine stopped in September, and for nine days this section gave the wrong reason. The
correction is kept here in full, because it is checkable and because the mistake changed what
we did.

**We reported that Somnia bills a reactive callback at its gas *limit*, not its usage. It does
not, and it never did.** Every charge we could match to its receipts — 255 charged blocks on
six engines, 1 to 11 September, at limits of 10,000,000 and 4,000,000 and priority fees of 1
and 2 gwei — equals `gasUsed × effectiveGasPrice` to the wei. Not one equals the limit.

The recorded run settles it without sampling. From the subscription opening on 1 September to
its close on 2 September (12.75 hours), the engine went from 40 STT to 12.77 with no top-ups:
**27.23 STT for 2,715 callbacks, about 0.010 each**. Billing at the limit would have cost
190.05 STT, from an engine that only ever held 40.

The 0.07 STT per wake we quoted was never a charge. It is the engine's own `costPerCallback`
— `callbackGasLimit × (basefee + priority)`, a worst-case bound — and we read it as the bill.
The twenty receipts showing 1,479,630 – 1,497,350 gas used were real; the 6.7× overpay, the
12.8 STT an hour and the ~190 STT for the run were that bound multiplied out, not measured.
The run actually burned 2.14 STT an hour. Charges followed the work: single callbacks in seven
sampled minutes on 1 September cost between 0.0033 and 0.0101 STT, so the 2,281 registration
wakes were not billed like the 434 drain wakes.

What was true: an engine cannot open a subscription without holding 32 STT, and the Somnia
faucet paid 0.5 a day.

Acting on the wrong number, we cut the limit to 4,000,000 on 5 September — to save money that
was never being charged — on the strength of `poke()` estimating 1,936,405 on a live window.
`poke()` is not the worst path. A callback that buys cover has since used between 2,391,400
and 9,064,459 gas, so at 4,000,000 the engine bought nothing, and the limit is back at
10,000,000. A discard-path callback genuinely costs ~1.5M gas, because Somnia charges 200k per
new non-zero SSTORE and the engine writes state on every wake.

Applying it meant closing and reopening the subscription, and `openSubscription` requires the
engine to hold **32 STT** — a floor checked once at creation, never escrowed and never
consumed. On 2 September it held 12.77, so the subscription was closed deliberately to preserve that
against the floor rather than spend it on an hour nobody would watch.

**`topUp()` on the engine is `payable` and permissionless**, so anyone can fund it — no
permission of ours is involved. Reopening a closed subscription is not: `openSubscription()` is
owner-only, and a top-up alone never reopens one.

Narrowing the subscription instead is not available: `eventTopics` is a `bytes32[4]` so the
precompile does match beyond topic0, but `MarketCreated` indexes `marketId`, `market` and
`pool` — all per-market, all created fresh each window. None of them selects a series.

Because the live page reads a rolling ~1000-block tail (about 100 seconds), the whole run is
captured and committed as data: **6,748 events, 1–2 September**, in
[`docs/run-record.json`](docs/run-record.json). The page renders it when the live tail is
empty, labelled as the recorded run, and live wins whenever the engine is running.

## The latch sweep

After a real production failure — `pendingTickAt` was set by one path and cleared only by an
inbound callback, so one missed tick stalled the retry ladder **silently** for 62 windows —
every piece of state was swept with the same two questions:

> What clears this, and what happens if that thing never comes?

Three needed fixing. Two now have a timeout or a permissionless escape that works; the third's
escape turned out not to cover the case it was written for, as the note under the table says:

| State | Failure | Fix |
| --- | --- | --- |
| `pendingTickAt` | stalled the ladder forever | expires after `tickGraceSeconds`, emits `TickExpired` |
| `activeSubscriptionId` | the protocol drops subscriptions on its own; the flag kept reporting `subscribed = true` | permissionless `reconcileSubscription()` — **which does not clear it**; see below |
| `pendingList` | grew without limit; 218 dead entries | permissionless `prunePending(max)` |

**Correction, 2026-09-11.** `reconcileSubscription()` assumed the precompile would report a
removed subscription as belonging to someone else. It does not: `getSubscriptionInfo` on a removed
id **reverts**, and reconcile deliberately treats a failed read as "cannot tell" and keeps the
flag. So when Somnia removed subscription 16123715 on 2026-09-07 (`SubscriptionRemoved`, in the same
block as the last callback), the flag stayed set, `closeSubscription()` reverted with
`UnsubscribeFailed` — twice, on chain — and `openSubscription()` refuses while the flag is set.
That engine cannot be reopened by anyone, the owner included.
[Finding 7](docs/somnia-feedback.md) has the evidence.

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
forge test            # 173 tests
cd probes && forge test   # 23 Phase 0 probes against live testnet state (see note)
cd web && npm i && npm run dev
```

**Note on the probes.** 21 of 23 pass. Two — `test_ContractCanPlaceRestingBid` and
`test_ContractCanMintCompleteSet` — are pinned to a specific BTC 24 h market that expired at
2026-09-02 00:00 UTC, and now revert with `OrderAlreadyExpired()` and `TradingNotActive()`
respectively.
That is a time-pinned probe decaying, not a product regression: the same assertions passed
against that market while it was live, and the write path they exercise is the one the engine
still uses. They would need repointing at a live market to run green again.

**`via_ir = true` at `optimizer_runs = 200` is required, not optional.** The engine is 24,316
bytes against the EIP-170 limit of 24,576; the legacy pipeline produces 24,954 and will not
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
| [`tailwind-migration-estimate.md`](docs/tailwind-migration-estimate.md) | What migrating the styling to Tailwind would cost, measured |
| [`run-record.json`](docs/run-record.json) | The complete on-chain record of the engine's run |

## Licence

MIT.
