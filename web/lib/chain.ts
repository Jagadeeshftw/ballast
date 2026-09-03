import { createPublicClient, http, parseAbi, decodeEventLog, toEventSelector } from "viem";

/** Somnia Shannon testnet. Explorer is shannon-explorer, NOT testnet.somniascan.io. */
export const CHAIN_ID = 50312;
export const RPC = "https://dream-rpc.somnia.network/";
export const EXPLORER = "https://shannon-explorer.somnia.network";

export const ADDR = {
  vault: "0x9BC43B97c94E23634A561a02EFce641C9e89fe63",
  engine: "0x9026b93dc240244A34B3568aF704a60f4703a115",
  source: "0x7fE8B80FE1C798c48bB6968e478e321d4A4873cb",
  binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388",
  oracleHub: "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b",
  tusdc: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
  demoUser: "0x7caEb6fc664219306BBED42183a66282B78AEd96",
} as const;

/** Engines retired by a redeploy. Still vault-approved, still able to settle their own
 *  cover — which is the point of the vault approving a set rather than one address. */
export const RETIRED_ENGINES = [
  "0x8ff058704823A6711A456beAfbEd6509F4845f13",
  "0x9cf2fBC0C2d6Db45799e52f54347ad7B97801581",
  "0xB095Aacf9D2e3B12717C2a58B4C6b3afdDf053b0",
] as const;

export const client = createPublicClient({ transport: http(RPC) });

const engineAbi = parseAbi([
  "function callbackCount() view returns (uint256)",
  "function windowsEnqueued() view returns (uint256)",
  "function coversOpened() view returns (uint256)",
  "function coversSettled() view returns (uint256)",
  "function premiumPaidTotal() view returns (uint256)",
  "function proceedsPaidTotal() view returns (uint256)",
  "function pendingCount() view returns (uint256)",
  "function enrolledCount() view returns (uint256)",
  "function lastCallbackAt() view returns (uint64)",
  "function activeSubscriptionId() view returns (uint256)",
  "function callbacksPerWindowX100() view returns (uint256)",
  "function callbacksRemaining() view returns (uint256)",
  "function canSchedule() view returns (bool)",
  "function maxAttempts() view returns (uint8)",
  "function initialDelaySeconds() view returns (uint64)",
  "function subscriptionHealth() view returns (uint256 balance, uint256 costPerCallback, uint256 windowsRemaining, bool subscribed, bool stale)",
  "function coverOf(address,bytes32) view returns (uint256 quantity,uint256 premium,uint16 requestedBps,uint16 achievedBps,bool degraded,bool settled,uint8 outcome,uint256 proceeds,uint32 purchaseDelaySeconds,int32 driftBps)",
  "function openPriceOf(bytes32) view returns (uint256)",
  "function outcomeOf(bytes32) view returns (uint8)",
  "function assetKeyOf(bytes32) view returns (bytes32)",
]);

const vaultAbi = parseAbi([
  "function collateralOf(address) view returns (uint256)",
  "function reservedOf(address) view returns (uint256)",
  "function freeBalanceOf(address) view returns (uint256)",
  "function isCoverable(address) view returns (bool)",
  "function totalCollateral() view returns (uint256)",
  "function surplus() view returns (uint256)",
  "function isEngine(address) view returns (bool)",
  "function policyOf(address) view returns (bool active,uint16 makeWholeBps,uint16 maxPremiumBpsPerWindow,uint64 expiry,uint256 maxNotionalPerWindow)",
]);

const sourceAbi = parseAbi([
  "function priceOf(bytes32) view returns (uint256 price, bool ok)",
  "function assetKeyFor(string) pure returns (bytes32)",
  "function exposureOf(address,bytes32) view returns (uint256)",
]);

const moduleAbi = parseAbi([
  "function markets(bytes32) view returns ((uint256 oracleQuestionId,uint8 outcomeSlotCount,uint8 voidPolicy,address collateral,uint32 originOperatorId,bytes32 originVenueId,address oracleAdapter,address creator,address market,address pool,uint256 yesId,uint256 noId,uint64 tradingStart,uint64 expiry))",
]);

const hubAbi = parseAbi([
  "function pullNumericAnswer(uint256) view returns (int256 numericValue, bool voided)",
]);

const coverOpenedAbi = parseAbi([
  "event CoverOpened(address indexed user, bytes32 indexed marketId, uint256 quantity, uint256 premium, uint256 coverPrice, uint16 requestedBps, uint16 achievedBps, bool degraded)",
]);
const coverSkippedAbi = parseAbi([
  "event CoverSkipped(address indexed user, bytes32 indexed marketId, uint8 reason)",
]);
const callbackRanAbi = parseAbi([
  "event CallbackRan(bytes32 indexed marketId, uint256 scanned, uint256 covered, uint256 cursorAfter)",
]);

export const TOPIC = {
  coverOpened: toEventSelector(
    "CoverOpened(address,bytes32,uint256,uint256,uint256,uint16,uint16,bool)",
  ),
  coverSkipped: toEventSelector("CoverSkipped(address,bytes32,uint8)"),
  callbackRan: toEventSelector("CallbackRan(bytes32,uint256,uint256,uint256)"),
  windowEnqueued: toEventSelector("WindowEnqueued(bytes32,bytes32,uint256,uint64)"),
};

export const SKIP_REASON = [
  "None",
  "Policy inactive or expired",
  "Below enrolment floor",
  "No exposure",
  "No liquidity",
  "Cover too expensive",
  "No headroom",
  "Below minimum lot",
  "Already covered",
  "Placement failed",
  "No open price",
  "Would misrepresent",
  "Attempts exhausted",
] as const;

/** Plain-English reason each skip is a judgement rather than a gap. */
export const SKIP_MEANING: Record<string, string> = {
  "No exposure": "no measured spot position in this asset — nothing to cover",
  "No liquidity": "the Down book was empty; refused rather than mispriced",
  "Cover too expensive": "Down priced above 0.90, where size diverges",
  "No headroom": "a ceiling was already committed this window",
  "Below minimum lot": "the affordable size rounds to zero on the venue's lot grid",
  "Attempts exhausted": "three attempts, book never became priceable",
  "Placement failed": "the pool rejected the order; the rest of the batch continued",
  "Already covered": "this window already holds cover for this user",
  "Policy inactive or expired": "no active consent, so no action",
  "Would misrepresent": "the position would deliver nothing it could honestly describe",
  "No open price": "the window's opening price was never recorded",
};

export const OUTCOME = ["Unsettled", "Won", "Lost", "Voided"] as const;

/** The captured lifecycles. Positions are per-engine, and `eth_getLogs` is capped at 1000
 *  blocks (~100 s at 100 ms blocks), so history cannot be scanned — each is pinned to the
 *  block its CoverOpened landed in and read back exactly. */
export const KNOWN_POSITIONS = [
  {
    label: "A",
    engine: "0x8ff058704823A6711A456beAfbEd6509F4845f13",
    engineLabel: "retired",
    marketId:
      "0x0000000000000000000000000000000000000000000000000000000000010393" as const,
    openedBlock: 477005631n,
    openedTx:
      "0xa7398198a56e982b0a026a613cecfc269dd16a798a7e8522948901b10cf120cf",
    settledTx:
      "0xac81f1fe91f1eb8d9e21f88140bce12abe23bef698f73760f5f6796f9960c2fb",
  },
  {
    label: "B",
    engine: "0x9cf2fBC0C2d6Db45799e52f54347ad7B97801581",
    engineLabel: "retired",
    marketId:
      "0x00000000000000000000000000000000000000000000000000000000000102ff" as const,
    openedBlock: 476975638n,
    openedTx:
      "0xdf3cef7e35293f516973eea140e76565162ba85dc5608b5d9112eac1c1ebc5b7",
    settledTx:
      "0x5bbe1e6005513a4d88ad993d4042f55bba86e9e0547fc3033a667f53c19c305a",
  },
] as const;

export type Position = {
  label: string;
  engine: string;
  engineLabel: string;
  marketId: string;
  openedTx: string;
  settledTx: string;
  quantity: bigint;
  premium: bigint;
  requestedBps: number;
  achievedBps: number;
  degraded: boolean;
  settled: boolean;
  outcome: string;
  proceeds: bigint;
  purchaseDelaySeconds: number;
  driftBps: number;
  coverPrice: bigint;
  /** Exposure at the window's open, derived from qty, q and achievedBps. */
  exposureAtOpen: number;
  openPrice: number | null;
  closePrice: number | null;
  /** Fractional DOWN move from open. Positive = price fell. */
  moveDown: number | null;
  /** Break-even, as a fractional down move. */
  breakEven: number;
  /** Realised net across spot + cover, in tUSDC. */
  netTotal: number | null;
  coverLegNet: number;
};

const ONE = 1_000_000; // tUSDC, 6dp

export async function getPosition(p: (typeof KNOWN_POSITIONS)[number]): Promise<Position> {
  const [cover, openPriceRaw, outcomeIdx, row] = await Promise.all([
    client.readContract({
      address: p.engine as `0x${string}`,
      abi: engineAbi,
      functionName: "coverOf",
      args: [ADDR.demoUser as `0x${string}`, p.marketId],
    }),
    client.readContract({
      address: p.engine as `0x${string}`,
      abi: engineAbi,
      functionName: "openPriceOf",
      args: [p.marketId],
    }),
    client.readContract({
      address: p.engine as `0x${string}`,
      abi: engineAbi,
      functionName: "outcomeOf",
      args: [p.marketId],
    }),
    client.readContract({
      address: ADDR.binaryModule,
      abi: moduleAbi,
      functionName: "markets",
      args: [p.marketId],
    }),
  ]);

  // coverPrice is only on the event, so read the exact block it landed in.
  const logs = await client.getLogs({
    address: p.engine as `0x${string}`,
    fromBlock: p.openedBlock,
    toBlock: p.openedBlock,
  });
  let coverPrice = 0n;
  for (const l of logs) {
    if (l.topics[0]?.toLowerCase() !== TOPIC.coverOpened.toLowerCase()) continue;
    if (l.topics[2]?.toLowerCase() !== p.marketId.toLowerCase()) continue;
    const d = decodeEventLog({ abi: coverOpenedAbi, data: l.data, topics: l.topics });
    coverPrice = d.args.coverPrice as bigint;
  }

  let closePrice: number | null = null;
  try {
    const ans = await client.readContract({
      address: ADDR.oracleHub,
      abi: hubAbi,
      functionName: "pullNumericAnswer",
      args: [row.oracleQuestionId],
    });
    // The oracle publishes at 2dp for these feeds.
    if (!ans[1]) closePrice = Number(ans[0]) / 100;
  } catch {
    closePrice = null;
  }

  const [
    quantity,
    premium,
    requestedBps,
    achievedBps,
    degraded,
    settled,
    outcome,
    proceeds,
    purchaseDelaySeconds,
    driftBps,
  ] = cover;

  const q = Number(coverPrice) / ONE;
  const qty = Number(quantity) / ONE;
  // achievedBps = qty*(1-q)*10000 / exposure  =>  exposure = qty*(1-q)*10000/achievedBps
  const exposureAtOpen =
    achievedBps > 0 ? (qty * (1 - q) * 10_000) / achievedBps : 0;

  const openPrice = openPriceRaw > 0n ? Number(openPriceRaw) / 1e18 : null;
  const moveDown =
    openPrice !== null && closePrice !== null ? (openPrice - closePrice) / openPrice : null;

  const coverLegNet = Number(proceeds) / ONE - Number(premium) / ONE;
  const netTotal =
    moveDown !== null ? -exposureAtOpen * moveDown + coverLegNet : null;

  return {
    label: p.label,
    engine: p.engine,
    engineLabel: p.engineLabel,
    marketId: p.marketId,
    openedTx: p.openedTx,
    settledTx: p.settledTx,
    quantity,
    premium,
    requestedBps,
    achievedBps,
    degraded,
    settled,
    outcome: OUTCOME[outcome] ?? "Unknown",
    proceeds,
    purchaseDelaySeconds,
    driftBps,
    coverPrice,
    exposureAtOpen,
    openPrice,
    closePrice,
    moveDown,
    breakEven: achievedBps / 10_000,
    netTotal,
    coverLegNet,
  };
}

export async function getEngineState() {
  const [
    health,
    callbackCount,
    windowsEnqueued,
    coversOpened,
    coversSettled,
    premiumPaidTotal,
    proceedsPaidTotal,
    pendingCount,
    enrolledCount,
    lastCallbackAt,
    subId,
    ratioX100,
    callbacksLeft,
    canSchedule,
    maxAttempts,
    initialDelay,
  ] = await Promise.all([
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "subscriptionHealth" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "callbackCount" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "windowsEnqueued" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "coversOpened" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "coversSettled" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "premiumPaidTotal" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "proceedsPaidTotal" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "pendingCount" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "enrolledCount" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "lastCallbackAt" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "activeSubscriptionId" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "callbacksPerWindowX100" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "callbacksRemaining" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "canSchedule" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "maxAttempts" }),
    client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "initialDelaySeconds" }),
  ]);

  return {
    balance: health[0],
    costPerCallback: health[1],
    windowsRemaining: health[2],
    subscribed: health[3],
    stale: health[4],
    callbackCount,
    windowsEnqueued,
    coversOpened,
    coversSettled,
    premiumPaidTotal,
    proceedsPaidTotal,
    pendingCount,
    enrolledCount,
    lastCallbackAt,
    subId,
    ratioX100,
    callbacksLeft,
    canSchedule,
    maxAttempts,
    initialDelay,
  };
}

export async function getVaultState() {
  const [collateral, reserved, free, coverable, total, surplus, policy] = await Promise.all([
    client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "collateralOf", args: [ADDR.demoUser] }),
    client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "reservedOf", args: [ADDR.demoUser] }),
    client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "freeBalanceOf", args: [ADDR.demoUser] }),
    client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "isCoverable", args: [ADDR.demoUser] }),
    client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "totalCollateral" }),
    client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "surplus" }),
    client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "policyOf", args: [ADDR.demoUser] }),
  ]);
  return { collateral, reserved, free, coverable, total, surplus, policy };
}

/* The two assets are independent, so they resolve together. This was a sequential for-loop:
   four round trips at ~530ms each on this RPC, where the pair only needs two. Within an
   asset the key must still precede the price -- that dependency is real. */
export async function getSpotPrices() {
  return Promise.all(
    (["ETH", "BTC"] as const).map(async (asset) => {
      try {
        const key = await client.readContract({
          address: ADDR.source, abi: sourceAbi, functionName: "assetKeyFor", args: [asset],
        });
        const r = await client.readContract({
          address: ADDR.source, abi: sourceAbi, functionName: "priceOf", args: [key],
        });
        return { asset: asset as string, price: r[1] ? Number(r[0]) / 1e18 : null, ok: r[1] };
      } catch {
        return { asset: asset as string, price: null as number | null, ok: false };
      }
    }),
  );
}

export type Activity =
  | { kind: "opened"; block: bigint; marketId: string; achievedBps: number; requestedBps: number; premium: bigint; tx: string }
  | { kind: "skipped"; block: bigint; marketId: string; reason: string; tx: string }
  | { kind: "callback"; block: bigint; marketId: string; scanned: bigint; covered: bigint; tx: string };

/** Recent engine activity. Bounded to 990 blocks because `eth_getLogs` is capped at 1000
 *  on this RPC — about 100 seconds at 100 ms blocks. */
export async function getRecentActivity(limit = 14): Promise<{ items: Activity[]; head: bigint }> {
  const head = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: ADDR.engine,
    fromBlock: head - 990n,
    toBlock: head,
  });
  const items: Activity[] = [];
  for (const l of logs.slice().reverse()) {
    const t0 = l.topics[0]?.toLowerCase();
    try {
      if (t0 === TOPIC.coverOpened.toLowerCase()) {
        const d = decodeEventLog({ abi: coverOpenedAbi, data: l.data, topics: l.topics });
        items.push({ kind: "opened", block: l.blockNumber!, marketId: l.topics[2]!, achievedBps: Number(d.args.achievedBps), requestedBps: Number(d.args.requestedBps), premium: d.args.premium as bigint, tx: l.transactionHash! });
      } else if (t0 === TOPIC.coverSkipped.toLowerCase()) {
        const d = decodeEventLog({ abi: coverSkippedAbi, data: l.data, topics: l.topics });
        items.push({ kind: "skipped", block: l.blockNumber!, marketId: l.topics[2]!, reason: SKIP_REASON[Number(d.args.reason)] ?? "Unknown", tx: l.transactionHash! });
      } else if (t0 === TOPIC.callbackRan.toLowerCase()) {
        const d = decodeEventLog({ abi: callbackRanAbi, data: l.data, topics: l.topics });
        items.push({ kind: "callback", block: l.blockNumber!, marketId: l.topics[1]!, scanned: d.args.scanned as bigint, covered: d.args.covered as bigint, tx: l.transactionHash! });
      }
    } catch {
      /* foreign or unknown log */
    }
    if (items.length >= limit) break;
  }
  return { items, head };
}

export async function getEngineSet() {
  const all = [ADDR.engine, ...RETIRED_ENGINES];
  return Promise.all(
    all.map(async (e) => {
      const [approved, bal] = await Promise.all([
        client.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "isEngine", args: [e as `0x${string}`] }),
        client.getBalance({ address: e as `0x${string}` }),
      ]);
      return { address: e, approved, balance: bal, live: e === ADDR.engine };
    }),
  );
}

// ---------------------------------------------------------------- live window

const engineListAbi = parseAbi([
  "function pendingList(uint256) view returns (bytes32)",
  "function pendingOf(bytes32) view returns (uint64 createdAt,uint64 nextAttemptAt,uint8 attempts,bool active)",
]);

export type LiveWindow = {
  marketId: string;
  asset: string;
  /** The strike: the window's opening price. The waterline is engraved here. */
  strike: number;
  /** Where the cover makes the holder whole — the load line. */
  loadPrice: number;
  makeWholeBps: number;
  /** Live spot. This is the waterline that actually moves. */
  now: number | null;
  expiry: number;
  secondsLeft: number;
  intervalLabel: string;
  attempts: number;
  covered: boolean;
  /** How far the price has moved from the open, as a fraction. Positive = fell. */
  moveDown: number | null;
};

const ASSET_BY_KEY: Record<string, string> = {};

/** The window the gauge draws. Prefers one still open; falls back to the most recent so the
 *  hero is never an empty box. */
export async function getLiveWindow(makeWholeBps: number): Promise<LiveWindow | null> {
  const nowSec = Math.floor(Date.now() / 1000);

  const count = await client.readContract({
    address: ADDR.engine, abi: engineAbi, functionName: "pendingCount",
  });

  /* Both of these were sequential loops, and together they were 17.8 of the page's 19.2
     seconds: eight `pendingList` reads one after another, then up to eight `buildWindow`
     calls one after another, at ~530ms per round trip on this RPC. They are independent
     reads, so they go out together. Selection still walks the same order and picks the same
     window -- newest first, first one still open, else the newest that resolved. */
  const n = Number(count);
  const idx: number[] = [];
  for (let i = n - 1; i >= 0 && idx.length < 8; i--) idx.push(i);

  const ids = (await Promise.all(idx.map((i) =>
    client.readContract({
      address: ADDR.engine, abi: engineListAbi, functionName: "pendingList", args: [BigInt(i)],
    }).then((id) => id as string).catch(() => null),
  ))).filter((id): id is string => id !== null);
  if (ids.length === 0) return null;

  const built = await Promise.all(ids.map((marketId) =>
    buildWindow(marketId, makeWholeBps).catch(() => null),
  ));
  return built.find((w) => w && w.secondsLeft > 0) ?? built.find((w) => w) ?? null;
}

/** Builds the gauge's view of one window. Exported so the page can fall back to the most
 *  recently seen window when the queue is momentarily empty — the hero must never be a
 *  blank box. */
export async function buildWindow(marketId: string, makeWholeBps: number): Promise<LiveWindow | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  {
    const row = await client.readContract({
      address: ADDR.binaryModule, abi: moduleAbi, functionName: "markets", args: [marketId as `0x${string}`],
    });
    if (row.market === "0x0000000000000000000000000000000000000000") return null;

    const [openRaw, assetKey, pending] = await Promise.all([
      client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "openPriceOf", args: [marketId as `0x${string}`] }),
      client.readContract({ address: ADDR.engine, abi: engineAbi, functionName: "assetKeyOf", args: [marketId as `0x${string}`] }),
      client.readContract({ address: ADDR.engine, abi: engineListAbi, functionName: "pendingOf", args: [marketId as `0x${string}`] }),
    ]);
    if (openRaw === 0n) return null;

    let asset = ASSET_BY_KEY[assetKey as string] ?? "";
    if (!asset) {
      for (const a of ["ETH", "BTC"]) {
        const k = await client.readContract({ address: ADDR.source, abi: sourceAbi, functionName: "assetKeyFor", args: [a] });
        ASSET_BY_KEY[k as string] = a;
        if (k === assetKey) asset = a;
      }
    }
    if (!asset) return null;

    const key = await client.readContract({ address: ADDR.source, abi: sourceAbi, functionName: "assetKeyFor", args: [asset] });
    const px = await client.readContract({ address: ADDR.source, abi: sourceAbi, functionName: "priceOf", args: [key] });

    const strike = Number(openRaw) / 1e18;
    const spot = px[1] ? Number(px[0]) / 1e18 : null;
    const expiry = Number(row.expiry);
    const secs = expiry - nowSec;

    const w: LiveWindow = {
      marketId,
      asset,
      strike,
      loadPrice: strike * (1 - makeWholeBps / 10_000),
      makeWholeBps,
      now: spot,
      expiry,
      secondsLeft: secs,
      intervalLabel: intervalLabelFor(expiry, Number(pending[0])),
      attempts: Number(pending[2]),
      covered: false,
      moveDown: spot === null ? null : (strike - spot) / strike,
    };
    return w;
  }
}

function intervalLabelFor(expiry: number, createdAt: number): string {
  const d = expiry - createdAt;
  if (d <= 90) return "1m";
  if (d <= 400) return "5m";
  if (d <= 1000) return "15m";
  if (d <= 4000) return "1h";
  if (d <= 15000) return "4h";
  return "24h";
}

// ------------------------------------------------------------------ event tape

/** D6: `eth_getLogs` caps at 1000 blocks (~100 s at 100 ms blocks), so a single query shows
 *  almost nothing and the section that best demonstrates judgement renders empty. Page
 *  backwards in 990-block chunks and cache, rather than changing the contract. */
/* Every chunk's range is derived from the same head, so none of them depends on the one
   before it. Walking them sequentially cost 14 round trips at ~460ms -- 6.5s, and the single
   largest term left in the page once getLiveWindow was fixed. They go out together and are
   flattened back in chunk order, so the tape reads newest-first exactly as it did. A chunk
   that fails now yields nothing instead of truncating the scan at that point. */
export async function scanEngineLogs(chunks: number) {
  const head = await client.getBlockNumber();
  const ranges: { from: bigint; to: bigint }[] = [];
  for (let i = 0; i < chunks; i++) {
    const to = head - BigInt(i * 990);
    const from = to - 989n;
    if (from <= 0n) break;
    ranges.push({ from, to });
  }
  const per = await Promise.all(ranges.map(({ from, to }) =>
    client.getLogs({ address: ADDR.engine, fromBlock: from, toBlock: to })
      .catch(() => [] as Awaited<ReturnType<typeof client.getLogs>>),
  ));
  return { logs: per.flat(), head };
}

const tapeAbi = parseAbi([
  "event WindowEnqueued(bytes32 indexed marketId, bytes32 assetKey, uint256 openPrice, uint64 firstAttemptAt)",
  "event TickScheduled(uint256 timestampMillis, uint256 pendingWindows)",
  "event TickExpired(uint256 wasScheduledFor, uint256 pendingWindows)",
  "event WindowAttempted(bytes32 indexed marketId, uint8 attempt, uint256 covered)",
  "event WindowGaveUp(bytes32 indexed marketId, uint8 attempts)",
  "event CoverOpened(address indexed user, bytes32 indexed marketId, uint256 quantity, uint256 premium, uint256 coverPrice, uint16 requestedBps, uint16 achievedBps, bool degraded)",
  "event CoverSkipped(address indexed user, bytes32 indexed marketId, uint8 reason)",
  "event CallbackRan(bytes32 indexed marketId, uint256 scanned, uint256 covered, uint256 cursorAfter)",
  "event CoverSettled(address indexed user, bytes32 indexed marketId, uint8 outcome, uint256 quantity, uint256 premium, uint256 proceeds)",
]);

export type TapeItem = {
  block: bigint;
  tx: string;
  marketId: string | null;
  kind: "enqueued" | "tick" | "tickExpired" | "attempt" | "gaveUp" | "opened" | "declined" | "callback" | "settled";
  headline: string;
  detail: string;
  tone: "waterline" | "heel" | "silt";
};

/** The tape and the declined list both come from here. Pages backwards in 990-block chunks
 *  because `eth_getLogs` caps at 1000 (~100 s), which is why a single query showed nothing. */
export async function getTape(chunks = 14): Promise<{ items: TapeItem[]; head: bigint; spanBlocks: number }> {
  const { logs, head } = await scanEngineLogs(chunks);
  const items: TapeItem[] = [];

  for (const l of logs) {
    let d: ReturnType<typeof decodeEventLog>;
    try {
      d = decodeEventLog({ abi: tapeAbi, data: l.data, topics: l.topics });
    } catch {
      continue;
    }
    const a = d.args as Record<string, unknown>;
    const base = { block: l.blockNumber!, tx: l.transactionHash!, marketId: null as string | null };

    switch (d.eventName) {
      case "WindowEnqueued":
        items.push({ ...base, marketId: l.topics[1]!, kind: "enqueued", tone: "silt",
          headline: "window opened", detail: "dreamDEX rolled a new window; Ballast reacted in the same block" });
        break;
      case "TickScheduled":
        items.push({ ...base, kind: "tick", tone: "silt",
          headline: "tick scheduled", detail: `${a.pendingWindows} window(s) waiting for a book` });
        break;
      case "TickExpired":
        items.push({ ...base, kind: "tickExpired", tone: "heel",
          headline: "tick lost, replaced", detail: "a scheduled callback never arrived; the ladder rescheduled itself" });
        break;
      case "WindowAttempted":
        items.push({ ...base, marketId: l.topics[1]!, kind: "attempt", tone: "silt",
          headline: `attempt ${a.attempt}`, detail: Number(a.covered) > 0 ? `covered ${a.covered}` : "book not priceable yet" });
        break;
      case "WindowGaveUp":
        items.push({ ...base, marketId: l.topics[1]!, kind: "gaveUp", tone: "heel",
          headline: "gave up", detail: `${a.attempts} attempts, book never became priceable` });
        break;
      case "CoverOpened":
        items.push({ ...base, marketId: l.topics[2]!, kind: "opened", tone: "waterline",
          headline: "cover opened",
          detail: `${(Number(a.premium) / 1e6).toFixed(2)} tUSDC · asked ${a.requestedBps} bps, got ${a.achievedBps} bps` });
        break;
      case "CoverSkipped": {
        const reason = SKIP_REASON[Number(a.reason)] ?? "Unknown";
        items.push({ ...base, marketId: l.topics[2]!, kind: "declined", tone: "heel",
          headline: reason, detail: SKIP_MEANING[reason] ?? "" });
        break;
      }
      case "CallbackRan":
        items.push({ ...base, marketId: l.topics[1]!, kind: "callback", tone: "silt",
          headline: "batch ran", detail: `scanned ${a.scanned}, covered ${a.covered}` });
        break;
      case "CoverSettled":
        items.push({ ...base, marketId: l.topics[2]!, kind: "settled",
          tone: Number(a.outcome) === 1 ? "waterline" : "heel",
          headline: `settled · ${OUTCOME[Number(a.outcome)] ?? "?"}`,
          detail: `${(Number(a.proceeds) / 1e6).toFixed(2)} tUSDC paid out` });
        break;
    }
  }

  items.sort((x, y) => Number(y.block - x.block));
  return { items, head, spanBlocks: chunks * 990 };
}

const poolAbi = parseAbi([
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price,uint256 quantity)[])",
  "function getOrderBookParameters() view returns ((uint256 tickSize,uint256 minQuantity,uint256 lotSize))",
]);

export type LiveBook = {
  /** q — what a Down contract costs. The book is quoted in Up terms, so this is ONE minus
   *  the best Up bid: a Buy-Down crosses a resting Buy-Up by mint-a-pair. */
  coverPrice: number;
  /** Contracts available at the touch. This is what capped both settled positions. */
  bookQty: number;
  lotSize: number;
  priceable: boolean;
};

/** The live Down book for a window, so the dial prices against the venue rather than a
 *  placeholder. Falls back to unpriceable rather than inventing a number. */
export async function getLiveBook(marketId: string | null): Promise<LiveBook> {
  const none: LiveBook = { coverPrice: 0, bookQty: 0, lotSize: 0.001, priceable: false };
  if (!marketId) return none;
  try {
    const row = await client.readContract({
      address: ADDR.binaryModule, abi: moduleAbi, functionName: "markets", args: [marketId as `0x${string}`],
    });
    if (row.pool === "0x0000000000000000000000000000000000000000") return none;

    const [bids, params] = await Promise.all([
      client.readContract({ address: row.pool, abi: poolAbi, functionName: "getBookLevels", args: [true, 1n] }),
      client.readContract({ address: row.pool, abi: poolAbi, functionName: "getOrderBookParameters" }),
    ]);
    if (!bids.length || bids[0].price === 0n || bids[0].quantity === 0n) return none;

    const ONE = 1_000_000;
    const upBid = Number(bids[0].price);
    if (upBid >= ONE) return none;

    return {
      coverPrice: (ONE - upBid) / ONE,
      bookQty: Number(bids[0].quantity) / ONE,
      lotSize: Number(params.lotSize) / ONE,
      priceable: true,
    };
  } catch {
    return none;
  }
}
