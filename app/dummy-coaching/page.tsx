import type { Metadata } from "next";
import { siteById } from "@/lib/widget";
import WidgetDemo from "@/app/widget-demo/preview";
import "@/app/widget-demo/preview.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dummy coaching website — OrbitFlow", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  let enabled = false;
  try { if (site) { await siteById(site); enabled = true; } } catch {}
  return <WidgetDemo site={enabled ? site! : null}/>;
}
