"use client";
import { createPortal } from "react-dom";
import { useEffect,useRef,useState } from "react";
import { IconBell,IconShieldCheck,IconAlertTriangle,IconCoin,IconX } from "@tabler/icons-react";
import { EXPLORER } from "@/lib/chain";
import { useConvenience,type Notification } from "./Convenience";
import { useWallet } from "./wallet";
const relative=(time:string)=>{const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(time))/1000));return seconds<60?"just now":seconds<3600?`${Math.floor(seconds/60)}m ago`:seconds<86400?`${Math.floor(seconds/3600)}h ago`:`${Math.floor(seconds/86400)}d ago`;};
function destination(note:Notification){
 if(note.data?.tx&&/^0x[0-9a-f]{64}$/i.test(note.data.tx))return `${EXPLORER}/tx/${note.data.tx}`;
 return ["/app/funds","/app/engine","/app/cover","/app/activity"].includes(note.data?.href??"")?note.data.href!:"/app/activity";
}
export default function NotificationBell(){
 const c=useConvenience(),{account,chainOk}=useWallet();
 const [open,setOpen]=useState(false),[shown,setShown]=useState<Notification[]>([]);
 const panel=useRef<HTMLElement>(null),[top,setTop]=useState(64);
 const box=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),close=useRef<HTMLButtonElement>(null);
 const marking=useRef(new Set<string>());
 useEffect(()=>{
  if(!open)return;
  close.current?.focus();void c.refresh();
  const position=()=>setTop((button.current?.getBoundingClientRect().bottom??52)+12);
  position();window.addEventListener("resize",position);window.addEventListener("scroll",position);
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);button.current?.focus();}};
  const away=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))setOpen(false);};
  document.addEventListener("keydown",key);document.addEventListener("mousedown",away);
  return()=>{document.removeEventListener("keydown",key);document.removeEventListener("mousedown",away);window.removeEventListener("resize",position);window.removeEventListener("scroll",position);};
 // Refresh identity changes as sign-in completes; do not reset panel focus each poll.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open]);
 useEffect(()=>{
  if(!open)return;
  setShown(old=>[...new Map([...old,...c.items].map(n=>[n.id,n])).values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,50));
  const ids=c.items.filter(n=>!marking.current.has(n.id)).map(n=>n.id);
  if(ids.length){ids.forEach(id=>marking.current.add(id));void c.mark(ids).then(ok=>{if(!ok)ids.forEach(id=>marking.current.delete(id));});}
 // mark only newly received notifications. Do not mark a hidden panel's items.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,c.items]);
 return <div className="notificationBox" ref={box} onBlur={e=>{if(e.relatedTarget&&!box.current?.contains(e.relatedTarget as Node)&&!panel.current?.contains(e.relatedTarget as Node))setOpen(false);}}>
  <button ref={button} type="button" className="chip notificationToggle" aria-expanded={open} aria-controls="notification-panel" aria-label={`Notifications${c.unread===null?" — sign in or check service status":` — ${c.unread} unread`}`} onClick={()=>{if(!open)setShown([]);setOpen(!open);}}>
   <IconBell size={17} aria-hidden="true"/><span className="notificationBadge">{c.unread===null?"—":c.unread>99?"99+":c.unread}</span>
  </button>
  {open&&createPortal(<section ref={panel} style={{top,maxHeight:`calc(100dvh - ${top+14}px)`}} id="notification-panel" className="notificationPanel" aria-label="Wallet notifications">
   <div className="notificationHeading"><h2>Notifications</h2><button ref={close} type="button" className="notificationIcon" aria-label="Close notifications" onClick={()=>{setOpen(false);button.current?.focus();}}><IconX size={19}/></button></div>
   <p className="notificationOwner">{account?`For ${account.slice(0,8)}…${account.slice(-4)}`:"Connect your wallet to see its notifications."}</p>
   {!account?<p className="notificationText">Cover purchases, settlements and balance alerts for your connected wallet will appear here.</p>:!chainOk?<p className="notificationText">Switch to Somnia Shannon testnet to sign in.</p>:c.checking?<p className="notificationText" role="status">Checking your notification session…</p>:!c.signedIn?<div className="notificationText"><p>Sign a message to read your notifications. No transaction or gas is needed.</p><button type="button" className="btn" disabled={c.signing} onClick={c.signIn}>{c.signing?"Waiting for your signature…":"Sign in for notifications"}</button></div>:<>
    <div className="notificationActions"><button type="button" onClick={()=>{void c.mark([],true).then(ok=>{if(ok)setShown([]);});}} disabled={!shown.length&&!c.unread}>Clear all</button><button type="button" onClick={()=>void c.refresh()}>Refresh</button></div>
    {shown.length===0?<p className="notificationText">No notifications yet. When Ballast buys cover, settles a window, or needs attention, it will appear here.</p>:<ol className="notificationList">{shown.map(n=><li key={n.id}>
     <span className="notificationKind" aria-hidden="true">{n.kind==="cover_opened"?<IconShieldCheck size={19}/>:n.kind.includes("settled")?<IconCoin size={19}/>:<IconAlertTriangle size={19}/>}</span>
     <div><a href={destination(n)}><strong>{n.title}</strong></a><p>{n.body}</p><time dateTime={n.created_at} title={new Date(n.created_at).toISOString().replace("T"," ").replace(".000Z"," UTC")}>{relative(n.created_at)}</time></div>
     <button type="button" className="notificationIcon" aria-label={`Dismiss ${n.title}`} onClick={()=>{void c.mark([n.id]).then(ok=>{if(ok)setShown(old=>old.filter(x=>x.id!==n.id));});}}><IconX size={16}/></button>
    </li>)}</ol>}
   </>}
   {c.error&&<p className="notificationText notificationError" role="alert">{c.error}</p>}
  </section>,document.getElementById("dir-a")!)}
 </div>;
}
