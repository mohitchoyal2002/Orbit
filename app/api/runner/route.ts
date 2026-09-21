import { runtimeConfig, database } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { endpoint, HttpError, reply } from "@/lib/operations-access";
import { processJobs, recurringReports } from "@/lib/workflow-engine";
import { processIncoming } from "@/lib/coaching";
import { processOutgoing } from "@/lib/coaching-whatsapp";
import { purgeExpiredAuth } from "@/lib/google-auth";
import { purgeExpiredWidgetData } from "@/lib/widget";
import { processVoiceCalls,purgeVoiceTranscripts } from "@/lib/voice";

export const POST=(request:Request)=>endpoint(async()=>{
  const expected=runtimeConfig().ORBIT_RUNNER_TOKEN;
  const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
  if(!expected||expected.length<32||supplied.length>256||await hashValue(expected)!==await hashValue(supplied))throw new HttpError(401,"Runner authorization required.");
  const jobs=await processJobs();const reports=await recurringReports();
  const coaching={incoming:await processIncoming(),outgoing:await processOutgoing()};
  const calls=await processVoiceCalls();await purgeVoiceTranscripts();
  await purgeExpiredWidgetData();
  await purgeExpiredAuth();
  await database().prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(Date.now()).run();
  return reply({jobs,reports,coaching,calls});
});
