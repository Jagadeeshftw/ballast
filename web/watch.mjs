import { createPublicClient, http, parseAbi, formatEther, decodeEventLog } from 'viem';
const c = createPublicClient({ transport: http('https://dream-rpc.somnia.network/') });
const E = '0x9026b93dc240244A34B3568aF704a60f4703a115';
const abi = parseAbi([
  'event WindowEnqueued(bytes32 indexed marketId, bytes32 assetKey, uint256 openPrice, uint64 firstAttemptAt)',
  'event TickScheduled(uint256 timestampMillis, uint256 pendingWindows)',
  'event WindowAttempted(bytes32 indexed marketId, uint8 attempt, uint256 covered)',
  'event CallbackRan(bytes32 indexed marketId, uint256 scanned, uint256 covered, uint256 cursorAfter)',
  'event CoverOpened(address indexed user, bytes32 indexed marketId, uint256 quantity, uint256 premium, uint256 coverPrice, uint16 requestedBps, uint16 achievedBps, bool degraded)',
  'event CoverSkipped(address indexed user, bytes32 indexed marketId, uint8 reason)',
]);
const start = Number(process.env.FROM);
const startBal = BigInt(process.env.BAL);
const startT = Number(process.env.T0);
const head = await c.getBlockNumber();
const logs = [];
for (let f = BigInt(start); f <= head; f += 990n) {
  const t = f + 989n > head ? head : f + 989n;
  logs.push(...await c.getLogs({ address: E, fromBlock: f, toBlock: t }).catch(()=>[]));
}
const byName = {};
const windows = new Map();
for (const l of logs) {
  let d; try { d = decodeEventLog({ abi, data: l.data, topics: l.topics }); } catch { continue; }
  byName[d.eventName] = (byName[d.eventName]||0)+1;
  const mid = l.topics[1];
  if (['WindowEnqueued','WindowAttempted','CallbackRan','CoverOpened','CoverSkipped'].includes(d.eventName) && mid) {
    if (!windows.has(mid)) windows.set(mid, new Set());
    windows.get(mid).add(d.eventName);
  }
}
const bal = await c.getBalance({ address: E });
const spent = Number(startBal - bal)/1e18;
const hours = (Date.now()/1000 - startT)/3600;
console.log('blocks watched  :', start, '->', head.toString(), `(${Number(head)-start})`);
console.log('elapsed         :', (hours*60).toFixed(1), 'minutes');
console.log('events          :', JSON.stringify(byName));
console.log('distinct windows:', windows.size);
let both = 0;
for (const [mid, s] of windows) {
  const line = [...s].join(', ');
  if (s.has('WindowEnqueued')) console.log(`  ${mid.slice(0,12)}… ${line}`);
}
console.log('\nTickScheduled fired :', byName.TickScheduled ?? 0);
console.log('WindowAttempted     :', byName.WindowAttempted ?? 0);
console.log('\n--- burn ---');
console.log('spent           :', spent.toFixed(6), 'STT in', (hours*60).toFixed(1), 'min');
if (hours > 0) console.log('rate            :', (spent/hours).toFixed(3), 'STT/hour  (estimate was 5.1)');
console.log('balance now     :', formatEther(bal), 'STT');
