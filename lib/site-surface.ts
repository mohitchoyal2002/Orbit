import { headers } from "next/headers";
import { navigationForHostname, SITE_HOST_HEADER, surfaceForHostname } from "./site-domains";

export async function siteSurface() {
  const hostname = (await headers()).get(SITE_HOST_HEADER) || "";
  return { surface: surfaceForHostname(hostname), navigation: navigationForHostname(hostname) };
}
