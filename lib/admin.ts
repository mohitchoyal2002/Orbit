import { getUser } from "@/app/auth";
import { runtimeConfig } from "@/db/connection";

export async function isStudioOwner() {
  const user = await getUser();
  const owner = runtimeConfig().ORBIT_ADMIN_EMAIL;
  return Boolean(user?.email && owner && user.email.toLowerCase() === owner.toLowerCase());
}
