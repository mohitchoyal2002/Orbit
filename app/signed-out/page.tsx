import type { Metadata } from "next";
import { signInPath } from "@/lib/auth-paths";
import { siteSurface } from "@/lib/site-surface";
import OrbitBrand from "@/components/orbit-brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Signed out | OrbitFlow", robots: { index: false, follow: false } };

export default async function SignedOut() {
  const { surface, navigation } = await siteSurface();
  return <main className="legal-page shell"><OrbitBrand href={navigation.websiteHref}/><h1>You're signed out.</h1><p>Sign in again to open your workspace.</p><a className="button button-primary" href={signInPath(surface === "marketing" ? "/portal" : "/")} target="_top">Sign in to OrbitFlow</a><a className="button button-outline" href={navigation.websiteHref}>View website</a></main>;
}
