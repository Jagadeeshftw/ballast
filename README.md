# Ballast

**Parametric cover on dreamDEX Event Contracts, bought by the chain itself in the same block
a window opens.** No keeper, no cron, nothing of ours running.

Live on Somnia Shannon testnet · <https://ballast.0xo.in>

---

## What it is

A user holds spot exposure on dreamDEX. Each Event Contract window, Ballast buys the
offsetting Down contract out of collateral the user has deposited, sized to a make-whole
point they set. Somnia's on-chain reactivity precompile triggers it: when dreamDEX emits
`MarketCreated`, the engine's handler executes **as a synthetic transaction in the same
block**.

- trigger [`0x0434d364…`](https://shannon-explorer.somnia.network/tx/0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4)
- callback [`0x79bf978b…`](https://shannon-explorer.somnia.network/tx/0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1)

Both in block 476941284. Zero blocks of latency.

## It sells parametric cover, not a hedge

Event Contracts are **at-the-money binaries**: one strike per window, struck at the window's
opening price, paying a fixed 1 collateral unit per winning contract. There is no strike
ladder — 562 markets checked, at most one strike per venue per window. So **no quantity of
Down contracts produces a flat net line**, and the product does not claim one.

What it produces is a fixed payout on a trigger, with basis risk as the gap between payout
and realised loss — the same class as weather, crop and flight-delay cover. The dial moves
the **break-even**, not the kink. Full arithmetic in
[`docs/instrument-economics.md`](docs/instrument-economics.md).

## Deployed

| Contract | Address |
| --- | --- |
| `BallastVault` | [`0x9BC43B97c94E23634A561a02EFce641C9e89fe63`](https://shannon-explorer.somnia.network/address/0x9BC43B97c94E23634A561a02EFce641C9e89fe63) |
| `HedgeEngine` | [`0x9026b93dc240244A34B3568aF704a60f4703a115`](https://shannon-explorer.somnia.network/address/0x9026b93dc240244A34B3568aF704a60f4703a115) |
| `SpotExposureSource` | [`0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb`](https://shannon-explorer.somnia.network/address/0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb) |

Somnia Shannon testnet, chain 50312. Collateral is tUSDC (6 decimals).

## Thirty-second quickstart

```bash
git clone --recurse-submodules https://github.com/Jagadeeshftw/ballast
cd ballast && npm install
forge test                      # 164 tests, no network needed for most
cd web && npm install && npm run dev
```

> **Build with the committed profile.** `foundry.toml` sets `via_ir = true` with
> `optimizer_runs = 200`. This is not cosmetic: `HedgeEngine` compiles to 24,162 bytes under
> the IR pipeline and **24,902 under the legacy one — over the EIP-170 limit of 24,576.**
> Rebuilding with the default profile produces a different artifact that cannot be deployed.

## Design decisions that earned themselves

**The vault approves a *set* of engines.** A retired engine with zero balance and no
subscription
[settled its own cover](https://shannon-explorer.somnia.network/tx/0xdafa9556f7f474c089b57293c2db3a62b426560a54bdcbb8e4b518e1a489d4c9)
while the live one took new enrolments. Redeploys strand nothing.

**Skip reasons are first-class visible states, and `poke()` is permissionless.** Both paid
off on the same day: a retry-ladder latch deadlocked in production, an *empty section on the
front page* was the symptom that exposed it, and `poke()` kept the product working while the
automatic path was dead. That is also the honest answer to why a no-keeper product ships a
manual path — **reactive delivery is best-effort**, and we learned it on chain rather than
assuming otherwise. Every latch of that shape was then swept:
[`docs/latch-sweep.md`](docs/latch-sweep.md).

**Ballast never touches your dreamDEX account.** It trades in its own name and holds no
operator grant — verified in Phase 0 by trading Event Contracts from a contract with no
allow-list entry. dreamDEX's `OperatorPermissionsRegistry` would allow trading on a user's
behalf; Ballast deliberately does not use it. Consent is a `Policy` with two ceilings, an
expiry, and a one-transaction `revoke()` no operator can block.

**The interface never shows a number it cannot source.** A position that asked for 250 bps
and got 152 says 152, with the reason in words.

## Audit citations

Hacken SCA of dreamDEX spot, 20 May 2026, `somnia-chain/dream-dex-spot-audit` @ `9015ac4`.
Two findings shaped this design, both about the reactive-handler pattern:

- **F-2026-1647** (High, fixed) — unbounded loop in `onEvent` plus no-retry precompile
  semantics enables griefing. Hence `maxBatch`, a resumable cursor, and fair rotation.
- **F-2026-1656** (Medium, mitigated) — the precompile drains contract balance with no
  on-chain accounting. Hence the engine's own runway accounting and `subscriptionHealth()`.

## Docs

| | |
| --- | --- |
| [`phase0-findings.md`](docs/phase0-findings.md) | What was verified on chain before any contract was written, and five corrections to the original spec |
| [`instrument-economics.md`](docs/instrument-economics.md) | Why this is parametric cover, the sizing arithmetic, and the cost of rolling every window |
| [`onchain-lifecycle.md`](docs/onchain-lifecycle.md) | A full lifecycle with every transaction hash |
| [`latch-sweep.md`](docs/latch-sweep.md) | Every piece of state, asked what clears it and what happens if that never comes |
| [`go-live.md`](docs/go-live.md) | Deploy runbook: what to run, what it should return, what would be a bug |
| [`somnia-feedback.md`](docs/somnia-feedback.md) | Findings reported back to the Somnia team |

## Known limitations

- Binary markets exist for **BTC and ETH only**. SOMI spot has no corresponding binary and
  **cannot be covered**.
- A **voided** window (both sides redeem at 0.5) is tested but has never occurred on chain.
- Per-user gas metering is deliberately not built; callbacks are operator-subsidised.
- `vault.reservedOf` has no user-side escape. Currently unreachable, documented in the latch
  sweep rather than fixed, because closing it means redeploying a vault holding a live
  deposit.

## Licence

MIT.
