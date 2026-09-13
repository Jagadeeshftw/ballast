import { createPublicClient, http, parseAbi, keccak256, stringToBytes, formatUnits, type Address, type Hex } from "viem";
import { ADDR, RPC, RETIRED_ENGINES } from "../lib/chain";

// No wallet client, account, signer or environment-file loader in this module.
export const reader = createPublicClient({ transport: http(RPC, { timeout: 15000, retryCount: 1 }) });
export const views = parseAbi([
 "function enrolledCount() view returns (uint256)", "function enrolled(uint256) view returns (address)",
 "function callbackCount() view returns (uint256)", "function canSchedule() view returns (bool)",
 "function activeSubscriptionId() view returns (uint256)", "function lastCallbackAt() view returns (uint64)",
 "function exposureSource() view returns (address)", "function pendingCount() view returns (uint256)",
 "function pendingList(uint256) view returns (bytes32)", "function assetKeyOf(bytes32) view returns (bytes32)",
 "function openPriceOf(bytes32) view returns (uint256)", "function maxCoverPriceBps() view returns (uint256)",
 "function freeBalanceOf(address) view returns (uint256)", "function collateralOf(address) view returns (uint256)",
 "function reservedOf(address) view returns (uint256)", "function isCoverable(address) view returns (bool)",
 "function policyOf(address) view returns (bool active,uint16 makeWholeBps,uint16 maxPremiumBpsPerWindow,uint64 expiry,uint256 maxNotionalPerWindow)",
 "function configOf(bytes32) view returns (address token,address pool,uint8 tokenDecimals,uint16 maxSpreadBps,bool enabled)",
 "function priceOf(bytes32) view returns (uint256 price,bool ok)",
 "function COLLATERAL_ONE() view returns (uint256)", "function QUOTE_ONE() view returns (uint256)",
 "function balanceOf(address) view returns (uint256)",
 "function getWithdrawableBalance(address,address) view returns (uint256)",
 "function markets(bytes32) view returns ((uint256 oracleQuestionId,uint8 outcomeSlotCount,uint8 voidPolicy,address collateral,uint32 originOperatorId,bytes32 originVenueId,address oracleAdapter,address creator,address market,address pool,uint256 yesId,uint256 noId,uint64 tradingStart,uint64 expiry))",
 "function getBookLevels(bool,uint64) view returns ((uint256 price,uint256 quantity)[])",
 "function getOrderBookParameters() view returns ((uint256 tickSize,uint256 minQuantity,uint256 lotSize))",
]);
export const events = parseAbi([
 "event CoverOpened(address indexed user,bytes32 indexed marketId,uint256 quantity,uint256 premium,uint256 coverPrice,uint16 requestedBps,uint16 achievedBps,bool degraded)",
 "event CoverSkipped(address indexed user,bytes32 indexed marketId,uint8 reason)",
 "event CoverSettled(address indexed user,bytes32 indexed marketId,uint8 outcome,uint256 quantity,uint256 premium,uint256 proceeds)",
 "event CallbackRan(bytes32 indexed marketId,uint256 scanned,uint256 covered,uint256 cursorAfter)",
 "event WindowEnqueued(bytes32 indexed marketId,bytes32 assetKey,uint256 openPrice,uint64 firstAttemptAt)",
 "event ToppedUp(address indexed from,uint256 amount,uint256 balance)",
 "event TickScheduled(uint256 timestampMillis,uint256 pendingWindows)",
 "event WindowGaveUp(bytes32 indexed marketId,uint8 attempts)",
]);
const subscriptionAbi = parseAbi([
 "function getSubscriptionInfo(uint256) view returns ((bytes32[4] eventTopics,address origin,address caller,address emitter,address handlerContractAddress,bytes4 handlerFunctionSelector,uint64 priorityFeePerGas,uint64 maxFeePerGas,uint64 gasLimit,bool isGuaranteed,bool isCoalesced),address)",
]);
export const money = (raw: bigint | string) => formatUnits(BigInt(raw), 6);
export const keyFor = (asset: string) => keccak256(stringToBytes(asset));
export function at(blockNumber: bigint) {
 return <N extends typeof views[number]["name"]>(address: Address, functionName: N, args?: readonly unknown[]) =>
  reader.readContract({ address, abi: views, functionName, args, blockNumber } as never) as Promise<any>; // ABI names restricted; tuple returns checked at their call sites.
}
export async function head() {
 // Keep notifications behind the moving tip. Checkpoint hash is verified before advancing.
 const tip = await reader.getBlockNumber({ cacheTime: 0 });
 return reader.getBlock({ blockNumber: tip > 10n ? tip - 10n : tip });
}
export async function engineAt(blockNumber: bigint) {
 const read = at(blockNumber);
 const [count, balance, callbacks, canSchedule, subId, lastCallbackAt, source, maxPrice] = await Promise.all([
  read(ADDR.engine,"enrolledCount"), reader.getBalance({address:ADDR.engine,blockNumber}),
  read(ADDR.engine,"callbackCount"), read(ADDR.engine,"canSchedule"), read(ADDR.engine,"activeSubscriptionId"),
  read(ADDR.engine,"lastCallbackAt"), read(ADDR.engine,"exposureSource"), read(ADDR.engine,"maxCoverPriceBps"),
 ]);
 const enrolled: Address[] = [];
 for (let i=0n;i<count;i+=20n) {
  enrolled.push(...await Promise.all(Array.from({length:Number(count-i>20n?20n:count-i)},(_,j)=>read(ADDR.engine,"enrolled",[i+BigInt(j)]))));
 }
 // Measured on Shannon: getSubscriptionInfo reverts at historical blocks but succeeds
 // at latest. This one field is explicitly observed at poll time, not the snapshot block.
 let subscription: "verified"|"closed"|"unknown" = subId===0n ? "closed" : "unknown";
 if (subId!==0n) {
  try {
   const info = await reader.readContract({address:"0x0000000000000000000000000000000000000100",abi:subscriptionAbi,functionName:"getSubscriptionInfo",args:[subId]});
   if(info[1].toLowerCase()===ADDR.engine.toLowerCase()) subscription="verified";
  } catch { /* A revert is ambiguous, never evidence of a live subscription. */ }
 }
 return { enrolled, balance:balance.toString(), callbackCount:String(callbacks), canSchedule:Boolean(canSchedule), subscription,
  subscriptionObservedAt:new Date().toISOString(), subscriptionId:String(subId), lastCallbackAt:Number(lastCallbackAt), source:source as Address, maxPrice:String(maxPrice) };
}
export type EngineRead = Awaited<ReturnType<typeof engineAt>>;
export async function booksAt(blockNumber:bigint, now:number) {
 const read=at(blockNumber), count:bigint=await read(ADDR.engine,"pendingCount");
 const ids:Hex[]=await Promise.all(Array.from({length:Number(count>24n?24n:count)},(_,i)=>read(ADDR.engine,"pendingList",[count-1n-BigInt(i)])));
 const books=await Promise.all(ids.map(async marketId=>{
  try {
   const [row,key,open]:[any,Hex,bigint]=await Promise.all([read(ADDR.binaryModule,"markets",[marketId]),read(ADDR.engine,"assetKeyOf",[marketId]),read(ADDR.engine,"openPriceOf",[marketId])]);
   if (Number(row.tradingStart)>now || Number(row.expiry)<=now || open===0n) return null;
   const [bids,params]=await Promise.all([read(row.pool,"getBookLevels",[true,1n]),read(row.pool,"getOrderBookParameters")]);
   if(!bids.length||bids[0].price<=0n||bids[0].price>=1_000_000n||bids[0].quantity<=0n) return null;
   return {marketId,key,open,upBid:bids[0].price as bigint,quantity:bids[0].quantity as bigint,lot:params.lotSize as bigint,min:params.minQuantity as bigint};
  }catch{return null;}
 }));
 return books.filter(x=>x!==null);
}
export type Books = Awaited<ReturnType<typeof booksAt>>;
export function estimatedPremium(exposure:bigint, spot:bigint, policy:readonly [boolean,number,number,bigint,bigint], book:Books[number], maxPrice:bigint) {
 const one=1_000_000n, q=one-book.upBid;
 if(spot<=0n||q*10000n>maxPrice*one) return null;
 const atOpen=exposure*book.open/spot;
 let premium=atOpen*BigInt(policy[1])*q/(10000n*book.upBid);
 const ceiling=atOpen*BigInt(policy[2])/10000n;
 premium=premium<ceiling?premium:ceiling;
 premium=premium<policy[4]?premium:policy[4];
 let qty=premium*one/q;
 qty=qty<book.quantity?qty:book.quantity;
 if(book.lot>0n)qty=qty/book.lot*book.lot;
 if(qty<book.min||qty===0n)return null;
 // Deliberately exclude free balance: clamping to an almost empty vault hides low funds.
 const result=qty*q/one;
 return result>0n?result:null;
}
export async function walletAt(address:Address,blockNumber:bigint,now:number,engine:EngineRead,books:Books) {
 const read=at(blockNumber);
 const [free,collateral,reserved,isCoverable,policy,collateralOne,quoteOne]=await Promise.all([
  read(ADDR.vault,"freeBalanceOf",[address]),read(ADDR.vault,"collateralOf",[address]),read(ADDR.vault,"reservedOf",[address]),
  read(ADDR.vault,"isCoverable",[address]),read(ADDR.vault,"policyOf",[address]),read(engine.source,"COLLATERAL_ONE"),read(engine.source,"QUOTE_ONE"),
 ]);
 const exposure=await Promise.all(["ETH","BTC"].map(async asset=>{
  const key=keyFor(asset);
  try {
   const [cfg,price]=await Promise.all([read(engine.source,"configOf",[key]),read(engine.source,"priceOf",[key])]);
   if(!cfg[4]||!price[1])return {asset,raw:null,price:null,reason:"The exposure source cannot price this asset's spot book."};
   const [held,claimable]=await Promise.all([read(cfg[0],"balanceOf",[address]),read(cfg[1],"getWithdrawableBalance",[address,cfg[0]])]);
   return {asset,raw:((BigInt(held)+BigInt(claimable))*BigInt(price[0])*BigInt(collateralOne)/(BigInt(quoteOne)*10n**BigInt(cfg[2]))).toString(),price:String(price[0]),reason:null};
  }catch{return {asset,raw:null,price:null,reason:"The spot holdings or price could not be read."};}
 }));
 const premiums=books.flatMap(book=>{
  const exp=exposure.find(e=>keyFor(e.asset)===book.key);
  if(!exp?.raw||!exp.price)return [];
  const value=estimatedPremium(BigInt(exp.raw),BigInt(exp.price),policy,book,BigInt(engine.maxPrice));
  return value===null?[]:[{raw:value,marketId:book.marketId,asset:exp.asset}];
 });
 const estimate=premiums.sort((a,b)=>a.raw>b.raw?-1:a.raw<b.raw?1:0)[0];
 const active=policy[0]&&Number(policy[3])>now;
 const low=active&&!!estimate&&free<estimate.raw*2n;
 return {address:address.toLowerCase(),blockNumber:String(blockNumber),observedAt:new Date(now*1000).toISOString(),
  free:String(free),collateral:String(collateral),reserved:String(reserved),isCoverable:Boolean(isCoverable),
  enrolled:engine.enrolled.some(a=>a.toLowerCase()===address.toLowerCase()),
  policy:{active:policy[0],makeWholeBps:policy[1],maxPremiumBpsPerWindow:policy[2],expiry:String(policy[3]),maxNotionalPerWindow:String(policy[4])},exposure,
  estimatedPremium:estimate?String(estimate.raw):null,estimateMarketId:estimate?.marketId??null,
  estimateReason:estimate?`Estimate from the largest current ${estimate.asset} quote among up to 24 pending windows, before the free-balance limit. Future books can differ.`:"No priceable pending window with measured exposure; premium and windows remaining are unknown.",
  windowsRemaining:estimate?Number(free*100n/estimate.raw)/100:null,
  suggestedDeposit:estimate?String(estimate.raw*10n):null,vaultLow:low,vaultEmpty:free===0n&&active,
 };
}
export type WalletRead=Awaited<ReturnType<typeof walletAt>>;
export async function logsBetween(fromBlock:bigint,toBlock:bigint){
 const logs=[];
 for(let from=fromBlock;from<=toBlock;from+=990n){
  const to=from+989n<toBlock?from+989n:toBlock;
  logs.push(...await reader.getLogs({address:[ADDR.engine,...RETIRED_ENGINES],events,fromBlock:from,toBlock:to,strict:true}));
 }
 return logs.sort((a,b)=>Number(a.blockNumber!-b.blockNumber!)||a.logIndex!-b.logIndex!);
}
export type ChainLog=Awaited<ReturnType<typeof logsBetween>>[number];
