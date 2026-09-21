import { z } from "zod";
import { database, runtimeConfig } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { HttpError } from "@/lib/operations-access";
import { captureLead, coachingLeadInput, phoneInput, receiveMessage, settings, student } from "./coaching";

const connection=z.object({
  token:z.string().min(1),phoneId:z.string().regex(/^\d+$/),version:z.string().regex(/^v\d+\.0$/),
  appSecret:z.string().min(16),verifyToken:z.string().min(24),language:z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
  welcomeTemplate:z.string().regex(/^[a-z0-9_]+$/),bookingTemplate:z.string().regex(/^[a-z0-9_]+$/),reminderTemplate:z.string().regex(/^[a-z0-9_]+$/),
  // An explicit allowlist is mandatory for the first live tests. No unrestricted campaign sender.
  allowedRecipients:z.array(phoneInput).min(1).max(50),
}).strict();
export function whatsappConnection(client:string){
  try{const parsed=connection.safeParse(JSON.parse(runtimeConfig().ORBIT_COACHING_CONNECTORS_JSON||"{}")[client]);return parsed.success?parsed.data:null;}catch{return null;}
}
export async function verifySignature(raw:Uint8Array,signature:string,secret:string){
  if(!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const sig=Uint8Array.from(signature.slice(7).match(/../g)!,x=>parseInt(x,16));
  return crypto.subtle.verify("HMAC",key,sig,raw as Uint8Array<ArrayBuffer>);
}
export async function webhookGet(request:Request,client:string){
  const cfg=await settings(client),c=whatsappConnection(client),u=new URL(request.url);
  if(cfg.is_demo||!c||u.searchParams.get("hub.mode")!=="subscribe"||await hashValue(u.searchParams.get("hub.verify_token")||"")!==await hashValue(c.verifyToken))throw new HttpError(403,"Webhook verification failed.");
  return new Response((u.searchParams.get("hub.challenge")||"").slice(0,1000),{headers:{"Cache-Control":"no-store"}});
}
const message=z.object({id:z.string().max(250),from:z.string().regex(/^\d{8,15}$/),timestamp:z.string().regex(/^\d{1,12}$/),type:z.string(),text:z.object({body:z.string().max(4096)}).optional(),button:z.object({text:z.string().max(4096)}).optional(),interactive:z.object({button_reply:z.object({title:z.string().max(4096)}).optional(),list_reply:z.object({title:z.string().max(4096)}).optional()}).optional()});
const webhook=z.object({object:z.literal("whatsapp_business_account"),entry:z.array(z.object({changes:z.array(z.object({value:z.object({metadata:z.object({phone_number_id:z.string()}),messages:z.array(message).max(100).optional(),statuses:z.array(z.object({id:z.string().max(250),status:z.enum(["sent","delivered","read","failed"]),biz_opaque_callback_data:z.string().max(250).optional()})).max(100).optional()})})).max(20)})).max(10)});
export async function webhookPost(request:Request,client:string){
  const cfg=await settings(client),c=whatsappConnection(client);
  if(cfg.is_demo||!c)throw new HttpError(403,"Live WhatsApp is not enabled for this workspace.");
  if(!request.body)throw new HttpError(400,"Missing body.");
  const reader=request.body.getReader(),chunks:Uint8Array[]= [];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128000)throw new HttpError(413,"Payload too large.");chunks.push(value);}}finally{await reader.cancel();}
  const raw=new Uint8Array(size);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
  if(!await verifySignature(raw,request.headers.get("x-hub-signature-256")||"",c.appSecret))throw new HttpError(403,"Invalid webhook signature.");
  let json:unknown;try{json=JSON.parse(new TextDecoder().decode(raw));}catch{throw new HttpError(400,"Invalid JSON.");}
  const result=webhook.safeParse(json);if(!result.success)throw new HttpError(400,"Invalid WhatsApp event.");
  for(const entry of result.data.entry)for(const change of entry.changes){
    const v=change.value;if(v.metadata.phone_number_id!==c.phoneId)throw new HttpError(403,"Phone account mismatch.");
    for(const m of v.messages||[]){
      const phone=`+${m.from}`;
      if(!c.allowedRecipients.includes(phone))continue;
      const lead=await captureLead(client,coachingLeadInput.parse({name:"WhatsApp enquiry",phone,source:"Incoming WhatsApp"}));
      const text=m.text?.body||m.button?.text||m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||"[Attachment received: counsellor review requested]";
      await receiveMessage(client,lead.id,m.id,text,Number(m.timestamp)*1000);
    }
    for(const status of v.statuses||[]){
      // Terminal delivery facts never regress when Meta retries or reorders events.
      await database().prepare("UPDATE coaching_messages SET status=CASE WHEN status='read' THEN 'read' WHEN ?='read' THEN 'read' WHEN status='delivered' THEN 'delivered' WHEN ?='delivered' THEN 'delivered' WHEN ?='failed' AND status NOT IN ('delivered','read') THEN 'failed' WHEN ?='sent' AND status NOT IN ('failed','delivered','read') THEN 'accepted' ELSE status END,provider_id=COALESCE(provider_id,?),updated_at=? WHERE client_id=? AND (provider_id=? OR id=?) AND direction='outbound'").bind(status.status,status.status,status.status,status.status,status.id,Date.now(),client,status.id,status.biz_opaque_callback_data||'').run();
    }
  }
  return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
export async function processOutgoing(client?:string,transport:typeof fetch=fetch){
  const db=database(),now=Date.now(),params=client?[client]:[],scope=client?" AND m.client_id=?":"";
  await db.prepare(`UPDATE coaching_messages SET status='needs_review',error_code='send_interrupted',claim_token=NULL WHERE direction='outbound' AND status='sending' AND lease_until<?${client?" AND client_id=?":""}`).bind(now,...params).run();
  const results:{id:string;status:string}[]=[];
  for(let i=0;i<5;i++){
    const claim=crypto.randomUUID();
    const m=await db.prepare(`UPDATE coaching_messages SET status='sending',claim_token=?,lease_until=?,attempts=attempts+1 WHERE id=(SELECT m.id FROM coaching_messages m JOIN clients c ON c.id=m.client_id WHERE c.active=1 AND m.direction='outbound' AND m.status IN ('queued','retry') AND m.send_at<=?${scope} ORDER BY m.send_at,m.id LIMIT 1) AND status IN ('queued','retry') RETURNING *`).bind(claim,now+120000,now,...params).first<{id:string;client_id:string;lead_id:string;kind:string;body:string;parameters:string;attempts:number;booking_id:string|null}>();
    if(!m)break;
    const finish=async(status:string,error:string|null=null,provider:string|null=null,delay=0)=>{
      await db.prepare("UPDATE coaching_messages SET status=CASE WHEN status IN ('read','delivered') THEN status ELSE ? END,error_code=?,provider_id=COALESCE(?,provider_id),send_at=?,updated_at=?,claim_token=NULL WHERE id=? AND claim_token=?").bind(status,error,provider,Date.now()+delay,Date.now(),m.id,claim).run();results.push({id:m.id,status});
      if(status==="accepted"&&m.id.startsWith("staff:"))await db.prepare("UPDATE leads SET first_response_at=COALESCE(first_response_at,?),updated_at=? WHERE id=? AND client_id=?").bind(Date.now(),Date.now(),m.lead_id,m.client_id).run();
    };
    const cfg=await settings(m.client_id),s=await student(m.client_id,m.lead_id);
    if(s.opted_out_at){await finish("cancelled","opted_out");continue;}
    if(m.kind!=="text"&&!s.consent_at){await finish("blocked","opt_in_required");continue;}
    if(m.booking_id){
      const valid=await db.prepare("SELECT id FROM coaching_bookings WHERE id=? AND lead_id=? AND client_id=? AND status='confirmed'").bind(m.booking_id,m.lead_id,m.client_id).first();
      if(!valid){await finish("cancelled","booking_changed");continue;}
    }
    if(m.kind==="text"&&(!s.last_inbound_at||Date.now()-s.last_inbound_at>=86400000)){await finish("blocked","customer_service_window_closed");continue;}
    if(cfg.is_demo){await finish("simulated");continue;}
    const c=whatsappConnection(m.client_id);
    if(!c){await finish("blocked","connection_missing");continue;}
    if(!c.allowedRecipients.includes(s.phone)){await finish("blocked","recipient_not_allowlisted");continue;}
    const kind=m.kind as "welcome"|"booking"|"reminder";
    const template=kind==="welcome"?c.welcomeTemplate:kind==="booking"?c.bookingTemplate:kind==="reminder"?c.reminderTemplate:null;
    if(m.kind!=="text"&&!template){await finish("blocked","template_missing");continue;}
    const content=m.kind==="text"?{type:"text",text:{body:m.body}}:{type:"template",template:{name:template,language:{code:c.language},components:[{type:"body",parameters:(JSON.parse(m.parameters) as string[]).map(text=>({type:"text",text}))}]}};
    try{
      const r=await transport(`https://graph.facebook.com/${c.version}/${c.phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${c.token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:s.phone.slice(1),biz_opaque_callback_data:m.id,...content}),redirect:"error",signal:AbortSignal.timeout(10000)});
      if(r.status===429){const wait=Number(r.headers.get("retry-after")||0);await finish(m.attempts<5?"retry":"failed","rate_limited",null,Math.max(60000,Number.isFinite(wait)?Math.min(wait*1000,86400000):0));continue;}
      if(!r.ok){await finish(r.status>=500?"needs_review":"failed",`provider_http_${r.status}`);continue;}
      const data=await r.json() as {messages?:{id?:string}[]};const id=data.messages?.[0]?.id;
      if(!id){await finish("needs_review","provider_result_unknown");continue;}
      await finish("accepted",null,id);
    }catch{await finish("needs_review","provider_result_unknown");}
  }
  return results;
}
