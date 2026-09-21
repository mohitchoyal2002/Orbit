export function safeReturnPath(value: string | null | undefined, fallback = "/") {
  if (!value || value.length > 1500 || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://orbitflow.invalid");
    if (url.origin !== "https://orbitflow.invalid" || /^\/(?:api\/auth|login|logout|signin-with-chatgpt|signout-with-chatgpt|callback)(?:\/|$)/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
export const signInPath = (path: string) => `/login?return_to=${encodeURIComponent(safeReturnPath(path))}`;
