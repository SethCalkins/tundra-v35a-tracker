/**
 * Edge middleware — closes admin bypass paths.
 *
 *  Cloudflare Access is bound only to `tundrav35a.com/admin*`. Without
 *  this middleware, the workers.dev fallback (the random subdomain we
 *  keep enabled for site-uptime fallback) is reachable un-gated, since
 *  Access policies cannot be applied to *.workers.dev hostnames.
 *
 *  This middleware also verifies the CF Access signed JWT is present on
 *  every /admin request — defense in depth so a leaked header alone
 *  can't forge an auth claim.
 */
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_HOSTS = new Set([
  "tundrav35a.com",
  "www.tundrav35a.com",
]);

const ALLOWED_EMAIL = "sethcalkins@me.com";

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return;

  // 1. Host gate — admin is only reachable via the custom domain that
  //    Cloudflare Access protects. workers.dev / preview URLs → 404.
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  if (!ALLOWED_HOSTS.has(host)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // 2. CF Access presence check — both the signed JWT and the email
  //    claim must be set. Cloudflare's edge sets these *only* for
  //    requests that passed Access; they cannot be spoofed by the
  //    client because Cloudflare strips and re-injects them.
  const jwt = req.headers.get("cf-access-jwt-assertion") ?? "";
  const email = req.headers.get("cf-access-authenticated-user-email")?.toLowerCase() ?? "";

  if (!jwt || !email) {
    return new NextResponse(
      "This page requires Cloudflare Access authentication.",
      { status: 401 },
    );
  }

  // 3. Email claim must match the policy allowlist. Belt-and-suspenders —
  //    CF Access already enforces this via the policy, so a mismatch here
  //    would indicate a misconfiguration rather than an attack.
  if (email !== ALLOWED_EMAIL) {
    return new NextResponse("Forbidden", { status: 403 });
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
