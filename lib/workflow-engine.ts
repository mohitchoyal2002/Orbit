import { z } from "zod";
import { database, runtimeConfig } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { HttpError, monthBounds } from "@/lib/operations-access";
import { callConsentFields, validateCallConsent } from "./voice-shared";
import { queueVoiceCall } from "./voice";

const connectorSchema = z.object({
  hubspotToken:z.string().min(1).optional(), alertEmail:z.string().email().optional(),
  whatsapp:z.object({token:z.string().min(1),phoneId:z.string().regex(/^\d+$/),version:z.string().regex(/^v\d+\.0$/),template:z.string().regex(/^[a-z0-9_]+$/),language:z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/)}).optional(),
}).strict();
export function connectors(clientId: string) {
  try { return connectorSchema.parse(JSON.parse(runtimeConfig().ORBIT_CONNECTORS_JSON || "{}")[clientId] || {}); }
  catch { return {}; }
}
export function connectionStatus(clientId: string) {
  const c=connectors(clientId), env=runtimeConfig();
  return {crm:!!c.hubspotToken,whatsapp:!!c.whatsapp,email:!!(c.alertEmail&&env.ORBIT_RESEND_KEY&&env.ORBIT_EMAIL_FROM)};
}
export const leadInput = z.object({
  externalRef:z.string().min(1).max(120),name:z.string().trim().min(2).max(100),
  email:z.union([z.string().trim().email().max(254),z.literal("")]).default("").transform(v=>v.toLowerCase()),
  phone:z.string().regex(/^(\+[1-9]\d{7,14})?$/,"Use an international phone number, such as +919876543210.").default(""),
  brief:z.string().trim().max(3000).default(""),
  consentEvidence:z.string().trim().max(1000).default(""),
  consentAt:z.number().int().positive().nullable().default(null),
  ...callConsentFields,
}).strict().superRefine((v,ctx)=>{
  validateCallConsent(v,ctx);
  if (!v.email && !v.phone) ctx.addIssue({code:z.ZodIssueCode.custom,message:"Add an email address or international phone number."});
  if ((v.consentAt && (!v.phone || v.consentEvidence.length<10 || v.consentAt>Date.now())) || (!v.consentAt && v.consentEvidence)) ctx.addIssue({code:z.ZodIssueCode.custom,message:"Record the phone number, consent time and a specific opt-in source together."});
});
export async function addLead(clientId:string, input:z.infer<typeof leadInput>) {
  const {callConsentAt,callConsentEvidence,...legacyInput}=input;
  const db=database(), now=Date.now(), digest=await hashValue(JSON.stringify(callConsentAt?input:legacyInput));
  const previous=await db.prepare("SELECT id, payload_hash FROM leads WHERE client_id = ? AND external_ref = ?").bind(clientId,input.externalRef).first<{id:string;payload_hash:string}>();
  if(previous){if(previous.payload_hash!==digest)throw new HttpError(409,"This source reference already contains different details.");await queueVoiceCall(clientId,previous.id);return {id:previous.id,duplicate:true};}
  // Deterministic ID makes a concurrent replay share the exact same jobs.
  const id=await hashValue(`${clientId}:${input.externalRef}`);
  const statements=[db.prepare("INSERT INTO leads (id, client_id, external_ref, payload_hash, name, email, phone, brief, consent_evidence, consent_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, external_ref) DO NOTHING").bind(id,clientId,input.externalRef,digest,input.name,input.email,input.phone,input.brief,input.consentEvidence,input.consentAt,now,now)];
  statements.push(db.prepare("UPDATE leads SET call_consent_at=?,call_consent_evidence=? WHERE id=? AND client_id=? AND payload_hash=?").bind(input.callConsentAt??null,input.callConsentEvidence||"",id,clientId,digest));
  for(const action of ["crm.sync","email.alert"]){
    statements.push(db.prepare("INSERT INTO workflow_jobs (id, client_id, lead_id, action, status, next_at, created_at, updated_at) SELECT ?, ?, ?, ?, 'pending', ?, ?, ? WHERE EXISTS (SELECT 1 FROM workflows WHERE client_id = ? AND template = ? AND enabled = 1) AND EXISTS (SELECT 1 FROM leads WHERE id = ? AND payload_hash = ?) ON CONFLICT(id) DO NOTHING").bind(`${action}:${id}`,clientId,id,action,now,now,now,clientId,action,id,digest));
  }
  await db.batch(statements);
  const saved=await db.prepare("SELECT payload_hash FROM leads WHERE id = ? AND client_id = ?").bind(id,clientId).first<{payload_hash:string}>();
  if(saved?.payload_hash!==digest)throw new HttpError(409,"This source reference already contains different details.");
  await queueVoiceCall(clientId,id);
  return {id,duplicate:false};
}
export async function queueJob(clientId:string,leadId:string,action:string,revision?:string) {
  const id=`${action}:${leadId}${revision?`:${revision}`:""}`, now=Date.now();
  await database().prepare("INSERT INTO workflow_jobs (id, client_id, lead_id, action, status, next_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id,clientId,leadId,action,now,now,now).run();
  return id;
}
type Job={id:string;client_id:string;lead_id:string|null;action:string;status:string;attempts:number;payload:string|null;created_at:number;claim_token:string};
type Payload={url:string;body:unknown};
class ProviderFailure extends Error {
  constructor(public code:string,public state:"retry"|"failed"|"blocked"|"needs_review",public delay=0){super(code);}
}
export function retryDelay(attempt:number, retryAfter:string|null=null, now=Date.now()) {
  const raw=retryAfter?(Number.isFinite(Number(retryAfter))?Number(retryAfter)*1000:Date.parse(retryAfter)-now):0;
  return Math.max(30000*2**Math.min(attempt-1,6),Number.isFinite(raw)?raw:0);
}
async function payloadFor(job:Job):Promise<Payload> {
  const c=connectors(job.client_id), env=runtimeConfig();
  if(job.action==="crm.sync"&&!c.hubspotToken || job.action==="whatsapp.template"&&!c.whatsapp || job.action.startsWith("email.")&&!(c.alertEmail&&env.ORBIT_RESEND_KEY&&env.ORBIT_EMAIL_FROM))throw new ProviderFailure("connection_missing","blocked");
  const lead=job.lead_id?await database().prepare("SELECT * FROM leads WHERE id = ? AND client_id = ?").bind(job.lead_id,job.client_id).first<Record<string,string|number|null>>():null;
  if(job.action==="whatsapp.template"&&(!lead?.phone||!lead.consent_at||lead.opted_out_at))throw new ProviderFailure("whatsapp_opt_in_required","blocked");
  if(job.payload)return JSON.parse(job.payload);
  if(job.action==="crm.sync"){
    if(!lead)throw new ProviderFailure("lead_missing","failed");
    if(!lead.email)throw new ProviderFailure("crm_email_required","blocked");
    const names=String(lead.name).split(" "),firstname=names.shift(),lastname=names.join(" ");
    return {url:"https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert",body:{inputs:[{id:lead.email,idProperty:"email",properties:{email:lead.email,firstname,...(lastname?{lastname}:{}),...(lead.phone?{phone:lead.phone}:{})}}]}};
  }
  if(job.action==="whatsapp.template")return {url:`https://graph.facebook.com/${c.whatsapp!.version}/${c.whatsapp!.phoneId}/messages`,body:{messaging_product:"whatsapp",to:String(lead!.phone).replace(/^\+/,""),type:"template",template:{name:c.whatsapp!.template,language:{code:c.whatsapp!.language}}}};
  if(job.action==="email.alert"&&!lead)throw new ProviderFailure("lead_missing","failed");
  return {url:"https://api.resend.com/emails",body:{from:env.ORBIT_EMAIL_FROM,to:[c.alertEmail],subject:job.action==="email.error"?"OrbitFlow workflow needs attention":"New OrbitFlow lead",text:job.action==="email.error"?"A workflow needs attention. Open your OrbitFlow workspace and review the Alerts tab. No customer details are included in this notification.":`A new lead is ready for review in your OrbitFlow workspace. Reference: ${job.lead_id}. Open Leads to review and respond.`}};
}
async function deliver(job:Job,payload:Payload,transport:typeof fetch) {
  const c=connectors(job.client_id), token=job.action==="crm.sync"?c.hubspotToken:job.action==="whatsapp.template"?c.whatsapp?.token:runtimeConfig().ORBIT_RESEND_KEY;
  let response:Response;
  try {response=await transport(payload.url,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(job.action.startsWith("email.")?{"Idempotency-Key":job.id}:{})},body:JSON.stringify(payload.body),redirect:"error",signal:AbortSignal.timeout(10000)});}
  catch {throw new ProviderFailure("provider_result_unknown",job.action==="whatsapp.template"?"needs_review":"retry");}
  if(!response.ok){
    if(response.status===429)throw new ProviderFailure("provider_rate_limited","retry",retryDelay(job.attempts,response.headers.get("retry-after")));
    if(response.status>=500)throw new ProviderFailure("provider_unavailable",job.action==="whatsapp.template"?"needs_review":"retry");
    throw new ProviderFailure(`provider_http_${response.status}`,"failed");
  }
  let data:{id?:string;messages?:{id:string}[];results?:{id:string}[];errors?:unknown[];status?:string};
  try {data=await response.json();}catch {throw new ProviderFailure("provider_result_unknown",job.action==="whatsapp.template"?"needs_review":"retry");}
  const id=job.action==="crm.sync"?data.results?.[0]?.id:job.action==="whatsapp.template"?data.messages?.[0]?.id:data.id;
  if(!id||data.errors?.length)throw new ProviderFailure("provider_incomplete_result",job.action==="whatsapp.template"?"needs_review":"retry");
  return id;
}
async function raiseAlert(job:Job,code:string,now:number) {
  const db=database();
  const stmts=[db.prepare("INSERT INTO operation_alerts (id, client_id, job_id, code, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET code = excluded.code, acknowledged_at = NULL").bind(`alert:${job.id}`,job.client_id,job.id,code,now)];
  if(!job.action.startsWith("email."))stmts.push(db.prepare("INSERT INTO workflow_jobs (id, client_id, action, status, next_at, created_at, updated_at) VALUES (?, ?, 'email.error', 'pending', ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(`error-email:${job.id}`,job.client_id,now,now,now));
  await db.batch(stmts);
}
// Bounded, durable processor. No network work in GET handlers, no in-memory queues.
export async function processJobs(clientId?:string,transport:typeof fetch=fetch) {
  const db=database(),now=Date.now();
  const scope=clientId?" AND client_id = ?":"";const params=clientId?[clientId]:[];
  const expired=await db.prepare(`SELECT * FROM workflow_jobs WHERE status = 'processing' AND lease_until < ?${scope} LIMIT 20`).bind(now,...params).all<Job>();
  for(const job of expired.results){
    const state=job.action==="whatsapp.template"?"needs_review":job.attempts>=5?"failed":"retry";
    await db.prepare("UPDATE workflow_jobs SET status = ?, error_code = 'worker_interrupted', claim_token = NULL, lease_until = NULL, next_at = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND lease_until < ?").bind(state,now,now,job.id,now).run();
    if(state!=="retry")await raiseAlert(job,"worker_interrupted",now);
  }
  const results: {id:string;status:string}[]=[];
  for(let i=0;i<5;i++){
    const claim=crypto.randomUUID(),at=Date.now();
    const job=await db.prepare(`UPDATE workflow_jobs SET status = 'processing', claim_token = ?, lease_until = ?, attempts = attempts + 1, updated_at = ? WHERE id = (SELECT j.id FROM workflow_jobs j JOIN clients c ON c.id = j.client_id WHERE j.status IN ('pending','retry') AND j.next_at <= ? AND c.active = 1${clientId?" AND j.client_id = ?":""} ORDER BY j.next_at, j.id LIMIT 1) AND status IN ('pending','retry') RETURNING *`).bind(claim,at+120000,at,at,...params).first<Job>();
    if(!job)break;
    let providerId:string;
    try {
      if(job.attempts>5)throw new ProviderFailure("retry_limit_reached","failed");
      // Resend retains idempotency keys for 24h; never repeat old ambiguous sends.
      if(job.payload&&job.action.startsWith("email.")&&at-job.created_at>23*3600000)throw new ProviderFailure("email_idempotency_window_expired","needs_review");
      const payload=await payloadFor(job);
      await db.prepare("UPDATE workflow_jobs SET payload = ? WHERE id = ? AND claim_token = ?").bind(JSON.stringify(payload),job.id,claim).run();
      providerId=await deliver(job,payload,transport);
    } catch(err) {
      // Unknown local/storage faults before delivery leave the lease to expire.
      if(!(err instanceof ProviderFailure))throw err;
      const state=err.state==="retry"&&job.attempts>=5?"failed":err.state;
      await db.prepare("UPDATE workflow_jobs SET status = ?, error_code = ?, next_at = ?, lease_until = NULL, claim_token = NULL, updated_at = ? WHERE id = ? AND claim_token = ?").bind(state,err.code,at+(err.delay||retryDelay(job.attempts)),at,job.id,claim).run();
      if(state!=="retry")await raiseAlert(job,err.code,at);
      results.push({id:job.id,status:state});continue;
    }
    // A persistence failure after provider acceptance is not converted to a retry here.
    await db.prepare("UPDATE workflow_jobs SET status = 'succeeded', provider_id = ?, error_code = NULL, finished_at = ?, updated_at = ?, lease_until = NULL, claim_token = NULL WHERE id = ? AND claim_token = ?").bind(providerId,Date.now(),Date.now(),job.id,claim).run();
    await db.prepare("UPDATE operation_alerts SET acknowledged_at = ? WHERE job_id = ?").bind(Date.now(),job.id).run();
    results.push({id:job.id,status:"succeeded"});
  }
  return results;
}
export async function reportMetrics(clientId:string,month:string) {
  const {start,end}=monthBounds(month), db=database();
  const metrics=await db.prepare("SELECT COUNT(*) AS leads, COALESCE(SUM(status = 'won'),0) AS won, COUNT(first_response_at) AS responded, AVG(CASE WHEN first_response_at IS NOT NULL THEN (first_response_at - created_at) / 60000.0 END) AS average_response_minutes FROM leads WHERE client_id = ? AND created_at >= ? AND created_at < ?").bind(clientId,start,end).first();
  const usage=await db.prepare("SELECT action, COUNT(*) AS accepted FROM workflow_jobs WHERE client_id = ? AND status = 'succeeded' AND finished_at >= ? AND finished_at < ? GROUP BY action").bind(clientId,start,end).all();
  return {month,timeZone:"UTC",cohort:"Leads received during this month; outcomes reflect the snapshot time.",...metrics,usage:usage.results};
}
export async function saveReport(clientId:string,month:string,replace=false) {
  const metrics=await reportMetrics(clientId,month);
  await database().prepare(`INSERT INTO monthly_reports (id, client_id, month, metrics, generated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(client_id, month) ${replace?"DO UPDATE SET metrics = excluded.metrics, generated_at = excluded.generated_at":"DO NOTHING"}`).bind(`${clientId}:${month}`,clientId,month,JSON.stringify(metrics),Date.now()).run();
  return metrics;
}
export async function recurringReports() {
  const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);const month=d.toISOString().slice(0,7);
  const rows=await database().prepare("SELECT id FROM clients WHERE active = 1 AND NOT EXISTS (SELECT 1 FROM monthly_reports WHERE client_id = clients.id AND month = ?) ORDER BY created_at LIMIT 10").bind(month).all<{id:string}>();
  for(const row of rows.results)await saveReport(row.id,month);
  return rows.results.length;
}
