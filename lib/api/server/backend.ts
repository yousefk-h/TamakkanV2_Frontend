/**
 * Server-only helpers shared by the BFF route handlers
 * (app/api/auth/*, app/api/backend/[...path]). Never import this from a
 * "use client" file - it uses next/headers cookies() and reads a
 * non-NEXT_PUBLIC_ env var that isn't inlined into the browser bundle.
 */
import { cookies } from "next/headers";
import type { TokenPair } from "../types";

// Supplied to the server process by its environment profile. Never exposed
// as a NEXT_PUBLIC_ variable in the browser bundle.
export const BACKEND_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000/api/v1";

// Cookies are scoped to a host, not a port. Separate deployments must use
// separate names (AUTH_COOKIE_PREFIX) so they can be signed in together on one host.
const cookiePrefix = process.env.AUTH_COOKIE_PREFIX ?? "tamakkan";
if (!/^[a-z][a-z0-9_]{0,39}$/.test(cookiePrefix)) {
  throw new Error("AUTH_COOKIE_PREFIX must be a lowercase cookie-safe identifier.");
}
export const ACCESS_COOKIE = `${cookiePrefix}_access_token`;
export const REFRESH_COOKIE = `${cookiePrefix}_refresh_token`;

const isProd = process.env.NODE_ENV === "production";

// maxAge mirrors the backend's own token lifetimes (app/core/config.py:
// ACCESS_TOKEN_EXPIRE_MINUTES=30, REFRESH_TOKEN_EXPIRE_DAYS=7) so the cookie
// doesn't outlive - or expire before - the JWT it holds.
const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 30,
};

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export async function setAuthCookies(tokens: TokenPair): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.access_token, ACCESS_COOKIE_OPTS);
  jar.set(REFRESH_COOKIE, tokens.refresh_token, REFRESH_COOKIE_OPTS);
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Statuses the Fetch API forbids a body on (Response throws otherwise). */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export async function passthroughResponse(backendRes: Response): Promise<Response> {
  const headers = new Headers();
  const cacheControl = backendRes.headers.get("Cache-Control");
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  const contentType = backendRes.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  if (NULL_BODY_STATUSES.has(backendRes.status)) {
    return new Response(null, { status: backendRes.status, headers });
  }
  return new Response(await backendRes.blob(), { status: backendRes.status, headers });
}
