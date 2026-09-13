"use client";
import { createContext,useContext,useEffect,useRef,useState,useCallback } from "react";
import { createWalletClient,custom,type EIP1193Provider } from "viem";
import type { WalletRead } from "@/backend/chain-reader";
import { useWallet } from "./wallet";
export type Notification={id:string;kind:string;title:string;body:string;data:{tx?:string;href?:string};created_at:string};
async function request(url:string,init?:RequestInit){
 const res=await fetch(url,{...init,cache:"no-store",headers:{"Content-Type":"application/json",...init?.headers}});
 const body=await res.json();if(!res.ok)throw Object.assign(new Error(body.error??"The notification service did not answer. Please retry."),{status:res.status});return body;
}
type Context={signedIn:boolean;checking:boolean;signing:boolean;error:string|null;vaultError:string|null;status:WalletRead|null;items:Notification[];unread:number|null;signIn:()=>Promise<void>;refresh:()=>Promise<void>;mark:(ids:string[],all?:boolean)=>Promise<boolean>};
const Context=createContext<Context|null>(null);
export const useConvenience=()=>{const c=useContext(Context);if(!c)throw new Error("ConvenienceProvider missing");return c;};
export function ConvenienceProvider({children}:{children:React.ReactNode}){
 const {account}=useWallet();
 // Remount account-owned state together. A slow response for the previous wallet cannot
 // repopulate the new wallet's bell or top-up prompt.
 return <AccountConvenience key={account?.toLowerCase()??"disconnected"}>{children}</AccountConvenience>;
}
function AccountConvenience({children}:{children:React.ReactNode}){
 const {account,chainOk}=useWallet();
 const [signedIn,setSignedIn]=useState(false),[checking,setChecking]=useState(!!account),[signing,setSigning]=useState(false);
 const [error,setError]=useState<string|null>(null),[vaultError,setVaultError]=useState<string|null>(null),[status,setStatus]=useState<WalletRead|null>(null);
 const [items,setItems]=useState<Notification[]>([]),[unread,setUnread]=useState<number|null>(null);
 const alive=useRef(true),inflight=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!account)return;
  let active=true;
  request("/api/auth/session").then(r=>{if(active)setSignedIn(r.address===account.toLowerCase());}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setChecking(false);});
  return()=>{active=false;};
 },[account]);
 const refresh=useCallback(async()=>{
  if(!account||!signedIn||inflight.current)return;
  inflight.current=true;
  try{
   const r=await request(`/api/notifications?address=${account}`);
   if(alive.current){setItems(r.items);setUnread(r.unread);setError(null);}
  }catch(e){if(alive.current){setError((e as Error).message);setUnread(null);if((e as {status?:number}).status===401){setSignedIn(false);setStatus(null);}}}
  finally{inflight.current=false;}
 },[account,signedIn]);
 useEffect(()=>{
  if(!signedIn||!chainOk||!account)return;
  let active=true,busy=false;
  const poll=async()=>{
   void refresh();if(busy)return;busy=true;
   try{const result=await request(`/api/vault/status?address=${account}`);if(active){setStatus(result);setVaultError(null);}}
   catch(e){if(active){setStatus(null);setVaultError((e as Error).message);}}
   finally{busy=false;}
  };
  void poll();const id=setInterval(poll,30000);return()=>{active=false;clearInterval(id);};
 },[account,signedIn,chainOk,refresh]);
 const signIn=async()=>{
  if(!account||!chainOk)return;
  setSigning(true);setError(null);
  try{
   const {message}=await request("/api/auth/challenge",{method:"POST",body:JSON.stringify({address:account})});
   const provider=(globalThis as {ethereum?:EIP1193Provider}).ethereum;if(!provider)throw new Error("Reconnect your wallet to sign in.");
   const signature=await createWalletClient({account,transport:custom(provider)}).signMessage({message});
   if(!alive.current)return;
   await request("/api/auth/verify",{method:"POST",body:JSON.stringify({address:account,signature})});
   if(alive.current)setSignedIn(true);
  }catch(e){if(alive.current)setError((e as {code?:number}).code===4001?"Signature declined. You can sign in again when you want notifications.":e instanceof Error&&e.message.length<300?e.message:"The wallet could not sign the message. Reconnect and try again.");}
  finally{if(alive.current)setSigning(false);}
 };
 const mark=async(ids:string[],all=false)=>{
  try{await request("/api/notifications/read",{method:"POST",body:JSON.stringify(all?{all:true}:{ids})});if(alive.current){setUnread(n=>all?0:n===null?null:Math.max(0,n-items.filter(item=>ids.includes(item.id)).length));setItems(items=>all?[]:items.filter(n=>!ids.includes(n.id)));}return true;}
  catch(e){if(alive.current)setError((e as Error).message);return false;}
 };
 return <Context.Provider value={{signedIn,checking,signing,error,vaultError,status,items,unread,signIn,refresh,mark}}>{children}</Context.Provider>;
}
