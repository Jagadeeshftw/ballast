import { db } from "@/backend/db";
import { ADDR } from "@/lib/chain";
import { endpoint,json } from "@/backend/http";
export const runtime="nodejs";
export const GET=endpoint(async()=>{
 const rows=await db()`SELECT * FROM engine_snapshots WHERE engine_address=${ADDR.engine.toLowerCase()} ORDER BY snapshot_at DESC LIMIT 1`;
 if(!rows.length)return json({snapshot:null,stale:true,error:"The watcher has not recorded an engine snapshot yet."},503);
 const snapshot=rows[0],stale=Date.now()-new Date(snapshot.snapshot_at).getTime()>90000||Date.now()-new Date(snapshot.data.observedAt).getTime()>90000;
 return json({snapshot,stale,...(stale?{error:"The watcher or chain is more than 90 seconds behind. These are the last measured figures."}:{})},stale?503:200);
});
