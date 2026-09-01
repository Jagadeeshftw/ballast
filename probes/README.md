# Phase 0 probes

Investigation artifacts for [`docs/phase0-findings.md`](../docs/phase0-findings.md).
These are **not** product code — no contract under `../src` exists yet, per build-spec §0.

Each test encodes a Phase 0 finding as an executable assertion against **live Somnia
testnet state**, so the report's `[VERIFIED]` claims can be re-run rather than trusted.

```bash
npm install          # @somnia-chain/reactivity-contracts@0.2.1
forge test -vv       # 13 tests
```

| File | Establishes |
| --- | --- |
| `test/Q1.t.sol` | **The kill question.** A contract obtains collateral, places a resting bid, crosses the touch for a real fill, and mints a complete set — no allow-list, no operator grant |
| `test/Q5.t.sol` | The 32 STT floor is enforced; the reactivity precompile has no bytecode and cannot run under a fork |
| `test/Q5Mock.t.sol` | The mock-precompile harness (`vm.etch` at `0x0100`) the build will rely on for `onEvent` tests |
| `src/Probe.sol` | Minimal contract standing in for `BallastVault` |
| `src/HandlerProbe.sol` | Minimal `SomniaEventHandler` standing in for `HedgeEngine` |

Q1 forks the chain, so those four tests need network access and take ~30s.
