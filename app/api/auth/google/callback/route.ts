import { finishGoogle } from "@/lib/google-auth";
export const GET = (request:Request) => finishGoogle(request);
