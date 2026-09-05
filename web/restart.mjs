import { createPublicClient, createWalletClient, http, parseAbi, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from 'viem/chains';
import fs from 'node:fs';

const KEY = fs.readFileSync('../.env','utf8').split('\n')
  .find(l=>l.startsWith('PRIVATE_KEY=')).split('=')[1].trim().replace(/^['"]|['"]$/g,'');
const E = '0x9026b93dc240244A34B3568aF704a60f4703a115';
const RPC = 'https://dream-rpc.somnia.network/';

const abi = parseAbi([
  'function setSubscriptionFees(uint64 priority, uint64 maxFee, uint64 gasLimit_)',
  'function openSubscription() returns (uint256)',
  'function owner() view returns (address)',
  'function activeSubscriptionId() view returns (uint256)',
  'function callbackGasLimit() view returns (uint32)',
  'function subscriptionHealth() view returns (uint256,uint256,uint256,bool,bool)',
  'function callbacksPerWindowX100() view returns (uint256)',
]);

const pub = createPublicClient({ chain: somniaTestnet, transport: http(RPC) });
const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC) });

// --- guard: the signer must be the owner, checked rather than assumed ---
const owner = await pub.readContract({ address: E, abi, functionName: 'owner' });
console.log('signer :', account.address);
console.log('owner  :', owner);
if (owner.toLowerCase() !== account.address.toLowerCase()) {
  console.log('ABORT: signer is not the owner. Nothing sent.');
  process.exit(1);
}
const bal = await pub.getBalance({ address: E });
console.log('engine balance:', formatEther(bal), 'STT  (floor for openSubscription is 32)');
if (bal < 32n * 10n**18n) { console.log('ABORT: below the 32 STT floor.'); process.exit(1); }

const send = async (label, fn, args) => {
  console.log(`\n--- ${label}`);
  const hash = await wallet.writeContract({ address: E, abi, functionName: fn, args, gas: 3_000_000n });
  console.log('  tx:', hash);
  const r = await pub.waitForTransactionReceipt({ hash });
  // waitForTransactionReceipt RESOLVES on a revert; the status is the thing that matters.
  console.log('  status:', r.status, '| block:', r.blockNumber.toString(), '| gasUsed:', r.gasUsed.toString());
  if (r.status !== 'success') { console.log('  ABORT: reverted.'); process.exit(1); }
  return r;
};

const step = process.argv[2];
if (step === 'fees' || step === 'both') {
  await send('setSubscriptionFees(1 gwei, 40 gwei, 4,000,000)', 'setSubscriptionFees',
             [1_000_000_000n, 40_000_000_000n, 4_000_000n]);
  console.log('  callbackGasLimit now:', String(await pub.readContract({address:E,abi,functionName:'callbackGasLimit'})));
}
if (step === 'open' || step === 'both') {
  const balAt = await pub.getBalance({ address: E });
  console.log('\nbalance at the moment of openSubscription:', formatEther(balAt), 'STT');
  await send('openSubscription()', 'openSubscription', []);
  const id = await pub.readContract({address:E,abi,functionName:'activeSubscriptionId'});
  console.log('  activeSubscriptionId:', id.toString());
}
const h = await pub.readContract({ address: E, abi, functionName: 'subscriptionHealth' });
const ratio = await pub.readContract({ address: E, abi, functionName: 'callbacksPerWindowX100' });
console.log('\n=== post-state ===');
console.log('  balance          :', formatEther(h[0]), 'STT');
console.log('  costPerCallback  :', formatEther(h[1]), 'STT');
console.log('  windowsRemaining :', h[2].toString(), `(at ${Number(ratio)/100} callbacks/window)`);
console.log('  subscribed       :', h[3]);
console.log('  stale            :', h[4]);
console.log('  callbackGasLimit :', String(await pub.readContract({address:E,abi,functionName:'callbackGasLimit'})));
