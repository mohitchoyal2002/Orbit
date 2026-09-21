import { requireUser } from "@/app/auth";
import { isStudioOwner } from "@/lib/admin";
import { siteSurface } from "@/lib/site-surface";
import Inbox from "./inbox";

export default async function StudioWorkspace({ returnTo = "/studio" }: { returnTo?: string }) {
  await requireUser(returnTo);
  const { navigation } = await siteSurface();
  if (!await isStudioOwner()) return <main className="legal-page shell"><h1>A private workspace.</h1><p>This inbox is available only to the studio owner.</p><a className="button button-outline" href={navigation.portalHref}>Client dashboard</a><a className="button button-outline" href={navigation.websiteHref}>View website</a></main>;
  return <Inbox websiteHref={navigation.websiteHref} portalHref={navigation.portalHref} studioHref={navigation.studioHref} />;
}
