import { database, runtimeConfig } from "@/db/connection";
import { enquirySchema, hashValue, readBoundedJson, requestOriginAllowed } from "@/lib/enquiries";

const json = (value: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...extra } });

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) return json({ error: "Please submit this form from the Orbit website." }, 403);
  let payload: unknown;
  try { payload = await readBoundedJson(request); } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_JSON";
    return json({ error: code === "BODY_TOO_LARGE" ? "Your message is too long. Please shorten it and try again." : "We couldn't read this request. Please check the form and try again." }, code === "BODY_TOO_LARGE" ? 413 : code === "CONTENT_TYPE" ? 415 : 400);
  }
  const parsed = enquirySchema.safeParse(payload);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Please check all required fields." }, 400);
  const data = parsed.data;
  const now = Date.now();
  if (data.website || data.startedAt > now + 60000 || now - data.startedAt < 1000) return json({ error: "Please take a moment to review your details, then submit again." }, 400);
  try {
    const db = database();
    const { website, startedAt, requestId, ...details } = data;
    const payloadHash = await hashValue(JSON.stringify(details));
    const existing = await db.prepare("SELECT reference, payload_hash FROM enquiries WHERE id = ?").bind(requestId).first<{ reference: string; payload_hash: string }>();
    if (existing) return existing.payload_hash === payloadHash ? json({ reference: existing.reference }) : json({ error: "This request was already received with different details. Close the form and start a new enquiry." }, 409);
    const salt = runtimeConfig().ORBIT_RATE_LIMIT_SALT;
    if (!salt) throw new Error("Rate limit configuration unavailable");
    const network = request.headers.get("cf-connecting-ip") || request.headers.get("oai-authenticated-user-id") || "unidentified";
    const bucket = Math.floor(now / 600000);
    const key = await hashValue(`${salt}:${bucket}:${network}`);
    const [limit] = await db.batch<{ hits: number }>([
      db.prepare("INSERT INTO rate_limits (key, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1 RETURNING hits").bind(key, (bucket + 1) * 600000),
      db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now),
    ]);
    if (Number(limit.results[0]?.hits || 0) > 5) return json({ error: "Several enquiries were sent recently. Please try again in ten minutes." }, 429, { "Retry-After": "600" });
    const reference = `ORB-${requestId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    await db.prepare("INSERT INTO enquiries (id, reference, payload_hash, name, email, company, goal, plan, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?) ON CONFLICT(id) DO NOTHING").bind(requestId, reference, payloadHash, data.name, data.email, data.company, data.goal, data.plan, data.message, now, now).run();
    const saved = await db.prepare("SELECT reference, payload_hash FROM enquiries WHERE id = ?").bind(requestId).first<{reference:string;payload_hash:string}>();
    if (!saved || saved.payload_hash !== payloadHash) return json({ error: "This request has changed. Close the form and start a new enquiry." }, 409);
    return json({ reference: saved.reference }, 201);
  } catch {
    console.error("Orbit enquiry could not be saved");
    return json({ error: "Enquiries are temporarily unavailable. Your details are still in the form—please try again shortly." }, 503);
  }
}
