# Ballast — build spec

Auto-hedging vault for dreamDEX Event Contracts on Somnia.
Target: Somnia × dreamDEX Event Contracts Hackathon, submission by 9 Sept 2026.

Author: Jagadeesh B. Solo build. Agent-assisted.

---

## 0. Read this first

**Phase 0 is investigation only. Do not write contract code until the Phase 0 report is
written and I have read it.** Several load-bearing facts in this spec are unverified and
marked `[UNVERIFIED]`. If Phase 0 contradicts something here, the finding wins and you say
so plainly rather than routing around it.

**Git rule:** every commit carries my name only. No co-author trailers, no "generated with"
lines, in commits or PR descriptions.

**Naming:** working name Ballast. Alternatives if it collides: Counterweight, Keelson,
Offset. Check npm and GitHub before committing to it.

---

## 1. What we are building

A user holds a spot position on dreamDEX. Each Event Contract window, Ballast automatically
buys the offsetting Down contract, sized to their exposure, so their net position stays flat
through the window. No keeper bot, no backend cron: the trigger is Somnia's on-chain
Reactivity precompile.

The pitch in one line: **Event Contracts are not only a speculation product, they are a
hedging instrument, and Ballast is the thing that makes that usable.**

Why this and not a prediction game: the hackathon's stated goal is to bring new users and
use cases into the ecosystem. A hedging vault brings in a user class who would otherwise
never touch a prediction market, and it produces steady per-window flow rather than a burst.

### Judging criteria we are optimising against

Published criteria, in their order:

1. How effectively the project uses Event Contracts and the available APIs/SDKs
2. How strong and functional the technical implementation is
3. How intuitive and accessible the product is
4. Whether it provides a compelling overall user experience

Note what is *absent*: there is no innovation line item. Two of the four are usability. Budget
effort accordingly — a working, legible product beats a clever one. They also say explicitly
that they want production-ready applications rather than simple proofs-of-concept.

---

## 2. Phase 0 — investigation, before any code

Produce `docs/phase0-findings.md`. One section per question, each with the answer, the source
(URL, contract address, file path, or "asked in Telegram, answered by <handle>"), and a
confidence marker. End with a go / no-go / pivot recommendation.

Sources in priority order: on-chain reads against Somnia testnet (chain ID 50312, RPC
`https://dream-rpc.somnia.network/`, explorer `https://testnet.somniascan.io`), then
`docs.somnia.network`, then the hackathon Telegram group linked from the DoraHacks page. Do
not guess an ABI from a blog post.

**Q1 — Are Event Contracts callable from a contract? [KILL QUESTION]**
Find the deployed Event Contract addresses on testnet and their ABI. Determine whether a
smart contract can open a position, or whether positions can only be opened by a signed
off-chain API call from an EOA.
*Kill criterion:* if only an EOA via signed API can trade, the on-chain vault is dead. Report
immediately and stop. Fallback in §9.

**Q2 — Window mechanics.**
Window durations offered. The exact lifecycle timestamps (open, lock, expiry, settle) and
whether each transition emits an on-chain event we can filter on. Collateral token. Payout
unit. Minimum and maximum position size. Tick size.

**Q3 — Event surface for Reactivity.**
The full list of events the Event Contract system emits, with topic0 hashes. We need at
minimum a window-rollover trigger and a price trigger. Confirm whether `MarkPriceUpdated`
from the relevant `SpotPool` is the right price feed, and whether the post-audit smoothed
midpoint is what it now emits.

**Q4 — Order placement on behalf of a user.**
On the spot side, `placeOrderFor` is gated by an owner-managed allow-list
(`isApprovedContractToPlaceOrders`). Determine whether the Event Contract side has the
equivalent gate. If it does, determine whether the hackathon organisers will whitelist a
hackathon contract, and how long that takes. Assume **no** until told yes in writing. See §3.1
— the architecture is built to not need it.

**Q5 — Reactivity economics on testnet.**
Minimum subscription funding (docs say 32 STT minimum for on-chain subscriptions — confirm
for testnet). How gas for the callback is deducted and from whom. Maximum gas available in a
single `onEvent` callback. Observed callback latency after the triggering event. Whether a
reverting or out-of-gas callback is retried (the audit implies **no retry** — confirm, because
the whole failure model depends on it).

**Q6 — SDKs and endpoints.**
Is there a published dreamDEX npm package, testnet REST base URL, WebSocket URL, MCP server
endpoint? `@somnia-chain/reactivity` and `@somnia-chain/reactivity-contracts` — confirm both
install cleanly and note versions. Criterion 1 is literally "uses the available APIs/SDKs", so
every one we can legitimately use is a point.

**Q7 — Faucet.**
How much testnet STT per request, per day, per address. We need enough for subscription
funding plus a demo with several positions. If the faucet caps below the subscription
minimum, that is a schedule risk — raise it on day one, not day six.

**Q8 — Field check.**
Look at what has already been submitted to this hackathon on DoraHacks. If someone has already
shipped a hedging vault, tell me before we build the second one.

---

## 3. Architecture

Three contracts, one reactive handler among them. Solidity, Foundry, Somnia testnet.

```
                    ┌──────────────────────────────────┐
   user deposits →  │  BallastVault                    │
   collateral       │  custody + per-user accounting   │
                    │  Policy = consent (2 ceilings)   │
                    │  approves a SET of engines       │
                    │  makes NO external venue calls   │
                    └──────────┬───────────────────────┘
                               │ reserve / spendForCover / creditProceeds
                               ▼
                    ┌──────────────────────────────────┐
                    │  HedgeEngine (SomniaEventHandler)│
                    │  _onEvent ← precompile 0x0100    │
                    │  TRADER OF RECORD                │
                    │  bounded batch + resumable cursor│
                    │  try/catch per position          │
                    │  owns native runway + subscription│
                    └──────────┬───────────────────────┘
                               │ places / redeems in its own name
                               ▼
                    ┌──────────────────────────────────┐
                    │  dreamDEX Event Contracts        │
                    │  (BinaryMarketsModule + pools)   │
                    └──────────────────────────────────┘

                    ┌──────────────────────────────────┐
                    │  IExposureSource (measured)      │
                    └──────────────────────────────────┘
                               ▲ exposureOf(user, marketId)
```

**Revised from the original three-contract sketch.** The engine, not the vault, is the
trader of record: dreamDEX pools pull collateral from the order owner, so whoever places
the order must hold the tokens — and putting external calls into a venue inside the
custody contract is the wrong attack surface. The vault stays a custody-and-consent
contract that never calls out to a venue. It approves a *set* of engines so a redeployed
engine can take new enrolments while the old one settles what it already opened.


### 3.1 The constraint that shapes everything

From the Hacken audit of dream-dex-spot: `placeOrderFor` lets any address on the
`isApprovedContractToPlaceOrders` allow-list place orders on behalf of arbitrary users,
consuming their vault balance **without per-order user consent**. The allow-list is populated
by the pool owner. The audit raised the absent-consent issue and the team accepted it as a
known risk.

Two consequences.

**One: we cannot assume we get whitelisted.** So Ballast does not act on behalf of users at
all. Users deposit collateral into `BallastVault`, and the vault is the trader of record on
dreamDEX — it opens positions in its own name and keeps internal per-user accounting. This is
self-contained, needs no permission from anyone, and works on day one. If we later get
whitelisted, an on-behalf-of mode is an addition, not a rewrite.

**Two: turn their accepted risk into our feature.** Ballast requires explicit, revocable,
on-chain per-user consent before it will ever open a position for someone: a `Policy` the user
signs into, with a cap, an expiry, and a one-transaction `revoke()` that is honoured
immediately and cannot be blocked by the operator. Say this in the README next to the audit
citation. It is a two-sentence argument that we read their code, understood a real property of
it, and designed around it. That is the highest-value paragraph in the whole submission for
criterion 2, and it costs almost nothing to build.

### 3.2 BallastVault

State per user:

- `collateral` — internal balance, deposit and withdraw, `nonReentrant`
- `Policy { bool active; uint256 maxNotionalPerWindow; uint16 coverageBps; uint64 expiry; uint256 gasPrepaid; }`
- `coverageBps` is how much of measured exposure to hedge. 10000 = fully flat. Default to
  something under full (7500) so the product is legibly a *dial*, not a switch.
- open position handles per window

Rules:

- No policy, no action. Ever. `revoke()` is a single transaction and takes effect for the next
  window boundary with no operator involvement.
- Never spend more than `maxNotionalPerWindow` in a window, and never more than free
  collateral, whichever binds first.
- Withdrawals of collateral not reserved against an open hedge are always available. A user
  must never be locked in by our automation.

### 3.3 HedgeEngine — the reactive handler

Inherits `SomniaEventHandler` from `@somnia-chain/reactivity-contracts`, overrides `_onEvent`.
The chain's validators invoke it via the precompile at `0x0100`. The reference implementation
to study is dreamDEX's own `SpotStopOrderRegistry`, which subscribes to `MarkPriceUpdated` and
submits IOC orders from `onEvent` — mirror its shape, including its fixes.

Hard requirements, each of which comes from a real audit finding on that exact contract:

1. **`msg.sender == 0x0100` and gate on `activeSubscriptionId`.** The audit found the
   registry's `onEvent` did not gate on the active subscription ID (fixed, Low). Do both from
   the start.
2. **Bounded work per callback.** The audit's top High finding was an unbounded loop in
   `onEvent` combined with no-retry precompile semantics, which let an attacker grief stop-order
   execution by stuffing the queue. So: a `maxBatch` cap, a persistent cursor that resumes where
   the last callback stopped, and fair rotation so the same users are not always served last.
   Never iterate an unbounded user set.
3. **`try/catch` around every individual position.** One user's failing hedge must not block
   the rest of the batch. Record the failure, emit it, move on.
4. **Never revert the whole callback.** If there is no retry, a revert loses the window for
   everyone in it.
5. **Our own SOMI/STT accounting.** The audit found the precompile drains the contract's
   balance with no on-chain accounting (Medium, mitigated). So Ballast tracks prepaid gas per
   user itself, refunds on cancellation, consumes on trigger, and exposes a
   `subscriptionHealth()` view. The UI shows a real warning when the balance approaches the
   subscription minimum, because below it every hedge silently stops firing.
6. **Do not size a hedge off an instantaneous midpoint.** The audit found unsmoothed midpoint
   enabled manipulation sandwiches (Medium, fixed). Use the post-fix smoothed mark, and add our
   own sanity band: if the observed price moves more than N bps between reads, skip the window
   and emit `HedgeSkipped(reason)` rather than hedging into a manipulated print.

### 3.4 Exposure measurement

The honest hard part. Options in order of preference:

1. Read the user's dreamDEX vault balance / open position directly on-chain. Preferred: no
   trust, no oracle.
2. If (1) is not readable, the user declares their exposure in the Policy and Ballast hedges
   the declared amount. Weaker, but honest, and the UI must then say "declared" not "measured".

Do not blur these. If we end up on (2), the interface says so on the face of it.

---

## 4. Failure modes to handle explicitly

Each of these should have a test and a visible UI state. A judge who tries to break it and
finds it already handled is the judge who scores criterion 2 highest.

- Subscription unfunded or removed → all hedges inert. Detected, surfaced, not silent.
- Callback gas exhausted mid-batch → cursor resumes next window, nobody permanently starved.
- Event Contract order rejected (size, liquidity, window locked) → recorded per user, position
  marked unhedged, collateral released.
- User revokes mid-window → open hedge runs to settlement, no new hedge opens. State legible.
- Insufficient collateral → hedge sized down to what is affordable, or skipped, and the user is
  told which.
- Window settles while our handler is mid-batch → settlement is idempotent, no double-claim.
- Precompile stops delivering entirely → `lastCallbackAt` goes stale, UI shows a stale badge
  rather than a confident "covered".

---

## 5. Interface

One screen. The product is the screen.

### Signature element

A single continuous line across the top of the app: **net exposure**. The spot position moves.
The hedge moves opposite. The net line stays flat. That line is the whole thesis and it is the
first thing on the page, live, before any explanatory copy. Everything else on the page is
quiet so that line carries the design.

### Non-negotiable interface rules

- **R1.** Never render a position as "covered" unless the offsetting contract is confirmed on
  chain. Pending is its own visual state, not an optimistic green.
- **R2.** The coverage dial and the window countdown are always on screen. A user must never
  have to hunt for how much longer they are protected.
- **R3.** Revoke is always reachable in one action from anywhere in the app.
- **R4.** Never show a number we cannot source. Unknown renders as unknown, not as zero.

### Direction

Instrument panel, not trading terminal. The reference feeling is a ship's inclinometer: one
needle, one datum line, calm until it isn't.

- Ground `#EDF0F1` pale steel, ink `#101A22`, muted `#6B7A85`, covered `#1F6F6B` deep teal,
  exposed `#A83B2A` brick, stale `#8A8F94` grey.
- One type family, quiet, with tabular figures. The large exposure numbers are the display
  type — do not add a second decorative face on top of them.
- The two accent colours are reserved for exactly one job each: covered and exposed. Nothing
  else in the UI may use them.
- Motion only where it shows a state change: the moment a hedge confirms, and the window
  rollover. No scroll-triggered entrances, no hover lifts on cards.

Avoid, because they read as generated: cream-and-terracotta, all-caps eyebrow labels above
every heading, identical rounded cards for everything, arrows appended to button text.

Server-render the read-only view so it works with no wallet connected — a judge who never
connects still sees a live, populated product. This mattered on Vickrey and it will matter here.

---

## 6. Tests

- Unit: policy lifecycle, cap enforcement, coverage sizing arithmetic at boundary values,
  collateral reservation and release.
- `onEvent`: unauthorised caller rejected; wrong subscription ID rejected; batch cap honoured;
  cursor resumes correctly across three consecutive partial batches; one failing position does
  not abort the batch; callback never reverts.
- Negative: revoked user never receives a hedge; expired policy never receives a hedge;
  over-cap request is clamped not reverted.
- Integration on testnet: full window, real Event Contract, real Reactivity callback, hedge
  opened and settled without any process of ours running.

Zero warnings. Zero skipped tests. If something cannot be tested, the README says which and why.

---

## 7. Submission checklist

- Public GitHub repo, MIT, README that opens with what it is and a 30-second quickstart
- Deployed on Somnia testnet, addresses in the README and in the UI footer
- Live URL, working without a wallet
- Demo video, ≤3 minutes, structured as: the problem in 20 seconds → open a spot position →
  watch price move against it → hedge fires automatically → net line stays flat → revoke →
  30 seconds on the architecture with the Reactivity callback on screen
- `docs/phase0-findings.md` committed — it demonstrates we read the actual system
- A short section citing the Hacken audit and what we did differently about consent
- Submit on 8 Sept, not on the 9th

---

## 8. Schedule

Vickrey's freeze is 7 Sept and it takes priority. This plan assumes Somnia gets days 1–4 and
day 8, and that days 5–7 are Vickrey's.

| Day | Date | Work |
|---|---|---|
| 1 | Tue 2 Sep | Phase 0 only. No code. Report by end of day. Telegram questions asked in the morning so answers land the same day. |
| 2 | Wed 3 Sep | Contracts against mocks. Vault, policy, engine skeleton. Tests green. |
| 3 | Thu 4 Sep | Deploy to testnet, real subscription, real Event Contract integration, first live hedge. |
| 4 | Fri 5 Sep | Frontend. Read-only view first, then connected. |
| 5–7 | Sat–Mon | Vickrey. Ballast frozen except README. |
| 8 | Tue 8 Sep | Video, README, deploy verification, submit. |

If Phase 0 comes back negative on Q1, we lose day 1 and pivot the same evening. That is the
correct trade — losing one day is much cheaper than discovering it on day 4.

---

## 9. Fallback

If Q1 kills the on-chain vault, the pivot is the read-side product: a calibration terminal
scoring the Event Contract book as a probability surface (market-implied probability against
realised outcomes, Brier scores per window length, drift in the final seconds before expiry).
Reuses the same data plumbing and the same design language. Weaker on criterion 1, safe on
everything else. Decide the same day, do not hybridise.

---

## 10. Open questions for me, not for you to decide

1. Do we hedge measured or declared exposure, if measured turns out not to be readable?
2. Default coverage ratio: full flat, or a dial starting under 100%?
3. Do we spend a day on the sealed-policy idea (commitments hiding a user's coverage and
   trigger from front-runners) if days 5–7 free up, or leave it in the README as future work?