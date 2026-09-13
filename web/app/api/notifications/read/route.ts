import { db } from "@/backend/db";
import { requireSession } from "@/backend/auth";
import { endpoint,json,bodyOf,sameOrigin,ApiError } from "@/backend/http";
export const runtime="nodejs";
export const POST=endpoint(async req=>{
 sameOrigin(req);const address=await requireSession(req),body=await bodyOf(req),sql=db();
 if(body?.all===true){await sql`UPDATE notifications SET read=true WHERE address=${address} AND NOT read`;return json({ok:true});}
 if(!Array.isArray(body?.ids)||body.ids.length>50||!body.ids.every((id:unknown)=>typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw new ApiError(400,"Provide up to 50 notification IDs.");
 if(body.ids.length)await sql`UPDATE notifications SET read=true WHERE address=${address} AND id IN ${sql(body.ids)} AND NOT read`;
 return json({ok:true});
});
