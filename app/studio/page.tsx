import type { Metadata } from "next";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isStudioOwner } from "@/lib/admin";
import Inbox from "./inbox";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project inbox — Orbit Studio", robots: { index: false, follow: false } };
export default async function Studio() {
  await requireChatGPTUser("/studio");
  if (!await isStudioOwner()) return <main className="legal-page shell"><a className="brand" href="/"><span>orbit.</span></a><h1>A private workspace.</h1><p>This inbox is available only to the studio owner.</p><a className="button button-outline" href="/">Back to Orbit</a></main>;
  return <><div className="shell" style={{paddingTop:24}}><a className="text-button" href="/portal">Open client operations →</a></div><Inbox /></>;
}
