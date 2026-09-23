import { z } from "zod";
import { database, runtimeConfig } from "@/db/connection";
import { body,clientAccess,endpoint,HttpError,identity,reply } from "@/lib/operations-access";
import { openingLine,SARVAM_AGENT_TEMPLATE,voiceContextSchema } from "@/lib/voice-shared";
import { getVoiceSettings,isDemoClient,processVoiceCalls,suppressVoiceContact } from "@/lib/voice";
import { CallProviderError,checkSarvamConnection,voiceConnector } from "@/lib/voice-sarvam";

export const GET=(request:Request)=>endpoint(async()=>{
  const user=await identity(),db=database(),url=new URL(request.url),client=url.searchParams.get("client");
  if(!client) {
    const rows=user.owner?await db.prepare("SELECT id,name FROM clients WHERE active=1 ORDER BY name LIMIT 200").all():await db.prepare("SELECT DISTINCT c.id,c.name FROM clients c JOIN memberships m ON m.client_id=c.id WHERE c.active=1 AND m.active=1 AND (m.user_id=? OR(m.user_id IS NULL AND m.email=?)) ORDER BY c.name LIMIT 200").bind(user.id,user.email).all();
    return reply({owner:user.owner,clients:rows.results});
  }
  const access=await clientAccess(client),cfg=await getVoiceSettings(client),demo=await isDemoClient(client),connector=voiceConnector(client);
  const page=Number(url.searchParams.get("page")||0);if(!Number.isInteger(page)||page<0||page>10000)throw new HttpError(400,"Invalid page.");
  const call=url.searchParams.get("call");
  const cutoff=Date.now()-90*86400000;
  const detail=call?await db.prepare("SELECT v.id,v.status,v.error_code,v.outcome,CASE WHEN v.updated_at>=? THEN v.summary END AS summary,CASE WHEN v.updated_at>=? THEN v.answers END AS answers,l.name,v.phone,v.created_at FROM voice_calls v JOIN leads l ON l.id=v.lead_id AND l.client_id=v.client_id WHERE v.id=? AND v.client_id=?").bind(cutoff,cutoff,call,client).first():null;
  if(call&&!detail)throw new HttpError(404,"Call unavailable.");
  const attempts=call?await db.prepare("SELECT attempt_number,status,duration,CASE WHEN started_at>=? THEN transcript END AS transcript,started_at,finished_at FROM voice_attempts WHERE call_id=? AND client_id=? ORDER BY attempt_number").bind(cutoff,call,client).all():null;
  const [rows,totals]=await Promise.all([
    db.prepare("SELECT v.id,v.status,v.attempts,v.next_at,v.outcome,v.error_code,v.created_at,v.updated_at,l.name,v.phone FROM voice_calls v JOIN leads l ON l.id=v.lead_id AND l.client_id=v.client_id WHERE v.client_id=? ORDER BY v.created_at DESC,v.id LIMIT 26 OFFSET ?").bind(client,page*25).all(),
    db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status='queued'),0) AS queued,COALESCE(SUM(status='completed'),0) AS completed,COALESCE(SUM(outcome='interested'),0) AS interested,COALESCE(SUM(outcome IN('human_requested','callback_requested') OR status IN('needs_review','failed','blocked')),0) AS attention FROM voice_calls WHERE client_id=?").bind(client).first(),
  ]);
  const heartbeat=await db.prepare("SELECT expires_at FROM rate_limits WHERE key='voice-runner-heartbeat'").first<{expires_at:number}>();
  const runnerReady=!!runtimeConfig().ORBIT_RUNNER_TOKEN&&!!heartbeat&&heartbeat.expires_at>Date.now();
  const issues=[...(demo?["Demo workspace: real calls are disabled."]:[]),...(!connector?["Admin must connect a Sarvam Voice Agent and calling number."]:[]),...(!runnerReady?["The scheduled calling runner is not connected or has stopped. Ask your admin to check it."]:[]),...(!cfg.business_context||!cfg.role_context?["Save the business context and call purpose."]:[])];
  return reply({owner:access.user.owner,client:access.client,settings:cfg,demo,connectionReady:!!connector,voicePreviewReady:!!runtimeConfig().ORBIT_SARVAM_KEY,issues,template:access.user.owner?SARVAM_AGENT_TEMPLATE:undefined,opening:openingLine(access.client.name,cfg.language),calls:rows.results.slice(0,25),hasMore:rows.results.length>25,page,totals,detail:detail?{...detail,answers:JSON.parse(String(detail.answers||"{}")),attempts:attempts?.results.map(a=>({...a,transcript:a.transcript?JSON.parse(String(a.transcript)):null}))}:null});
});
const client=z.string().uuid(),revision=z.number().int().nonnegative();
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("context"),client,revision,...voiceContextSchema.shape}).strict(),
  z.object({action:z.literal("admin"),client,revision,enabled:z.boolean(),testMode:z.boolean().default(true),dailyLimit:z.number().int().min(1).max(100),startHour:z.number().int().min(9).max(19),endHour:z.number().int().min(10).max(20),maxAttempts:z.number().int().min(1).max(2)}).strict(),
  z.object({action:z.literal("activate"),client,revision,enabled:z.boolean()}).strict(),
  z.object({action:z.literal("stop"),client,call:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  z.object({action:z.literal("process"),client}).strict(),
  z.object({action:z.literal("voicePreview"),client}).strict(),
  z.object({action:z.literal("runnerSecret"),client}).strict(),
  z.object({action:z.literal("checkConnection"),client}).strict(),
]);
export const POST=(request:Request)=>endpoint(async()=>{
  const data=await body(request,schema,20000),{user,client}=await clientAccess(data.client),db=database(),now=Date.now();
  if((data.action==="admin"||data.action==="process"||data.action==="runnerSecret"||data.action==="checkConnection")&&!user.owner)throw new HttpError(403,"Only the studio owner can manage call access and limits.");
  if(data.action==="checkConnection") {
    const connector=voiceConnector(data.client);
    if(!connector)throw new HttpError(409,"Complete the Sarvam connection first.");
    try{return reply(await checkSarvamConnection(connector));}
    catch(error){if(error instanceof CallProviderError)return reply({ok:false,code:error.code});throw error;}
  }
  if(data.action==="process")return reply({ok:true,processed:await processVoiceCalls(data.client)});
  if(data.action==="runnerSecret") {
    const token=runtimeConfig().ORBIT_RUNNER_TOKEN;
    if(!token)throw new HttpError(409,"Runner token is not configured in the site environment.");
    return reply({ok:true,runnerToken:token});
  }
  if(data.action==="stop") {
    const row=await db.prepare("SELECT phone FROM voice_calls WHERE id=? AND client_id=?").bind(data.call,data.client).first<{phone:string}>();
    if(!row)throw new HttpError(404,"Call unavailable.");
    await suppressVoiceContact(data.client,row.phone,"operator_request");return reply({ok:true});
  }
  if(data.action==="voicePreview") {
    const key=runtimeConfig().ORBIT_SARVAM_KEY;if(!key)throw new HttpError(409,"Sarvam voice preview is not connected.");
    const bucket=Math.floor(now/60000),limit=await db.prepare("INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits").bind(`voice-preview:${data.client}:${bucket}`,(bucket+1)*60000).first<{hits:number}>();
    if((limit?.hits||0)>3)throw new HttpError(429,"Wait a minute before listening again.");
    let response:Response;
    try {response=await fetch("https://api.sarvam.ai/text-to-speech",{method:"POST",headers:{"api-subscription-key":key,"Content-Type":"application/json"},body:JSON.stringify({text:"नमस्ते! मैं आपकी ए आई सहायक हूँ। आपकी पूछताछ के बारे में बात करने के लिए क्या यह सही समय है?",language_code:"hi-IN",speaker:"priya",model:"bulbul:v3"}),redirect:"error",signal:AbortSignal.timeout(20000)});}catch{throw new HttpError(502,"Voice preview is unavailable. Please try again.");}
    if(!response.ok)throw new HttpError(502,`Sarvam could not generate the preview (${response.status}). Ask the owner to check the model API key and credits.`);
    const result=await response.json() as {audios?:string[]};const audio=result.audios?.[0];if(!audio||audio.length>3000000)throw new HttpError(502,"Sarvam returned an invalid preview.");
    return reply({ok:true,audio,mimeType:"audio/wav"});
  }
  const initial=await getVoiceSettings(data.client);
  await db.prepare("INSERT INTO voice_settings(client_id,admin_enabled,test_mode,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(client_id) DO NOTHING").bind(data.client,initial.admin_enabled,initial.test_mode,now,user.id).run();
  const cfg=await getVoiceSettings(data.client);
  if(cfg.revision!==data.revision)throw new HttpError(409,"Settings changed. Refresh before saving again.");
  let changed;
  if(data.action==="admin") {
    if(data.endHour<=data.startHour)throw new HttpError(400,"End time must be after the start time.");
    if(!data.testMode&&await isDemoClient(data.client))throw new HttpError(409,"Keep the synthetic demo in test mode. Use a real client workspace for live calls.");
    changed=await db.prepare("UPDATE voice_settings SET admin_enabled=?,test_mode=?,client_enabled=CASE WHEN ?=0 OR ?!=test_mode THEN 0 ELSE client_enabled END,daily_limit=?,start_hour=?,end_hour=?,max_attempts=?,revision=revision+1,updated_at=?,updated_by=? WHERE client_id=? AND revision=? RETURNING client_id").bind(+data.enabled,+data.testMode,+data.enabled,+data.testMode,data.dailyLimit,data.startHour,data.endHour,data.maxAttempts,now,user.id,data.client,data.revision).first();
  } else if(data.action==="context") {
    if(!user.owner&&!cfg.admin_enabled)throw new HttpError(403,"Ask the owner to enable AI calling for this workspace first.");
    changed=await db.prepare("UPDATE voice_settings SET business_context=?,role_context=?,language=?,revision=revision+1,updated_at=?,updated_by=? WHERE client_id=? AND revision=? RETURNING client_id").bind(data.businessContext,data.roleContext,data.language,now,user.id,data.client,data.revision).first();
  } else {
    if(data.enabled) {
      if(!cfg.admin_enabled)throw new HttpError(403,"The owner must enable this feature first.");
      if(cfg.test_mode)throw new HttpError(409,"The owner must switch this workspace from test capture to live mode first.");
      if(await isDemoClient(data.client))throw new HttpError(409,"This demo workspace cannot make real phone calls.");
      if(!voiceConnector(data.client)||!voiceContextSchema.safeParse({businessContext:cfg.business_context,roleContext:cfg.role_context,language:cfg.language}).success)throw new HttpError(409,"Complete the calling connection and business context before activation.");
      const heartbeat=await db.prepare("SELECT expires_at FROM rate_limits WHERE key='voice-runner-heartbeat'").first<{expires_at:number}>();
      if(!runtimeConfig().ORBIT_RUNNER_TOKEN||!heartbeat||heartbeat.expires_at<=now)throw new HttpError(409,"Connect the scheduled runner before activating calls.");
    }
    changed=await db.prepare("UPDATE voice_settings SET client_enabled=?,revision=revision+1,updated_at=?,updated_by=? WHERE client_id=? AND revision=? RETURNING client_id").bind(+data.enabled,now,user.id,data.client,data.revision).first();
  }
  if(!changed)throw new HttpError(409,"Settings changed. Refresh before saving again.");
  if((data.action==="activate"||data.action==="admin")&&(!data.enabled||(data.action==="admin"&&data.testMode)))await db.prepare("UPDATE voice_calls SET status='cancelled',error_code='calling_paused',updated_at=? WHERE client_id=? AND status IN('queued','blocked')").bind(now,data.client).run();
  return reply({ok:true});
});
