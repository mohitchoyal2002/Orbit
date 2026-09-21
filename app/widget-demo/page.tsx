import type { Metadata } from "next";
import { siteById } from "@/lib/widget";
import WidgetDemo from "./preview";
import "./preview.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Widget demo — OrbitFlow", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  let enabled = false;
  try { if (site) { await siteById(site); enabled = true; } } catch {}
  return <WidgetDemo site={enabled ? site! : null}/>;
}
