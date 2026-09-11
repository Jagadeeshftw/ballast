/**
 * The live window, and what Ballast would do in it.
 *
 * Shared by the server, which renders the Overview shell, and the browser, which keeps it
 * ticking — so the two cannot disagree about which window is current or what it would cost.
 *
 * The series is ETH, one-minute. It is the only series whose whole arc — open, buy, close,
 * resolve — fits inside a minute, and every one of its windows is registered inside a single
 * ~100-second log scan, which is the most `eth_getLogs` returns on this RPC.
 *
 * `quoteFor` is not an estimate. It replays the engine's own `_quote` read path — the same
 * reads, the same refusal checks in the same order, the same integer arithmetic — against the
 * connected wallet, so "what Ballast would do" is what the engine would do if it ran now. If
 * any input cannot be read, it returns a refusal with that reason rather than a number.
 */
import { parseAbi, keccak256, stringToBytes, type Address, type PublicClient } from "viem";
import { ADDR } from "./chain";

export const ETH_KEY = keccak256(stringToBytes("ETH")).toLowerCase();
const ONE = 1_000_000n;
const BPS = 10_000n;

/** The longest window this series can have and still be "one-minute". A market that opens a
    second or two late is still the one-minute series, not another. */
const SERIES_MAX_SECONDS = 90;

export const engineEvents = parseAbi([
  "event WindowEnqueued(bytes32 indexed marketId, bytes32 assetKey, uint256 openPrice, uint64 firstAttemptAt)",
  "event WindowAttempted(bytes32 indexed marketId, uint8 attempt, uint256 covered)",
  "event WindowGaveUp(bytes32 indexed marketId, uint8 attempts)",
  "event CoverOpened(address indexed user, bytes32 indexed marketId, uint256 quantity, uint256 premium, uint256 coverPrice, uint16 requestedBps, uint16 achievedBps, bool degraded)",
  "event CoverSkipped(address indexed user, bytes32 indexed marketId, uint8 reason)",
  "event CoverSettled(address indexed user, bytes32 indexed marketId, uint8 outcome, uint256 quantity, uint256 premium, uint256 proceeds)",
]);

export const engineViews = parseAbi([
  "function coverOf(address,bytes32) view returns (uint256 quantity,uint256 premium,uint16 requestedBps,uint16 achievedBps,bool degraded,bool settled,uint8 outcome,uint256 proceeds,uint32 purchaseDelaySeconds,int32 driftBps)",
  "function outcomeOf(bytes32) view returns (uint8)",
  "function openPriceOf(bytes32) view returns (uint256)",
  "function assetKeyOf(bytes32) view returns (bytes32)",
  "function maxCoverPriceBps() view returns (uint256)",
  "function initialDelaySeconds() view returns (uint64)",
  "function retryDelaySeconds() view returns (uint64)",
  "function maxAttempts() view returns (uint8)",
]);

const moduleAbi = parseAbi([
  "struct MarketRow { uint256 oracleQuestionId; uint8 outcomeSlotCount; uint8 voidPolicy; address collateral; uint32 originOperatorId; bytes32 originVenueId; address oracleAdapter; address creator; address market; address pool; uint256 yesId; uint256 noId; uint64 tradingStart; uint64 expiry; }",
  "function markets(bytes32) view returns (MarketRow)",
]);
const poolAbi = parseAbi([
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price,uint256 quantity)[])",
  "function getOrderBookParameters() view returns ((uint256 tickSize,uint256 minQuantity,uint256 lotSize))",
]);
const vaultAbi = parseAbi([
  "function bindingLimit(address,bytes32,uint256) view returns (uint256,uint8)",
]);
const sourceAbi = parseAbi([
  "function exposureOf(address,bytes32) view returns (uint256)",
  "function priceOf(bytes32) view returns (uint256,bool)",
]);

export type Win = {
  marketId: `0x${string}`;
  asset: "ETH";
  start: number;
  close: number;
  seconds: number;
  /** The strike: the window's opening price, as the engine recorded it. */
  openPrice: number;
  pool: Address;
};

type EnqueueLog = { args: { marketId?: `0x${string}`; assetKey?: `0x${string}`; openPrice?: bigint } };

/** Turns the engine's WindowEnqueued logs into one-minute ETH windows, reading each market's
    open and close from the module rather than assuming the series cadence. */
export async function toWindows(client: PublicClient, logs: EnqueueLog[]): Promise<Win[]> {
  const eth = logs.filter((l) => l.args.marketId && String(l.args.assetKey).toLowerCase() === ETH_KEY);
  const rows = await Promise.all(eth.map((l) =>
    client.readContract({ address: ADDR.binaryModule as Address, abi: moduleAbi, functionName: "markets", args: [l.args.marketId!] })
      .then((r) => ({ l, r })).catch(() => null)));
  const out: Win[] = [];
  for (const x of rows) {
    if (!x) continue;
    const seconds = Number(x.r.expiry - x.r.tradingStart);
    if (seconds <= 0 || seconds > SERIES_MAX_SECONDS) continue;
    out.push({
      marketId: x.l.args.marketId!, asset: "ETH",
      start: Number(x.r.tradingStart), close: Number(x.r.expiry), seconds,
      openPrice: Number(x.l.args.openPrice ?? 0n) / 1e18, pool: x.r.pool,
    });
  }
  return out;
}

/** The window open now, by CHAIN time, from the last ~100 seconds of engine logs. */
export async function currentWindow(client: PublicClient): Promise<{ win: Win | null; chainNow: number }> {
  const head = await client.getBlockNumber();
  const [blk, logs] = await Promise.all([
    client.getBlock({ blockNumber: head }),
    client.getLogs({ address: ADDR.engine as Address, event: engineEvents[0], fromBlock: head - 989n, toBlock: head }),
  ]);
  const now = Number(blk.timestamp);
  const wins = await toWindows(client, logs as unknown as EnqueueLog[]);
  const win = wins.filter((w) => w.start <= now && now < w.close).sort((a, b) => b.start - a.start)[0] ?? null;
  return { win, chainNow: now };
}

export type Quote =
  | {
      kind: "buy";
      qty: bigint; premium: bigint; coverPrice: bigint;
      requestedBps: number; achievedBps: number;
      /** Why it would deliver less than asked, or null when it would not. */
      shortBy: string | null;
    }
  | { kind: "decline"; reason: string; coverPrice: bigint | null; exposure: bigint | null };

const BINDING = ["", "your free balance", "your per-window cap", "your premium ceiling"];

/**
 * The engine's `_quote`, replayed. Order and arithmetic follow HedgeEngine.sol exactly; a
 * change there that is not made here would make this lie, so the two are meant to be read
 * side by side.
 */
export async function quoteFor(
  client: PublicClient, user: Address, w: Win, requestedBps: number, atBlock?: bigint,
): Promise<Quote> {
  const m = w.marketId;
  const read = <T,>(p: Promise<T>) => p.catch(() => null);
  /* Every read is pinned to ONE block. The engine takes all of these inside a single
     transaction, where the spot price in exposureOf and in priceOf is the same number and
     cancels exactly; reading them at "latest" one call at a time let the two land in
     different blocks, and the replay drifted from the engine by a few units. */
  const blockNumber = atBlock ?? await client.getBlockNumber();
  const [exposureNow, openPrice, assetKey, maxCoverPriceBps, bids, params] = await Promise.all([
    read(client.readContract({ address: ADDR.source as Address, abi: sourceAbi, functionName: "exposureOf", args: [user, m], blockNumber })),
    read(client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "openPriceOf", args: [m], blockNumber })),
    read(client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "assetKeyOf", args: [m], blockNumber })),
    read(client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "maxCoverPriceBps", blockNumber })),
    read(client.readContract({ address: w.pool, abi: poolAbi, functionName: "getBookLevels", args: [true, 1n], blockNumber })),
    read(client.readContract({ address: w.pool, abi: poolAbi, functionName: "getOrderBookParameters", blockNumber })),
  ]);
  const decline = (reason: string, coverPrice: bigint | null = null, exposure: bigint | null = null): Quote =>
    ({ kind: "decline", reason, coverPrice, exposure });

  if (exposureNow === null || openPrice === null || assetKey === null || maxCoverPriceBps === null || bids === null || params === null) {
    return decline("Unreadable");
  }
  const top = bids[0];
  const coverPriceNow = top && top.price > 0n && top.price < ONE && top.quantity > 0n ? ONE - top.price : null;

  if (exposureNow === 0n) return decline("NoExposure", coverPriceNow, 0n);
  if (openPrice === 0n) return decline("NoOpenPrice", coverPriceNow, exposureNow);

  const px = await read(client.readContract({ address: ADDR.source as Address, abi: sourceAbi, functionName: "priceOf", args: [assetKey], blockNumber }));
  if (px === null) return decline("Unreadable", coverPriceNow, exposureNow);
  const [spotNow, priceOk] = px;
  if (!priceOk || spotNow === 0n) return decline("NoLiquidity", coverPriceNow, exposureNow);

  const exposure = (exposureNow * openPrice) / spotNow;
  if (exposure === 0n) return decline("NoExposure", coverPriceNow, 0n);

  if (!top || top.price === 0n || top.quantity === 0n) return decline("NoLiquidity", null, exposure);
  const upBid = top.price;
  if (upBid >= ONE) return decline("NoLiquidity", null, exposure);
  const coverPrice = ONE - upBid;
  if (coverPrice * BPS > maxCoverPriceBps * ONE) return decline("CoverTooExpensive", coverPrice, exposure);

  const req = BigInt(requestedBps);
  const desiredPremium = (exposure * req * coverPrice) / (BPS * upBid);

  const bl = await read(client.readContract({ address: ADDR.vault as Address, abi: vaultAbi, functionName: "bindingLimit", args: [user, m, exposure], blockNumber }));
  if (bl === null) return decline("Unreadable", coverPrice, exposure);
  const [limit, binding] = bl;
  if (limit === 0n) return decline("NoHeadroom", coverPrice, exposure);

  let premium = desiredPremium > limit ? limit : desiredPremium;
  let qty = (premium * ONE) / coverPrice;
  let bookBound = false;
  if (params.lotSize !== 0n) {
    qty = (qty / params.lotSize) * params.lotSize;
    if (qty > top.quantity) { qty = (top.quantity / params.lotSize) * params.lotSize; bookBound = true; }
  } else if (qty > top.quantity) { qty = top.quantity; bookBound = true; }
  if (qty === 0n || qty < params.minQuantity) return decline("BelowMinimumLot", coverPrice, exposure);

  premium = (qty * coverPrice) / ONE;
  if (premium === 0n || premium > limit) return decline("BelowMinimumLot", coverPrice, exposure);

  const denom = exposure * ONE;
  const achieved = (qty * upBid * BPS + denom / 2n) / denom;
  const achievedBps = achieved >= 65_535n ? 65_535 : Number(achieved);
  if (achievedBps === 0) return decline("WouldMisrepresent", coverPrice, exposure);

  let shortBy: string | null = null;
  if (achievedBps < requestedBps) {
    shortBy = bookBound ? `the book only offers ${(Number(top.quantity) / 1e6).toLocaleString("en-GB")} contracts at the touch`
      : desiredPremium > limit ? `${BINDING[binding] || "one of your limits"} binds first`
      : "rounding to the venue's lot size";
  }
  return { kind: "buy", qty, premium, coverPrice, requestedBps, achievedBps, shortBy };
}

/** Why an OPENED cover delivered less than asked. Same classification the positions table
    uses, recovered from the event and the policy: the premium ceiling or the per-window cap if
    the premium sat on one of them, otherwise the book. */
export function explainShort(o: { qty: bigint; premium: bigint; coverPrice: bigint; requestedBps: number; achievedBps: number },
  premiumCeilingBps: number, notionalCap: bigint): string | null {
  if (o.achievedBps >= o.requestedBps || o.achievedBps === 0) return null;
  const exposure = (o.qty * (ONE - o.coverPrice) * BPS) / (BigInt(o.achievedBps) * ONE);
  const ceiling = (exposure * BigInt(premiumCeilingBps)) / BPS;
  if (ceiling > 0n && o.premium * 1000n >= ceiling * 995n) return `your premium ceiling of ${premiumCeilingBps} bps bound the size`;
  if (notionalCap > 0n && o.premium * 1000n >= notionalCap * 995n) return "your per-window cap bound the size";
  return "the book offered less than the ask";
}
