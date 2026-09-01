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

- trigger `0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4`
- callback `0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1`

Worth advertising. It is a genuinely different capability from anything a keeper can do, and
"same block" is a much stronger claim than a latency figure in milliseconds.
