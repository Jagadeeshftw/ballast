# Phase 0 — dashboard

Investigation for the Ballast landing page and dashboard. Same rules as the first Phase 0:
nothing here is taken from documentation where it could be executed instead.

- **Date:** 2 Sep 2026
- **Chain under test:** Somnia Shannon testnet, chain ID 50312
- **RPC:** `https://dream-rpc.somnia.network/`
- **Reproducible evidence:** [`probes/test/Q1Dashboard.t.sol`](../probes/test/Q1Dashboard.t.sol) —
  10 tests, all passing, run against live testnet state
- **SDK read:** `@somnia-chain/markets-sdk` **0.29.0** (the first Phase 0 used 0.28.1)

Confidence markers: **[VERIFIED]** = executed against the chain. **[DOCUMENTED]** = stated in
official docs, not independently executed. **[UNRESOLVED]** = could not establish.

**Recommendation up front: GO on all five.** Q1 passes by two independent routes. But Q1's
*preferred* route is not the one the plan assumed, and the assumed function does not exist.
Three corrections below.

---

## Q1 — Can a visitor acquire spot exposure from inside our app? **[KILL QUESTION → GO]**

**Yes, by two routes, neither of which needs an allow-list or an operator grant.**
**[VERIFIED]**

Every assertion below is about a **fresh externally owned account** — a judge with a browser
wallet and nothing in it. The first Phase 0 proved a *contract* can trade; that proved nothing
about a visitor, which is why this was worth asking.

### Correction 1 — `placeTakerOrderWithoutVault` does not exist

It is in no ABI in markets-sdk 0.29.0. The spot pool's entire write surface is three
functions:

```
placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity,
           uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption,
           address builder, uint96 builderFeeBpsTimes1k) payable
cancelOrder(uint128 orderId)
amendOrder(tuple) -> uint128
```

Identical in shape to the perp pool's `placeOrder` and a sibling of the binary pool's
`placeBinaryOrder`. A market buy is a marketable limit at the touch with `orderType = 1`
(`FILL_OR_KILL`), which is what the probe does. **[VERIFIED]**

There is no vault-mode variant to reach for because vault mode is not an argument — it is
per-user state, `setManualVaultMode(bool)`, defaulting to **off**, meaning fills are auto-pulled
from and delivered to the wallet. And it does not matter to us either way: `SpotExposureSource`
already reads `balanceOf(user) + pool.getWithdrawableBalance(user, token)`, so it measures the
holding under either mode. **[VERIFIED]**

### Route A — mint the asset directly (recommended)

WETH, WBTC and USDso are all the same mintable test-token template, and `mint(address,uint256)`
is **unpermissioned**. There is no `owner()`, no `MINTER_ROLE()`, no gate. A fresh EOA minted
2 WETH to itself. **[VERIFIED]**

One transaction, no approvals, no book interaction.

### Route B — buy WETH against USDso on the spot pool

Also works, exactly as the plan hoped. A fresh EOA minted USDso, approved the pool, crossed
the touch `FILL_OR_KILL`, and **really received WETH**. **[VERIFIED]**

`getAutoPullRequirement(owner, isBid, price, quantity, fee)` returns the input token and the
amount to approve, so the approval step needs no guesswork: it returned `USDso` and
`136.24e18` for a `0.0563 WETH` lift.

### The measurement works end to end

The real prize, and the thing that makes this a GO: after minting 1 WETH, the **live deployed**
`SpotExposureSource` measured the fresh EOA at **2,419.67 tUSDC** against a live ETH market.
Before the mint it read 0. **[VERIFIED]**

That is the same contract the engine calls. Nothing is mocked and nothing is declared.

### Route B has a self-defeating failure mode — prefer Route A

**A visitor who buys too much spot destroys the measurement that decides their cover.**
**[VERIFIED]**

`SpotExposureSource` prices off the touch and refuses to price a one-sided book. The visible
ask side of WETH/USDso is thin — **0.3939 WETH, about $955, across five levels**:

| ask | quantity | value |
| --- | --- | --- |
| 2421.11 | 0.0563 | $136.31 |
| 2422.06 | 0.0675 | $163.49 |
| 2423.23 | 0.0788 | $190.95 |
| 2424.44 | 0.0900 | $218.20 |
| 2425.68 | 0.1013 | $245.72 |

A visitor who sweeps it ends up holding 0.3942 WETH while `exposureOf` returns **0**, because
there are no asks left to price against — so Ballast would skip their window and report no
exposure. The probe asserts this happens.

Configured band is `maxSpreadBps = 200` and the live spread is ~2 bps, so the band is not the
binding constraint; **book exhaustion** is. A single-level lift is safe, a sweep is not.

**Design consequence.** The dashboard's "get exposure" step should mint (Route A) and, if it
offers the spot buy at all, must cap the size to one level and say why. Route B is worth
keeping as the honest demonstration that Ballast covers a real dreamDEX spot position, but it
is the wrong default.

**Go / no-go: GO.** Step 3 of the dashboard stays. It does not become a link to dreamDEX.

---

## Q2 — tUSDC self-mint from a browser wallet **[GO]**

**Yes, directly, repeatably, from an EOA.** **[VERIFIED]**

`faucet(uint256)` on `0x70a86D…5d8E`, capped at 10,000 per call — and the cap is per call, not
per address or per day. Two consecutive calls credited 20,000 tUSDC. A visitor is never stuck
for collateral.

Only tUSDC carries `faucet(uint256)`. USDso, WETH and WBTC do not; they carry unpermissioned
`mint(address,uint256)` instead. Different function, same effect. **[VERIFIED]**

Cost: **79,707 gas** for an address that already exists; **1,379,707 gas** for a brand-new one,
because Somnia charges the new-account surcharge and enforces its 1,000,000-gas-remaining rule.
At the observed 6 gwei that is **0.00048 STT** and **0.0083 STT** respectively.

**A visitor with zero STT can do nothing at all.** `eth_estimateGas` succeeds from a zero
balance — estimation does not check funds — so the failure surfaces only at the signature
prompt. That is precisely the anticlimax Q3 exists to prevent.

---

## Q3 — STT for visitors **[GO — and the plan's premise was wrong]**

### Correction 2 — the Telegram bot is not the only source

There are **four public faucets** in the official documentation, none of which require Telegram
**[DOCUMENTED]**:

| Route | URL |
| --- | --- |
| Official Somnia faucet | https://testnet.somnia.network/ |
| Google Cloud Web3 faucet | https://cloud.google.com/application/web3/faucet/somnia/shannon |
| Stakely | https://stakely.io/faucet/somnia-testnet-stt |
| Thirdweb | https://thirdweb.com/somnia-shannon-testnet |

Plus Discord `#dev-chat` and `developers@somnia.foundation` for larger asks.

The official faucet is reported to dispense **0.5 STT** per claim. **[DOCUMENTED]** Per-claim
amounts and cooldowns are not stated in the docs for any of the four and I did not sign in to
measure them — **[UNRESOLVED]**. The Google Cloud route requires a Google sign-in; its balance
requirements are behind that wall.

0.5 STT is ample. The entire visitor write path below costs **under 0.02 STT**, so one claim
covers a judge more than twenty times over.

**Design consequence.** The dashboard detects a zero STT balance *before* anything can fail and
links the faucet directly, rather than sending the visitor to a Telegram bot. This is strictly
better than what the plan assumed was possible.

---

## Q4 — Wallet stack **[GO]**

**viem already ships the chain. No custom definition is needed.** **[VERIFIED]**

`viem/chains` exports `somniaTestnet`, and its config is correct against the live network:

| Field | viem value | Verified |
| --- | --- | --- |
| id | 50312 | `eth_chainId` → `0xc488` ✓ |
| nativeCurrency | STT, 18dp | ✓ |
| explorer | `https://shannon-explorer.somnia.network` | matches what the site already links ✓ |
| default RPC | `https://api.infra.testnet.somnia.network` | live, returns `0xc488` ✓ |

Both that RPC and the `dream-rpc` one we already use are live and agree on chain ID. **[VERIFIED]**

### The multicall trap

viem's config points multicall3 at **`0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223`**, which is
deployed (5,561 bytes) and answers `getBlockNumber()`. The *canonical* multicall3 address
`0xcA11bde0…CA11` that most tooling hardcodes has **no code on this chain**. **[VERIFIED]**

Take the address from the chain object; never hardcode the canonical one, or every batched read
fails at once.

Wallets do not carry Somnia Shannon by default — the docs tell users to add it manually — so
the connect flow needs `wallet_addEthereumChain`, which viem exposes as
`walletClient.addChain({ chain: somniaTestnet })`, with `switchChain` on wrong-network.
**[DOCUMENTED]**

`wagmi` is not yet a dependency; the app currently runs on viem alone for reads.

---

## Q5 — Write path gas **[GO, with one real hazard]**

Measured two ways, because they disagree and the disagreement is the finding. Fork numbers use
the standard EVM schedule; live `eth_estimateGas` applies Somnia's rules.

| Operation | Fork gas | Live Somnia gas | Cost at 6 gwei |
| --- | --- | --- | --- |
| `approve` | 25,184 | — | — |
| `faucet` (existing account) | — | 79,707 | 0.00048 STT |
| `faucet` (brand-new account) | — | **1,379,707** | 0.0083 STT |
| `deposit` | 48,343 | **1,149,275** | 0.0069 STT |
| `setPolicy` | 49,233 | 119,403 | 0.00072 STT |
| `enrol` | 61,666 | — (already enrolled) | — |
| `revoke` | 2,073 | 56,163 | 0.00034 STT |
| `withdraw` | 10,626 | 135,660 | 0.00081 STT |

### Correction 3 — nothing is expensive in STT; the hazard is the gas *number*

`deposit` costs **24× more on Somnia than on a fork** — 1,149,275 against 48,343 — because of
the 200k-per-new-non-zero-SSTORE charge and the 1,000,000-gas-remaining requirement. In STT
that is still only 0.0069, so no copy needs to warn anyone about cost.

The hazard is different and worth stating plainly: **a wallet that estimates conservatively, or
any code path that caps gas below ~1.2M, will fail on a first deposit** — and it will fail at
the signature prompt, which is the worst place. The same applies to a visitor's very first
transaction of any kind, at 1.38M.

The live figure for `deposit` is measured against an account that **already holds collateral**,
so its slot is warm. A true first-time deposit writes an additional new slot and can only be
higher. Treat 1,149,275 as a floor. **[VERIFIED for warm, inferred for cold]**

**Design consequence.** Set explicit gas limits on every write rather than trusting wallet
estimation, and give them headroom above these numbers.

### Revert reasons are decodable

Every failure path is a typed custom error with arguments, so the guardrail "state the actual
revert reason" is achievable without string parsing. Estimating a withdraw of 1 tUSDC against a
balance of 115 wei returned `0x4aeb0dcb` + `(1000000, 115)` — that is
`InsufficientFreeBalance(requested, available)`, and both numbers are renderable directly.
`enrol()` on an enrolled account returned `AlreadyEnrolled()`. **[VERIFIED]**

Full selector table for `BallastVault`:

| Selector | Error |
| --- | --- |
| `0xd92e233d` | `ZeroAddress()` |
| `0x1f2a2005` | `ZeroAmount()` |
| `0x27da1990` | `NotEngine()` |
| `0x4aeb0dcb` | `InsufficientFreeBalance(uint256,uint256)` |
| `0x9e69636f` | `InsufficientReservation(uint256,uint256)` |
| `0xc22bd0dd` | `NoActivePolicy()` |
| `0x3423db65` | `PolicyExpired(uint64,uint256)` |
| `0x875e095d` | `MakeWholeOutOfRange(uint16,uint16)` |
| `0x91489852` | `PremiumCapOutOfRange(uint16,uint16)` |
| `0x3be04dc0` | `PolicyDurationTooShort(uint64,uint256)` |
| `0x1bdf6d63` | `NotionalCapExceeded(uint256,uint256,uint256)` |
| `0x62c31b16` | `PremiumCapExceeded(uint256,uint256,uint256)` |

---

## What this changes in the plan

1. **Dashboard step 3 survives** and is not cut. Q1 is a GO.
2. **It mints rather than trades.** Route A is one transaction, no approval, and cannot damage
   the book. Route B stays available as the honest "cover a real dreamDEX position"
   demonstration, capped to one book level with the reason shown.
3. **The zero-STT screen links a real faucet**, not a Telegram bot.
4. **Writes carry explicit gas limits.** A first deposit needs ~1.2M and a first transaction
   ~1.4M; wallet estimation is not to be trusted with that.
5. **Take multicall3 from viem's chain object.** The canonical address is not deployed here.

## Still open

- Per-claim amounts and cooldowns for the four STT faucets. **[UNRESOLVED]** — does not block,
  because the dashboard links rather than integrates them.
- Cold-path `deposit` gas on Somnia. Measured warm at 1,149,275; the cold figure is higher by
  an unmeasured amount. Mitigated by setting a generous explicit limit.
- `wagmi` is not yet installed; Q4 confirms the chain and RPC, not the connector UX.
