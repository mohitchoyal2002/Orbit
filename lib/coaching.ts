import { z } from "zod";
import { database, runtimeConfig } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { HttpError } from "@/lib/operations-access";
import { connectionStatus, queueJob } from "@/lib/workflow-engine";
import { coachingCourses, courseName, DEMO_CLIENT, indiaTime, type Student, type CoachingSlot } from "./coaching-shared";
import { understandWithGemini } from "./coaching-gemini";
import { callConsentFields,validateCallConsent } from "./voice-shared";
import { queueVoiceCall } from "./voice";

export const phoneInput=z.string().trim().transform(v=>{
  const p=v.replace(/[\s()\-]/g,"");return /^[6-9]\d{9}$/.test(p)?`+91${p}`:p;
}).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Use a 10-digit Indian number or an international number starting with +."));
export const coachingLeadInput=z.object({
  name:z.string().trim().min(2).max(100),phone:phoneInput,
  email:z.union([z.string().trim().email().max(254),z.literal("")]).default(""),
  course:z.enum(["mern","data-science","data-analytics","java","python","testing","undecided"]).default("undecided"),
  centre:z.enum(["Bhawarkua","Vijay Nagar","Online"]).default("Bhawarkua"),
  source:z.string().trim().min(2).max(160).default("Manual entry"),
  consentAt:z.number().int().positive().nullable().default(null),consentEvidence:z.string().trim().max(1000).default(""),
  ...callConsentFields,
}).strict().superRefine((v,ctx)=>{
  validateCallConsent(v,ctx);
  if((v.consentAt && (v.consentAt>Date.now()||v.consentEvidence.length<10))||(!v.consentAt&&v.consentEvidence))ctx.addIssue({code:"custom",message:"Record the actual opt-in time and its evidence together."});
});
export type CoachingInput=z.output<typeof coachingLeadInput>;
type Settings={client_id:string;is_demo:number;name:string};
export async function settings(client:string):Promise<Settings>{
  const row=await database().prepare("SELECT s.*, c.name FROM coaching_settings s JOIN clients c ON c.id=s.client_id WHERE s.client_id=? AND c.active=1").bind(client).first<Settings>();
  if(!row)throw new HttpError(404,"Coaching workspace is not enabled.");return row;
}
export async function student(client:string,id:string):Promise<Student>{
  const row=await database().prepare("SELECT l.id,l.name,l.email,l.phone,l.consent_at,l.consent_evidence,l.opted_out_at,l.follow_up_at,l.created_at,s.course,s.centre,s.learning_mode,s.background,s.source,s.stage,s.assigned_to,s.handoff,s.last_inbound_at FROM coaching_students s JOIN leads l ON l.id=s.lead_id AND l.client_id=s.client_id WHERE s.client_id=? AND s.lead_id=?").bind(client,id).first<Student>();
  if(!row)throw new HttpError(404,"Student unavailable.");return row;
}
export async function createDemo(){
  const db=database(),now=Date.now();
  await db.batch([
    db.prepare("INSERT INTO clients (id,name,intake_key_hash,created_at) VALUES (?,?,'demo-no-external-intake',?) ON CONFLICT(id) DO NOTHING").bind(DEMO_CLIENT,"Programmer’s Point · OrbitFlow demo",now),
    db.prepare("INSERT INTO coaching_settings (client_id,is_demo,created_at) VALUES (?,1,?) ON CONFLICT(client_id) DO NOTHING").bind(DEMO_CLIENT,now),
  ]);
  const day=Math.floor(now/86400000)*86400000;
  for(const [i,c] of coachingCourses.entries()){
    for(let n=1;n<=3;n++){
      const time=day+n*86400000+(11+i)*3600000;
      await db.prepare("INSERT INTO coaching_slots (id,client_id,course,centre,starts_at,capacity) VALUES (?,?,?,?,?,1) ON CONFLICT(id) DO NOTHING").bind(`demo:${c.id}:${time}`,DEMO_CLIENT,c.id,n===2?"Vijay Nagar":"Bhawarkua",time).run();
    }
  }
  // Ofcom-reserved fictional mobile range. No external workflow runs in this preset.
  for(const [i,name] of ["Aarav Demo","Meera Demo","Kabir Demo"].entries())await captureLead(DEMO_CLIENT,coachingLeadInput.parse({name,phone:`+44770090000${i+1}`,course:["mern","python","data-analytics"][i],source:"Synthetic demo data",consentAt:i===2?null:now,consentEvidence:i===2?"":"Simulated permission for synthetic demo data only."}));
  return DEMO_CLIENT;
}
export async function captureLead(client:string,input:CoachingInput){
  const cfg=await settings(client),db=database(),id=await hashValue(`coaching:${client}:${input.phone}`),now=Date.now();
  const previous=await db.prepare("SELECT lead_id FROM coaching_students WHERE client_id=? AND phone=?").bind(client,input.phone).first<{lead_id:string}>();
  if(previous){
    const saved=await student(client,previous.lead_id);
    if(saved.consent_at&&!saved.opted_out_at)await enqueue(client,saved.id,`welcome:${saved.id}`,"welcome",`Hi ${saved.name}, thanks for your interest in ${courseName(saved.course)}. Reply COURSES, DEMO or COUNSELLOR. Reply STOP to opt out.`,[saved.name,courseName(saved.course)]);
    if(input.callConsentAt&&!saved.opted_out_at)await db.prepare("UPDATE leads SET call_consent_at=COALESCE(call_consent_at,?),call_consent_evidence=CASE WHEN call_consent_at IS NULL THEN ? ELSE call_consent_evidence END WHERE id=? AND client_id=? AND opted_out_at IS NULL").bind(input.callConsentAt,input.callConsentEvidence,saved.id,client).run();
    if(input.source!=="Synthetic demo data")await queueVoiceCall(client,saved.id);
    return {id:previous.lead_id,duplicate:true};
  }
  const out=await db.batch([
    db.prepare("INSERT INTO leads (id,client_id,external_ref,payload_hash,name,email,phone,brief,consent_evidence,consent_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id").bind(id,client,`coaching:${input.phone}`,await hashValue(JSON.stringify(input)),input.name,input.email.toLowerCase(),input.phone,courseName(input.course),input.consentEvidence,input.consentAt,now,now),
    db.prepare("INSERT INTO coaching_students (lead_id,client_id,phone,course,centre,source) VALUES (?,?,?,?,?,?) ON CONFLICT(lead_id) DO NOTHING").bind(id,client,input.phone,input.course,input.centre,input.source),
    db.prepare("UPDATE leads SET call_consent_at=COALESCE(call_consent_at,?),call_consent_evidence=CASE WHEN call_consent_at IS NULL THEN ? ELSE call_consent_evidence END WHERE id=? AND client_id=? AND opted_out_at IS NULL").bind(input.callConsentAt,input.callConsentEvidence,id,client),
  ]);
  if(input.consentAt)await enqueue(client,id,`welcome:${id}`,"welcome",`Hi ${input.name}, thanks for your interest in ${courseName(input.course)}. Reply COURSES, DEMO or COUNSELLOR. Reply STOP to opt out.`,[input.name,courseName(input.course)]);
  if(input.source!=="Synthetic demo data")await queueVoiceCall(client,id);
  if(!cfg.is_demo&&input.email&&connectionStatus(client).crm){
    const enabled=await db.prepare("SELECT id FROM workflows WHERE client_id=? AND template='crm.sync' AND enabled=1").bind(client).first();
    if(enabled)await queueJob(client,id,"crm.sync");
  }
  return {id,duplicate:!out[0].results.length};
}
export async function enqueue(client:string,lead:string,id:string,kind:string,text:string,parameters:string[]=[],sendAt=Date.now(),bookingId:string|null=null){
  const cfg=await settings(client),s=await student(client,lead),now=Date.now();
  const blocked=!!s.opted_out_at||(kind!=="text"&&!s.consent_at);
  const status=blocked?"blocked":cfg.is_demo&&sendAt<=now?"simulated":"queued";
  await database().prepare("INSERT INTO coaching_messages (id,client_id,lead_id,direction,kind,body,parameters,status,error_code,send_at,booking_id,created_at,updated_at) VALUES (?,?,?,'outbound',?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(id,client,lead,kind,text,JSON.stringify(parameters),status,blocked?"opt_in_required":null,sendAt,bookingId,now,now).run();
}
export async function availableSlots(client:string,course:string){
  return (await database().prepare("SELECT s.*, (SELECT COUNT(*) FROM coaching_bookings b WHERE b.client_id=s.client_id AND b.slot_id=s.id AND b.status IN ('confirmed','attended')) AS booked FROM coaching_slots s WHERE s.client_id=? AND s.starts_at>? AND (?='undecided' OR s.course=?) ORDER BY s.starts_at,s.id LIMIT 100").bind(client,Date.now(),course,course).all<CoachingSlot>()).results;
}
export async function bookSlot(client:string,lead:string,slotId:string,version=crypto.randomUUID()){
  const db=database(),s=await student(client,lead),now=Date.now();
  if(s.opted_out_at)throw new HttpError(409,"This student has opted out. Confirm a new request with the counsellor.");
  const existing=await db.prepare("SELECT id FROM coaching_bookings WHERE client_id=? AND lead_id=? AND slot_id=? AND status='confirmed'").bind(client,lead,slotId).first<{id:string}>();
  if(existing)version=existing.id;
  const slot=await db.prepare("SELECT * FROM coaching_slots WHERE id=? AND client_id=? AND starts_at>?").bind(slotId,client,now).first<CoachingSlot>();
  if(!slot||s.course!=="undecided"&&slot.course!==s.course)throw new HttpError(409,"Select a future slot for this student's course.");
  const b=await db.prepare("INSERT INTO coaching_bookings (lead_id,id,client_id,slot_id,status,updated_at) SELECT ?,?,?,?,'confirmed',? WHERE (SELECT COUNT(*) FROM coaching_bookings WHERE client_id=? AND slot_id=? AND status IN ('confirmed','attended') AND lead_id!=?) < (SELECT capacity FROM coaching_slots WHERE id=? AND client_id=?) ON CONFLICT(lead_id) DO UPDATE SET id=excluded.id,slot_id=excluded.slot_id,status='confirmed',updated_at=excluded.updated_at WHERE coaching_bookings.client_id=excluded.client_id RETURNING id").bind(lead,version,client,slotId,now,client,slotId,lead,slotId,client).first();
  if(!b)throw new HttpError(409,"That slot just filled up. Select another time.");
  await db.batch([
    db.prepare("UPDATE coaching_students SET stage='booked',course=? WHERE lead_id=? AND client_id=?").bind(slot.course,lead,client),
    db.prepare("UPDATE coaching_messages SET status='cancelled',updated_at=? WHERE client_id=? AND lead_id=? AND booking_id IS NOT NULL AND booking_id!=? AND status IN ('queued','retry')").bind(now,client,lead,version),
  ]);
  const params=[courseName(slot.course),indiaTime(slot.starts_at),slot.centre];
  const text=`Your ${params[0]} demo is booked for ${params[1]} at ${params[2]}. Reply RESCHEDULE or CANCEL if your plans change.`;
  const inside=!!s.last_inbound_at&&now-s.last_inbound_at<86400000;
  await enqueue(client,lead,`booking:${version}`,inside?"text":"booking",text,params,now,version);
  if(slot.starts_at-now>3600000)await enqueue(client,lead,`reminder:${version}`,"reminder",`Reminder: ${params[0]} demo at ${params[1]}, ${params[2]}. Reply CANCEL or RESCHEDULE.`,params,slot.starts_at-3600000,version);
  return {id:version,text};
}
export async function cancelBooking(client:string,lead:string){
  await student(client,lead);const db=database(),now=Date.now();
  await db.batch([
    db.prepare("UPDATE coaching_bookings SET status='cancelled',updated_at=? WHERE client_id=? AND lead_id=? AND status='confirmed'").bind(now,client,lead),
    db.prepare("UPDATE coaching_messages SET status='cancelled',updated_at=? WHERE client_id=? AND lead_id=? AND booking_id IS NOT NULL AND status IN ('queued','retry')").bind(now,client,lead),
    db.prepare("UPDATE coaching_students SET stage=CASE WHEN stage='booked' THEN 'replied' ELSE stage END WHERE client_id=? AND lead_id=?").bind(client,lead),
  ]);
}
export async function optOut(client:string,lead:string){
  await student(client,lead);const db=database(),now=Date.now();
  await db.batch([
    db.prepare("UPDATE leads SET opted_out_at=COALESCE(opted_out_at,?),updated_at=? WHERE id=? AND client_id=?").bind(now,now,lead,client),
    db.prepare("UPDATE coaching_messages SET status='cancelled',error_code='opted_out',updated_at=? WHERE client_id=? AND lead_id=? AND direction='outbound' AND status IN ('queued','retry')").bind(now,client,lead),
    db.prepare("UPDATE coaching_students SET handoff=1 WHERE client_id=? AND lead_id=?").bind(client,lead),
  ]);
}
export async function receiveMessage(client:string,lead:string,providerId:string,text:string,timestamp=Date.now()){
  const db=database(),id=await hashValue(`in:${client}:${providerId}`),s=await student(client,lead),now=Date.now();
  await db.prepare("INSERT INTO coaching_messages (id,client_id,lead_id,direction,kind,body,status,provider_id,send_at,created_at,updated_at) VALUES (?,?,?,'inbound','text',?,'received',?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(id,client,lead,text,providerId,now,Math.min(timestamp,now),now).run();
  // Opt-out suppresses queued sends immediately, even if the assistant runner is delayed.
  if(isStop(text))await optOut(client,s.id);
  return id;
}
const isStop=(s:string)=>/^(stop|unsubscribe|opt\s*out|band|band karo|बंद|बन्द|बंद करो|रोकें)[.!\s]*$/i.test(s.trim())||/please\s+(stop|unsubscribe)|stop\s+(sending|messaging)|no more messages|don.t message|message.*mat bhej|मत.*भेज/.test(s.toLowerCase());
export async function respond(client:string,lead:string,text:string,eventId:string,allowModel=true):Promise<string|null>{
  let s=await student(client,lead);const db=database(),t=text.toLowerCase().trim();
  if(isStop(t)){await optOut(client,lead);return null;}
  if(s.opted_out_at)return null;
  if(/\b(human|counsell?or|agent|teacher|call me)\b|काउंसलर|बात कर/.test(t)){
    await db.prepare("UPDATE coaching_students SET handoff=1 WHERE lead_id=? AND client_id=?").bind(lead,client).run();
    return "A counsellor has been requested. Aapka question aur chat unke dashboard mein hai. Please wait for their reply.";
  }
  if(s.handoff)return null;
  if(/^(cancel|cancel booking|रद्द|रद्द करो)$/.test(t)){await cancelBooking(client,lead);return "Demo booking cancelled. Naya slot dekhne ke liye DEMO reply karein.";}
  if(/\b(fee|fees|price|cost|discount|duration|guarantee|placement|batch date)\b|फीस|गारंटी|अवधि/.test(t)){
    await db.prepare("UPDATE coaching_students SET handoff=1 WHERE lead_id=? AND client_id=?").bind(lead,client).run();
    return "Current fees, duration, batches and placement terms need confirmation from the institute. Counsellor ko request bhej di hai; main unverified figures share nahi karunga.";
  }
  const selected=[[/mern|react|node/,"mern"],[/analytics|power\s*bi|excel/,"data-analytics"],[/data science|machine learning|\bai\b/,"data-science"],[/java(?!script)|spring/,"java"],[/python|django/,"python"],[/testing|selenium/,"testing"]].find(([pattern])=>(pattern as RegExp).test(t));
  if(selected){await db.prepare("UPDATE coaching_students SET course=?,offered_slots='[]' WHERE client_id=? AND lead_id=?").bind(String(selected[1]),client,lead).run();s=await student(client,lead);}
  const mode=/\bonline\b|ऑनलाइन/.test(t)?"Online":/\boffline\b|classroom|ऑफलाइन/.test(t)?"Offline":null;
  if(mode)await db.prepare("UPDATE coaching_students SET learning_mode=? WHERE client_id=? AND lead_id=?").bind(mode,client,lead).run();
  if(/beginner|fresher|non.?it|शुरुआत/.test(t))await db.prepare("UPDATE coaching_students SET background=? WHERE client_id=? AND lead_id=?").bind(text.slice(0,300),client,lead).run();
  const match=t.match(/^(?:book|बुक)\s+([1-3])$/);
  if(match){
    const row=await db.prepare("SELECT offered_slots FROM coaching_students WHERE client_id=? AND lead_id=?").bind(client,lead).first<{offered_slots:string}>();
    const id=JSON.parse(row?.offered_slots||"[]")[Number(match[1])-1];
    if(!id)return "Pehle DEMO reply karke available times dekhein, phir BOOK 1, BOOK 2 ya BOOK 3 bhejein.";
    try{await bookSlot(client,lead,id,`chat:${eventId}`);return null;}catch(err){if(err instanceof HttpError)return err.message+" Reply DEMO for fresh availability.";throw err;}
  }
  if(/demo|reschedule|appointment|डेमो|बुकिंग/.test(t)){
    const cfg=await settings(client),slots=(await availableSlots(client,s.course)).filter(x=>x.booked<x.capacity).slice(0,3);
    await db.prepare("UPDATE coaching_students SET offered_slots=? WHERE client_id=? AND lead_id=?").bind(JSON.stringify(slots.map(x=>x.id)),client,lead).run();
    if(!slots.length)return "Is course ke available demo slots abhi publish nahi hue. COUNSELLOR reply karke suitable time request karein.";
    return `${cfg.is_demo?"Sample demo times (simulation):":"Available demo times:"}\n${slots.map((x,i)=>`${i+1}. ${courseName(x.course)} · ${indiaTime(x.starts_at)} · ${x.centre}`).join("\n")}\nReply BOOK 1, BOOK 2 or BOOK 3. Existing booking changes only after a new slot is confirmed.`;
  }
  if(/course|syllabus|brochure|कोर्स|पाठ्यक्रम/.test(t)&&!selected)return `Courses: ${coachingCourses.map(c=>c.name).join(", ")}. Kaunsa course explore karna hai? Course name reply karein.`;
  if(/beginner|fresher|non.?it|शुरुआत/.test(t))return "Beginner background noted. Right course aur prerequisites counsellor confirm karenge. Aap MERN, Python, Java ya Data Analytics mein interested hain?";
  if(mode)return `${mode} preference saved. DEMO reply karke published demo slots dekhein. Class mode aur batch availability counsellor confirm karenge.`;
  if(selected)return `${courseName(s.course)}: ${coachingCourses.find(c=>c.id===s.course)?.summary} Aap online ya offline learning prefer karte hain? Reply DEMO for a counselling slot, or COUNSELLOR for help.`;
  if(/^(hi|hello|hey|namaste|नमस्ते)[!\s]*$/.test(t))return "Namaste! Main guided course assistant hoon. COURSES, DEMO ya COUNSELLOR reply karein. Aapki learning interest kya hai?";
  if(allowModel&&(await settings(client)).is_demo){
    const command=await understandWithGemini(text,client);
    if(command&&command.toLowerCase()!==t)return respond(client,lead,command,eventId,false);
  }
  await db.prepare("UPDATE coaching_students SET handoff=1 WHERE client_id=? AND lead_id=?").bind(client,lead).run();
  return "Is question ka verified answer mere paas nahi hai. Counsellor ko chat forward kar di hai; woh dashboard se reply kar sakte hain.";
}
export async function processIncoming(client?:string){
  const db=database(),scope=client?" AND m.client_id=?":"",params=client?[client]:[],now=Date.now();
  await db.prepare(`UPDATE coaching_messages SET status='received',claim_token=NULL WHERE direction='inbound' AND status='processing' AND lease_until<? AND attempts<5${client?" AND client_id=?":""}`).bind(now,...params).run();
  let count=0;
  for(let i=0;i<10;i++){
    const claim=crypto.randomUUID();
    const m=await db.prepare(`UPDATE coaching_messages SET status='processing',claim_token=?,lease_until=?,attempts=attempts+1 WHERE id=(SELECT m.id FROM coaching_messages m JOIN clients c ON c.id=m.client_id WHERE c.active=1 AND m.direction='inbound' AND m.status='received' AND m.attempts<5 AND NOT EXISTS (SELECT 1 FROM coaching_messages x WHERE x.client_id=m.client_id AND x.lead_id=m.lead_id AND x.direction='inbound' AND x.status='processing')${scope} ORDER BY m.created_at,m.id LIMIT 1) AND status='received' RETURNING *`).bind(claim,now+120000,...params).first<{id:string;client_id:string;lead_id:string;body:string;created_at:number}>();
    if(!m)break;
    try{
      await db.prepare("UPDATE coaching_students SET last_inbound_at=MAX(COALESCE(last_inbound_at,0),?),stage=CASE WHEN stage='new' THEN 'replied' ELSE stage END WHERE client_id=? AND lead_id=?").bind(m.created_at,m.client_id,m.lead_id).run();
      const result=await respond(m.client_id,m.lead_id,m.body,m.id);
      if(result)await enqueue(m.client_id,m.lead_id,`reply:${m.id}`,"text",result);
      await db.prepare("UPDATE coaching_messages SET status='processed',claim_token=NULL,updated_at=? WHERE id=? AND claim_token=?").bind(Date.now(),m.id,claim).run();count++;
    }catch(err){await db.prepare("UPDATE coaching_messages SET status=CASE WHEN attempts>=5 THEN 'needs_review' ELSE 'received' END,error_code='reply_processing_failed',claim_token=NULL WHERE id=? AND claim_token=?").bind(m.id,claim).run();throw err;}
  }
  return count;
}
