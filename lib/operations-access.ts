import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database, runtimeConfig } from "@/db/connection";
import { requestOriginAllowed, readBoundedJson } from "@/lib/enquiries";
import type { z } from "zod";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const reply = (body: unknown, status = 200) => Response.json(body, {status, headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}});
export async function endpoint(fn: () => Promise<Response>) {
  try { return await fn(); } catch (err) {
    if (err instanceof HttpError) return reply({error:err.message},err.status);
    console.error("Orbit operations request failed");
    return reply({error:"This workspace is temporarily unavailable. Please try again."},503);
  }
}
export async function identity() {
  const user = await getChatGPTUser();
  if (!user?.id || !user.email) throw new HttpError(401,"Sign in with ChatGPT to continue.");
  return {...user,id:user.id,email:user.email.toLowerCase(),owner:user.email.toLowerCase() === runtimeConfig().ORBIT_ADMIN_EMAIL?.toLowerCase()};
}
export async function ownerAccess() {
  const user = await identity();
  if (!user.owner) throw new HttpError(403,"Only the studio owner can change this setting.");
  return user;
}
export async function clientAccess(clientId: string) {
  const user = await identity();
  if (!/^[0-9a-f-]{36}$/.test(clientId)) throw new HttpError(400,"Select a workspace.");
  const client = await database().prepare("SELECT id, name, active FROM clients WHERE id = ?").bind(clientId).first<{id:string;name:string;active:number}>();
  if (!client || !client.active) throw new HttpError(404,"Workspace unavailable.");
  if (user.owner) return {user,client};
  // The email invitation can be claimed once. Later access requires the same stable Site user ID.
  await database().prepare("UPDATE memberships SET user_id = ? WHERE client_id = ? AND email = ? AND user_id IS NULL AND active = 1").bind(user.id,clientId,user.email).run();
  const member = await database().prepare("SELECT id FROM memberships WHERE client_id = ? AND user_id = ? AND active = 1").bind(clientId,user.id).first();
  if (!member) throw new HttpError(403,"You do not have access to this workspace.");
  return {user,client};
}
export async function body<T extends z.ZodTypeAny>(request: Request, schema: T, limit=16000): Promise<z.output<T>> {
  if (!requestOriginAllowed(request)) throw new HttpError(403,"Please use the Orbit workspace.");
  let raw: unknown;
  try { raw = await readBoundedJson(request,limit); } catch { throw new HttpError(400,"Invalid request body."); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400,parsed.error.issues[0]?.message || "Check the required fields.");
  return parsed.data;
}
export function monthBounds(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400,"Use a month in YYYY-MM format.");
  const [y,m]=month.split("-").map(Number);
  return {start:Date.UTC(y,m-1,1),end:Date.UTC(y,m,1)};
}
