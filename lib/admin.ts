import { getChatGPTUser } from "@/app/chatgpt-auth";
import { runtimeConfig } from "@/db/connection";

export async function isStudioOwner() {
  const user = await getChatGPTUser();
  const owner = runtimeConfig().ORBIT_ADMIN_EMAIL;
  return Boolean(user?.email && owner && user.email.toLowerCase() === owner.toLowerCase());
}
