/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { domainRedirect, SITE_HOST_HEADER, surfaceForHostname } from "../lib/site-domains";
import { processVoiceCalls } from "../lib/voice";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const redirect = domainRedirect(request);
    if (redirect) return redirect;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(SITE_HOST_HEADER, url.hostname);
    const result = await handler.fetch(new Request(request, { headers: requestHeaders }), env, ctx);
    const response = new Response(result.body, result);
    // Respond promptly to the form, then drain durable call jobs within the Worker's
    // lifetime. No browser tab is needed. Timed retries also use the dedicated runner.
    if(request.method==="POST"&&result.ok&&(/^\/api\/(intake|widget|coaching)(\/|$)/.test(url.pathname)||url.pathname==="/api/operations"||url.pathname.startsWith("/api/voice/webhook/"))) {
      ctx.waitUntil(processVoiceCalls().catch(()=>{console.error("Call queue processing deferred to runner");}));
    }
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", url.pathname.startsWith("/api/auth/")||url.pathname.startsWith("/api/voice/") ? "no-referrer" : "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Content-Security-Policy", "object-src 'none'; base-uri 'self'; form-action 'self'");
    if (surfaceForHostname(url.hostname) !== "marketing" || url.pathname.startsWith("/studio") || url.pathname.startsWith("/portal") || url.pathname.startsWith("/coaching") || url.pathname.startsWith("/api/") || ["/login", "/logout", "/tracking", "/widget-demo", "/signed-out", "/calling"].includes(url.pathname)) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return response;
  },
};

export default worker;
