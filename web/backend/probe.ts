import { head, engineAt, booksAt, walletAt, logsBetween, reader } from "./chain-reader";
import { formatEther } from "viem";
async function main(){
 const block=await head();
 const engine=await engineAt(block.number);
 const books=await booksAt(block.number,Number(block.timestamp));
 const logs=await logsBetween(block.number-989n,block.number);
 const wallets=[];
 for(const address of engine.enrolled)wallets.push({...await walletAt(address,block.number,Number(block.timestamp),engine,books),lastEvents:logs.filter(l=>"user" in l.args&&l.args.user?.toLowerCase()===address.toLowerCase()).slice(-10).map(l=>({name:l.eventName,block:String(l.blockNumber),tx:l.transactionHash,args:l.args}))});
 const after=await reader.getBlock({blockNumber:block.number});
 if(after.hash!==block.hash)throw new Error("Block changed during probe");
 console.log(JSON.stringify({mode:"read-only probe; database not connected",block:String(block.number),time:new Date(Number(block.timestamp)*1000).toISOString(),engine:{...engine,balanceStt:formatEther(BigInt(engine.balance))},priceableBooks:books.length,eventsIn990Blocks:logs.length,wallets},(_,v)=>typeof v==="bigint"?v.toString():v,2));
}
main().catch(()=>{console.error("Chain probe failed; no state or checkpoint written. Check the Somnia RPC.");process.exitCode=1;});
