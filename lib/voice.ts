import { database } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { HttpError } from "@/lib/operations-access";
import { callOutcomes, defaultVoiceSettings, nextCallTime, voiceVariables, type VoiceSettings } from "./voice-shared";
import { CallProviderError, placeSarvamCall, voiceConnector, type SarvamResult } from "./voice-sarvam";

const DAY=86400000;
type Lead={id:string;name:string;brief:string;phone:string;client_id:string;call_consent_at:number|null;call_consent_evidence:string;opted_out_at:number|null;status:string;created_at:number};
type Call={id:string;client_id:string;lead_id:string;phone:string;status:string;attempts:number;next_at:number;expires_at:number;active_attempt_id:string|null;created_at:number};
type Attempt={id:string;call_id:string;client_id:string;provider_id:string|null;token_hash:string;status:string;caller_number:string;result_hash:string|null;started_at:number};
export async function getVoiceSettings(client:string) {
  const saved=await database().prepare("SELECT * FROM voice_settings WHERE client_id=?").bind(client).first<VoiceSettings>();
  if(saved)return saved;
  const defaults=defaultVoiceSettings(client);
  // Synthetic coaching workspaces can demonstrate form-to-call capture, never dial.
  if(await isDemoClient(client))defaults.admin_enabled=1;
  return defaults;
}
export async function isDemoClient(client:string) {
  return !!await database().prepare("SELECT client_id FROM coaching_settings WHERE client_id=? AND is_demo=1").bind(client).first();
}
export async function queueVoiceCall(client:string,leadId:string,now=Date.now()) {
  const db=database(),cfg=await getVoiceSettings(client);
  if(!cfg.admin_enabled||(!cfg.test_mode&&!cfg.client_enabled))return null;
  const lead=await db.prepare("SELECT * FROM leads WHERE id=? AND client_id=?").bind(leadId,client).first<Lead>();
  if(cfg.test_mode) {
    if(!lead?.phone)return null;
    const id=await hashValue(`voice:${client}:${lead.phone}`);
    await db.prepare("INSERT INTO voice_calls(id,client_id,lead_id,phone,status,next_at,expires_at,error_code,created_at,updated_at) VALUES(?,?,?,?,'test_saved',?,?,?,?,?) ON CONFLICT(client_id,phone) DO NOTHING").bind(id,client,leadId,lead.phone,now,now+2*DAY,lead.call_consent_at?"test_only":"call_consent_required",now,now).run();
    return id;
  }
  if(!lead||lead.created_at<now-2*DAY||!lead.call_consent_at||lead.call_consent_evidence.length<15||!/^\+[1-9]\d{7,14}$/.test(lead.phone)||lead.opted_out_at||["won","lost"].includes(lead.status))return null;
  if(await isDemoClient(client))return null;
  if(await db.prepare("SELECT id FROM voice_suppression WHERE client_id=? AND phone=?").bind(client,lead.phone).first())return null;
  const id=await hashValue(`voice:${client}:${lead.phone}`),ready=!!voiceConnector(client);
  await db.prepare("INSERT INTO voice_calls (id,client_id,lead_id,phone,status,next_at,expires_at,error_code,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clients WHERE id=? AND active=1) ON CONFLICT(client_id,phone) DO UPDATE SET lead_id=excluded.lead_id,status=excluded.status,next_at=excluded.next_at,expires_at=excluded.expires_at,error_code=excluded.error_code,created_at=excluded.created_at,updated_at=excluded.updated_at WHERE voice_calls.status='test_saved'").bind(id,client,leadId,lead.phone,ready?"queued":"blocked",nextCallTime(now,cfg.start_hour,cfg.end_hour),now+2*DAY,ready?null:"connection_missing",now,now,client).run();
  return id;
}

export async function suppressVoiceContact(client:string,phone:string,reason:string,now=Date.now()) {
  const db=database();
  await db.batch([
    db.prepare("INSERT INTO voice_suppression(id,client_id,phone,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(client_id,phone) DO NOTHING").bind(await hashValue(`voice-stop:${client}:${phone}`),client,phone,reason,now),
    db.prepare("UPDATE voice_calls SET status='cancelled',error_code='do_not_call',updated_at=? WHERE client_id=? AND phone=? AND status IN('queued','blocked')").bind(now,client,phone),
  ]);
}

// Durable outbox. Each accepted attempt is delivered at most once by OrbitFlow.
// Sarvam does not document request idempotency: ambiguous sends always need review.
export async function processVoiceCalls(client?:string,transport:typeof fetch=fetch,now=Date.now()) {
  const db=database(),scope=client?" AND client_id=?":"",params=client?[client]:[];
  await db.prepare(`UPDATE voice_calls SET status='needs_review',error_code='result_overdue',updated_at=? WHERE status IN('dispatching','awaiting_result') AND updated_at<?${scope}`).bind(now,now-90*60000,...params).run();
  await db.prepare(`UPDATE voice_calls SET status='cancelled',error_code='enquiry_expired',updated_at=? WHERE status='queued' AND expires_at<=?${scope}`).bind(now,now,...params).run();
  const dayStart=Math.floor((now+19800000)/DAY)*DAY-19800000;
  // Pick one due call per available client, so a busy or capped workspace cannot
  // starve the others. Two 12-second provider requests fit the background window.
  const rows=await db.prepare(`SELECT * FROM (
    SELECT v.*,ROW_NUMBER() OVER(PARTITION BY v.client_id ORDER BY v.next_at,v.id) AS position
    FROM voice_calls v JOIN voice_settings s ON s.client_id=v.client_id
    WHERE v.status='queued' AND v.next_at<=?${client?" AND v.client_id=?":""}
    AND s.admin_enabled=1 AND s.client_enabled=1 AND s.test_mode=0
    AND NOT EXISTS(SELECT 1 FROM voice_calls busy WHERE busy.client_id=v.client_id AND busy.status IN('dispatching','awaiting_result'))
    AND (SELECT COUNT(*) FROM voice_attempts a WHERE a.client_id=v.client_id AND a.started_at>=? AND a.started_at<?)<s.daily_limit
  ) WHERE position=1 ORDER BY next_at,id LIMIT 2`).bind(now,...params,dayStart,dayStart+DAY).all<Call>();
  const processed:{id:string;status:string}[]=[];
  for(const call of rows.results) {
    const cfg=await getVoiceSettings(call.client_id),connector=voiceConnector(call.client_id);
    const company=await db.prepare("SELECT name FROM clients WHERE id=? AND active=1").bind(call.client_id).first<{name:string}>();
    const lead=await db.prepare("SELECT * FROM leads WHERE id=? AND client_id=?").bind(call.lead_id,call.client_id).first<Lead>();
    const stop=await db.prepare("SELECT id FROM voice_suppression WHERE client_id=? AND phone=?").bind(call.client_id,call.phone).first();
    const opted=await db.prepare("SELECT id FROM leads WHERE client_id=? AND phone=? AND opted_out_at IS NOT NULL LIMIT 1").bind(call.client_id,call.phone).first();
    const invalid=!company||!lead||!lead.call_consent_at||lead.call_consent_evidence.length<15||lead.phone!==call.phone||stop||opted||["won","lost"].includes(lead.status)||await isDemoClient(call.client_id);
    if(invalid||call.attempts>=cfg.max_attempts) {
      await db.prepare("UPDATE voice_calls SET status='cancelled',error_code=?,updated_at=? WHERE id=? AND status='queued'").bind(invalid?"contact_ineligible":"attempt_limit",now,call.id).run();continue;
    }
    if(!cfg.admin_enabled||!cfg.client_enabled||cfg.test_mode)continue;
    if(!connector||!cfg.business_context||!cfg.role_context) {
      await db.prepare("UPDATE voice_calls SET status='blocked',error_code='setup_incomplete',updated_at=? WHERE id=? AND status='queued'").bind(now,call.id).run();continue;
    }
    const next=nextCallTime(now,cfg.start_hour,cfg.end_hour);
    if(next!==now){await db.prepare("UPDATE voice_calls SET next_at=? WHERE id=? AND status='queued'").bind(next,call.id).run();continue;}
    const attempt=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await hashValue(token);
    // Claim and attempt insertion share a transaction; the daily cap and single active
    // call per client are checked inside the claim, including competing runners.
    const result=await db.batch([
      db.prepare(`UPDATE voice_calls SET status='dispatching',active_attempt_id=?,attempts=attempts+1,updated_at=?,error_code=NULL
        WHERE id=? AND status='queued' AND next_at<=? AND expires_at>?
        AND EXISTS(SELECT 1 FROM voice_settings WHERE client_id=? AND admin_enabled=1 AND client_enabled=1 AND test_mode=0 AND revision=?)
        AND NOT EXISTS(SELECT 1 FROM voice_calls v WHERE v.client_id=? AND v.status IN('dispatching','awaiting_result'))
        AND (SELECT COUNT(*) FROM voice_attempts WHERE client_id=? AND started_at>=? AND started_at<?)<? RETURNING id`).bind(attempt,now,call.id,now,now,call.client_id,cfg.revision,call.client_id,call.client_id,dayStart,dayStart+DAY,cfg.daily_limit),
      db.prepare(`INSERT INTO voice_attempts(id,client_id,call_id,attempt_number,token_hash,context_snapshot,settings_revision,caller_number,started_at)
        SELECT ?,client_id,id,attempts,?,?,?,?,? FROM voice_calls WHERE id=? AND active_attempt_id=? AND status='dispatching'`).bind(attempt,tokenHash,JSON.stringify(voiceVariables(cfg,lead!,company!.name)),cfg.revision,connector.agentPhoneNumber,now,call.id,attempt),
    ]);
    if(!result[0].results.length)continue;
    // Recheck switches and contact eligibility after claiming, immediately before network I/O.
    const current=await db.prepare(`SELECT v.id FROM voice_calls v JOIN voice_settings s ON s.client_id=v.client_id JOIN leads l ON l.id=v.lead_id JOIN clients c ON c.id=v.client_id
      WHERE v.id=? AND v.active_attempt_id=? AND v.status='dispatching' AND c.active=1 AND s.admin_enabled=1 AND s.client_enabled=1 AND s.test_mode=0 AND s.revision=? AND l.opted_out_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM voice_suppression WHERE client_id=v.client_id AND phone=v.phone)`).bind(call.id,attempt,cfg.revision).first();
    if(!current){await db.batch([db.prepare("UPDATE voice_calls SET status='cancelled',error_code='settings_changed',updated_at=? WHERE id=? AND active_attempt_id=? AND status='dispatching'").bind(now,call.id,attempt),db.prepare("UPDATE voice_attempts SET status='cancelled',finished_at=? WHERE id=?").bind(now,attempt)]);continue;}
    const callback=`https://www.orbitflow.work/api/voice/webhook/${attempt}?token=${encodeURIComponent(token)}`;
    try {
      const providerId=await placeSarvamCall(connector,cfg,lead!,company!.name,callback,attempt,transport);
      // A fast completion webhook may arrive before the outbound HTTP response.
      await db.batch([
        db.prepare("UPDATE voice_attempts SET provider_id=?,status=CASE WHEN status='dispatching' THEN 'awaiting_result' ELSE status END WHERE id=? AND (provider_id IS NULL OR provider_id=?)").bind(providerId,attempt,providerId),
        db.prepare("UPDATE voice_calls SET status='awaiting_result',updated_at=? WHERE id=? AND active_attempt_id=? AND status='dispatching'").bind(now,call.id,attempt),
      ]);
      processed.push({id:call.id,status:"awaiting_result"});
    }catch(e) {
      if(!(e instanceof CallProviderError))throw e;
      const status=e.review?"needs_review":"failed";
      await db.batch([
        db.prepare("UPDATE voice_attempts SET status=? WHERE id=? AND status='dispatching'").bind(status,attempt),
        db.prepare("UPDATE voice_calls SET status=?,error_code=?,updated_at=? WHERE id=? AND active_attempt_id=? AND status='dispatching'").bind(status,e.code,now,call.id,attempt),
      ]);processed.push({id:call.id,status});
    }
  }
  return processed;
}

export async function acceptVoiceResult(attemptId:string,token:string,result:SarvamResult,now=Date.now()) {
  const db=database(),attempt=await db.prepare("SELECT * FROM voice_attempts WHERE id=?").bind(attemptId).first<Attempt>();
  if(!attempt||token.length!==72||await hashValue(token)!==attempt.token_hash)throw new HttpError(401,"Invalid callback credentials.");
  if(now-attempt.started_at>7*DAY)throw new HttpError(410,"Callback expired.");
  if(attempt.provider_id&&attempt.provider_id!==result.attempt_id||result.channel_info.agent_phone_number!==attempt.caller_number)throw new HttpError(409,"Call identity mismatch.");
  const digest=await hashValue(JSON.stringify(result));
  if(attempt.result_hash){if(attempt.result_hash!==digest)throw new HttpError(409,"Conflicting call result.");return {ok:true,duplicate:true};}
  if(!["dispatching","awaiting_result","needs_review"].includes(attempt.status))throw new HttpError(409,"This attempt cannot accept a result.");
  const call=await db.prepare("SELECT * FROM voice_calls WHERE id=? AND client_id=?").bind(attempt.call_id,attempt.client_id).first<Call>();
  if(!call||call.active_attempt_id!==attemptId)throw new HttpError(409,"Attempt is no longer active.");
  const variables=result.final_agent_variables||{},text=(key:string,max=1500)=>typeof variables[key]==="string"?String(variables[key]).slice(0,max):"";
  let outcome=callOutcomes.includes(variables.outcome as typeof callOutcomes[number])?String(variables.outcome):"unknown";
  const declined=variables.do_not_call===true||variables.do_not_call==="true"||["do_not_call","wrong_number"].includes(outcome);
  if(declined&&outcome!=="wrong_number")outcome="do_not_call";
  const answers={interest:text("interest"),questions:text("questions"),callback_request:text("callback_request"),next_action:text("next_action"),do_not_call:declined};
  const summary=text("summary",4000),cfg=await getVoiceSettings(call.client_id);
  const retry=(result.status==="busy"||result.status==="no_answer")&&call.attempts<cfg.max_attempts&&cfg.admin_enabled&&cfg.client_enabled;
  const next=nextCallTime(now+4*3600000,cfg.start_hour,cfg.end_hour),canRetry=retry&&next<call.expires_at;
  const hasOptOutResult=declined||[true,false,"true","false"].includes(variables.do_not_call as boolean|string);
  const extractionIncomplete=result.status==="connected"&&(outcome==="unknown"||!summary.trim()||!hasOptOutResult);
  const status=result.status==="connected"?(extractionIncomplete?"needs_review":"completed"):canRetry?"queued":result.status;
  const errorCode=extractionIncomplete?"extraction_incomplete":result.status==="failed"?"provider_call_failed":null;
  const statements=[
    db.prepare("UPDATE voice_attempts SET provider_id=?,status=?,duration=?,interaction_id=?,transcript=?,result_hash=?,finished_at=? WHERE id=? AND result_hash IS NULL RETURNING id").bind(result.attempt_id,result.status,result.duration??null,result.interaction_id??null,JSON.stringify(result.interaction_transcript||[]),digest,now,attemptId),
    db.prepare("UPDATE voice_calls SET status=?,outcome=?,summary=?,answers=?,next_at=?,error_code=?,updated_at=? WHERE id=? AND active_attempt_id=? AND EXISTS(SELECT 1 FROM voice_attempts WHERE id=? AND result_hash=?)").bind(status,result.status==="connected"?outcome:null,summary,JSON.stringify(answers),canRetry?next:call.next_at,errorCode,now,call.id,attemptId,attemptId,digest),
  ];
  if(declined)statements.push(
    db.prepare("INSERT INTO voice_suppression(id,client_id,phone,reason,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM voice_attempts WHERE id=? AND result_hash=?) ON CONFLICT(client_id,phone) DO NOTHING").bind(await hashValue(`voice-stop:${call.client_id}:${call.phone}`),call.client_id,call.phone,outcome,now,attemptId,digest),
    db.prepare("UPDATE voice_calls SET status='cancelled',error_code='do_not_call',updated_at=? WHERE client_id=? AND phone=? AND status IN('queued','blocked') AND EXISTS(SELECT 1 FROM voice_suppression WHERE client_id=? AND phone=?)").bind(now,call.client_id,call.phone,call.client_id,call.phone),
  );
  const applied=await db.batch(statements);
  if(!applied[0].results.length){const saved=await db.prepare("SELECT result_hash FROM voice_attempts WHERE id=?").bind(attemptId).first<{result_hash:string}>();if(saved?.result_hash!==digest)throw new HttpError(409,"Conflicting call result.");}
  return {ok:true,duplicate:false};
}

export async function purgeVoiceTranscripts(now=Date.now()) {
  const db=database();await db.batch([
    db.prepare("UPDATE voice_attempts SET transcript=NULL,context_snapshot='{}' WHERE started_at<? AND (transcript IS NOT NULL OR context_snapshot!='{}')").bind(now-90*DAY),
    db.prepare("UPDATE voice_calls SET summary=NULL,answers=NULL WHERE updated_at<? AND (summary IS NOT NULL OR answers IS NOT NULL)").bind(now-90*DAY),
  ]);
}
