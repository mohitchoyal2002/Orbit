import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "./chatgpt-auth";
import { googleUser } from "@/lib/google-auth";
import { signInPath } from "@/lib/auth-paths";
export { signInPath } from "@/lib/auth-paths";
export async function getUser() {
  // Explicit Google sign-in takes precedence over an incidental ChatGPT session.
  return await googleUser(await headers()) || await getChatGPTUser();
}
export async function requireUser(returnTo:string) {
  const user=await getUser();if(user?.id)return user;redirect(signInPath(returnTo));
}
