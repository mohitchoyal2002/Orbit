import { database,runtimeConfig } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { endpoint,HttpError,reply } from "@/lib/operations-access";
import { processVoiceCalls,purgeVoiceTranscripts } from "@/lib/voice";

export const POST=(request:Request)=>endpoint(async()=>{
  const expected=runtimeConfig().ORBIT_RUNNER_TOKEN,supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
  if(!expected||expected.length<32||supplied.length>256||await hashValue(expected)!==await hashValue(supplied))throw new HttpError(401,"Runner authorization required.");
  await database().prepare("INSERT INTO rate_limits(key,hits,expires_at) VALUES('voice-runner-heartbeat',1,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at").bind(Date.now()+15*60000).run();
  const calls=await processVoiceCalls();await purgeVoiceTranscripts();return reply({ok:true,calls});
});
