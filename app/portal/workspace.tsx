import { requireUser } from "@/app/auth";
import { isStudioOwner } from "@/lib/admin";
import { SITE_ORIGINS } from "@/lib/site-domains";
import { siteSurface } from "@/lib/site-surface";
import Portal from "./portal";
import "./portal.css";

export default async function ClientWorkspace({ returnTo = "/portal" }: { returnTo?: string }) {
  await requireUser(returnTo);
  const { surface, navigation } = await siteSurface();
  if (surface === "admin" && !await isStudioOwner()) return <main className="legal-page shell"><h1>A private workspace.</h1><p>Administration is available only to the studio owner.</p><a className="button button-primary" href={SITE_ORIGINS.client}>Open client dashboard</a></main>;
  return <Portal navigation={navigation} />;
}
