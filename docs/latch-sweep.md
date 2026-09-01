# Latch sweep

Prompted by a real production failure: `pendingTickAt` was set by one path and cleared only
by an inbound reactive callback. Phase 0 had recorded that reactive matches can be evicted
from a full queue or deferred indefinitely at low priority — and the code trusted them
anyway. One missed tick stalled the retry ladder permanently and **silently**: 62 windows
enqueued over twenty minutes, not one attempted, no event to say why.

This is every piece of state in the system, with the same two questions asked of each:

> **What clears this, and what happens if that thing never comes?**

Anything whose answer depended on an external arrival with no timeout and no permissionless
escape has been given one. Three needed fixing.

---

## HedgeEngine

| State | Cleared by | If that never comes | Verdict |
| --- | --- | --- | --- |
| `pendingTickAt` | a `Schedule` callback | **stalled the ladder forever** | 🔴 **FIXED** — expires after `tickGraceSeconds`, emits `TickExpired` |
| `activeSubscriptionId` | `closeSubscription()` (owner) | **the protocol removes subscriptions on its own** when the owner's balance cannot cover `gasLimit`; the flag stayed true and `subscriptionHealth().subscribed` lied | 🔴 **FIXED** — permissionless `reconcileSubscription()` |
| `pendingList` / `pendingOf` | a window being attempted | grew without limit; 218 dead entries accumulated | 🔴 **FIXED** — permissionless `prunePending(max)` |
| `cursor` | every `_processWindow` | it is an index, not a latch; `% total` bounds it and `_remove` re-anchors it when the set shrinks | ✅ no external dependency |
| `enrolled` / `_enrolledAt` | `withdrawEnrolment()` (user) or `kick()` | `kick()` is **permissionless** for anyone who no longer qualifies | ✅ has an escape |
| `coverOf[...].settled` | `settle()` | `settle()` is **permissionless**; if the market itself is stuck, `pokeOracle()` and `voidExpired()` are permissionless too | ✅ has an escape |
| in-flight reservation (`reserve` → `spendForCover`) | the same transaction | `_coverOne` does both in one call, and a failed placement reverts the whole thing through the batch's `try/catch`, rolling both back | ✅ atomic, cannot dangle |
| `lastCallbackAt` / `stale` | every callback | `stale` is a timeout, not a latch — it flips to true on its own after 24 h of silence | ✅ self-clearing |
| `coverWindowSeen` | never | deliberate: it is a permanent "we have already worked this window" record. Grows monotonically, which is inherent to the guarantee | ✅ intentional |
| `windowsEnqueued` / `callbackCount` | never | counters, and the runway ratio derives from them | ✅ intentional |

## BallastVault

| State | Cleared by | If that never comes | Verdict |
| --- | --- | --- | --- |
| `reservedOf[user]` | an approved engine calling `spendForCover` or `releaseReservation` | **Latent.** No user-side escape exists: if an engine reserved and then stopped, the user's collateral would be locked with no way out. **Currently unreachable** — the only caller pairs reserve with spend atomically in one transaction, and a revert rolls both back. Noted rather than fixed, because the fix is a reservation expiry in the vault and the vault holds a live user deposit; redeploying it would strand that. Written down so it is a decision rather than an oversight. | 🟡 **latent, documented** |
| `policyOf[user].active` | `revoke()` (user) | the user controls it entirely; no operator path can set, block, or delay it | ✅ user-owned |
| `isEngine[...]` | owner | approving is additive by design, so a redeploy strands nothing; revoking is deliberate | ✅ owner-owned |
| `collateralOf` / `totalCollateral` | deposit / withdraw / engine calls | withdrawal of unreserved collateral is unconditional | ✅ has an escape |
| `committedInWindow` | `releaseReservation` | per-window and per-user; a stale entry only ever *reduces* that user's headroom in a window that has already passed, and never blocks withdrawal | ✅ bounded impact |

## SpotExposureSource

| State | Cleared by | If that never comes | Verdict |
| --- | --- | --- | --- |
| `configOf[assetKey]` | owner | pure configuration; an unconfigured asset prices as zero, which makes the engine skip rather than guess | ✅ fail-closed |
| price reads | nothing — read live per call | a one-sided, crossed, or too-wide book returns `(0, false)` and the engine skips | ✅ stateless |

---

## The three fixes

**1. `tickGraceSeconds` — a parameter, not a constant.** A tick whose moment has passed by
more than the grace is presumed lost and replaced, emitting `TickExpired`. Repeated
occurrences mean the priority fee is too low for boundary contention, so the event is the
signal rather than a silent stall.

Thirty seconds was a magic number that interacted badly with window length — 30 s of grace
on top of a 15 s initial delay is most of a 60-second window and nothing at all in a
four-hour one. It is now settable via `setLadder(initialDelay, retryDelay, attempts, grace)`
alongside the delays it interacts with. Default 20 s.

**2. `reconcileSubscription()` — permissionless.** Reads the precompile and clears
`activeSubscriptionId` if the protocol no longer lists this contract as the owner. Guarded:
if the precompile cannot be read it leaves the flag alone rather than guessing. This one
mattered because `subscribed` is surfaced in the interface, and a flag that says "covered"
when nothing is covered is the R4 failure in its worst form.

**3. `prunePending(max)` — permissionless and bounded.** Drops queued windows the module
says are no longer `Trading`. Read-gated, so it can never remove a window still worth
covering. `poke()` already cleared one window at a time but needed its `marketId`; this
clears the dead ones in bulk without needing to know anything.

All three are covered by tests, including one that reproduces the exact production stall.

---

## What the sweep did not change

Two things looked like latches and are not, and it is worth recording why so nobody
"fixes" them later:

- **`coverWindowSeen` never clears.** That is the guarantee — a window is worked once. Its
  monotonic growth is the cost of not double-covering.
- **`stale` in `subscriptionHealth()` is a timeout, not a latch.** It becomes true on its
  own after 24 h of silence. Long, deliberately: shorter would flag a quiet period as a
  fault. It is a badge, not a control.

## The general lesson

The bug was not that a callback failed to arrive — Phase 0 said plainly that it might. The
bug was writing that down and then building a latch that assumed it would. **Reactive
delivery is best-effort, so any state gated on it needs a timeout, a permissionless escape,
or both.** That is now true of every such latch in this codebase.
