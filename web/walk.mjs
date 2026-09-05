import { createPublicClient, createWalletClient, http, parseAbi, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaTestnet } from 'viem/chains';
import fs from 'node:fs';

const RPC='https://dream-rpc.somnia.network/';
const HOME=process.env.HOME;
const COLD_KEY = fs.readFileSync(`${HOME}/.ballast-coldwalk/key`,'utf8').trim();
const DEP_KEY = fs.readFileSync('../.env','utf8').split('\n').find(l=>l.startsWith('PRIVATE_KEY=')).split('=')[1].trim().replace(/^['"]|['"]$/g,'');

const A={tusdc:'0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',vault:'0x9BC43B97c94E23634A561a02EFce641C9e89fe63',engine:'0x9026b93dc240244A34B3568aF704a60f4703a115'};
const erc20=parseAbi(['function approve(address,uint256) returns (bool)','function faucet(uint256)','function mint(address,uint256)','function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)']);
const vaultAbi=parseAbi(['function deposit(uint256)','function withdraw(uint256)','function revoke()','function setPolicy(uint16,uint16,uint256,uint64)','function collateralOf(address) view returns (uint256)','function freeBalanceOf(address) view returns (uint256)','function policyOf(address) view returns (bool,uint16,uint16,uint64,uint256)']);
const engineAbi=parseAbi(['function enrol()','function withdrawEnrolment()','function isEnrolled(address) view returns (bool)']);

const CURRENT={faucet:2_800_000,mint:2_800_000,approve:2_800_000,deposit:3_200_000,setPolicy:3_500_000,enrol:2_800_000,revoke:2_200_000,withdraw:2_000_000};

const pub=createPublicClient({chain:somniaTestnet,transport:http(RPC)});
const cold=privateKeyToAccount(COLD_KEY);
const dep=privateKeyToAccount(DEP_KEY);
const cw=createWalletClient({account:cold,chain:somniaTestnet,transport:http(RPC)});
const dw=createWalletClient({account:dep,chain:somniaTestnet,transport:http(RPC)});
console.log('cold wallet:', cold.address);

// --- fund from the DEPLOYER, not the engine ---
let bal = await pub.getBalance({address:cold.address});
if (bal < parseEther('0.05')) {
  const h = await dw.sendTransaction({to:cold.address, value:parseEther('0.25')});
  const r = await pub.waitForTransactionReceipt({hash:h});
  if (r.status!=='success'){console.log('funding failed');process.exit(1);}
  console.log('funded 0.25 STT from deployer:', h);
}
bal = await pub.getBalance({address:cold.address});
console.log('cold wallet STT:', formatEther(bal), '\n');

const results=[];
const run = async (name, to, abi, fn, args, opts={}) => {
  let est;
  try { est = await pub.estimateContractGas({address:to,abi,functionName:fn,args,account:cold.address,...opts}); }
  catch(e){ console.log(`${name.padEnd(10)} ESTIMATE FAILED: ${String(e.shortMessage||e.message).slice(0,60)}`); return null; }
  const hash = await cw.writeContract({address:to,abi,functionName:fn,args,gas:BigInt(CURRENT[name]),...opts});
  const r = await pub.waitForTransactionReceipt({hash});
  const sent = await pub.getTransaction({hash});
  const oog = r.gasUsed >= sent.gas;
  const ok = r.status==='success';
  results.push({name, est:Number(est), used:Number(r.gasUsed), limit:CURRENT[name], ok, oog});
  console.log(`${name.padEnd(10)} est ${Number(est).toLocaleString('en-GB').padStart(9)} | used ${Number(r.gasUsed).toLocaleString('en-GB').padStart(9)} | limit ${CURRENT[name].toLocaleString('en-GB').padStart(9)} | ${ok?'ok':(oog?'OUT OF GAS':'reverted')}`);
  if(!ok) process.exit(1);
  return r;
};

console.log('op'.padEnd(10),'  estimate','      used','     limit','  result');
await run('faucet',   A.tusdc,  erc20,    'faucet',   [10_000_000_000n]);
await run('mint',     A.tusdc,  erc20,    'mint',     [cold.address, 1_000_000_000n]);
await run('approve',  A.tusdc,  erc20,    'approve',  [A.vault, 1_000_000_000_000n]);
await run('deposit',  A.vault,  vaultAbi, 'deposit',  [1_000_000_000n]);
await run('setPolicy',A.vault,  vaultAbi, 'setPolicy',[250, 300, 2_000_000_000n, BigInt(Math.floor(Date.now()/1000)+86400*30)]);
await run('enrol',    A.engine, engineAbi,'enrol',    []);
console.log('\n--- unwinding: the engine is live, so this wallet must not stay enrolled ---');
await run('revoke',   A.vault,  vaultAbi, 'revoke',   []);
const free = await pub.readContract({address:A.vault,abi:vaultAbi,functionName:'freeBalanceOf',args:[cold.address]});
await run('withdraw', A.vault,  vaultAbi, 'withdraw', [free]);

console.log('\n=== final state of the cold wallet ===');
console.log('  enrolled  :', await pub.readContract({address:A.engine,abi:engineAbi,functionName:'isEnrolled',args:[cold.address]}));
console.log('  policy    :', (await pub.readContract({address:A.vault,abi:vaultAbi,functionName:'policyOf',args:[cold.address]}))[0]);
console.log('  collateral:', Number(await pub.readContract({address:A.vault,abi:vaultAbi,functionName:'collateralOf',args:[cold.address]}))/1e6, 'tUSDC');

console.log('\n=== limits vs cold measurement ===');
let bad=0;
for (const r of results) {
  const need = r.used*2, ok = r.limit >= need;
  if(!ok) bad++;
  console.log(`  ${r.name.padEnd(10)} used ${r.used.toLocaleString('en-GB').padStart(9)} | 2x = ${need.toLocaleString('en-GB').padStart(9)} | limit ${r.limit.toLocaleString('en-GB').padStart(9)} | ${(r.limit/r.used).toFixed(2)}x ${ok?'ok':'*** BELOW 2x ***'}`);
}
console.log(bad? `  ${bad} limit(s) below 2x cold` : '  every limit clears 2x its cold cost');
