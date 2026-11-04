/**
 * Catch-all authenticated proxy to the FastAPI backend. The browser never
 * holds a JWT - it calls same-origin `/api/backend/<path>` with its httpOnly
 * session cookies attached automatically, and this route attaches the real
 * Authorization: Bearer header server-side, transparently refreshing on a
 * 401 exactly the way the old client-side `request()` used to.
 */
import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  BACKEND_BASE_URL,
  REFRESH_COOKIE,
  clearAuthCookies,
  passthroughResponse,
  setAuthCookies,
} from "../../../../lib/api/server/backend";
import type { TokenPair } from "../../../../lib/api/types";

async function refreshTokens(refreshToken: string): Promise<TokenPair | null> {
  const res = await fetch(`${BACKEND_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  return (await res.json()) as TokenPair;
}

// Coalesce concurrent refreshes of the SAME refresh token into a single one.
// The dashboard fires many requests in parallel, and when the access cookie
// has lapsed they would all try to refresh at once - but the backend rotates
// the refresh token on every refresh (single-use), so only the first would
// succeed and the rest would present an already-rotated token, fail, and
// clear the session. This app runs as one long-lived Node process (the
// standalone vinext server), so a module-scoped map of in-flight refreshes
// lets every concurrent waiter holding the same token share one real refresh
// and its resulting token pair.
//
// The map MUST be keyed by the refresh token: this process serves every user,
// and a single shared in-flight promise handed whichever user's refresh
// happened to be running to every other user waiting on it - their browser
// got that user's session cookies (see tests/bff-refresh.test.mjs).
//
// (In a multi-instance/serverless deployment this coalesces only within an
// instance; the backend would then need a short refresh-reuse grace window
// instead.)
const refreshesInFlight = new Map<string, Promise<TokenPair | null>>();

function refreshOnce(refreshToken: string): Promise<TokenPair | null> {
  const pending = refreshesInFlight.get(refreshToken);
  if (pending) return pending;
  const refresh = refreshTokens(refreshToken).finally(() => {
    if (refreshesInFlight.get(refreshToken) === refresh) refreshesInFlight.delete(refreshToken);
  });
  refreshesInFlight.set(refreshToken, refresh);
  return refresh;
}

async function proxy(request: Request, path: string[]): Promise<Response> {
  const jar = await cookies();
  const url = new URL(request.url);
  const targetUrl = `${BACKEND_BASE_URL}/${path.join("/")}${url.search}`;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const forwardBody = hasBody ? await request.blob() : undefined;
  const contentType = request.headers.get("Content-Type");

  const doFetch = (accessToken: string | undefined) => {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(targetUrl, { method: request.method, headers, body: forwardBody });
  };

  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  let response = await doFetch(accessToken);

  // Decide whether this looks like a token problem worth a refresh-and-retry.
  //
  // Two distinct rejections mean "the token is missing or stale, try to
  // refresh":
  //   - 401: the token was present but the backend rejected it (expired JWT,
  //     clock skew).
  //   - 403 with NO access cookie: the short-lived access cookie already
  //     expired, so the browser sent nothing and this proxy forwarded no
  //     Authorization header. FastAPI's HTTPBearer rejects a *missing* header
  //     with 403 ("Not authenticated"), NOT 401 - so without this branch the
  //     refresh below would never fire once the access cookie lapsed (~30
  //     min), stranding a still-valid 7-day refresh token and logging the
  //     user out mid-session.
  //
  // A 403 *with* an access token is deliberately NOT refreshed: that's a
  // genuine authorization denial (e.g. a non-student account hitting a
  // student-only route like POST /sessions/start), and refreshing would
  // neither help nor be correct - it would just burn the single-use refresh
  // token and still come back 403.
  const tokenMissingOrRejected = response.status === 401 || (response.status === 403 && !accessToken);

  // One refresh-and-retry, never a loop - a second failure means the refresh
  // token itself is dead; the caller (client-side auth layer) sends the
  // user back to the login screen.
  if (tokenMissingOrRejected) {
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      const tokens = await refreshOnce(refreshToken);
      if (tokens) {
        await setAuthCookies(tokens);
        response = await doFetch(tokens.access_token);
      } else {
        await clearAuthCookies();
      }
    }
  }

  return passthroughResponse(response);
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  return proxy(request, (await params).path);
}
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  return proxy(request, (await params).path);
}
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  return proxy(request, (await params).path);
}
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  return proxy(request, (await params).path);
}
