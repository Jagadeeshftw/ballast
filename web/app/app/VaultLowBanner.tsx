"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { useWallet } from "./wallet";
import { useConvenience } from "./Convenience";
export default function VaultLowBanner(){
 const {account,chainOk}=useWallet(),{status,signedIn,vaultError}=useConvenience();
 const [dismissed,setDismissed]=useState(false);
 const key=`ballast.vault-reminder.${account?.toLowerCase()}`;
 useEffect(()=>{try{setDismissed(sessionStorage.getItem(key)==="1");}catch{setDismissed(false);}},[key]);
 if(!account||!chainOk||!signedIn||dismissed)return null;
 if(vaultError)return <aside className="vaultReminder"><p>Vault alert unavailable — {vaultError}</p></aside>;
 if(!status)return null;
 if(!status.vaultLow&&!status.vaultEmpty)return null;
 const amount=status.suggestedDeposit?formatUnits(BigInt(status.suggestedDeposit),6):null;
 const href=amount?`/app/funds?topup=${encodeURIComponent(amount)}&wallet=${account.toLowerCase()}`:"/app/funds";
 return <aside className="vaultReminder" aria-label="Your vault balance alert">
  <div><strong>{status.vaultEmpty?"Your vault is empty.":`Your vault is running low — about ${status.windowsRemaining} windows left.`}</strong>
   <p>{status.vaultEmpty?"No free tUSDC. Deposit before Ballast can buy cover.":"Top up now. Future window premiums can differ."}</p>
   <p className="why">{status.estimateReason}</p></div>
  <div className="vaultReminderActions"><Link className="btn" href={href}>Top up now</Link><button type="button" className="btn ghost" onClick={()=>{try{sessionStorage.setItem(key,"1");}catch{/* memory-only dismissal */}setDismissed(true);}}>Remind me later</button></div>
 </aside>;
}
