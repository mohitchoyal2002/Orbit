export const SITE_ORIGINS = {
  marketing: "https://www.orbitflow.work",
  admin: "https://admin.orbitflow.work",
  client: "https://app.orbitflow.work",
} as const;

// The Worker overwrites this header from Request.url before rendering.
export const SITE_HOST_HEADER = "x-orbit-site-host";

export function surfaceForHostname(hostname: string) {
  if (hostname === "admin.orbitflow.work") return "admin";
  if (hostname === "app.orbitflow.work") return "client";
  return "marketing";
}

export function navigationForHostname(hostname: string) {
  const custom = ["orbitflow.work", "www.orbitflow.work", "admin.orbitflow.work", "app.orbitflow.work"].includes(hostname);
  return {
    websiteHref: custom ? SITE_ORIGINS.marketing : "/",
    studioHref: hostname === "admin.orbitflow.work" ? "/" : custom ? SITE_ORIGINS.admin : "/studio",
    portalHref: hostname === "admin.orbitflow.work" ? "/portal" : custom ? SITE_ORIGINS.client : "/portal",
  };
}

export type SiteNavigation = ReturnType<typeof navigationForHostname>;

export function domainRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const surface = surfaceForHostname(url.hostname);
  const marketingPage = ["/", "/privacy", "/robots.txt", "/sitemap.xml"].includes(url.pathname);
  if ((url.hostname === "orbitflow.work" && marketingPage) || (surface !== "marketing" && url.pathname === "/privacy")) {
    url.protocol = "https:";
    url.host = "www.orbitflow.work";
  } else if ((surface === "admin" && url.pathname === "/studio") || (surface === "client" && url.pathname === "/portal")) {
    url.pathname = "/";
  } else {
    return null;
  }
  return new Response(null, { status: 307, headers: { Location: url.toString(), "Cache-Control": "private, no-store" } });
}
