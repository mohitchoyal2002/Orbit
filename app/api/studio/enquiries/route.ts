import { z } from "zod";
import { database } from "@/db/connection";
import { isStudioOwner } from "@/lib/admin";
import { readBoundedJson, requestOriginAllowed } from "@/lib/enquiries";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  if (!await isStudioOwner()) return json({ error: "This inbox is restricted to the studio owner." }, 403);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  if (!["all", "new", "contacted", "closed"].includes(status)) return json({ error: "Invalid filter." }, 400);
  const before = url.searchParams.get("before");
  if (before && !/^\d{13}\|[0-9a-f-]{36}$/.test(before)) return json({ error: "Invalid page." }, 400);
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];
  if (status !== "all") { conditions.push("status = ?"); bindings.push(status); }
  if (before) { const [date, id] = before.split("|"); conditions.push("(created_at < ? OR (created_at = ? AND id < ?))"); bindings.push(Number(date), Number(date), id); }
  try {
    const db = database();
    const rows = await db.prepare(`SELECT id, reference, name, email, company, goal, plan, message, status, created_at FROM enquiries ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY created_at DESC, id DESC LIMIT 51`).bind(...bindings).all();
    const counts = await db.prepare("SELECT status, COUNT(*) AS count FROM enquiries GROUP BY status").all();
    const items = rows.results.slice(0, 50);
    const last = items.at(-1);
    return json({ items, counts: counts.results, next: rows.results.length > 50 && last ? `${last.created_at}|${last.id}` : null });
  } catch { return json({ error: "The inbox couldn't be loaded. Please try again." }, 503); }
}
const mutationSchema = z.object({ id: z.string().uuid(), status: z.enum(["new", "contacted", "closed"]).optional() }).strict();
async function mutate(request: Request, remove: boolean) {
  if (!requestOriginAllowed(request) || !await isStudioOwner()) return json({ error: "Not authorised." }, 403);
  let payload;
  try { payload = mutationSchema.safeParse(await readBoundedJson(request, 1000)); } catch { return json({ error: "Invalid request." }, 400); }
  if (!payload.success || (!remove && !payload.data.status)) return json({ error: "Invalid enquiry or status." }, 400);
  try {
    const result = remove
      ? await database().prepare("DELETE FROM enquiries WHERE id = ? RETURNING id").bind(payload.data.id).first()
      : await database().prepare("UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ? RETURNING id").bind(payload.data.status, Date.now(), payload.data.id).first();
    return result ? json({ ok: true }) : json({ error: "This enquiry is no longer available." }, 404);
  } catch { return json({ error: "The change couldn't be saved. Please try again." }, 503); }
}
export const PATCH = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
