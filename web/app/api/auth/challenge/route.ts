import { endpoint } from "@/backend/http";
import { challenge } from "@/backend/auth";
export const runtime="nodejs";
export const POST=endpoint(challenge);
