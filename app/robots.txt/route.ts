import { SITE_ORIGINS, surfaceForHostname } from "@/lib/site-domains";

export function GET(request: Request) {
  const privateSite = surfaceForHostname(new URL(request.url).hostname) !== "marketing";
  const content = privateSite ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /portal\nDisallow: /coaching\nDisallow: /calling\nDisallow: /tracking\nDisallow: /widget-demo\nDisallow: /dummy-coaching\nDisallow: /login\nDisallow: /logout\nDisallow: /api/\nDisallow: /signed-out\nSitemap: ${SITE_ORIGINS.marketing}/sitemap.xml\n`;
  return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
