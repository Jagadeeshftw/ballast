/**
 * Settle the account's unsettled backlog, one position at a time.
 *
 * settleMany batches USERS for one market, not markets for one user, so there is no bulk
 * call for a single account's backlog. Sequential and awaited: a failure is attributable to
 * a position rather than to the run.
 *
 * Settling is permissionless and costs nothing beyond gas — proceeds credit the user's vault.
 */
import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaTestnet } from "viem/chains";
import { readFileSync } from "node:fs";

const RPC = "https://dream-rpc.somnia.network/";
const ENGINE = "0x9026b93dc240244A34B3568aF704a60f4703a115";
const USER = "0x7caEb6fc664219306BBED42183a66282B78AEd96";
const GAS = 5_600_000n; // twice the measured maximum of 2,796,559

const env = Object.fromEntries(readFileSync("../.env", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const account = privateKeyToAccount(env.PRIVATE_KEY.startsWith("0x") ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`);
const pub = createPublicClient({ chain: somniaTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC) });

const engineAbi = parseAbi([
  "function settle(address,bytes32) returns (uint256)",
  "event CoverSettled(address indexed user, bytes32 indexed marketId, uint8 outcome, uint256 quantity, uint256 premium, uint256 proceeds)",
]);
const OUTCOME = ["Unsettled", "Won", "Lost", "Voided"];

const markets = readFileSync("/tmp/unsettled.txt", "utf8").split("\n").map((x) => x.trim()).filter(Boolean);
console.log(`backlog: ${markets.length} positions`);
console.log(`from   : ${account.address}`);
console.log(`balance: ${formatEther(await pub.getBalance({ address: account.address }))} STT\n`);

const results = [];
let gasSpent = 0n, sent = 0, failed = 0;

for (const [i, m] of markets.entries()) {
  try {
    const hash = await wallet.writeContract({
      address: ENGINE, abi: engineAbi, functionName: "settle",
      args: [USER, m], gas: GAS,
    });
    const r = await pub.waitForTransactionReceipt({ hash });
    gasSpent += r.gasUsed * r.effectiveGasPrice;
    // A reverted transaction still returns a receipt. Without this it is counted as a
    // success that merely emitted no event -- a silent failure of exactly the kind this
    // project keeps finding elsewhere.
    if (r.status !== "success") {
      failed++;
      results.push({ m, outcome: "REVERTED", hash });
      console.log(`${String(i + 1).padStart(2)}/${markets.length}  ${m.slice(-8)}  REVERTED (gas still spent)  ${hash.slice(0, 12)}…`);
      continue;
    }

    let outcome = "?", proceeds = 0n;
    for (const l of r.logs) {
      try {
        const d = decodeEventLog({ abi: engineAbi, data: l.data, topics: l.topics });
        if (d.eventName === "CoverSettled") {
          outcome = OUTCOME[Number(d.args.outcome)] ?? "?";
          proceeds = d.args.proceeds;
        }
      } catch { /* other logs */ }
    }
    results.push({ m, outcome, proceeds, hash, gasUsed: r.gasUsed });
    sent++;
    console.log(`${String(i + 1).padStart(2)}/${markets.length}  ${m.slice(-8)}  ${outcome.padEnd(7)} ${(Number(proceeds) / 1e6).toFixed(2).padStart(8)} tUSDC  gas ${r.gasUsed}  ${hash.slice(0, 12)}…`);
  } catch (e) {
    failed++;
    const msg = String(e?.shortMessage ?? e?.message ?? e).slice(0, 90);
    results.push({ m, outcome: "FAILED", err: msg });
    console.log(`${String(i + 1).padStart(2)}/${markets.length}  ${m.slice(-8)}  FAILED  ${msg}`);
  }
}

const dist = {};
for (const r of results) dist[r.outcome] = (dist[r.outcome] ?? 0) + 1;
const paid = results.reduce((a, r) => a + Number(r.proceeds ?? 0n) / 1e6, 0);

console.log(`\n=== outcome distribution ===`);
for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(8)} ${v}`);
console.log(`\nsettled ok : ${sent}`);
console.log(`failed     : ${failed}`);
console.log(`proceeds   : ${paid.toFixed(2)} tUSDC`);
console.log(`gas spent  : ${formatEther(gasSpent)} STT`);
console.log(`balance now: ${formatEther(await pub.getBalance({ address: account.address }))} STT`);
