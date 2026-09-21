import { env } from "cloudflare:workers";

export function database(): D1Database {
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

export function runtimeConfig() {
  return env as unknown as {
    ORBIT_ADMIN_EMAIL: string; ORBIT_RATE_LIMIT_SALT: string;
    ORBIT_CONNECTORS_JSON?: string; ORBIT_RUNNER_TOKEN?: string;
    ORBIT_COACHING_CONNECTORS_JSON?: string;
    ORBIT_GEMINI_KEY?: string; ORBIT_GEMINI_MODEL?: string;
    ORBIT_RESEND_KEY?: string; ORBIT_EMAIL_FROM?: string;
    ORBIT_GOOGLE_CLIENT_ID?: string; ORBIT_GOOGLE_CLIENT_SECRET?: string;
    ORBIT_VOICE_CONNECTORS_JSON?: string;
    ORBIT_SARVAM_KEY?: string;
    ORBIT_SARVAM_VOICE_KEY?: string;
  };
}
