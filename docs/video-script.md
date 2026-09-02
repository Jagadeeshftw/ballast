# Ballast — three-minute submission video

Draft for review. **Nothing recorded yet.**

Written assuming **the engine is not running**, because it currently is not: the recorded run
carries the tape and the script says so out loud rather than hiding it. If STT arrives before
recording, the live engine simply replaces the recorded tape on screen and **not one word of
narration changes** — the page swaps automatically, and every claim below is already phrased
to be true either way.

Target **2:55**. Roughly 430 spoken words at ~150 wpm, which leaves room to breathe. Going
over three minutes is worse than cutting shot 6.

---

## Before recording

- [ ] Decide the front door. `/` still serves the **old light design**; the approved page is
      at `/preview/a`. Record whichever is live, but do not show a URL that lands on the old
      one.
- [ ] `scripts/check-deploy.sh` — confirm the deployed commit matches local HEAD.
- [ ] Browser at 1440×900, no bookmarks bar, no extensions visible, system dark.
- [ ] Explorer tabs pre-loaded so nothing is waiting on a network round trip on camera:
      trigger `0x0434d364…`, callback `0x79bf978b…`, settlement `0xdafa9556…`.
- [ ] Vault holds 4,000 tUSDC and the policy runs to 14 October — both already true.
- [ ] If STT arrived: `setSubscriptionFees(1 gwei, 40 gwei, 4_000_000)` then
      `openSubscription()`, and wait for one real callback before recording.

---

## Shot list

| # | Time | On screen | Said |
| --- | --- | --- | --- |
| 1 | 0:00–0:18 | Hero, full. Countdown ticking, gauge lit, three tape rows. | "You hold ETH. It can fall while you sleep. Cover for that exists — but on this venue it expires every window, and nobody sits up all night re-buying it. Ballast does. It buys downside cover for your position automatically, and the chain itself is what triggers it." |
| 2 | 0:18–0:40 | Scroll to **How it works**. Let the three rules draw. | "Three steps. You hold something — Ballast only ever covers exposure it can measure on chain, never a number you type in. You set a load line: how deep a fall you want made whole. Then it runs, every window, with no keeper and nothing of ours running." |
| 3 | 0:40–1:12 | Cut to explorer. Trigger tx, then callback tx. **Highlight the block number on both.** | "This is the part that only works here. dreamDEX opens a window — that's the first transaction. Ballast's handler runs — that's the second. Same block. Not a fast bot: Somnia's reactivity precompile executes the handler as a synthetic transaction inside the block that triggered it. Zero blocks of latency, and no operator anywhere in the loop." |
| 4 | 1:12–1:45 | Back to page, **What it actually pays**. Let the curve draw: step, regions, then the two real points. | "What it buys is not a hedge, and we won't call it one. The payout is fixed, so cover is exact at one depth and imperfect either side — over-paying on a small fall, under-paying on a large one. That gap is basis risk. It's parametric cover, the same trade flight-delay insurance makes: it pays the same whether you missed a meeting or a wedding. The honest version of this product says where the exact point is." |
| 5 | 1:45–2:12 | **It has already done this.** Both position cards, then the totals row. | "Two positions, both real, both settled on chain. One paid two hundred tUSDC, one paid nothing — and the one that paid nothing is a success, because the price went up. Net across both: minus twenty-four dollars. That's the cost of cover that wasn't needed, and we show it rather than the winner alone." |
| 6 | 2:12–2:30 | **And it refuses**, scrolling the reasons. | "It also declines. No measured exposure. Book one-sided. Size rounds below the venue's minimum lot. Every refusal is on chain with its reason, because a system that only shows you what it did is hiding what it chose not to." |
| 7 | 2:30–2:52 | The **not-running** panel, held still long enough to read. | "It's stopped right now, and that's worth explaining. Somnia bills a reactive callback at its gas limit, not its usage — ours was provisioned ten million and uses one and a half. That's twelve STT an hour on a testnet whose faucet pays half a day. We measured it, the fix is a subscription parameter rather than a new contract, and `topUp` is permissionless so anyone can restart it. Everything it did is committed to the repo." |
| 8 | 2:52–2:55 | Addresses and repo URL, held. | "Contracts, documents and the full run record are in the repo. Thanks for watching." |

---

## Delivery notes

- **Do not read the tables aloud.** Shot 4 is the only place a number matters and it is one
  number: the make-whole point.
- **Shot 3 is the technical claim.** Slow down. Let the two block numbers sit on screen for a
  full second before speaking over them. If a judge remembers one thing, it is this.
- **Shot 7 is not an apology.** The tone is "we measured something nobody had checked",
  because that is what happened. Delivered defensively it reads as a broken project;
  delivered flatly it reads as the strongest engineering moment in the submission.
- No music. No transitions beyond straight cuts. The page has exactly one animation of its
  own and it should be the only motion in the video.

## If it runs long

Cut **shot 6** first — the refusals are visible on the page and in the README. Then compress
shot 2 to a single sentence. **Never cut shot 3 or shot 7**: shot 3 is the reason the project
belongs on Somnia, and shot 7 is the reason it looks stopped.
