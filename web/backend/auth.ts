import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { verifyMessage } from "viem";
import { db } from "./db";
import { ApiError, addressOf, bodyOf, json, sameOrigin } from "./http";
import { CHAIN_ID } from "../lib/chain";
export const hash=(token:string)=>createHash("sha256").update(token).digest("hex");
const secure=process.env.NODE_ENV==="production";
const SESSION=secure?"__Host-ballast-session":"ballast-session";
const CHALLENGE=secure?"__Host-ballast-challenge":"ballast-challenge";
const cookieOptions={httpOnly:true,secure,sameSite:"strict" as const,path:"/"};
export async function session(req:NextRequest){
 const token=req.cookies.get(SESSION)?.value;
 if(!token||!/^\w{64}$/.test(token))return null;
 const rows=await db()`SELECT address FROM sessions WHERE token_hash=${hash(token)} AND expires_at>now()`;
 return rows[0]?.address as string|undefined??null;
}
export async function requireSession(req:NextRequest){const who=await session(req);if(!who)throw new ApiError(401,"Sign a wallet message to read your notifications.");return who;}
export async function requireAddress(req:NextRequest){const address=addressOf(req.nextUrl.searchParams.get("address"));if(await requireSession(req)!==address)throw new ApiError(403,"This session belongs to a different wallet. Sign in with the connected account.");return address;}
export async function challenge(req:NextRequest){
 sameOrigin(req);const address=addressOf((await bodyOf(req))?.address),sql=db();
 const recent=await sql`SELECT count(*)::int AS n FROM auth_challenges WHERE address=${address} AND expires_at>now()-interval '1 minute'`;
 if(recent[0].n>=10)throw new ApiError(429,"Too many sign-in requests for this wallet. Wait a few minutes and retry.");
 const token=randomBytes(32).toString("hex"),now=new Date(),expires=new Date(now.getTime()+5*60*1000);
 const url=new URL(req.url);
 const message=createSiweMessage({address,chainId:CHAIN_ID,domain:url.host,uri:url.origin,version:"1",nonce:randomBytes(16).toString("hex"),issuedAt:now,expirationTime:expires,statement:"Sign in to Ballast notifications. This does not authorize transactions or access to funds."});
 await sql`INSERT INTO auth_challenges(token_hash,address,message,expires_at) VALUES(${hash(token)},${address},${message},${expires})`;
 const res=json({message});res.cookies.set(CHALLENGE,token,{...cookieOptions,maxAge:300});return res;
}
export async function signIn(req:NextRequest){
 sameOrigin(req);const body=await bodyOf(req),address=addressOf(body?.address);
 if(typeof body?.signature!=="string"||!/^0x[0-9a-fA-F]{130}$/.test(body.signature))throw new ApiError(400,"A valid wallet message signature is required.");
 const token=req.cookies.get(CHALLENGE)?.value;
 if(!token)throw new ApiError(401,"The sign-in challenge expired. Request a fresh message.");
 const sql=db();
 // Consume once, including failed attempts. A captured signature cannot create another session.
 const rows=await sql`DELETE FROM auth_challenges WHERE token_hash=${hash(token)} AND address=${address} AND expires_at>now() RETURNING message`;
 if(!rows.length)throw new ApiError(401,"This sign-in message expired or was already used.");
 const parsed=parseSiweMessage(rows[0].message),url=new URL(req.url);
 if(parsed.uri!==url.origin||parsed.chainId!==CHAIN_ID||!validateSiweMessage({message:parsed,address,domain:url.host}))throw new ApiError(401,"This sign-in message belongs to another site or chain, or has expired.");
 if(!await verifyMessage({address,message:rows[0].message,signature:body.signature}))throw new ApiError(401,"The signature does not match this wallet.");
 const sessionToken=randomBytes(32).toString("hex");
 await sql.begin(async tx=>{
  await tx`INSERT INTO wallets(address,last_seen_at) VALUES(${address},now()) ON CONFLICT(address) DO UPDATE SET last_seen_at=now()`;
  const old=req.cookies.get(SESSION)?.value;
  if(old)await tx`DELETE FROM sessions WHERE token_hash=${hash(old)}`;
  await tx`INSERT INTO sessions(token_hash,address,expires_at) VALUES(${hash(sessionToken)},${address},now()+interval '24 hours')`;
 });
 const res=json({address});res.cookies.set(SESSION,sessionToken,{...cookieOptions,maxAge:86400});res.cookies.set(CHALLENGE,"",{...cookieOptions,maxAge:0});return res;
}
export async function signOut(req:NextRequest){
 sameOrigin(req);const token=req.cookies.get(SESSION)?.value;
 if(token)await db()`DELETE FROM sessions WHERE token_hash=${hash(token)}`;
 const res=json({address:null});res.cookies.set(SESSION,"",{...cookieOptions,maxAge:0});res.cookies.set(CHALLENGE,"",{...cookieOptions,maxAge:0});return res;
}
