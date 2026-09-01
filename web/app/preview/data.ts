import {
  buildWindow, getEngineState, getLiveBook, getLiveWindow, getSpotPrices, getTape, getVaultState,
} from "@/lib/chain";

/** Both directions render the same live state, so the comparison is about design and
 *  nothing else. Read at request time; nothing cached. */
export async function loadPreview() {
  const vault = await getVaultState();
  const makeWholeBps = Number(vault.policy[1]) || 250;

  const [engine, prices, tape, live] = await Promise.all([
    getEngineState(), getSpotPrices(), getTape(10), getLiveWindow(makeWholeBps),
  ]);

  // The hero must never be a blank box: fall back to the most recently seen window.
  let shown = live;
  if (!shown) {
    const lastSeen = tape.items.find((t) => t.kind === "enqueued" && t.marketId)?.marketId;
    if (lastSeen) shown = await buildWindow(lastSeen, makeWholeBps);
  }
  const book = await getLiveBook(shown?.marketId ?? null);
  const eth = prices.find((p) => p.asset === "ETH");

  return { vault, engine, prices, tape, shown, book, makeWholeBps, eth };
}

/** Chain timestamps are UTC. Render them as UTC, explicitly, always. */
export function utc(ts: number | bigint): string {
  const d = new Date(Number(ts) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

/** The three steps as the flow ACTUALLY exists after Phase 0 -- minting, not trading. */
export const STEPS = [
  {
    n: "01",
    head: "Hold something",
    body: "Mint test ETH in one click. Ballast only ever covers what it can measure you holding on chain — never a number you type in.",
    foot: "one transaction · no approval",
  },
  {
    n: "02",
    head: "Say how deep",
    body: "Set the load line: how far a fall you want made whole, and the most you will pay for it. That is the whole of the policy.",
    foot: "revocable at any time",
  },
  {
    n: "03",
    head: "The chain does the rest",
    body: "Every window, in the same block it opens, Ballast buys cover — or declines it and tells you which reason. No keeper, no cron, nothing of ours running.",
    foot: "0 blocks latency",
  },
] as const;
