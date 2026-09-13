import { ADDR, SKIP_REASON, SKIP_MEANING } from "../lib/chain";
import { money, type ChainLog, type WalletRead } from "./chain-reader";
export type PendingNote={address:string;kind:string;title:string;body:string;data:Record<string,unknown>;dedupeKey:string;createdAt:string};
export function eventNote(log:ChainLog,createdAt:string,asset:string):PendingNote|null{
 const a=log.args;
 if(!("user" in a)||!a.user)return null;
 const base={address:a.user.toLowerCase(),createdAt,dedupeKey:`${log.address}:${log.transactionHash}:${log.logIndex}`,data:{tx:log.transactionHash,marketId:"marketId" in a?a.marketId:null,engine:log.address,block:String(log.blockNumber),href:"/app/cover"}};
 if(log.eventName==="CoverOpened"){
  const a=log.args;
  return {...base,kind:"cover_opened",title:"Cover bought",body:`Spent ${money(a.premium)} tUSDC for ${money(a.quantity)} Down contracts. Makes you whole at ${(a.achievedBps/100).toFixed(2)}% of a fall in ${asset}.`+(a.achievedBps<a.requestedBps?` Requested ${(a.requestedBps/100).toFixed(2)}%; available liquidity, policy or balance limits, drift, or lot rounding reduced the fill. The event does not identify which limit bound it.`:""),data:{...base.data,premium:String(a.premium),quantity:String(a.quantity),achievedBps:a.achievedBps,requestedBps:a.requestedBps}};
 }
 if(log.eventName==="CoverSkipped"){
  const reason=SKIP_REASON[log.args.reason]??`Unrecognised refusal code ${log.args.reason}`;
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
