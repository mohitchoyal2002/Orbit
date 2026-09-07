import { runtimeConfig, database } from "@/db/connection";
import { hashValue } from "@/lib/enquiries";
import { endpoint, HttpError, reply } from "@/lib/operations-access";
import { processJobs, recurringReports } from "@/lib/workflow-engine";

export const POST=(request:Request)=>endpoint(async()=>{
  const expected=runtimeConfig().ORBIT_RUNNER_TOKEN;
  const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
  if(!expected||expected.length<32||supplied.length>256||await hashValue(expected)!==await hashValue(supplied))throw new HttpError(401,"Runner authorization required.");
  const jobs=await processJobs();const reports=await recurringReports();
  await database().prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(Date.now()).run();
  return reply({jobs,reports});
});
