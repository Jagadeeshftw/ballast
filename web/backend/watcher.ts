import { formatEther, type Address, type Hex } from "viem";
import { ADDR } from "../lib/chain";
import { db,closeDb } from "./db";
import { reader,head,engineAt,booksAt,walletAt,logsBetween,at,keyFor,type WalletRead } from "./chain-reader";
import { eventNote,vaultNote,engineNote,type PendingNote } from "./notification-copy";

type Sample={from:number;to:number;wei:string;callbacks:number;valid:boolean};
type State={wallets:Record<string,WalletRead>;samples:Sample[];engineAlert:string|null;observedAt:number;balance:string;callbackCount:string;lastEvents:Record<string,PendingNote[]>;vaultAlerts?:Record<string,string|null>};
let stage="starting";
const engineAddress=ADDR.engine.toLowerCase();
export function runway(balance:bigint,samples:Sample[]){
 const good=samples.filter(x=>x.valid&&x.to>x.from),seconds=good.reduce((s,x)=>s+x.to-x.from,0);
 const spent=good.reduce((s,x)=>s+BigInt(x.wei),0n),callbacks=good.reduce((s,x)=>s+x.callbacks,0);
 const rate=seconds>=60&&spent>0n?Number(formatEther(spent))*3600/seconds:null;
 return {callbacksPerHour:seconds>=60?callbacks*3600/seconds:null,burnSttPerHour:rate,
  hoursRemaining:rate===null?null:Math.max(0,Number(formatEther(balance))-32)/rate,sampleSeconds:seconds};
}
export async function pollOnce(){
 stage="database-connection";
 const sql=db();
 // A connection-level lock keeps two worker instances from polling concurrently.
 const lease=await sql.reserve();
 let holdsLock=false;
 try{
  const lock=await lease`SELECT pg_try_advisory_lock(50312, 7241) AS locked`;
  if(!lock[0].locked)return;
  holdsLock=true;
  try{
   const stored=await lease`SELECT * FROM watcher_state WHERE engine_address=${engineAddress}`;
   const prior=stored[0],previous=prior?.data as State|undefined;
   stage="chain-head";
   const block=await head();
   if(Date.now()/1000-Number(block.timestamp)>90)throw new Error("CHAIN_STALE");
   if(prior){
    const checkpoint=await reader.getBlock({blockNumber:BigInt(prior.checkpoint)});
    if(checkpoint.hash!==prior.block_hash)throw new Error("CHECKPOINT_REORG");
    if(block.number<=BigInt(prior.checkpoint))return;
   }
   const from=prior?BigInt(prior.checkpoint)+1n:block.number-989n;
   // Catch up in bounded batches; never skip a gap after downtime.
   const through=block.number-from>9899n?from+9899n:block.number;
   const scanBlock=through===block.number?block:await reader.getBlock({blockNumber:through});
   const now=Number(scanBlock.timestamp),observedAt=new Date(now*1000).toISOString();
   stage="event-scan";
   const logs=await logsBetween(from,through);
   stage="engine-and-books";
   const [engine,books,registered]=await Promise.all([engineAt(through),booksAt(through,now),lease`SELECT address FROM wallets`]);
   const addresses=[...new Set([...engine.enrolled.map(x=>x.toLowerCase()),...registered.map(x=>x.address as string),...logs.flatMap(l=>"user" in l.args&&l.args.user?[l.args.user.toLowerCase()]:[])])];
   const wallets:Record<string,WalletRead>={},notes:PendingNote[]=[],vaultAlerts:Record<string,string|null>={...previous?.vaultAlerts};
   stage="wallet-snapshots";
   for(const address of addresses){
    const current=await walletAt(address as Address,through,now,engine,books);
    // Preserve an already-fired low alert across an unpriceable book, but never publish its old estimate as current.
    wallets[address]=current;
    const old=vaultAlerts[address];
    const comparison=old ? {...current,vaultLow:old==="vault_low",vaultEmpty:old==="vault_empty"} : undefined;
    const note=vaultNote(current,comparison);if(note)notes.push(note);
    if(current.vaultEmpty)vaultAlerts[address]="vault_empty";
    else if(current.estimatedPremium!==null||!current.policy.active||Number(current.policy.expiry)<=now)vaultAlerts[address]=current.vaultLow?"vault_low":null;
   }
   const blockTimes=new Map<string,string>();
   const assetNames=new Map<string,string>();
   const lastEvents={...previous?.lastEvents};
   stage="event-details";
   for(const log of logs){
    if(!("user" in log.args))continue;
    const b=String(log.blockNumber);
    if(!blockTimes.has(b)){const header=await reader.getBlock({blockNumber:log.blockNumber!});blockTimes.set(b,new Date(Number(header.timestamp)*1000).toISOString());}
    const key=`${log.address}:${log.args.marketId}`;
    if(!assetNames.has(key)){
     const assetKey=await at(through)(log.address,"assetKeyOf",[log.args.marketId]);
     assetNames.set(key,assetKey===keyFor("ETH")?"ETH":assetKey===keyFor("BTC")?"BTC":"the underlying asset");
    }
    const note=eventNote(log,blockTimes.get(b)!,assetNames.get(key)!);
    if(note){notes.push(note);lastEvents[note.address]=[...(lastEvents[note.address]??[]),note].slice(-10);}
   }
   // Balance deltas capture every charge (including failed callbacks). Any top-up or withdrawal
   // makes that interval unusable. Compare with successful receipt costs to detect masked funding.
   const hashes=[...new Set(logs.filter(l=>l.address.toLowerCase()===engineAddress).map(l=>l.transactionHash!))];
   let receiptCost=0n,nonCallback=false;
   stage="receipt-charges";
   for(const hash of hashes){
    const [receipt,tx]=await Promise.all([reader.getTransactionReceipt({hash}),reader.getTransaction({hash})]);
    if(tx.from.toLowerCase()===engineAddress&&tx.to?.toLowerCase()===engineAddress)receiptCost+=receipt.gasUsed*receipt.effectiveGasPrice;
    else nonCallback=true;
   }
   const delta=previous?BigInt(previous.balance)-BigInt(engine.balance):0n;
   const callbacks=previous?Number(BigInt(engine.callbackCount)-BigInt(previous.callbackCount)):0;
   const sample:Sample={from:previous?.observedAt??now,to:now,wei:delta>0n?String(delta):"0",callbacks,
    valid:!!previous&&delta===receiptCost&&delta>=0n&&callbacks>=0&&!nonCallback};
   const samples=[...(previous?.samples??[]),sample].filter(x=>x.from>=now-3600);
   const measured=runway(BigInt(engine.balance),samples);
   const alert=BigInt(engine.balance)<32n*10n**18n?"engine_stopped":measured.hoursRemaining!==null&&measured.hoursRemaining<8?"engine_low":null;
   for(const address of addresses)if(alert&&(alert!==previous?.engineAlert||!previous?.wallets[address]))notes.push(engineNote(address,alert,String(through),observedAt,measured.hoursRemaining));
   const finalHeader=await reader.getBlock({blockNumber:through});if(finalHeader.hash!==scanBlock.hash)throw new Error("BLOCK_CHANGED");
   const data={wallets,samples,engineAlert:alert,observedAt:now,balance:engine.balance,callbackCount:engine.callbackCount,lastEvents,vaultAlerts};
   stage="database-commit";
   await sql.begin(async tx=>{
    for(const address of addresses)await tx`INSERT INTO wallets(address) VALUES(${address}) ON CONFLICT DO NOTHING`;
    for(const n of notes)await tx`INSERT INTO notifications(address,kind,title,body,data,dedupe_key,created_at) VALUES(${n.address},${n.kind},${n.title},${n.body},${tx.json(n.data as never)},${n.dedupeKey},${n.createdAt}) ON CONFLICT(address,dedupe_key) DO NOTHING`;
    await tx`INSERT INTO engine_snapshots(engine_address,balance_stt,callbacks_per_hour,hours_remaining,data) VALUES(${engineAddress},${formatEther(BigInt(engine.balance))},${measured.callbacksPerHour},${measured.hoursRemaining},${tx.json({...engine,...measured,observedAt,blockNumber:String(through),runwayBasis:"Observed callback receipt charges matched exactly to balance decreases, excluding unmatched intervals; hours until the 32 STT scheduling floor. Future callback load can differ."} as never)})`;
    await tx`INSERT INTO watcher_state(engine_address,checkpoint,block_hash,data) VALUES(${engineAddress},${String(through)},${scanBlock.hash},${tx.json(data as never)}) ON CONFLICT(engine_address) DO UPDATE SET checkpoint=excluded.checkpoint,block_hash=excluded.block_hash,data=excluded.data,updated_at=now()`;
    await tx`DELETE FROM sessions WHERE expires_at<now()`;
    await tx`DELETE FROM auth_challenges WHERE expires_at<now()-interval '1 hour'`;
    await tx`DELETE FROM engine_snapshots WHERE snapshot_at<now()-interval '7 days'`;
   });
   console.log(JSON.stringify({at:new Date().toISOString(),block:String(through),wallets:addresses.length,events:logs.length,notifications:notes.length,catchingUp:through<block.number}));
  }finally{
   if(holdsLock) await lease`SELECT pg_advisory_unlock(50312,7241)`;
  }
 }finally{lease.release();}
}
async function main(){
 let stop=false;process.on("SIGTERM",()=>{stop=true;});process.on("SIGINT",()=>{stop=true;});
 do{
  const started=Date.now();
  try{await pollOnce();}catch(e){
   const code=e instanceof Error&&["CHAIN_STALE","CHECKPOINT_REORG","BLOCK_CHANGED"].includes(e.message)?e.message:"WATCHER_READ_OR_DATABASE_FAILED";
   console.error(JSON.stringify({at:new Date().toISOString(),error:code,stage,type:e instanceof Error?e.name:"unknown",databaseCode: typeof (e as {code?:unknown})?.code==="string"&&/^[A-Z0-9_]{1,40}$/.test((e as {code:string}).code)?(e as {code:string}).code:undefined,checkpoint:"unchanged"}));
   if(process.argv.includes("--once")){process.exitCode=1;break;}
  }
  if(process.argv.includes("--once"))break;
  const until=started+30000;while(!stop&&Date.now()<until)await new Promise(r=>setTimeout(r,Math.min(1000,until-Date.now())));
 }while(!stop);
 await closeDb();
}
if(process.argv[1]?.endsWith("watcher.ts"))void main();
