import { z } from "zod";
import { runtimeConfig } from "@/db/connection";
import { openingLine, voiceVariables, type VoiceSettings } from "./voice-shared";

const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const connectorSchema=z.object({
  apiKey:z.string().min(16).max(500),orgId:identifier,workspaceId:identifier,appId:identifier,
  appVersion:z.number().int().positive(),connectionId:identifier,
  agentPhoneNumber:z.string().regex(/^\+[1-9]\d{7,14}$/),templateReady:z.literal(true),
}).strict();
export type VoiceConnector=z.output<typeof connectorSchema>;
export function voiceConnector(client:string):VoiceConnector|null {
  try {
    const env=runtimeConfig(),{useOrbitKey,...config}=JSON.parse(env.ORBIT_VOICE_CONNECTORS_JSON||"{}")[client];
    if(useOrbitKey!==undefined&&useOrbitKey!==true)return null;
    if(useOrbitKey){if(config.apiKey)return null;config.apiKey=env.ORBIT_SARVAM_VOICE_KEY;}
    return connectorSchema.parse(config);
  }catch{return null;}
}
export class CallProviderError extends Error {
  constructor(public code:string,public review:boolean){super(code);}
}
function transportFailure(error:unknown) {
  const name=error instanceof Error?error.name:"UnknownError";
  const message=error instanceof Error?error.message:"";
  const code=name==="TimeoutError"||name==="AbortError"?"provider_timeout"
    :/illegal invocation/i.test(message)?"provider_runtime_error"
    :/redirect/i.test(message)?"provider_redirect"
    :/dns|resolve|certificate|ssl|tls/i.test(message)?"provider_connection_error":"provider_network_error";
  // Never log credentials, request bodies, callback URLs or provider response text.
  console.error("Sarvam request failed",{code,errorType:name});
  return new CallProviderError(code,true);
}
async function providerJson(response:Response) {
  if(!response.ok)throw new CallProviderError(`provider_http_${response.status}`,response.status>=500||response.status===408||response.status>=300&&response.status<400);
  try{return await response.json() as unknown;}catch{throw new CallProviderError("provider_response_not_json",true);}
}
// Read-only production check: verifies the saved key and agent scope without dialing.
export async function checkSarvamConnection(c:VoiceConnector,transport:typeof fetch=fetch,now=Date.now()) {
  const url=new URL(`https://apps.sarvam.ai/api/analytics/v1/${encodeURIComponent(c.orgId)}/${encodeURIComponent(c.workspaceId)}/${encodeURIComponent(c.appId)}/attempts`);
  url.searchParams.set("start_datetime",new Date(now-60000).toISOString());
  url.searchParams.set("end_datetime",new Date(now).toISOString());url.searchParams.set("limit","1");
  let response:Response;
  try{response=await transport(url,{headers:{"X-API-Key":c.apiKey,Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(20000)});}catch(error){throw transportFailure(error);}
  const data=z.object({items:z.array(z.unknown()),total:z.number()}).safeParse(await providerJson(response));
  if(!data.success)throw new CallProviderError("provider_response_invalid",true);
  return {ok:true};
}
export async function placeSarvamCall(c:VoiceConnector,settings:VoiceSettings,lead:{name:string;brief:string;phone:string},businessName:string,webhookUrl:string,attemptId:string,transport:typeof fetch=fetch) {
  const url=`https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(c.orgId)}/workspaces/${encodeURIComponent(c.workspaceId)}/outbounds`;
  let response:Response;
  try {
    response=await transport(url,{method:"POST",headers:{"X-API-Key":c.apiKey,"Content-Type":"application/json",Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(12000),body:JSON.stringify({
      app_config:{app_id:c.appId,app_version:c.appVersion,app_type:"agent",connection_config:{connection_id:c.connectionId,agent_phone_number:c.agentPhoneNumber},agent_variables:voiceVariables(settings,lead,businessName),app_overrides:{initial_bot_message:openingLine(businessName,settings.language),initial_language_name:settings.language}},
      user_config:{user_phone_number:lead.phone},webhook_config:{url:webhookUrl,metadata:{orbit_attempt_id:attemptId}},
    })});
  }catch(error){throw transportFailure(error);}
  const data=await providerJson(response);
  const result=z.object({attempt_id:z.string().min(1).max(200)}).safeParse(data);
  if(!result.success)throw new CallProviderError("provider_attempt_id_missing",true);
  return result.data.attempt_id;
}

export const sarvamResultSchema=z.object({
  attempt_id:z.string().min(1).max(200),status:z.enum(["connected","no_answer","busy","failed"]),
  channel_info:z.object({channel_type:z.literal("v2v"),channel_provider:z.string().max(100),agent_phone_number:z.string().max(30)}),
  duration:z.number().finite().min(0).max(86400).nullable().optional(),interaction_id:z.string().max(300).nullable().optional(),
  failure_reason:z.string().max(2000).nullable().optional(),final_agent_variables:z.record(z.unknown()).nullable().optional(),
  interaction_transcript:z.array(z.object({role:z.enum(["agent","user"]),en_text:z.string().max(10000)})).max(500).nullable().optional(),
  webhook_config:z.unknown().optional(),
});
export type SarvamResult=z.output<typeof sarvamResultSchema>;
