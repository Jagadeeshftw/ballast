import { endpoint } from "@/backend/http";
import { signIn } from "@/backend/auth";
export const runtime="nodejs";
export const POST=endpoint(signIn);
