import { env } from "cloudflare:workers";

export function database(): D1Database {
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

export function runtimeConfig() {
  return env as unknown as { ORBIT_ADMIN_EMAIL: string; ORBIT_RATE_LIMIT_SALT: string };
}
