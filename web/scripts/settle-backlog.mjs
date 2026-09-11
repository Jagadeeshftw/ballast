/**
 * Settle the account's unsettled backlog, one position at a time, across one or more engines.
 *
 *   node scripts/settle-backlog.mjs <engine>[:<fromBlock>] [<engine>[:<fromBlock>] ...]
 *
 * The backlog is read from the chain, not from a file: every CoverOpened for the account on
 * each engine, minus those whose coverOf(...).settled is already true. The old version read a
 * hand-made list from /tmp and was pinned to one engine, so it could only ever settle the run
 * it was written for.
 *
 * settleMany batches USERS for one market, not markets for one user, so there is no bulk call
 * for a single account's backlog. Sequential and awaited: a failure is attributable to a
 * position rather than to the run. Each settle is simulated first, so a market that has not
 * resolved yet is reported and skipped instead of burning gas on a revert.
 *
 * Settling is permissionless and costs nothing beyond gas — proceeds credit the user's vault.
 * DRY=1 simulates every settle and sends nothing.
 */
import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaTestnet } from "viem/chains";
import { readFileSync } from "node:fs";

const RPC = "https://dream-rpc.somnia.network/";
const USER = "0x7caEb6fc664219306BBED42183a66282B78AEd96";
const VAULT = "0x9BC43B97c94E23634A561a02EFce641C9e89fe63";
const GAS = 5_600_000n; // twice the measured maximum of 2,796,559
const DRY = !!process.env.DRY;

const targets = process.argv.slice(2).map((a) => {
  const [engine, from] = a.split(":");
  return { engine, from: from ? BigInt(from) : null };
});
if (!targets.length) {
  console.log("usage: node scripts/settle-backlog.mjs <engine>[:<fromBlock>] ...");
  process.exit(1);
}

const env = Object.fromEntries(readFileSync("../.env", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const account = privateKeyToAccount(env.PRIVATE_KEY.startsWith("0x") ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`);
const pub = createPublicClient({ chain: somniaTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC) });

const engineAbi = parseAbi([
  "function settle(address,bytes32) returns (uint256)",
  "function coverOf(address,bytes32) view returns (uint256 quantity,uint256 premium,uint16 requestedBps,uint16 achievedBps,bool degraded,bool settled,uint8 outcome,uint256 proceeds,uint32 purchaseDelaySeconds,int32 driftBps)",
  "event CoverOpened(address indexed user, bytes32 indexed marketId, uint256 quantity, uint256 premium, uint256 coverPrice, uint16 requestedBps, uint16 achievedBps, bool degraded)",
  "event CoverSettled(address indexed user, bytes32 indexed marketId, uint8 outcome, uint256 quantity, uint256 premium, uint256 proceeds)",
]);
const vaultAbi = parseAbi(["function freeBalanceOf(address) view returns (uint256)"]);
const OUTCOME = ["Unsettled", "Won", "Lost", "Voided"];
const free = async () => Number(await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: "freeBalanceOf", args: [USER] })) / 1e6;

/** First block with code at `a`, by bisection — so no deploy block has to be remembered. */
async function deployBlock(a) {
  let lo = 0n, hi = await pub.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await pub.getBytecode({ address: a, blockNumber: mid }).catch(() => undefined);
    if (code && code !== "0x") hi = mid; else lo = mid + 1n;
  }
  return lo;
}

async function openedMarkets(engine, from) {
  const head = await pub.getBlockNumber();
  const opened = [];
  const event = engineAbi.find((x) => x.name === "CoverOpened");
  for (let f = from; f <= head; f += 1000n) {
    const to = f + 999n > head ? head : f + 999n;
    const logs = await pub.getLogs({ address: engine, event, args: { user: USER }, fromBlock: f, toBlock: to });
    for (const l of logs) opened.push(l.args.marketId);
  }
  return [...new Set(opened)];
}

console.log(`account: ${USER} | from ${account.address}`);
console.log(`STT    : ${formatEther(await pub.getBalance({ address: account.address }))} | vault free ${(await free()).toFixed(2)} tUSDC\n`);

const results = [];
let gasSpent = 0n;

for (const t of targets) {
  const from = t.from ?? await deployBlock(t.engine);
  const markets = await openedMarkets(t.engine, from);
  const pending = [];
  for (const m of markets) {
    const c = await pub.readContract({ address: t.engine, abi: engineAbi, functionName: "coverOf", args: [USER, m] });
    if (!c[5]) pending.push(m);
  }
  console.log(`== ${t.engine} (from block ${from}): ${markets.length} covers, ${pending.length} unsettled`);

  for (const [i, m] of pending.entries()) {
    const tag = `${String(i + 1).padStart(3)}/${pending.length}  ${m.slice(-8)}`;
    try {
      await pub.simulateContract({ account, address: t.engine, abi: engineAbi, functionName: "settle", args: [USER, m], gas: GAS });
    } catch (e) {
      const msg = String(e?.shortMessage ?? e?.message ?? e).split("\n")[0].slice(0, 90);
      results.push({ engine: t.engine, m, outcome: "NOT YET", err: msg });
      console.log(`${tag}  NOT YET (simulation reverts, nothing sent): ${msg}`);
      continue;
    }
    if (DRY) { results.push({ engine: t.engine, m, outcome: "WOULD SETTLE" }); continue; }
    try {
      const hash = await wallet.writeContract({ address: t.engine, abi: engineAbi, functionName: "settle", args: [USER, m], gas: GAS });
      const r = await pub.waitForTransactionReceipt({ hash });
      gasSpent += r.gasUsed * r.effectiveGasPrice;
      // A reverted transaction still returns a receipt. Without this it is counted as a
      // success that merely emitted no event -- a silent failure of exactly the kind this
      // project keeps finding elsewhere. And out-of-gas is told apart from a revert.
      if (r.status !== "success") {
        const why = r.gasUsed * 64n >= GAS * 63n ? "OUT OF GAS" : "REVERTED";
        results.push({ engine: t.engine, m, outcome: why, hash });
        console.log(`${tag}  ${why} (gas still spent, ${r.gasUsed}/${GAS})  ${hash.slice(0, 12)}…`);
        continue;
      }
      let outcome = "?", proceeds = 0n;
      for (const l of r.logs) {
        try {
          const d = decodeEventLog({ abi: engineAbi, data: l.data, topics: l.topics });
          if (d.eventName === "CoverSettled") { outcome = OUTCOME[Number(d.args.outcome)] ?? "?"; proceeds = d.args.proceeds; }
        } catch { /* other logs */ }
      }
      results.push({ engine: t.engine, m, outcome, proceeds, hash, gasUsed: r.gasUsed });
      console.log(`${tag}  ${outcome.padEnd(7)} ${(Number(proceeds) / 1e6).toFixed(2).padStart(8)} tUSDC  gas ${r.gasUsed}  ${hash.slice(0, 12)}…`);
    } catch (e) {
      const msg = String(e?.shortMessage ?? e?.message ?? e).split("\n")[0].slice(0, 90);
      results.push({ engine: t.engine, m, outcome: "FAILED", err: msg });
      console.log(`${tag}  FAILED  ${msg}`);
    }
  }
}

const dist = {};
for (const r of results) dist[r.outcome] = (dist[r.outcome] ?? 0) + 1;
const paid = results.reduce((a, r) => a + Number(r.proceeds ?? 0n) / 1e6, 0);
console.log(`\n=== outcome distribution ===`);
for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(10)} ${v}`);
console.log(`proceeds   : ${paid.toFixed(2)} tUSDC`);
console.log(`gas spent  : ${formatEther(gasSpent)} STT`);
console.log(`vault free : ${(await free()).toFixed(2)} tUSDC`);
console.log(`STT now    : ${formatEther(await pub.getBalance({ address: account.address }))}`);
