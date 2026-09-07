import { database } from "@/db/connection";
import { hashValue, readBoundedJson } from "@/lib/enquiries";
import { endpoint, HttpError, reply } from "@/lib/operations-access";
import { addLead, leadInput } from "@/lib/workflow-engine";

// Server-to-server intake. Never embed this key in a public website bundle.
export const POST=(request:Request,context:{params:Promise<{client:string}>})=>endpoint(async()=>{
  const {client}=await context.params;
  if(!/^[0-9a-f-]{36}$/.test(client))throw new HttpError(401,"Invalid intake credentials.");
  const key=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
  if(key.length<40||key.length>200)throw new HttpError(401,"Invalid intake credentials.");
  const row=await database().prepare("SELECT id FROM clients WHERE id = ? AND active = 1 AND intake_key_hash = ?").bind(client,await hashValue(key)).first();
  if(!row)throw new HttpError(401,"Invalid intake credentials.");
  const now=Date.now(), bucket=Math.floor(now/60000);
  const limit=await database().prepare("INSERT INTO rate_limits (key, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1 RETURNING hits").bind(`intake:${client}:${bucket}`,(bucket+1)*60000).first<{hits:number}>();
  if((limit?.hits||0)>60)return new Response(JSON.stringify({error:"Intake limit reached."}),{status:429,headers:{"Content-Type":"application/json","Retry-After":"60","Cache-Control":"no-store"}});
  let raw;try{raw=await readBoundedJson(request);}catch{throw new HttpError(400,"Invalid JSON body.");}
  const parsed=leadInput.safeParse(raw);if(!parsed.success)throw new HttpError(400,parsed.error.issues[0]?.message||"Invalid lead.");
  return reply(await addLead(client,parsed.data),201);
});
