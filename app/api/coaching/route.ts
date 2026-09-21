import { z } from "zod";
import { database,runtimeConfig } from "@/db/connection";
import { body, clientAccess, endpoint, HttpError, identity, ownerAccess, reply } from "@/lib/operations-access";
import { availableSlots, bookSlot, cancelBooking, captureLead, coachingLeadInput, createDemo, enqueue, optOut, processIncoming, receiveMessage, settings, student } from "@/lib/coaching";
import { processOutgoing, whatsappConnection } from "@/lib/coaching-whatsapp";
import { connectionStatus, queueJob } from "@/lib/workflow-engine";
import { coachingStages } from "@/lib/coaching-shared";
import { hashValue } from "@/lib/enquiries";

export const GET=(request:Request)=>endpoint(async()=>{
  const user=await identity(),db=database(),url=new URL(request.url),client=url.searchParams.get("client");
  if(!client){
    const rows=user.owner?await db.prepare("SELECT c.id,c.name,s.is_demo FROM clients c JOIN coaching_settings s ON s.client_id=c.id WHERE c.active=1 ORDER BY s.created_at DESC LIMIT 200").all():await db.prepare("SELECT c.id,c.name,s.is_demo FROM clients c JOIN coaching_settings s ON s.client_id=c.id JOIN memberships m ON m.client_id=c.id WHERE c.active=1 AND m.active=1 AND (m.user_id=? OR (m.user_id IS NULL AND m.email=?)) ORDER BY c.name LIMIT 200").bind(user.id,user.email).all();
    return reply({owner:user.owner,clients:rows.results});
  }
  const access=await clientAccess(client),cfg=await settings(client),page=Number(url.searchParams.get("page")||0),lead=url.searchParams.get("lead");
  if(!Number.isInteger(page)||page<0||page>10000)throw new HttpError(400,"Invalid page.");
  if(lead)await student(client,lead);
  const students=await db.prepare("SELECT l.id,l.name,l.phone,l.email,l.consent_at,l.consent_evidence,l.opted_out_at,l.follow_up_at,l.created_at,s.course,s.centre,s.learning_mode,s.background,s.source,s.stage,s.assigned_to,s.handoff,s.last_inbound_at FROM coaching_students s JOIN leads l ON l.id=s.lead_id AND l.client_id=s.client_id WHERE s.client_id=? ORDER BY l.created_at DESC,l.id LIMIT 51 OFFSET ?").bind(client,page*50).all();
  const metrics=await db.prepare("SELECT COUNT(*) AS leads,COALESCE(SUM(stage='replied'),0) AS replied,COALESCE(SUM(stage='booked'),0) AS booked,COALESCE(SUM(stage='attended'),0) AS attended,COALESCE(SUM(stage='enrolled'),0) AS enrolled,COALESCE(SUM(handoff=1),0) AS handoff FROM coaching_students WHERE client_id=?").bind(client).first<{leads:number}>();
  const messages=lead?(await db.prepare("SELECT id,lead_id,direction,kind,body,status,error_code,send_at,created_at FROM coaching_messages WHERE client_id=? AND lead_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100").bind(client,lead).all()).results.reverse():[];
  const bookings=await db.prepare("SELECT b.id,b.lead_id,b.slot_id,b.status,s.starts_at,s.course,s.centre FROM coaching_bookings b JOIN coaching_slots s ON s.id=b.slot_id AND s.client_id=b.client_id WHERE b.client_id=? ORDER BY s.starts_at DESC LIMIT 200").bind(client).all();
  return reply({client:access.client,owner:user.owner,demo:!!cfg.is_demo,students:students.results.slice(0,50),hasMore:students.results.length>50,page,total:metrics?.leads||0,metrics,messages,slots:await availableSlots(client,"undecided"),bookings:bookings.results,connections:{gemini:!!cfg.is_demo&&!!runtimeConfig().ORBIT_GEMINI_KEY,whatsapp:!cfg.is_demo&&!!whatsappConnection(client),hubspot:!cfg.is_demo&&connectionStatus(client).crm}});
});
const client=z.string().uuid(),id=z.string().min(1).max(250);
const actionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("createDemo")}).strict(),
  z.object({action:z.literal("enableWorkspace"),client}).strict(),
  z.object({action:z.literal("import"),client,leads:z.array(coachingLeadInput).min(1).max(50)}).strict(),
  z.object({action:z.literal("message"),client,id,text:z.string().trim().min(1).max(2000),requestId:z.string().uuid(),asStudent:z.boolean()}).strict(),
  z.object({action:z.literal("book"),client,id,slot:id,requestId:z.string().uuid()}).strict(),
  z.object({action:z.literal("cancel"),client,id}).strict(),
  z.object({action:z.literal("optOut"),client,id}).strict(),
  z.object({action:z.literal("manage"),client,id,stage:z.enum(coachingStages),assignedTo:z.string().trim().max(100),followUpAt:z.number().int().positive().nullable()}).strict(),
  z.object({action:z.literal("handoff"),client,id,enabled:z.boolean()}).strict(),
  z.object({action:z.literal("contactDetails"),client,id,name:z.string().trim().min(2).max(100),email:z.union([z.string().trim().email().max(254),z.literal("")])}).strict(),
  z.object({action:z.literal("attendance"),client,id,status:z.enum(["attended","no_show"])}).strict(),
  z.object({action:z.literal("slot"),client,id:z.string().uuid(),course:z.enum(["mern","data-science","data-analytics","java","python","testing"]),centre:z.enum(["Bhawarkua","Vijay Nagar","Online"]),startsAt:z.number().int().positive(),capacity:z.number().int().min(1).max(100)}).strict(),
  z.object({action:z.literal("run"),client}).strict(),
  z.object({action:z.literal("demoReminder"),client,id}).strict(),
  z.object({action:z.literal("syncContact"),client,id}).strict(),
]);
export const POST=(request:Request)=>endpoint(async()=>{
  await identity();const data=await body(request,actionSchema,96000),db=database(),now=Date.now();
  if(data.action==="createDemo"){await ownerAccess();return reply({clientId:await createDemo()});}
  const {user}=await clientAccess(data.client);
  if(data.action==="enableWorkspace"){
    await ownerAccess();await db.prepare("INSERT INTO coaching_settings (client_id,is_demo,created_at) VALUES (?,0,?) ON CONFLICT(client_id) DO NOTHING").bind(data.client,now).run();return reply({ok:true});
  }
  const cfg=await settings(data.client);
  if(["run","demoReminder","slot","syncContact"].includes(data.action)&&!user.owner)throw new HttpError(403,"The studio owner manages provider sends and setup.");
  switch(data.action){
    case "import":{const results=[];for(const lead of data.leads)results.push(await captureLead(data.client,lead));return reply({ok:true,results,created:results.filter(r=>!r.duplicate).length,duplicates:results.filter(r=>r.duplicate).length});}
    case "message":{
      const s=await student(data.client,data.id);
      if(data.asStudent){
        if(!cfg.is_demo)throw new HttpError(403,"Student replies can only be simulated in the demo workspace.");
        await receiveMessage(data.client,data.id,`demo:${data.requestId}`,data.text);await processIncoming(data.client);
      }else{
        if(s.opted_out_at)throw new HttpError(409,"This student has opted out.");
        if(!s.last_inbound_at||now-s.last_inbound_at>=86400000)throw new HttpError(409,"A recent student reply is required for a free-form counsellor message. Use an approved template outside 24 hours.");
        await enqueue(data.client,data.id,`staff:${data.client}:${data.requestId}`,"text",data.text);
        await db.prepare("UPDATE coaching_students SET handoff=1 WHERE lead_id=? AND client_id=?").bind(data.id,data.client).run();
      }break;
    }
    case "book":return reply({ok:true,...await bookSlot(data.client,data.id,data.slot,`${data.client}:${data.requestId}`)});
    case "cancel":await cancelBooking(data.client,data.id);break;
    case "optOut":await optOut(data.client,data.id);break;
    case "manage":{
      const s=await student(data.client,data.id);
      if(["booked","attended"].includes(s.stage)&&["new","replied"].includes(data.stage))throw new HttpError(409,"Use booking cancellation or attendance to change this stage.");
      if(["booked","attended"].includes(data.stage)&&data.stage!==s.stage)throw new HttpError(409,"Use booking or attendance to set this stage.");
      await db.batch([
        db.prepare("UPDATE coaching_students SET stage=?,assigned_to=? WHERE client_id=? AND lead_id=?").bind(data.stage,data.assignedTo,data.client,data.id),
        db.prepare("UPDATE leads SET follow_up_at=?,status=?,updated_at=? WHERE client_id=? AND id=?").bind(data.followUpAt,data.stage==="enrolled"?"won":data.stage==="lost"?"lost":"contacted",now,data.client,data.id),
      ]);break;
    }
    case "handoff":await student(data.client,data.id);await db.prepare("UPDATE coaching_students SET handoff=? WHERE client_id=? AND lead_id=?").bind(data.enabled?1:0,data.client,data.id).run();break;
    case "contactDetails":await student(data.client,data.id);await db.prepare("UPDATE leads SET name=?,email=?,updated_at=? WHERE client_id=? AND id=?").bind(data.name,data.email.toLowerCase(),now,data.client,data.id).run();break;
    case "attendance":{
      await student(data.client,data.id);
      const booking=await db.prepare("UPDATE coaching_bookings SET status=?,updated_at=? WHERE client_id=? AND lead_id=? AND status='confirmed' RETURNING id").bind(data.status,now,data.client,data.id).first();
      if(!booking)throw new HttpError(409,"A confirmed booking is required.");
      await db.batch([
        db.prepare("UPDATE coaching_students SET stage=?,handoff=? WHERE client_id=? AND lead_id=?").bind(data.status==="attended"?"attended":"replied",data.status==="no_show"?1:0,data.client,data.id),
        db.prepare("UPDATE leads SET follow_up_at=?,updated_at=? WHERE client_id=? AND id=?").bind(data.status==="no_show"?now+86400000:null,now,data.client,data.id),
        db.prepare("UPDATE coaching_messages SET status='cancelled' WHERE client_id=? AND lead_id=? AND booking_id IS NOT NULL AND status IN ('queued','retry')").bind(data.client,data.id),
      ]);break;
    }
    case "slot":{
      if(data.startsAt<=now||data.startsAt>now+180*86400000)throw new HttpError(400,"Choose a future slot within 180 days.");
      await db.prepare("INSERT INTO coaching_slots (id,client_id,course,centre,starts_at,capacity) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(data.id,data.client,data.course,data.centre,data.startsAt,data.capacity).run();break;
    }
    case "run":return reply({ok:true,incoming:await processIncoming(data.client),outgoing:await processOutgoing(data.client)});
    case "demoReminder":{
      if(!cfg.is_demo)throw new HttpError(403,"Reminder time can only be accelerated in the demo.");await student(data.client,data.id);
      await db.prepare("UPDATE coaching_messages SET send_at=? WHERE client_id=? AND lead_id=? AND kind='reminder' AND status='queued'").bind(now,data.client,data.id).run();
      return reply({ok:true,outgoing:await processOutgoing(data.client)});
    }
    case "syncContact":{
      const s=await student(data.client,data.id);
      if(cfg.is_demo)throw new HttpError(409,"Demo contacts stay inside OrbitFlow.");
      if(!s.email)throw new HttpError(409,"Add the student's actual email before email-based HubSpot upsert. No placeholder email is generated.");
      if(!connectionStatus(data.client).crm)throw new HttpError(409,"Connect this workspace's HubSpot account first.");
      return reply({ok:true,job:await queueJob(data.client,data.id,"crm.sync",await hashValue(JSON.stringify([s.name,s.email,s.phone])))});
    }
  }
  return reply({ok:true});
});
