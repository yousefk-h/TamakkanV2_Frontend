import { cookies } from "next/headers";
import { BACKEND_BASE_URL, REFRESH_COOKIE, clearAuthCookies } from "../../../../lib/api/server/backend";

export async function POST(): Promise<Response> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Best-effort server-side revoke - a network hiccup here shouldn't stop
    // the user from being logged out locally.
    try {
      await fetch(`${BACKEND_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // ignored - cookies are cleared below regardless
    }
  }

  await clearAuthCookies();
  return Response.json({ detail: "Logged out." });
}
