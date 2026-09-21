import { readBoundedJson } from "@/lib/enquiries";
import { endpoint,HttpError,reply } from "@/lib/operations-access";
import { sarvamResultSchema } from "@/lib/voice-sarvam";
import { acceptVoiceResult } from "@/lib/voice";

export const POST=(request:Request,context:{params:Promise<{attempt:string}>})=>endpoint(async()=>{
  const {attempt}=await context.params,token=new URL(request.url).searchParams.get("token")||"";
  if(!/^[a-f0-9-]{36}$/.test(attempt)||token.length!==72)throw new HttpError(401,"Invalid callback credentials.");
  let raw:unknown;try{raw=await readBoundedJson(request,256000);}catch{throw new HttpError(400,"Invalid callback body.");}
  const result=sarvamResultSchema.safeParse(raw);if(!result.success)throw new HttpError(400,"Invalid call result.");
  return reply(await acceptVoiceResult(attempt,token,result.data));
});
