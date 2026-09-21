import { handleWidget } from "@/lib/widget";
type Context={params:Promise<{key:string}>};
const handle=async(request:Request,context:Context)=>handleWidget(request,(await context.params).key);
export const GET=handle;
export const POST=handle;
export const OPTIONS=handle;
