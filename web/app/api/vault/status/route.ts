import { requireAddress } from "@/backend/auth";
import { endpoint,json,ApiError } from "@/backend/http";
import { head,engineAt,booksAt,walletAt } from "@/backend/chain-reader";
export const runtime="nodejs";
export const maxDuration=60;
export const GET=endpoint(async req=>{
 const address=await requireAddress(req),block=await head();
 if(Date.now()/1000-Number(block.timestamp)>90)throw new ApiError(503,"The chain head is more than 90 seconds old. Current vault status is unavailable.");
 const [engine,books]=await Promise.all([engineAt(block.number),booksAt(block.number,Number(block.timestamp))]);
 return json(await walletAt(address,block.number,Number(block.timestamp),engine,books));
});
