# Go-live checklist

Run this top to bottom the moment testnet STT lands. Every step says what to run, what it
should return, and what would be a bug. Nothing here is exploratory — the whole sequence has
already been rehearsed against live testnet state in `test/Deploy.t.sol` (9 tests).

**Time budget once funded: ~20 minutes to a live reactive callback.**

---

## 0a. Foundry WILL under-estimate gas and your first deploy WILL fail

**Always pass `--gas-estimate-multiplier 3000`.** Somnia charges **3,125 gas per byte of
deployed bytecode** against Ethereum's 200, plus 400,000 per new account, 200,000 per new
storage slot, and a 1,000,000 gas *remaining* requirement at each. Foundry simulates with
Ethereum rules even against a fork, so it broadcast 2,017,173 gas for a vault needing
34,289,290 — a 17x shortfall that dies as a bare out-of-gas with `gasUsed == gasLimit`.

```bash
forge script ... --broadcast --gas-estimate-multiplier 3000
```

The node's own `eth_estimateGas` is correct; only the client-side estimate is wrong. Unused
gas is not charged, so over-estimating costs nothing. The block gas limit is 15 billion.

`cast send` is fine with an explicit `--gas-limit` (use 8,000,000 for ordinary calls,
2,000,000 for a plain transfer).

**`forge script` cannot broadcast `openSubscription()` at all** — its local simulation has no
precompile at `0x0100` and reverts before broadcasting. Use `cast send` for that one call.

## 0. The one mistake that costs an hour

> **The 32 STT floor is on the ENGINE CONTRACT, not the deployer EOA.**

Funding your own wallet and calling `openSubscription()` does nothing for the engine's
balance and fails deep inside precompile `0x0100` with no readable reason. The order is:

```
deploy vault -> deploy engine -> deploy source -> wire -> FUND THE ENGINE -> subscribe
```

`OpenSubscription` asserts the engine's balance first and fails with a plain-English
message instead. Overfunding is safe (`sweepNative` recovers it), so ask generously.

---

## 1. Prerequisites

```bash
export SOMNIA_RPC=https://dream-rpc.somnia.network/
export PRIVATE_KEY=0x...          # deployer; also the owner unless OWNER is set
export OWNER=0x...                # optional, defaults to the deployer
```

| Check | Command | Expect | Bug if |
| --- | --- | --- | --- |
| Chain is right | `cast chain-id --rpc-url $SOMNIA_RPC` | `50312` | anything else — wrong RPC |
| Deployer has gas | `cast balance $(cast wallet address --private-key $PRIVATE_KEY) --rpc-url $SOMNIA_RPC` | `> 0.05 ether` | zero — deploy will revert immediately |
| Tests green | `forge test` | **140 passed, 0 failed** | any failure — do not deploy |
| No warnings | `forge build --force` | no `warning`/`note` lines | any — fix before deploying |

---

## 2. Preflight (read-only, costs nothing)

```bash
forge script script/Deploy.s.sol:Preflight --rpc-url $SOMNIA_RPC
```

Expected:

```
chain id            : 50312
BinaryMarketsModule : 0x3ecC694Cef705358864a646142ac17A90E29e388
  code size         : 130
tUSDC               : 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E   (6 dp)
WETH (testnet)      : 0x4d8E02BBfCf205828A8352Af4376b165E123D7b0   (18 dp)
WBTC (testnet)      : 0x4e85DC48a70DA1298489d5B6FC2492767d98f384   (8 dp)
USDso (testnet)     : 0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171   (18 dp)
precompile 0x0100 code size (expect 0): 0
```

**Bugs:**

- `code size: 0` on the module → wrong chain, or the module moved. Stop.
- WBTC decimals ≠ 8 → the venue changed scale; every BTC position will misprice. Stop.
- precompile code size ≠ 0 → you are not on Somnia.

> The token addresses above were read off the live pools' `getPoolParams()`, **not** copied
> from the Somnia docs. The docs' token table is *mainnet*; using it on testnet silently
> prices every position at zero.

---

## 3. Deploy

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $SOMNIA_RPC --broadcast
```

Expected: three addresses and `wiring : done`. **Record all three.**

```bash
export VAULT=0x...
export ENGINE=0x...
export SOURCE=0x...
```

**Bug if** `wiring : SKIPPED` — you set `OWNER` to something other than the deployer, so
the five wiring calls must be made from the owner key before step 5.

### Verify the wiring before spending STT

| Check | Command | Expect |
| --- | --- | --- |
| Vault approves engine | `cast call $VAULT "isEngine(address)(bool)" $ENGINE --rpc-url $SOMNIA_RPC` | `true` |
| Engine knows the source | `cast call $ENGINE "exposureSource()(address)" --rpc-url $SOMNIA_RPC` | `$SOURCE` |
| Module is the real one | `cast call $ENGINE "BINARY_MODULE()(address)" --rpc-url $SOMNIA_RPC` | `0x3ecC694...` |
| Collateral scale | `cast call $VAULT "COLLATERAL_DECIMALS()(uint8)" --rpc-url $SOMNIA_RPC` | `6` |
| Priority fee non-zero | `cast call $ENGINE "priorityFeePerGas()(uint64)" --rpc-url $SOMNIA_RPC` | `1000000000` |
| ETH prices | `cast call $SOURCE "priceOf(bytes32)(uint256,bool)" $(cast call $SOURCE "assetKeyFor(string)(bytes32)" "ETH" --rpc-url $SOMNIA_RPC) --rpc-url $SOMNIA_RPC` | a price near live ETH, `true` |

**Bug if** `priceOf` returns `(0, false)` — the spot book is one-sided or wider than the
200 bps band. Re-check in a minute; if it persists, the pool address is wrong.

---

## 4. Fund the engine

```bash
cast send $ENGINE --value 40ether --private-key $PRIVATE_KEY --rpc-url $SOMNIA_RPC
cast balance $ENGINE --rpc-url $SOMNIA_RPC
```

Expect `40000000000000000000`. **Minimum 32; 40 recommended.** At the live 6 gwei basefee
plus our 1 gwei priority fee, one callback costs `10,000,000 × 7 gwei = 0.07 STT`, so:

| Funding | Windows of runway |
| --- | --- |
| 32 STT (bare floor) | ~457 |
| **40 STT (recommended)** | **~571** |

Anyone can top up later — `topUp()` is permissionless — and the owner can `sweepNative`
the excess back.

---

## 5. Open the subscription

```bash
forge script script/Deploy.s.sol:OpenSubscription --rpc-url $SOMNIA_RPC --broadcast
```

Expected:

```
engine balance: 40000000000000000000
required floor: 32000000000000000000
subscription  : <non-zero id>
windows left  : ~571
subscribed    : true
```

**Bugs:**

| Message | Meaning | Fix |
| --- | --- | --- |
| `ENGINE UNDERFUNDED...` | step 4 was skipped or sent to the wrong address | send STT **to `$ENGINE`** |
| `exposure source not set` | wiring incomplete | run the owner wiring calls |
| `subscription already open` | already done | nothing to do |
| revert with no reason | you are not on Somnia, or the precompile rejected the filter | check chain id |

Confirm independently:

```bash
cast rpc somnia_reactivityGetSubscriptions $ENGINE --rpc-url $SOMNIA_RPC
```

Expect one entry with `handler_contract_address == $ENGINE` and `event_topics[0] ==
0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd` (`MarketCreated`).

---

## 6. Prove the reactive leg fires — the critical claim

**This is the one thing that cannot be rehearsed locally** (Phase 0, Q5: the precompile is
node-native and absent under forge). It is also the demo's central claim, so verify it
before anything else.

dreamDEX rolls 60-second windows continuously, so a callback should arrive within ~60s of
subscribing. Watch:

```bash
# before
cast call $ENGINE "callbackCount()(uint256)" --rpc-url $SOMNIA_RPC
sleep 90
# after
cast call $ENGINE "callbackCount()(uint256)" --rpc-url $SOMNIA_RPC
cast call $ENGINE "lastCallbackAt()(uint64)" --rpc-url $SOMNIA_RPC
```

**Expect `callbackCount` to increase.** That alone proves the reactive leg works end to
end on chain — no keeper, no cron, nothing of ours running.

Then confirm the asset decoding landed:

```bash
cast logs --from-block latest-500 --address $ENGINE --rpc-url $SOMNIA_RPC
```

Expect `CallbackRan(marketId, scanned, covered, cursorAfter)`.

**Bugs:**

| Symptom | Likely cause |
| --- | --- |
| `callbackCount` stays 0 | subscription not open, or engine balance fell below one callback's cost |
| `callbackCount` rises, `assetKeyOf` is 0 | the `MarketCreated` layout changed — the decoder refuses rather than guessing, which is correct; re-check the event ABI |
| `CallbackRan` with `scanned == 0` | nobody enrolled yet — expected before step 7 |

---

## 7. End-to-end user flow

```bash
# collateral mints on demand, capped at 10,000 per call, credited to msg.sender
cast send $TUSDC "faucet(uint256)" 10000000000 --private-key $PRIVATE_KEY --rpc-url $SOMNIA_RPC
cast send $TUSDC "approve(address,uint256)" $VAULT 10000000000 --private-key $PRIVATE_KEY --rpc-url $SOMNIA_RPC
cast send $VAULT "deposit(uint256)" 1000000000 --private-key $PRIVATE_KEY --rpc-url $SOMNIA_RPC

# consent: make whole at 250bps, premium ceiling 100bps of exposure, 500 tUSDC/window cap
cast send $VAULT "setPolicy(uint16,uint16,uint256,uint64)" 250 100 500000000 \
  $(( $(date +%s) + 86400 )) --private-key $PRIVATE_KEY --rpc-url $SOMNIA_RPC

cast send $ENGINE "enrol()" --private-key $PRIVATE_KEY --rpc-url $SOMNIA_RPC
```

You also need spot exposure for cover to be bought — hold testnet WETH, or the engine will
correctly skip you with `NoExposure`.

Then wait one window and check:

```bash
cast call $ENGINE "coversOpened()(uint256)" --rpc-url $SOMNIA_RPC
cast call $ENGINE "premiumPaidTotal()(uint256)" --rpc-url $SOMNIA_RPC
```

**A `CoverSkipped` event is a healthy outcome, not a failure.** Read the reason:

| Reason | Meaning |
| --- | --- |
| `NoExposure` | no measured spot position — hold some WETH |
| `NoLiquidity` | the Down book is one-sided; normal on a thin venue |
| `CoverTooExpensive` | Down priced above 0.90; refusing is correct |
| `NoHeadroom` | a ceiling is already committed this window |
| `BelowMinimumLot` | affordable size rounds to zero on the lot grid |

---

## 8. Settlement

After a window expires:

```bash
cast call $ENGINE "outcomeOf(bytes32)(uint8)" $MARKET_ID --rpc-url $SOMNIA_RPC
# 0 Unsettled | 1 Won | 2 Lost | 3 Voided
cast send $ENGINE "settle(address,bytes32)" $USER $MARKET_ID --private-key $PRIVATE_KEY --rpc-url $SOMNIA_RPC
```

**`Lost` paying zero is a success, not a bug** — the venue predicate is `>=`, so a flat or
up close resolves Up and the cover correctly pays nothing.

If a window is stuck:

```bash
cast send $ENGINE "pokeOracle(bytes32)" $MARKET_ID ...     # an answer is posted but unapplied
cast call $ENGINE "voidableAt(bytes32)(uint64)" $MARKET_ID # expiry + settlementWindow
cast send $ENGINE "voidExpired(bytes32)" $MARKET_ID ...    # after that instant
```

Both are permissionless — anyone, including a judge, can unstick a market.

### Reading a failed batch

`settleMany` emits `SettleFailed(user, marketId, kind, selector)` per failure. The **kind**
is what separates a systemic break from unlucky individuals:

| Pattern | Diagnosis |
| --- | --- |
| Mixed `NoCover` / `AlreadySettled` | individuals; nothing wrong |
| Every entry `NotSettleable` | the window has not resolved yet; wait or poke |
| **Every entry `External`, same selector** | **systemic** — most likely the ERC-6909 operator grant is missing. Re-run `approveModuleForOutcomes` |

---

## 9. Record for the README

```bash
echo "VAULT=$VAULT  ENGINE=$ENGINE  SOURCE=$SOURCE"
cast call $ENGINE "activeSubscriptionId()(uint256)" --rpc-url $SOMNIA_RPC
```

Put all three addresses plus the subscription id in the README and the UI footer, with
explorer links to `https://shannon-explorer.somnia.network`
(**not** `testnet.somniascan.io`, which does not resolve — Phase 0, Correction 3).

---

## Rollback

Nothing here is irreversible:

| Situation | Action |
| --- | --- |
| Wrong config | `closeSubscription()`, fix, `openSubscription()` again |
| Bad engine | approve a new engine on the vault; the old one keeps settling its open cover |
| Recover runway | `sweepNative(to, amount)` |
| User wants out | `revoke()` then `withdraw()` — always available, no operator involvement |

Users are never trapped: withdrawal of unreserved collateral is unconditional, and
`revoke()` takes effect immediately with no operator in the loop.
