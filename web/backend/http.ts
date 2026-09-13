import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
export function addressOf(value:unknown){
 if(typeof value!=="string"||!isAddress(value,{strict:false}))throw new ApiError(400,"A valid wallet address is required.");
 return value.toLowerCase() as `0x${string}`;
}
export function sameOrigin(req:NextRequest){
 if(req.headers.get("origin")!==new URL(req.url).origin)throw new ApiError(403,"This action must be requested from the Ballast page you signed in to.");
}
export async function bodyOf(req:NextRequest){
 if(!req.headers.get("content-type")?.startsWith("application/json"))throw new ApiError(415,"Send a JSON request.");
 // Limit the stream itself, not only an optional Content-Length header.
 const stream=req.body?.getReader(); if(!stream)throw new ApiError(400,"A JSON body is required.");
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await stream.read();if(done)break;size+=value.length;if(size>16384){await stream.cancel();throw new ApiError(413,"The request exceeds 16 KB.");}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new ApiError(400,"The request body is not valid JSON.");}
}
export function endpoint(handler:(req:NextRequest)=>Promise<NextResponse>){return async(req:NextRequest)=>{
 try{return await handler(req);}catch(e){return json({error:e instanceof ApiError?e.message:"The notification service could not reach its database or the testnet RPC. Please retry; your funds remain on chain."},e instanceof ApiError?e.status:503);}
};}
