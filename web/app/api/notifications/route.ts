import { db } from "@/backend/db";
import { requireAddress } from "@/backend/auth";
import { endpoint,json } from "@/backend/http";
export const runtime="nodejs";
export const GET=endpoint(async req=>{
 const address=await requireAddress(req),sql=db();
 const [items,count]=await Promise.all([
  sql`SELECT id,kind,title,body,data,created_at FROM notifications WHERE address=${address} AND NOT read ORDER BY created_at DESC,id DESC LIMIT 50`,
  sql`SELECT count(*)::int AS n FROM notifications WHERE address=${address} AND NOT read`,
 ]);
 return json({items,unread:count[0].n});
});
