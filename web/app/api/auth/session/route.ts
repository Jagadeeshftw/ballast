import { endpoint,json } from "@/backend/http";
import { session,signOut } from "@/backend/auth";
export const runtime="nodejs";
export const GET=endpoint(async req=>json({address:await session(req)}));
export const DELETE=endpoint(signOut);
