import type { Metadata } from "next";
import { siteSurface } from "@/lib/site-surface";
import { SITE_ORIGINS } from "@/lib/site-domains";
import Marketing from "./marketing";
import StudioWorkspace from "./studio/workspace";
import ClientWorkspace from "./portal/workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { surface } = await siteSurface();
  if (surface !== "marketing") return {
    title: surface === "admin" ? "Admin workspace | OrbitFlow" : "Client workspace | OrbitFlow",
    robots: { index: false, follow: false },
  };
  return { alternates: { canonical: SITE_ORIGINS.marketing + "/" } };
}

export default async function Home() {
  const { surface, navigation } = await siteSurface();
  if (surface === "admin") return <StudioWorkspace returnTo="/" />;
  if (surface === "client") return <ClientWorkspace returnTo="/" />;
  return <Marketing navigation={navigation} />;
}
