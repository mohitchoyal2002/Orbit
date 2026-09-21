import { z } from "zod";
import { database, runtimeConfig } from "@/db/connection";
import { hashValue, readBoundedJson } from "@/lib/enquiries";
import { HttpError } from "@/lib/operations-access";
import { phoneInput } from "@/lib/coaching";
import { ANALYTICS_NOTICE, CONTACT_NOTICE, WHATSAPP_NOTICE, WIDGET_CONSENT_VERSION, widgetCourseIds, type WidgetSite, type WidgetCourse } from "./widget-shared";
import { CALL_NOTICE } from "./voice-shared";
import { getVoiceSettings,queueVoiceCall } from "./voice";

const DAY = 86400000;
const uuid = z.string().uuid();
const slug = z.string().max(64).regex(/^[a-z][a-z0-9_-]*$/).refine(s=>!/[0-9]{6}/.test(s));
const properties = {
  page_view: z.object({}).strict(),
  scroll: z.object({percent:z.union([z.literal(25),z.literal(50),z.literal(75),z.literal(100)])}).strict(),
  active_time: z.object({seconds:z.number().int().min(1).max(15)}).strict(),
  cta_click: z.object({action:slug}).strict(),
  course_view: z.object({course:z.enum(widgetCourseIds)}).strict(),
  form_start: z.object({form:slug}).strict(),
  form_submit: z.object({form:slug}).strict(),
  widget_open: z.object({}).strict(),
  video_progress: z.object({video:slug,percent:z.union([z.literal(25),z.literal(50),z.literal(75),z.literal(100)])}).strict(),
  performance: z.object({loadMs:z.number().int().min(0).max(120000)}).strict(),
  session_end: z.object({}).strict(),
};
export function safePath(raw:string) {
  let p:string;
  try { p=decodeURIComponent(raw.split(/[?#]/)[0]); } catch { return "/[redacted]"; }
  if(!p.startsWith("/")||p.startsWith("//")) return "/[redacted]";
  if(/(?:^|\/)(?:admin|account|profile|login|signin|checkout|payment|reset|auth|student|portal)(?:\/|$)/i.test(p))return "/[private]";
  return p.split("/").map(s=>!s?"":/^[a-z][a-z0-9_-]{0,63}$/i.test(s)&&!/[0-9]{6}/.test(s)&&!/[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(s)?s:"[redacted]").join("/").slice(0,240);
}
const eventSchema=z.object({id:uuid,type:z.enum(Object.keys(properties) as [keyof typeof properties,...(keyof typeof properties)[]]),path:z.string().max(2048),at:z.number().int().positive(),properties:z.unknown()}).strict();
const attributionSchema=z.object({source:z.string().max(120).optional(),medium:z.string().max(120).optional(),campaign:z.string().max(120).optional(),referrer:z.string().max(253).optional()}).strict();
const consentSchema=z.object({action:z.literal("consent"),version:z.literal(WIDGET_CONSENT_VERSION),analytics:z.literal(true),visitorKey:uuid,sessionId:uuid,attribution:attributionSchema,device:z.enum(["mobile","tablet","desktop"])}).strict();
const eventsSchema=z.object({action:z.literal("events"),token:z.string().max(1800),events:z.array(eventSchema).min(1).max(20)}).strict();
const leadSchema=z.object({action:z.literal("lead"),requestId:uuid,name:z.string().trim().min(2).max(100),phone:phoneInput,email:z.union([z.string().trim().email().max(254),z.literal("")]).default(""),course:z.enum(widgetCourseIds),contactConsent:z.literal(true),whatsappConsent:z.boolean(),callConsent:z.boolean().default(false),version:z.literal(WIDGET_CONSENT_VERSION),token:z.string().max(1800).optional(),startedAt:z.number().int().positive(),website:z.string().max(200).default("")}).strict();
const revokeSchema=z.object({action:z.literal("revoke"),visitorKey:uuid}).strict();
const publicSchema=z.discriminatedUnion("action",[consentSchema,eventsSchema,leadSchema,revokeSchema]);
type Claims={site:string;origin:string;visitor:string;session:string;expires:number};

export async function siteById(id:string,active=true):Promise<WidgetSite> {
  if(!uuid.safeParse(id).success)throw new HttpError(404,"Widget unavailable.");
  const row=await database().prepare("SELECT w.* FROM widget_sites w JOIN clients c ON c.id=w.client_id WHERE w.id=? AND c.active=1").bind(id).first<WidgetSite>();
  if(!row||active&&!row.enabled)throw new HttpError(404,"Widget unavailable.");
  return row;
}
export function publicOrigin(request:Request,site:WidgetSite) {
  let origin=request.headers.get("origin");
  // Same-origin GET requests may omit Origin. Never infer it for a cross-site write.
  if(!origin&&request.method==="GET") {
    try{const ref=new URL(request.headers.get("referer")||"");if(ref.origin===new URL(request.url).origin)origin=ref.origin;}catch{}
  }
  if(!origin||!(JSON.parse(site.origins) as string[]).includes(origin))throw new HttpError(403,"This website is not enabled for this widget.");
  return origin;
}
async function signingKey() {
  const salt=runtimeConfig().ORBIT_RATE_LIMIT_SALT;
  if(!salt||salt.length<24)throw new HttpError(503,"Widget setup is incomplete.");
  return crypto.subtle.importKey("raw",new TextEncoder().encode(`widget-session-v1:${salt}`),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function unbase64(value:string){return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
async function sign(claims:Claims){const p=base64(new TextEncoder().encode(JSON.stringify(claims)));return `${p}.${base64(new Uint8Array(await crypto.subtle.sign("HMAC",await signingKey(),new TextEncoder().encode(p))))}`;}
async function verify(token:string,site:WidgetSite,origin:string):Promise<Claims> {
  try{
    const [p,s,extra]=token.split(".");
    if(!p||!s||extra||!await crypto.subtle.verify("HMAC",await signingKey(),unbase64(s),new TextEncoder().encode(p)))throw Error();
    const c=JSON.parse(new TextDecoder().decode(unbase64(p))) as Claims;
    if(c.site!==site.id||c.origin!==origin||!Number.isFinite(c.expires)||c.expires<Date.now())throw Error();
    const row=await database().prepare("SELECT s.id FROM widget_sessions s JOIN widget_visitors v ON v.id=s.visitor_id WHERE s.id=? AND s.site_id=? AND s.visitor_id=? AND v.revoked_at IS NULL AND s.expires_at>?").bind(c.session,site.id,c.visitor,Date.now()).first();
    if(!row)throw Error();return c;
  }catch{throw new HttpError(401,"Activity session expired. Reload to continue.");}
}
async function visitorId(site:string,key:string){return hashValue(`widget-visitor-v1:${site}:${key}`);}
async function limit(request:Request,site:WidgetSite,action:string) {
  const salt=runtimeConfig().ORBIT_RATE_LIMIT_SALT;
  if(!salt||salt.length<24)throw new HttpError(503,"Widget setup is incomplete.");
  const window=action==="lead"?3600000:60000,max=action==="lead"?20:action==="consent"?60:240,now=Date.now();
  const key=await hashValue(`widget:${site.id}:${action}:${Math.floor(now/window)}:${salt}:${request.headers.get("cf-connecting-ip")||"unknown-network"}`);
  const row=await database().prepare("INSERT INTO rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits").bind(key,now+window).first<{hits:number}>();
  if(!row||row.hits>max)throw new HttpError(429,"Too many requests. Please try again shortly.");
}
function attribution(raw:z.infer<typeof attributionSchema>) {
  const result:Record<string,string>={};
  for(const key of ["source","medium","campaign"] as const){const s=raw[key];if(s&&/^[a-z][a-z0-9_-]{0,63}$/i.test(s)&&!/[0-9]{6}/.test(s))result[key]=s;}
  if(raw.referrer&&/^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/i.test(raw.referrer)&&!/[0-9]{6}/.test(raw.referrer))result.referrer=raw.referrer.toLowerCase();
  return result;
}
export async function purgeExpiredWidgetData(siteId?:string) {
  const db=database(),now=Date.now();
  // Bounded so the shared runner stays responsive; repeated runs drain larger backlogs.
  await db.prepare(`DELETE FROM widget_events WHERE id IN (SELECT id FROM widget_events WHERE expires_at<=? ${siteId?"AND site_id=?":""} LIMIT 1000)`).bind(now,...siteId?[siteId]:[]).run();
  await db.prepare(`DELETE FROM widget_sessions WHERE id IN (SELECT id FROM widget_sessions WHERE expires_at<=? ${siteId?"AND site_id=?":""} LIMIT 250)`).bind(now,...siteId?[siteId]:[]).run();
  // Keep a small consent tombstone to reject late/replayed events after withdrawal.
}
export async function revokeVisitor(site:WidgetSite,visitor:string) {
  const db=database();
  await db.batch([
    db.prepare("INSERT INTO widget_visitors (id,site_id,consent_version,consent_at,revoked_at,origin,last_seen) VALUES (?,?,?,0,?,'',?) ON CONFLICT(id) DO UPDATE SET revoked_at=COALESCE(widget_visitors.revoked_at,excluded.revoked_at),lead_id=NULL").bind(visitor,site.id,WIDGET_CONSENT_VERSION,Date.now(),Date.now()),
    db.prepare("DELETE FROM widget_events WHERE site_id=? AND visitor_id=?").bind(site.id,visitor),
    db.prepare("DELETE FROM widget_sessions WHERE site_id=? AND visitor_id=?").bind(site.id,visitor),
    db.prepare("UPDATE widget_submissions SET visitor_id=NULL WHERE site_id=? AND visitor_id=?").bind(site.id,visitor),
  ]);
}
export async function handleWidget(request:Request,id:string) {
  let origin:string|null=null;
  const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","Vary":"Origin",...(origin?{"Access-Control-Allow-Origin":origin}:{}),...(status===429?{"Retry-After":"60"}:{})}});
  try{
    const site=await siteById(id,false);origin=publicOrigin(request,site);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"600","Vary":"Origin"}});
    if(request.method==="GET"){
      if(!site.enabled)throw new HttpError(404,"Widget unavailable.");
      const voice=await getVoiceSettings(site.client_id);
      return respond({id:site.id,name:site.name,privacyUrl:site.privacy_url,courses:JSON.parse(site.courses),color:site.color,retentionDays:site.retention_days,version:WIDGET_CONSENT_VERSION,analyticsNotice:ANALYTICS_NOTICE,contactNotice:CONTACT_NOTICE,whatsappNotice:WHATSAPP_NOTICE,callingEnabled:!!voice.admin_enabled&&(!!voice.test_mode||!!voice.client_enabled),callingTestMode:!!voice.test_mode,callNotice:CALL_NOTICE});
    }
    let raw:unknown;try{raw=await readBoundedJson(request,28000);}catch{throw new HttpError(400,"Invalid or oversized request.");}
    const parsed=publicSchema.safeParse(raw);if(!parsed.success)throw new HttpError(400,"Check the form and consent fields.");
    const data=parsed.data,db=database(),now=Date.now();
    if(!site.enabled&&data.action!=="revoke")throw new HttpError(404,"Widget unavailable.");
    await limit(request,site,data.action);
    if(data.action==="revoke"){
      await revokeVisitor(site,await visitorId(site.id,data.visitorKey));return respond({ok:true});
    }
    if(data.action==="consent"){
      if(request.headers.get("sec-gpc")==="1")throw new HttpError(403,"Your browser has requested privacy. Enquiries still work without analytics.");
      const visitor=await visitorId(site.id,data.visitorKey),session=await hashValue(`widget-session:${site.id}:${visitor}:${data.sessionId}`);
      const previous=await db.prepare("SELECT revoked_at FROM widget_visitors WHERE id=?").bind(visitor).first<{revoked_at:number|null}>();
      if(previous?.revoked_at)throw new HttpError(409,"This activity identity was withdrawn. Choose analytics again to start a new identity.");
      await db.batch([
        db.prepare("INSERT INTO widget_visitors (id,site_id,consent_version,consent_at,origin,last_seen) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen WHERE widget_visitors.revoked_at IS NULL").bind(visitor,site.id,WIDGET_CONSENT_VERSION,now,origin,now),
        db.prepare("INSERT INTO widget_sessions (id,site_id,visitor_id,started_at,last_seen,expires_at,attribution,device) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM widget_visitors WHERE id=? AND revoked_at IS NULL) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen").bind(session,site.id,visitor,now,now,now+site.retention_days*DAY,JSON.stringify(attribution(data.attribution)),data.device,visitor),
      ]);
      await purgeExpiredWidgetData(site.id);
      return respond({token:await sign({site:site.id,origin,visitor,session,expires:now+2*3600000}),expiresAt:now+2*3600000});
    }
    if(data.action==="events"){
      const c=await verify(data.token,site,origin);
      const session=await db.prepare("SELECT started_at FROM widget_sessions WHERE id=?").bind(c.session).first<{started_at:number}>();
      const events=data.events.map(e=>{
        const p=properties[e.type].safeParse(e.properties);
        if(!p.success||e.at<Math.max(session!.started_at-1000,now-DAY)||e.at>now+60000)throw new HttpError(400,"Invalid activity event.");
        if(e.type==="course_view"&&!(JSON.parse(site.courses) as WidgetCourse[]).some(x=>x.id===(p.data as {course:string}).course))throw new HttpError(400,"Unknown course.");
        return {...e,path:safePath(e.path),properties:p.data};
      }).filter(e=>e.path!=="/[private]");
      const statements=[];
      for(const e of events)statements.push(db.prepare("INSERT INTO widget_events (id,site_id,session_id,visitor_id,type,path,properties,occurred_at,received_at,expires_at,schema_version) SELECT ?,?,?,?,?,?,?,?,?,?,1 WHERE EXISTS (SELECT 1 FROM widget_visitors WHERE id=? AND revoked_at IS NULL) ON CONFLICT(id) DO NOTHING RETURNING id").bind(await hashValue(`widget-event:${site.id}:${c.session}:${e.id}`),site.id,c.session,c.visitor,e.type,e.path,JSON.stringify(e.properties),Math.min(e.at,now),now,now+site.retention_days*DAY,c.visitor));
      statements.push(db.prepare("UPDATE widget_sessions SET last_seen=? WHERE id=?").bind(now,c.session));
      statements.push(db.prepare("UPDATE widget_visitors SET last_seen=? WHERE id=? AND revoked_at IS NULL").bind(now,c.visitor));
      const saved=await db.batch(statements);
      return respond({ok:true,accepted:saved.slice(0,events.length).reduce((n,r)=>n+r.results.length,0)});
    }
    if(data.website||now-data.startedAt<1200||now-data.startedAt>DAY)throw new HttpError(400,"Please complete the enquiry form and try again.");
    const course=(JSON.parse(site.courses) as WidgetCourse[]).find(c=>c.id===data.course);
    if(!course)throw new HttpError(400,"Choose an available course.");
    const c=data.token?await verify(data.token,site,origin):null;
    const submissionId=await hashValue(`widget-submission:${site.id}:${data.requestId}`);
    const payloadHash=await hashValue(JSON.stringify([data.name,data.phone,data.email.toLowerCase(),data.course,data.whatsappConsent,...(data.callConsent?[true]:[])]));
    const existing=await db.prepare("SELECT payload_hash,lead_id FROM widget_submissions WHERE id=? AND site_id=?").bind(submissionId,site.id).first<{payload_hash:string;lead_id:string}>();
    if(existing){if(existing.payload_hash!==payloadHash)throw new HttpError(409,"This enquiry was already submitted. Open a new enquiry to change your details.");await queueVoiceCall(site.client_id,existing.lead_id);return respond({ok:true,reference:data.requestId});}
    const lead=await hashValue(`coaching:${site.client_id}:${data.phone}`);
    const evidence=`${WIDGET_CONSENT_VERSION}; ${origin}; ${WHATSAPP_NOTICE}`;
    const statements=[
      db.prepare("INSERT INTO leads (id,client_id,external_ref,payload_hash,name,email,phone,brief,consent_evidence,consent_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(lead,site.client_id,`coaching:${data.phone}`,payloadHash,data.name,data.email.toLowerCase(),data.phone,course.label,data.whatsappConsent?evidence:"",data.whatsappConsent?now:null,now,now),
      db.prepare("INSERT INTO coaching_students (lead_id,client_id,phone,course,centre,source,handoff) VALUES (?,?,?,?,?,?,1) ON CONFLICT(lead_id) DO NOTHING").bind(lead,site.client_id,data.phone,data.course,"Undecided",`Website widget · ${site.name}`),
      db.prepare("INSERT INTO widget_submissions (id,site_id,lead_id,visitor_id,payload_hash,course,origin,contact_consent_at,whatsapp_consent_at,consent_version,consent_text,created_at) VALUES (?,?,?,CASE WHEN EXISTS(SELECT 1 FROM widget_visitors WHERE id=? AND revoked_at IS NULL) THEN ? ELSE NULL END,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(submissionId,site.id,lead,c?.visitor||null,c?.visitor||null,payloadHash,data.course,origin,now,data.whatsappConsent?now:null,WIDGET_CONSENT_VERSION,`${CONTACT_NOTICE}${data.whatsappConsent?` ${WHATSAPP_NOTICE}`:""}`,now),
    ];
    if(data.callConsent)statements.push(db.prepare("UPDATE leads SET call_consent_at=COALESCE(call_consent_at,?),call_consent_evidence=CASE WHEN call_consent_at IS NULL THEN ? ELSE call_consent_evidence END WHERE id=? AND client_id=? AND opted_out_at IS NULL").bind(now,`AI-call-v1; ${origin}; form ${data.requestId}; ${CALL_NOTICE}`,lead,site.client_id));
    if(c)statements.push(db.prepare("UPDATE widget_visitors SET lead_id=COALESCE(lead_id,?) WHERE id=? AND site_id=? AND revoked_at IS NULL").bind(lead,c.visitor,site.id));
    await db.batch(statements);
    await queueVoiceCall(site.client_id,lead);
    return respond({ok:true,reference:data.requestId},201);
  }catch(e){
    if(e instanceof HttpError)return respond({error:e.message},e.status);
    console.error("Orbit widget request failed");return respond({error:"Unable to save right now. Please try again."},503);
  }
}
