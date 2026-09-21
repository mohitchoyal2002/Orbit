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
export async function placeSarvamCall(c:VoiceConnector,settings:VoiceSettings,lead:{name:string;brief:string;phone:string},businessName:string,webhookUrl:string,attemptId:string,transport:typeof fetch=fetch) {
  const url=`https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(c.orgId)}/workspaces/${encodeURIComponent(c.workspaceId)}/outbounds`;
  let response:Response;
  try {
    response=await transport(url,{method:"POST",headers:{"X-API-Key":c.apiKey,"Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(12000),body:JSON.stringify({
      app_config:{app_id:c.appId,app_version:c.appVersion,connection_config:{connection_id:c.connectionId,agent_phone_number:c.agentPhoneNumber},agent_variables:voiceVariables(settings,lead,businessName),app_overrides:{initial_bot_message:openingLine(businessName,settings.language),initial_language_name:settings.language}},
      user_config:{user_phone_number:lead.phone},webhook_config:{url:webhookUrl,metadata:{orbit_attempt_id:attemptId}},
    })});
  }catch{throw new CallProviderError("provider_result_unknown",true);}
  if(!response.ok)throw new CallProviderError(`provider_http_${response.status}`,response.status>=500||response.status===408);
  let data:unknown;try{data=await response.json();}catch{throw new CallProviderError("provider_result_unknown",true);}
  const result=z.object({attempt_id:z.string().min(1).max(200)}).safeParse(data);
  if(!result.success)throw new CallProviderError("provider_result_unknown",true);
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
