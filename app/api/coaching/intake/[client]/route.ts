import { database } from "@/db/connection";
import { hashValue,readBoundedJson } from "@/lib/enquiries";
import { endpoint,HttpError,reply } from "@/lib/operations-access";
import { captureLead,coachingLeadInput,settings } from "@/lib/coaching";
// Use only from the coaching website's server. Never expose the workspace intake key in a form bundle.
export const POST=(request:Request,context:{params:Promise<{client:string}>})=>endpoint(async()=>{
  const {client}=await context.params,key=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
  if(!/^[0-9a-f-]{36}$/.test(client)||key.length<40||key.length>200)throw new HttpError(401,"Invalid intake credentials.");
  const db=database(),valid=await db.prepare("SELECT id FROM clients WHERE id=? AND active=1 AND intake_key_hash=?").bind(client,await hashValue(key)).first();
  if(!valid)throw new HttpError(401,"Invalid intake credentials.");
  if((await settings(client)).is_demo)throw new HttpError(403,"External intake is disabled for the prospect demo.");
  const bucket=Math.floor(Date.now()/60000);
  const limit=await db.prepare("INSERT INTO rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<60 RETURNING hits").bind(`coaching-intake:${client}:${bucket}`,(bucket+1)*60000).first();
  if(!limit)return new Response(JSON.stringify({error:"Intake limit reached."}),{status:429,headers:{"Content-Type":"application/json","Retry-After":"60","Cache-Control":"no-store"}});
  let raw:unknown;try{raw=await readBoundedJson(request);}catch{throw new HttpError(400,"Invalid JSON body.");}
  const parsed=coachingLeadInput.safeParse(raw);if(!parsed.success)throw new HttpError(400,parsed.error.issues[0]?.message||"Invalid enquiry.");
  return reply(await captureLead(client,parsed.data),201);
});
