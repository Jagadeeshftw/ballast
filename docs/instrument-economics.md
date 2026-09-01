# What Ballast actually sells

Companion to [`phase0-findings.md`](phase0-findings.md). This is the load-bearing document
for the README's economics section and for how `HedgeEngine` sizes an order. Everything
here was measured against live Somnia testnet books on 1 Sep 2026.

---

## 1. The strike finding

**One strike per venue per window. Always.**

Checked across every binary market the indexer has ever seen:

| Measure | Result |
| --- | --- |
| Binary markets examined | **562** |
| Max distinct strikes within one venue, for one (asset, interval, expiry) | **1** |
| Groups where a single venue offered more than one strike | **0** |
| Max distinct strikes across *all* venues for one (asset, interval, expiry) | 2 |
| Groups reaching even 2 | 2 of 560 |

Re-sampled live five times over ~4.5 minutes spanning several 60-second rollovers: identical
every time (`maxStrikesWithinOneVenue=1`).

Where 2 appear, they are two different venues quoting the same window, not a ladder:

- `0x679795a0…` — **542 markets, all strike 0**, question *"BTC closes at or above its
  opening price"*.
- `0x1a1e6821…` / `0x3e57c57b…` — 7 markets total with an explicit numeric strike, pinned
  to spot at creation. BTC strike `7898745` → $78,987 against live spot $79,113; ETH
  `247881` → $2,478.81 against $2,480.6.

**Both venue types are the same instrument: an at-the-money binary struck at the window's
opening price.** There is no ladder, there never has been one, and there is no
out-of-the-money strike to buy instead.

## 2. Therefore: parametric cover, not a hedge

A binary pays a fixed 1 collateral unit per winning contract. Because the strike is pinned
at the window's open, the kink in the payoff is pinned at a 0% move and **cannot be moved**.
No quantity of Down contracts produces a flat net line, and the product must never claim one.

What the user sets is *quantity*, which moves the **break-even**, not the kink.

This is parametric cover — a fixed payout on a trigger, with basis risk as the gap between
payout and realised loss. Same class as weather, crop and flight-delay cover.

### The payoff has three regions

With exposure `E`, an adverse move `x`, `N` Down contracts bought at price `q`:

```
net(x) = −E·x  −  N·q  +  N·1[close < open]
```

```
 net
  +  |  ****                     region 1: over-compensated
     |      ****                 (payout exceeds the loss)
   0 |──────────*──────────────  ← break-even = makeWholeBps
     |            ****           region 3: under-compensated
  −  |                ****       (loss outruns the fixed payout)
     +──────────────────────────
     0        x*         larger adverse move
```

Region 2 is the single point `x = x*`. **Never draw a flat net line anywhere.**

On an *up* move the cover pays nothing and the premium is lost: `net = spot gain − N·q`.

### Sizing

Set `net(x*) = 0`:

$$N = \frac{E \cdot x^*}{1 - q} \qquad\text{premium} = N \cdot q = \frac{E \cdot x^* \cdot q}{1 - q}$$

Validated against a live 24h ETH book (`DOWN` ask 0.354, E = $10,000, x* = 250bps):
`N = 387` contracts, premium `$137`, and net is exactly `$0` at −2.5%, `+$150` at −1%,
`−$250` at −5%. Confirmed numerically.

## 3. Ties go against the cover holder — confirmed

Every market settles on **"closes at or above its opening price"**. The predicate is `>=`.

| Question template | Count |
| --- | --- |
| `BTC closes at or above its opening price` | 286 |
| `ETH closes at or above its opening price` | 269 |
| `… will X's price be at or above N at unix time N?` | 7 |

Unanimous across all 562 markets: **a flat close resolves Up, and the cover pays nothing.**

Settlement encoding, read from 50 finalized markets:

- `winningOutcome = 0` → `payoutNumerators = [10000000, 0]` → **Up (YES) wins**
- `winningOutcome = 1` → `payoutNumerators = [0, 10000000]` → **Down (NO) wins**
- Winner-take-all; `payoutDenominator = 10000000`. No partial payouts observed.

The empirical split was 28 Up / 22 Down (56% Up, n = 50) — directionally consistent with
ties resolving Up, but **n is far too small to be evidence**; the wording is the evidence.

> **Build requirement.** A zero move must be handled explicitly and resolve to *no payout*,
> never left to fall through a `<` / `<=` comparison. It is the one case where the
> difference is total.

## 4. Hazard: the premium diverges as `q → 1`

`N = E·x*/(1−q)` has a pole at `q = 1`, and the premium goes with it. **This is not
theoretical — it is happening on testnet right now.** Live `DOWN` asks observed in a single
snapshot of the 16 markets in `Trading`:

| Interval | DOWN bid / ask | Premium for a 250 bps make-whole point |
| --- | --- | --- |
| 60 s | 0.968 / **0.995** | **497% of exposure** |
| 3600 s | 0.954 / **0.975** | **98% of exposure** |
| 3600 s | 0.937 / 0.958 | 57% of exposure |
| 900 s | 0.329 / 0.357 | 1.39% of exposure |
| 14400 s | 0.144 / 0.168 | 0.50% of exposure |
| 86400 s | 0.316 / 0.344 | 1.31% of exposure |

At `q = 0.995` you pay 0.995 to receive 1 — almost no leverage — so making whole on a 2.5%
move demands enormous size. `maxPremiumBpsPerWindow` is what stops this, and it must:

1. `BallastVault.bindingLimit()` returns the achievable premium **and which limit binds**.
2. When `binding != None`, the achieved make-whole point is **worse** than
   `policy.makeWholeBps`. The engine must compute the achieved figure from what it actually
   bought, mark the position **degraded**, and emit requested-vs-achieved.
3. The UI shows the **achieved** number. Showing the dial's number here violates rule R4.

## 5. Hazard: at-the-money cover is expensive, and frequency multiplies it

Because the strike is the window's open, the book is at-the-money and there is no cheaper
out-of-the-money strike available. You are forced to pay for the very likely small moves.

Premium is roughly fair in expectation (`q` is the market's probability of Down), so the
*structural* cost is the spread, paid every roll. Observed spreads are wide — **2.2% to
15.4% of mid** on testnet.

Rolling a 250 bps make-whole point every window, using the live books above:

| Interval | Windows/day | Spread cost / day | Spread cost / year |
| --- | --- | --- | --- |
| 60 s | 1440 | 939% – 9720% | astronomically ruinous |
| 900 s | 96 | ~5% | ~1900% |
| 3600 s | 24 | 15% – 25% | 5500% – 9200% |
| **14400 s (4 h)** | 6 | **0.2% – 0.3%** | **79% – 110%** |
| **86400 s (24 h)** | 1 | **~0.1%** | **19% – 21%** |

**Default to the 4 h and 24 h windows.** 60 s is unusable. The 1 h row is bad in this
snapshot only because `q` happened to sit near 0.975 on those two markets — the window
length is fine, the price was not, which is exactly why the premium ceiling is a per-window
check rather than a configuration constant.

> Testnet books are thin and erratic; treat the absolute figures as illustrative of
> *structure*, not as a mainnet forecast. The structure — premium ∝ `x*/(1−q)`, multiplied
> by windows per day, with the spread as the real drag — is what transfers.

**UI requirement:** show cumulative premium paid against protection actually used,
prominently. A trading-literate judge will do this arithmetic; better that we did it first.

## 6. Failure mode: an unpriceable window

Four of the sixteen live markets (all the 300 s ones) had a **one-sided or empty `DOWN`
book** — no ask to buy cover at, at any price.

This is not an error, it is a normal state of a thin venue, and it maps directly onto spec
§4's *"Event Contract order rejected (size, liquidity, window locked)"*. Required behaviour:
skip the window, release the reservation in full, mark the position **uncovered** (never
optimistically covered — rule R1), and say so on screen.

## 7. Where each finding landed in the contracts

| Finding | Where it lands |
| --- | --- |
| Parametric cover, not a hedge | `isCoverable`, `Binding`, "cover" vocabulary throughout both contracts |
| Dial is a break-even, not a kink | `Policy.makeWholeBps` |
| Premium diverges as `q → 1` | `Policy.maxPremiumBpsPerWindow` enforced at `reserve`, plus `HedgeEngine.maxCoverPriceBps` refusing a book above 0.90 outright |
| Engine must know what binds | `bindingLimit()` → `(limit, Binding)` |
| Requested vs achieved (R4) | `CoverOpened(..., requestedBps, achievedBps, degraded)` |
| Ties pay nothing | Documented on both contracts; the settlement path must treat a zero move explicitly |
| Unpriceable window | `SkipReason.NoLiquidity` — a first-class state with its own event, not an error |
| Cumulative premium | `premiumPaidBy(user)` and `premiumPaidTotal` |

### On `degraded`

`degraded` is defined as **`desiredPremium > limit`** — a ceiling actually bound the
purchase — and deliberately *not* as `achievedBps < requestedBps`.

Integer flooring onto the venue's lot grid costs a fraction of a basis point, so the
naive definition marked **every healthy position** as one bp short of its dial. A badge
that appears on everything carries no information. `achievedBps` is separately rounded to
nearest for display, so an unbound purchase reports exactly its dial.

## 8. Demo cadence

The economics say default to 4 h and 24 h, but a 4 h window cannot show open → lock →
resolve → redeem inside a three-minute video. Resolved deliberately:

- **Engine supports every interval.** No hard-coded window length.
- **UI defaults to 4 h.**
- **The demo runs a 60 s window on camera, with the per-window premium meter visible.**
  The ruinous number appearing live is a better argument for why `makeWholeBps` and
  `maxPremiumBpsPerWindow` exist than any paragraph would be. Then cut to a completed 4 h
  cycle from history as the configuration a real user would run.

The video must not imply 60 s is the intended cadence — say so on screen.

## 9. Gas: callbacks are operator-subsidised

There is deliberately **no per-user gas metering**. One callback serves many positions and
the base cost is shared; attributing it per user means metering `gasleft()` deltas per
iteration and then defending how the shared overhead was split — a number nobody can
defend, scoring under no judging criterion.

Instead: the engine holds the native balance and owns the subscription, `topUp()` is
permissionless so anyone can extend runway, and `subscriptionHealth()` reports runway in
**windows remaining** rather than raw wei. Metered per-user gas is named as future work in
the README.

Two consequences of free callbacks, both handled:

1. **Griefing.** A cursor slot must cost real capital, so enrolment requires an active
   policy plus `minEnrolmentCollateral` of free balance, re-checked cheaply on every visit
   before anything expensive runs, with a permissionless `kick()`. Nothing is locked — a
   user can always withdraw, which simply makes their slot kickable.
2. **Priority starvation.** Every user's window rolls at the same boundary, which is
   exactly when contention peaks. `priorityFeePerGas` defaults non-zero, a zero value is
   rejected outright, and it feeds the runway calculation rather than sitting as a
   constant.

## 10. Settlement: four branches, three of which strand funds if missed

Resolution is a payout **vector** — `winningOutcome()` was removed in the payout-vector
refactor, and the winning index is the argmax of `payoutNumerators()` gated on
`isResolved()`. Ballast reads that vector and **never compares prices**, which is what
makes the zero-move case correct by construction rather than by care.

| Branch | Condition | Behaviour | Stranding risk if missed |
| --- | --- | --- | --- |
| **Won** | `payoutNumerators[1] > 0` | Redeem, credit proceeds to the user | — |
| **Lost** | resolved, `payoutNumerators[1] == 0` | **Redemption succeeds and pays zero.** Marked settled, nothing credited | Treating zero as a failure marks healthy settlements as errors |
| **Voided** | `isVoided()` | Position redeems at **0.5**, credited normally | Silently strands the position |
| **Unsettled** | neither | `NotSettleable` — use a backstop | Position waits forever |

**A flat close is `Lost`, not `Won`.** The venue predicate is `>=`, so a flat close
satisfies it, Up wins, and the Down entry of the vector is zero. There is no `<` or `<=`
anywhere in Ballast for that case to fall through, and `test_FlatCloseResolvesUpAndCover
PaysNothing` asserts it directly.

Ballast only ever holds **Down** positions — it never mints a complete set — so a voided
window is one redemption, not two.

### Backstops are exposed, permissionlessly

Nothing about Ballast requires the operator to be alive:

| Function | Who may call | When |
| --- | --- | --- |
| `settle(user, marketId)` | **anyone** | once resolved or voided |
| `settleMany(users, marketId)` | **anyone** | best-effort; one bad entry never blocks the rest |
| `pokeOracle(marketId)` | **anyone** | an answer is posted but the market has not resolved |
| `voidExpired(marketId)` | **anyone** | from `voidableAt(marketId)` = `expiry + settlementWindow` |

`finalizeMarket` is called best-effort inside `settle` and wrapped in `try/catch`, so a
market that resolved without finalising still redeems.

## 11. Demo pairing and a known limitation

Binary markets exist for **BTC and ETH only**. Testnet spot pools are SOMI, WBTC and WETH
against USDso. So:

- **WETH** spot ↔ **ETH** window ✅
- **WBTC** spot ↔ **BTC** window ✅
- **SOMI** spot ↔ *nothing* ❌ — SOMI has no corresponding binary and **cannot be covered
  at all.** This belongs in the README as a stated limitation rather than left for a judge
  to discover.
