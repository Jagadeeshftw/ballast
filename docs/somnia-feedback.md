# Feedback for the Somnia / dreamDEX team

Drafted for the hackathon Telegram group. Everything below was hit while building on Shannon
testnet (chain 50312) on 1 Sep 2026, with the transaction that demonstrates it.

---

## 1. Foundry silently under-estimates gas and every first deploy will fail

**This will hit every Foundry user on the chain, and the failure mode gives no clue.**

`forge script ... --broadcast` estimates gas with Ethereum's rules even when simulating
against a Somnia fork, because the simulation runs in Foundry's local EVM. Somnia's real
costs are far higher, so the transaction is broadcast with a limit that cannot possibly
succeed and dies as a plain out-of-gas with `gasUsed == gasLimit`.

Concretely, deploying a 6,659-byte contract:

| | gas |
| --- | --- |
| Foundry's estimate (Ethereum rules) | **2,017,173** |
| Somnia node's own `eth_estimateGas` | **34,289,290** |
| Actually required (bytecode alone, 6,659 × 3,125) | 20,809,375 |

A **17× shortfall**. Failed deploy:
`0xfae94729ea0eb910c96a54866ca66fe2ee1814455f9c1a46f0fd3117a3b04e2b`

The dominant term is documented but easy to miss —
[Somnia Gas Differences To Ethereum](https://docs.somnia.network/developer/deployment-and-production/somnia-gas-differences-to-ethereum.md)
says **3,125 gas per byte of deployed bytecode vs Ethereum's 200**. For a 17.9 KB contract
that is 56M gas for the bytecode alone. There is also 400,000 per new account, 200,000 per
new non-zero storage slot, and a **1,000,000 gas *remaining*** requirement (not charged) at
each of those points — so a limit that looks generous can still fail partway through.

**The node is right; only the client-side estimate is wrong.** The block gas limit is 15
billion, so capacity was never the constraint.

**Workaround** (works, but everyone will have to rediscover it):

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast \
  --gas-estimate-multiplier 3000     # 30x; the default 130 is nowhere near
```

**Suggested fixes, in order of usefulness:**

1. A line in the Foundry / "Deploy with Foundry" docs page saying the default multiplier is
   unusable on Somnia and giving the flag. One sentence would save everyone this.
2. Better: have `forge script` prefer the node's `eth_estimateGas` over local simulation.
   Worth raising upstream with Foundry, since this affects any chain with custom gas
   semantics.
3. Cross-link the gas-differences page from the Foundry and Hardhat deployment guides. It is
   currently filed under "Deployment and Production", which is not where anyone looks while
   their first deploy is failing.

---

## 2. The testnet explorer URL in circulation does not resolve

`https://testnet.somniascan.io` — used in hackathon materials — **fails to connect**
(not a 404; DNS/connection failure). `somniascan.io` itself resolves but is the mainnet
property.

The working testnet explorer is **`https://shannon-explorer.somnia.network`**
(Blockscout v10.2.6, API at `/api/v2/…`).

---

## 3. The documented token table is mainnet-only, and using it on testnet fails silently

[Smart Contracts](https://docs.somnia.network/developer/smart-contracts.md) lists WETH, WBTC,
USDC etc. without saying they are **mainnet** addresses. On testnet those addresses have no
code, so anything reading a balance from them returns **zero rather than reverting** — a
silent wrong answer, which is the worst kind.

The real testnet addresses, read from the live pools' `getPoolParams()` rather than any doc:

| Token | Testnet address | Decimals |
| --- | --- | --- |
| WETH | `0x4d8E02BBfCf205828A8352Af4376b165E123D7b0` | 18 |
| WBTC | `0x4e85DC48a70DA1298489d5B6FC2492767d98f384` | **8** |
| USDso | `0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171` | 18 |
| tUSDC (Event Contract collateral) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | 6 |

Note **WBTC is 8 decimals**, not 18. Combined with tUSDC at 6 and USDso at 18, a hardcoded
scale anywhere misprices without reverting.

**Suggested fix:** label the existing table "Mainnet" and add a testnet one. Also worth
documenting `getPoolParams()` on SpotPool — it returns `(base, quote, …, tickSize,
minQuantity, lotSize)` and is the only on-chain way to discover a pool's tokens, but it is
not in the dreamDEX contract reference or the markets SDK.

---

## 4. The STT faucet is undiscoverable from the docs

The docs point to `https://testnet.somnia.network/`, which is now a "Somnia Testnet Hub"
landing page with **no claim form** — only *Add network*, *Explorer*, and *Join Discord*.
The only per-request figure documented anywhere is the Google Cloud faucet's **1 STT/day**,
which is unusable when on-chain reactivity requires the subscription owner to hold **32 STT**.

The actual route is a **bot command in the hackathon Telegram group** (`/faucet <address>`,
50 STT, 24h cooldown) — which works well, but is invisible to anyone reading the docs. I
spent time preparing to escalate for a grant that was never needed.

**Suggested fix:** put the Telegram faucet route on the Network Info page, next to the 32 STT
reactivity requirement. It would also help to state plainly that the 32 STT is a **balance
check at subscription creation only** — not escrowed, not locked, not consumed. That reads
as a much smaller ask once it is clear.

---

## 5. Retracted: reactive callbacks are billed at gas used, not at the limit

**An earlier version of this finding said the opposite. It was wrong — never true, rather than
true once and since changed — and this correction is kept where the claim was.**

We reported that a reactive callback is charged against the subscription's `gasLimit` whatever
it uses: 0.07 STT a wake at 10,000,000 × 7 gwei, a 6.7× overpay. Checked charge by charge:

| | |
| --- | --- |
| Charged blocks matched to their callback receipts | **255**, on six engines, 1–11 Sep 2026 |
| Settings covered | limits of 10,000,000 and 4,000,000; priority fees of 1 and 2 gwei |
| Charges equal to `gasUsed × effectiveGasPrice` | **255**, to the wei |
| Charges equal to `gasLimit × effectiveGasPrice` | **0** |
| The 1–2 September run, whole: 2,715 callbacks over 12.75 h | **27.23 STT** burned (40 → 12.77, no top-ups); the limit model says 190.05 |

The 0.07 was our own engine's `costPerCallback`, which computes `callbackGasLimit ×
(basefee + priority)` as a worst-case bound. We read that bound as the bill. The receipts
showing 1,479,630 – 1,497,350 gas used were real; the charge we paired with them was not.

Nothing is needed from Somnia here: billing at usage is what we asked for, and it is what the
chain does. If this finding reached you in its earlier form, please disregard it.

What stands from the original: `openSubscription` requires the owner to hold **32 STT**
(`SUBSCRIPTION_OWNER_MINIMUM_BALANCE`, checked at creation, never escrowed or consumed), and a
`gasLimit` cannot be amended on a live subscription — changing it means closing and reopening,
which needs that 32 STT again. On a faucet paying 0.5 a day, that floor is the real cost of
changing your mind about a subscription.

### 5a. `eth_estimateGas` runs ~4× over actual, which compounds the above

Settling 42 positions, estimated then executed:

| | gas |
| --- | --- |
| `eth_estimateGas` per call | 2,053,708 – 2,796,559 |
| Actually used | **597,706 – 797,706** |
| Ratio | **~3.5–4.2× over** |

We assume this is headroom for the 1,000,000-gas-remaining rule at new-account and new-SSTORE
points. It is safe — a limit set from the estimate always succeeds — but it means the estimate
is a **ceiling, not a forecast**, and anyone sizing a budget from it will over-provision
fourfold. Worth a line in the gas documentation, because the natural reading of an estimate is
that it approximates the cost.

An earlier version said this compounded with finding 5 to about twenty-five times the cost. It
does not: billing is at usage, so a limit set generously from an estimate costs nothing extra —
it only has to be high enough.

### 5b. Retracted: billing is not flat per wake

This section argued that every wake cost the same 0.07 STT whether it registered a window or
scanned the book, and called that the part we would most like changed. It followed from
finding 5 and falls with it. Charges vary with the work — single callbacks in seven sampled
minutes on 1 September cost between 0.0033 and 0.0101 STT — and the 2,715 wakes of the
1–2 September run cost 27.23 STT in total, not the ~190 STT stated here before.

## 6. dreamDEX's `MarketCreated` is unreachable in practice: nested inside a reactive callback, and emitted by an unverified contract

Not a bug — a discoverability trap that will catch anyone integrating against
`BinaryMarketsModule`.

dreamDEX **creates its markets from inside a reactive callback of its own**. Every
`MarketCreated` we have looked at is emitted within a transaction whose top-level call is
`onEvent` (selector `0x53edf33d`) on `0xeE3AFf92812A2cb7bf801B500687BC97B55CaB34`, carrying
41–44 logs across ~15 contracts. We checked the exemplar plus three further recent ones; all
have that shape. There appears to be no top-level market-creation transaction on this venue
at all.

The consequence for an integrator: you subscribe to `MarketCreated`, your handler fires
correctly, and then you open the triggering transaction in the explorer to show someone —
and the summary page shows a reactive callback on a contract you have never heard of, plus a
couple of collateral transfers. Nothing on that page says a market was created. The evidence
is real but it is in the **Logs** tab, and in our case at **log index 75** of that
transaction, which also emits a second `MarketCreated` for a different market.

| | |
| --- | --- |
| Emitter to subscribe to | `BinaryMarketsModule` `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| `MarketCreated` topic0 | `0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd` |
| Transaction you will land on | `onEvent` on `0xeE3AFf92…`, ~44 logs |
| Where the event actually is | Logs tab; log 75 in our exemplar |
| Is the emitter verified? | **No** — `is_verified: false` on shannon-explorer |

### 6a. The second obstacle: the log cannot be read once you find it

Reaching the Logs tab is only half the problem. `BinaryMarketsModule` is **unverified** on
`shannon-explorer.somnia.network` — the explorer's own API reports `is_verified: false` for
`0x3ecC694C…` — so the log that carries the proof renders with **no event name and no decoded
parameters**: raw topics and roughly twenty lines of undifferentiated hex, under a banner
reading *"To see accurate decoded input data, the contract must be verified."*

So an integrator hits two obstacles in a row. The transaction summary shows `onEvent` on a
contract they have never heard of, and the log that actually matters cannot be read without
computing the topic hash themselves and decoding the data by hand. We did both — resolved the
signature through a public signature database, recomputed the keccak to confirm it, and
matched it against our own `SubscriptionOpened` record — and it is a lot of work to establish
that a market was created.

The practical consequence is worth stating plainly: **this evidence cannot be shown to anyone.**
We had intended to point at that log in a submission video and had to abandon it, because a
screen of undecoded hex demonstrates nothing to a viewer. The strongest interoperability claim
on this chain — a handler running in the same block as the event that triggered it — is
currently unpresentable on the venue's side of the pair.

Either fix resolves it: **verify `BinaryMarketsModule` on the explorer**, or **publish the
`MarketCreated` ABI** so explorers and integrators can decode the topic. Verification is the
better one, since it fixes every event on the contract at once and for everybody.

---

## 7. A subscription whose owner runs dry is removed without notice — the removal cannot be detected on chain, and cleaning it up burns the whole gas limit

When our engine's balance could no longer cover a wake, Somnia **removed its subscription**:
`SubscriptionRemoved(16123715, 0x9026b93d…)` at 2026-09-07 15:15:00 UTC, block 482209278, in a
transaction attributed to the owner and sent to `0x0100` — the same block as the last callback.
The owner contract is not called or told. Everything below was checked on chain.

| | |
| --- | --- |
| The removal | `SubscriptionRemoved`: topic0 matches `keccak256("SubscriptionRemoved(uint256,address)")`, and the owner topic is the engine |
| Reading a removed id | `getSubscriptionInfo(16123715)` **reverts** — no empty record, no zero owner. A live id (17918951) reads normally through the same `eth_call`, so this is not the precompile being unreadable |
| Unsubscribing a removed id | reverts, and **consumes 63/64 of the transaction's gas limit**: 1,477,024 of 1,500,000, then 7,875,461 of 8,000,000. Raising the limit 5.3× changed nothing but the bill |
| Topping up | +150 STT over three days, and no delivery. Expected once it is removed — but nothing says it was removed |

**Why it matters.** A contract cannot tell "my subscription was removed" from "the precompile
could not be read", because both arrive as a revert. Ours was written to be careful about exactly
that ambiguity — `reconcileSubscription()` keeps its flag when the read fails rather than
guessing — and that care is what latched it. The flag still names the removed id,
`closeSubscription()` cannot unsubscribe something that no longer exists, and
`openSubscription()` refuses while the flag is set. That engine cannot be reopened by anyone,
the owner included; only a redeploy gets back. The latch is our design, and we say so. But no
design can recover from a state it has no way to detect.

**Asks.** Return an empty record, or a zero owner, from `getSubscriptionInfo` for a removed id —
or expose an existence check. Make `unsubscribe` of an unknown id fail cheaply instead of
consuming all the gas forwarded to it. And document that a live subscription is **deleted, not
paused,** when its owner cannot cover a wake, and at what balance: the 32 STT figure in the docs is
a creation-time check, and nothing says what happens to a running subscription below it.

---

## Smaller notes

- `eth_getLogs` is capped at **1000 blocks** per query. At 100 ms blocks that is ~100
  seconds of history, which is a real constraint for any UI reading recent events. Worth
  stating in the JSON-RPC docs.
- The reactivity precompile at `0x0100` is node-native and has **no bytecode**, so
  `subscribe()` cannot execute under a Foundry fork or anvil. The markets SDK already knows
  this (`isLocalPrecompileUnavailable`, `precompileAvailable`), but the reactivity docs do
  not mention it, and it determines how anyone can structure their tests. A note in
  [On-chain Reactivity](https://docs.somnia.network/developer/reactivity/reactivity-onchain.md)
  would save people the discovery.
- `isGuaranteed` / `isCoalesced` are described as functional in the
  `ISomniaReactivityPrecompile` interface comments but documented as **reserved — pass
  false** in the reference. The interface comments should match.

---

## One thing that worked better than documented

Event-triggered reactivity fires in the **same block** as the log that triggers it. Our
handler's `CallbackRan` and the `MarketCreated` that caused it land in block 476941284
together, as separate transactions:

- trigger `0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4` — dreamDEX's
  own reactive callback, with `MarketCreated` for market `0x…010253` at log 75 (see finding 6)
- callback `0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1` — our
  handler, whose `CallbackRan` names that same market

Which makes the exemplar two reactive systems chained inside a single block, one of them
ours. Worth advertising. It is a genuinely different capability from anything a keeper can do, and
"same block" is a much stronger claim than a latency figure in milliseconds.
