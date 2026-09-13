import { ADDR, SKIP_REASON, SKIP_MEANING } from "../lib/chain";
import { money, type ChainLog, type WalletRead } from "./chain-reader";
export type PendingNote={address:string;kind:string;title:string;body:string;data:Record<string,unknown>;dedupeKey:string;createdAt:string};
function shortfall(a:Record<string,any>,policy:WalletRead["policy"]|undefined){
 if(!policy||Number(a.achievedBps)>=Number(a.requestedBps)||!a.achievedBps)return null;
 const one=1_000_000n,bps=10_000n,qty=BigInt(a.quantity),price=BigInt(a.coverPrice),premium=BigInt(a.premium);
 const exposure=qty*(one-price)*bps/(BigInt(a.achievedBps)*one);
 const premiumCeiling=exposure*BigInt(policy.maxPremiumBpsPerWindow)/bps;
 if(premiumCeiling>0n&&premium*1000n>=premiumCeiling*995n)return `Your premium ceiling of ${policy.maxPremiumBpsPerWindow} bps bound the fill.`;
 const notional=BigInt(policy.maxNotionalPerWindow);
 if(notional>0n&&premium*1000n>=notional*995n)return "Your notional cap bound the fill.";
 return "Liquidity or policy limits reduced the fill.";
}
export function eventNote(log:ChainLog,createdAt:string,asset:string,policy?:WalletRead["policy"]):PendingNote|null{
 const a=log.args;
 if(!("user" in a)||!a.user)return null;
 const base={address:a.user.toLowerCase(),createdAt,dedupeKey:`${log.address}:${log.transactionHash}:${log.logIndex}`,data:{tx:log.transactionHash,marketId:"marketId" in a?a.marketId:null,engine:log.address,block:String(log.blockNumber),href:"/app/cover"}};
 if(log.eventName==="CoverOpened"){
  const a=log.args;
  const bound=shortfall(a,policy);
  return {...base,kind:"cover_opened",title:"Cover bought",body:`Spent ${money(a.premium)} tUSDC for ${money(a.quantity)} Down contracts. Makes you whole at ${(a.achievedBps/100).toFixed(2)}% of a fall in ${asset}.`+(a.achievedBps<a.requestedBps?` Requested ${(a.requestedBps/100).toFixed(2)}%. ${bound??"Liquidity or policy limits reduced the fill."}`:""),data:{...base.data,premium:String(a.premium),quantity:String(a.quantity),achievedBps:a.achievedBps,requestedBps:a.requestedBps}};
 }
 if(log.eventName==="CoverSkipped"){
  const reason=SKIP_REASON[log.args.reason]??`Unrecognised refusal code ${log.args.reason}`;
  // A broad engine subscription sees every asset. "No exposure" is expected for assets a
  // holder does not own and conveys no action, so it never belongs in their notification bell.
  if(reason==="No exposure")return null;
  return {...base,kind:"cover_declined",title:"Window declined",body:`${asset}: ${reason}. ${SKIP_MEANING[reason]??"The engine recorded this refusal on chain."}`,data:{...base.data,reason:log.args.reason,href:"/app/activity"}};
 }
 if(log.eventName==="CoverSettled"){
  const a=log.args;
  if(a.outcome===1)return {...base,kind:"cover_settled_won",title:"Window paid out",body:`${asset} closed below the strike. ${money(a.proceeds)} tUSDC credited to your vault.`};
  if(a.outcome===2)return {...base,kind:"cover_settled_lost",title:"Window closed up",body:`${asset} did not fall. Premium of ${money(a.premium)} tUSDC spent.`};
  if(a.outcome===3)return {...base,kind:"cover_settled_voided",title:"Window voided",body:`The ${asset} window was voided. ${money(a.proceeds)} tUSDC credited to your vault.`};
 }
 return null;
}
export function vaultNote(current:WalletRead,previous:WalletRead|undefined):PendingNote|null{
 const state=current.vaultEmpty?"vault_empty":current.vaultLow?"vault_low":null;
 const old=previous?.vaultEmpty?"vault_empty":previous?.vaultLow?"vault_low":null;
 if(!state||state===old)return null;
 return {address:current.address,kind:state,title:state==="vault_empty"?"Vault empty":"Vault running low",
  body:state==="vault_empty"?"No tUSDC free. Ballast will not buy cover until you deposit.":`${money(current.free)} tUSDC free — about ${current.windowsRemaining} windows left at the current estimated premium. Deposit more to stay covered.`,
  data:{href:"/app/funds",estimatedPremium:current.estimatedPremium,suggestedDeposit:current.suggestedDeposit,estimateReason:current.estimateReason},
  dedupeKey:`${state}:${current.blockNumber}`,createdAt:current.observedAt};
}
export function engineNote(address:string,state:"engine_low"|"engine_stopped",block:string,createdAt:string,hours:number|null):PendingNote{
 return {address,kind:state,title:state==="engine_stopped"?"Engine stopped":"Engine runway low",
  body:state==="engine_stopped"?`Below the 32 STT scheduling floor. Send STT to ${ADDR.engine} to restore scheduling. If the subscription has closed, its owner must reopen it.`:`About ${hours?.toFixed(1)} hours until the 32 STT scheduling floor at the observed burn rate. Send STT to ${ADDR.engine} to keep the engine running.`,
  data:{href:"/app/engine",engine:ADDR.engine,hoursRemaining:hours},dedupeKey:`${state}:${block}`,createdAt};
}
