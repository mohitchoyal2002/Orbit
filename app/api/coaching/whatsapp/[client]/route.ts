import { endpoint } from "@/lib/operations-access";
import { webhookGet,webhookPost } from "@/lib/coaching-whatsapp";
type Context={params:Promise<{client:string}>};
export const GET=(request:Request,context:Context)=>endpoint(async()=>webhookGet(request,(await context.params).client));
export const POST=(request:Request,context:Context)=>endpoint(async()=>webhookPost(request,(await context.params).client));
