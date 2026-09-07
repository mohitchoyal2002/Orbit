import { z } from "zod";
import { database } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { body, clientAccess, endpoint, HttpError, identity, monthBounds, ownerAccess, reply } from "@/lib/operations-access";
import { addLead, connectionStatus, leadInput, processJobs, queueJob, reportMetrics, saveReport } from "@/lib/workflow-engine";
import { leadStatuses, onboardingItems, requestCategories, workflowTemplates } from "@/lib/operations-shared";

export const GET = (request:Request) => endpoint(async()=>{
  const user=await identity(),db=database(),url=new URL(request.url),clientId=url.searchParams.get("client");
  if(!clientId){
    const rows=user.owner?await db.prepare("SELECT id, name, active FROM clients ORDER BY created_at DESC LIMIT 200").all():await db.prepare("SELECT DISTINCT c.id, c.name, c.active FROM clients c JOIN memberships m ON m.client_id = c.id WHERE c.active = 1 AND m.active = 1 AND (m.user_id = ? OR (m.user_id IS NULL AND m.email = ?)) ORDER BY c.name LIMIT 200").bind(user.id,user.email).all();
    const demand=user.owner?await db.prepare("SELECT category, COUNT(DISTINCT client_id) AS clients, COUNT(*) AS requests FROM feature_requests GROUP BY category ORDER BY clients DESC, requests DESC").all():null;
    return reply({owner:user.owner,clients:rows.results,demand:demand?.results||[]});
  }
  const access=await clientAccess(clientId),month=url.searchParams.get("month")||new Date().toISOString().slice(0,7);monthBounds(month);
  const page=Number(url.searchParams.get("page")||0);
  if(!Number.isInteger(page)||page<0||page>10000)throw new HttpError(400,"Invalid lead page.");
  const [leadRows,totals,jobRows,alertRows,workflowRows,checkRows,caseRows,reportRows,requests,members]=await Promise.all([
    db.prepare("SELECT id, name, email, phone, brief, status, consent_evidence, consent_at, opted_out_at, first_response_at, follow_up_at, created_at FROM leads WHERE client_id = ? ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?").bind(clientId,page*50).all(),
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'new'),0) AS new, COALESCE(SUM(status = 'won'),0) AS won, COALESCE(SUM(follow_up_at <= ? AND status NOT IN ('won','lost')),0) AS overdue, COUNT(first_response_at) AS responded, AVG(CASE WHEN first_response_at IS NOT NULL THEN (first_response_at-created_at)/60000.0 END) AS average_response_minutes FROM leads WHERE client_id = ?").bind(Date.now(),clientId).first(),
    db.prepare("SELECT id, lead_id, action, status, attempts, next_at, provider_id, error_code, created_at, finished_at FROM workflow_jobs WHERE client_id = ? ORDER BY updated_at DESC LIMIT 30").bind(clientId).all(),
    db.prepare("SELECT id, job_id, code, created_at FROM operation_alerts WHERE client_id = ? AND acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 100").bind(clientId).all(),
    db.prepare("SELECT template, enabled FROM workflows WHERE client_id = ?").bind(clientId).all(),
    db.prepare("SELECT item, completed, updated_at FROM onboarding WHERE client_id = ?").bind(clientId).all(),
    db.prepare("SELECT id, title, body, content_hash, status, approved_hash, approved_at, revoked_at FROM case_studies WHERE client_id = ? ORDER BY updated_at DESC LIMIT 20").bind(clientId).all(),
    db.prepare("SELECT month, metrics, generated_at FROM monthly_reports WHERE client_id = ? ORDER BY month DESC LIMIT 12").bind(clientId).all(),
    db.prepare("SELECT category, description, created_at FROM feature_requests WHERE client_id = ? ORDER BY created_at DESC LIMIT 30").bind(clientId).all(),
    user.owner?db.prepare("SELECT id, email, active, user_id IS NOT NULL AS claimed FROM memberships WHERE client_id = ? ORDER BY created_at DESC LIMIT 100").bind(clientId).all():Promise.resolve({results:[]}),
  ]);
  return reply({client:access.client,owner:user.owner,leads:leadRows.results.slice(0,50),hasMore:leadRows.results.length>50,page,totals,jobs:jobRows.results,alerts:alertRows.results,workflows:workflowRows.results,onboarding:checkRows.results,cases:caseRows.results,reports:reportRows.results.map(r=>({...r,metrics:JSON.parse(String(r.metrics))})),requests:requests.results,members:members.results,connections:connectionStatus(clientId),monthMetrics:await reportMetrics(clientId,month)});
});

const client=z.string().uuid(), id=z.string().min(1).max(200), contentHash=z.string().regex(/^[a-f0-9]{64}$/);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("createClient"),requestId:z.string().uuid(),name:z.string().trim().min(2).max(160),email:z.string().trim().email().max(254)}).strict(),
  z.object({action:z.literal("addMember"),client,email:z.string().trim().email().max(254)}).strict(),
  z.object({action:z.literal("revokeMember"),client,id}).strict(),
  z.object({action:z.literal("rotateKey"),client}).strict(),
  z.object({action:z.literal("addLead"),client,lead:leadInput}).strict(),
  z.object({action:z.literal("updateLead"),client,id,status:z.enum(leadStatuses),followUpAt:z.number().int().positive().nullable(),responded:z.boolean(),optOut:z.boolean()}).strict(),
  z.object({action:z.literal("workflow"),client,template:z.enum(["crm.sync","email.alert"]),enabled:z.boolean()}).strict(),
  z.object({action:z.literal("sendWhatsApp"),client,id,confirm:z.literal(true)}).strict(),
  z.object({action:z.literal("retryJob"),client,id}).strict(),
  z.object({action:z.literal("resolveJob"),client,id,providerId:z.string().trim().min(3).max(250),confirm:z.literal(true)}).strict(),
  z.object({action:z.literal("run"),client}).strict(),
  z.object({action:z.literal("ackAlert"),client,id}).strict(),
  z.object({action:z.literal("onboarding"),client,item:z.string(),completed:z.boolean()}).strict(),
  z.object({action:z.literal("caseDraft"),client,id:z.string().uuid(),title:z.string().trim().min(3).max(160),text:z.string().trim().min(30).max(8000),expectedHash:contentHash.nullable()}).strict(),
  z.object({action:z.literal("caseConsent"),client,id,hash:contentHash,decision:z.enum(["approve","revoke"]),confirm:z.literal(true)}).strict(),
  z.object({action:z.literal("report"),client,month:z.string()}).strict(),
  z.object({action:z.literal("request"),client,category:z.enum(requestCategories),description:z.string().trim().min(15).max(2000)}).strict(),
]);
export const POST=(request:Request)=>endpoint(async()=>{
  const data=await body(request,schema),db=database(),now=Date.now();
  if(data.action==="createClient"){
    await ownerAccess();const key=`orb_${crypto.randomUUID()}${crypto.randomUUID()}`,hash=await hashValue(key);
    if(await db.prepare("SELECT id FROM clients WHERE id = ?").bind(data.requestId).first())throw new HttpError(409,"Workspace already created. Refresh the workspace list.");
    await db.batch([
      db.prepare("INSERT INTO clients (id, name, intake_key_hash, created_at) VALUES (?, ?, ?, ?)").bind(data.requestId,data.name,hash,now),
      db.prepare("INSERT INTO memberships (id, client_id, email, created_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(),data.requestId,data.email.toLowerCase(),now),
      ...workflowTemplates.map(t=>db.prepare("INSERT INTO workflows (id, client_id, template) VALUES (?, ?, ?)").bind(`${data.requestId}:${t.key}`,data.requestId,t.key)),
    ]);
    return reply({ok:true,clientId:data.requestId,intakeKey:key},201);
  }
  const {user}=await clientAccess(data.client);
  if(["addMember","revokeMember","rotateKey","workflow","sendWhatsApp","retryJob","resolveJob","run","caseDraft"].includes(data.action)&&!user.owner)throw new HttpError(403,"Only the studio owner can perform this action.");
  switch(data.action){
    case "addMember":
      // Reactivation preserves the original stable identity rather than rebinding an email.
      await db.prepare("INSERT INTO memberships (id, client_id, email, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(client_id, email) DO UPDATE SET active = 1").bind(crypto.randomUUID(),data.client,data.email.toLowerCase(),now).run();break;
    case "revokeMember":await db.prepare("UPDATE memberships SET active = 0 WHERE id = ? AND client_id = ?").bind(data.id,data.client).run();break;
    case "rotateKey":{
      const key=`orb_${crypto.randomUUID()}${crypto.randomUUID()}`;
      await db.prepare("UPDATE clients SET intake_key_hash = ? WHERE id = ?").bind(await hashValue(key),data.client).run();return reply({ok:true,intakeKey:key});
    }
    case "addLead":return reply(await addLead(data.client,data.lead),201);
    case "updateLead":{
      const changed=await db.prepare("UPDATE leads SET status = ?, follow_up_at = ?, first_response_at = CASE WHEN ? = 1 THEN COALESCE(first_response_at, ?) ELSE first_response_at END, opted_out_at = CASE WHEN ? = 1 THEN COALESCE(opted_out_at, ?) ELSE opted_out_at END, updated_at = ? WHERE id = ? AND client_id = ? RETURNING id").bind(data.status,data.followUpAt,data.responded?1:0,now,data.optOut?1:0,now,now,data.id,data.client).first();
      if(!changed)throw new HttpError(404,"Lead unavailable.");break;
    }
    case "workflow":await db.prepare("UPDATE workflows SET enabled = ? WHERE client_id = ? AND template = ?").bind(data.enabled?1:0,data.client,data.template).run();break;
    case "sendWhatsApp":{
      const lead=await db.prepare("SELECT id FROM leads WHERE id = ? AND client_id = ? AND phone != '' AND consent_at IS NOT NULL AND opted_out_at IS NULL").bind(data.id,data.client).first();
      if(!lead)throw new HttpError(400,"A phone number and recorded opt-in are required; opted-out leads cannot be messaged.");
      if(!connectionStatus(data.client).whatsapp)throw new HttpError(409,"Connect the WhatsApp account and approved template first.");
      return reply({ok:true,job:await queueJob(data.client,data.id,"whatsapp.template")});
    }
    case "retryJob":{
      const job=await db.prepare("SELECT * FROM workflow_jobs WHERE id = ? AND client_id = ?").bind(data.id,data.client).first<{status:string;action:string;attempts:number;payload:string|null;created_at:number}>();
      if(!job||!["blocked","failed","retry"].includes(job.status))throw new HttpError(409,"This run cannot be retried. Review uncertain sends with the provider first.");
      if(job.attempts>=5)throw new HttpError(409,"The five-attempt limit has been reached.");
      if(job.payload&&job.action.startsWith("email.")&&now-job.created_at>23*3600000)throw new HttpError(409,"The email retry window has expired. Check the provider before sending again.");
      await db.prepare("UPDATE workflow_jobs SET status = 'pending', next_at = ?, updated_at = ? WHERE id = ? AND client_id = ? AND status IN ('blocked','failed','retry')").bind(now,now,data.id,data.client).run();break;
    }
    case "resolveJob":{
      const row=await db.prepare("UPDATE workflow_jobs SET status = 'succeeded', provider_id = ?, error_code = 'manually_verified', finished_at = ?, updated_at = ? WHERE id = ? AND client_id = ? AND status = 'needs_review' RETURNING id").bind(data.providerId,now,now,data.id,data.client).first();
      if(!row)throw new HttpError(409,"This run does not need manual verification.");
      await db.prepare("UPDATE operation_alerts SET acknowledged_at = ? WHERE job_id = ? AND client_id = ?").bind(now,data.id,data.client).run();break;
    }
    case "run":return reply({ok:true,jobs:await processJobs(data.client)});
    case "ackAlert":await db.prepare("UPDATE operation_alerts SET acknowledged_at = ? WHERE id = ? AND client_id = ?").bind(now,data.id,data.client).run();break;
    case "onboarding":{
      if(!onboardingItems.some(i=>i.key===data.item))throw new HttpError(400,"Unknown checklist item.");
      await db.prepare("INSERT INTO onboarding (id, client_id, item, completed, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(client_id, item) DO UPDATE SET completed = excluded.completed, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(`${data.client}:${data.item}`,data.client,data.item,data.completed?1:0,user.id,now).run();break;
    }
    case "caseDraft":{
      const hash=await hashValue(`${data.title}\n${data.text}`);
      const existing=await db.prepare("SELECT content_hash FROM case_studies WHERE id = ? AND client_id = ?").bind(data.id,data.client).first<{content_hash:string}>();
      if(existing){
        if(existing.content_hash!==data.expectedHash)throw new HttpError(409,"The draft changed. Reload it before editing.");
        const changed=await db.prepare("UPDATE case_studies SET title = ?, body = ?, content_hash = ?, status = 'draft', approved_hash = NULL, approved_by = NULL, approved_at = NULL, updated_at = ? WHERE id = ? AND client_id = ? AND content_hash = ? RETURNING id").bind(data.title,data.text,hash,now,data.id,data.client,data.expectedHash).first();
        if(!changed)throw new HttpError(409,"The draft changed. Reload it before editing.");
      }else{
        if(data.expectedHash)throw new HttpError(409,"Draft unavailable.");
        await db.prepare("INSERT INTO case_studies (id, client_id, title, body, content_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(data.id,data.client,data.title,data.text,hash,now).run();
      }break;
    }
    case "caseConsent":{
      if(user.owner)throw new HttpError(403,"A client member must provide or revoke publication permission.");
      const study=await db.prepare("SELECT id FROM case_studies WHERE id = ? AND client_id = ? AND content_hash = ?").bind(data.id,data.client,data.hash).first();
      if(!study)throw new HttpError(409,"Read the latest draft before providing permission.");
      const status=data.decision==="approve"?"approved":"revoked";
      const out=await db.batch([
        db.prepare("UPDATE case_studies SET status = ?, approved_hash = ?, approved_by = ?, approved_at = ?, revoked_at = ?, updated_at = ? WHERE id = ? AND client_id = ? AND content_hash = ? RETURNING id").bind(status,data.decision==="approve"?data.hash:null,user.id,data.decision==="approve"?now:null,data.decision==="revoke"?now:null,now,data.id,data.client,data.hash),
        db.prepare("INSERT INTO case_consent_events (id, case_id, action, content_hash, actor, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM case_studies WHERE id = ? AND client_id = ? AND content_hash = ? AND status = ? AND updated_at = ?)").bind(crypto.randomUUID(),data.id,data.decision,data.hash,user.id,now,data.id,data.client,data.hash,status,now),
      ]);
      if(!out[0].results.length)throw new HttpError(409,"Read the latest draft before providing permission.");break;
    }
    case "report":return reply({ok:true,metrics:await saveReport(data.client,data.month,true)});
    case "request":await db.prepare("INSERT INTO feature_requests (id, client_id, category, description, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(),data.client,data.category,data.description,user.id,now).run();break;
  }
  return reply({ok:true});
});
