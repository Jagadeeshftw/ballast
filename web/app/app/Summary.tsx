"use client";

import { useWallet } from "./wallet";
import { useLive } from "./live";
import Num from "./Num";

/**
 * The first thing on Overview: what you hold, what you have to spend, and whether it is
 * protected right now. Three figures, one status. Everything below elaborates on these.
 *
 * Ownership is explicit. Disconnected, every figure is an em dash and the status says so --
 * no number that could be mistaken for the reader's. The server renders that state, which is
 * the true one for a reader without a wallet.
 */
export default function Summary() {
  const { settled, sErr, hasProvider, account, chainOk, s, connect, connecting } = useWallet();
  const { mounted, current, trackOf, phase, canSchedule, vaultEmpty } = useLive();
  const pending = (hasProvider && !settled) || (settled && !!account && chainOk && !s && !sErr);
  const connected = settled && !!account && chainOk;

  const weth = s ? Number(s.weth) / 1e18 : null;
  const ethUsd = s && s.priceable ? (Number(s.weth) / 1e18) * (Number(s.ethPrice) / 1e18) : null;
  const free = s ? Number(s.free) / 1e6 : null;
  const policy = s?.policy;
  const hasPolicy = !!policy?.[0] && Number(policy[3]) * 1000 > Date.now();
  const t = trackOf(current);

  /* Ordered facts before gates before idle timing before per-window narrative, so a
     structural blocker (the engine cannot schedule at all; this wallet's vault is empty)
     can never be masked by a neutral "Watching"/"Evaluating" reading -- which is exactly what
     was happening: a wallet with zero free tUSDC showed "Watching, waiting for the next
     window" for nine consecutive windows, true of the clock and false of the reason nothing
     was bought. `t.opened` and `phase === "gaveUp"` are facts about what already happened
     this window and always come first; `canSchedule`/`vaultEmpty` are true or false whether
     or not a window happens to be open right now, so they are checked before the "no current
     window" idle state, not folded into it. */
  let status: { tone: "" | "up" | "down" | "dim"; text: string; sub: string };
  if (!connected) status = { tone: "dim", text: "Not connected", sub: "connect a wallet to see your own figures" };
  else if (!hasPolicy) status = { tone: "dim", text: "Not protected", sub: "no active policy — set a load line" };
  else if (!s!.enrolled) status = { tone: "dim", text: "Not protected", sub: "policy set, not yet enrolled" };
  else if (!weth) status = { tone: "dim", text: "Nothing to protect", sub: "this wallet holds no WETH" };
  else if (t.opened) status = { tone: "up", text: "Protected this window", sub: `made whole at ${(t.opened.achievedBps / 100).toFixed(2)}% of a fall` };
  else if (phase === "declined" || phase === "gaveUp") status = { tone: "down", text: "Not protected this window", sub: "declined — the reason is in the live window" };
  else if (canSchedule === false) status = { tone: "down", text: "Not protected", sub: "the engine cannot schedule an attempt — below the 32 STT floor" };
  else if (vaultEmpty) status = { tone: "down", text: "Vault is empty", sub: "no free tUSDC — nothing will be bought until it is funded" };
  else if (!mounted || !current) status = { tone: "", text: "Watching", sub: "waiting for the next window" };
  else if (phase === "vaultLow") status = { tone: "down", text: "Vault low", sub: "less than this window's ask would cost — the reason is in the live window" };
  else status = { tone: "", text: "Evaluating", sub: "Ballast is sizing cover for this window" };

  return (
    <div className="summary" data-own="" aria-busy={pending || undefined}>
      {pending ? (
        <>
          <p className="srOnly" role="status">Checking your wallet and reading your balances.</p>
          <div className="skel skelLine w45" style={{ height: 14, marginTop: 0 }} />
          <div className="skel skelBig" />
        </>
      ) : (
        <>
          <div className="sumCell">
            <span className="sumK">ETH held</span>
            <span className="sumV">{connected && weth !== null ? <><Num value={weth} decimals={4} /> <small>WETH</small></> : "—"}</span>
            <span className="sumS">{connected && ethUsd !== null ? <>≈ <Num value={ethUsd} /> tUSDC at the live price</>
              : connected && s && !s.priceable ? "the book cannot price ETH right now" : "the position Ballast protects"}</span>
          </div>
          <div className="sumCell">
            <span className="sumK">tUSDC available</span>
            <span className="sumV">{connected && free !== null ? <Num value={free} /> : "—"}</span>
            <span className="sumS">{connected ? "in your vault, unreserved — what premium is paid from" : "deposited collateral, withdrawable any time"}</span>
          </div>
          <div className={`sumCell sumStatus ${status.tone}`}>
            <span className="sumK">Protection</span>
            <span className="sumV"><i className="sumDot" aria-hidden="true" />{status.text}</span>
            <span className="sumS">{status.sub}</span>
            {!connected && hasProvider && settled && !account && (
              <button type="button" className="btn small" onClick={connect} disabled={connecting} style={{ marginTop: 10 }}>
                {connecting ? "Connecting…" : "Connect a wallet"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
