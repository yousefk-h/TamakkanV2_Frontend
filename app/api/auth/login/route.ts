import { BACKEND_BASE_URL, passthroughResponse, setAuthCookies } from "../../../../lib/api/server/backend";
import type { LoginRequest, TokenPair, UserPublic } from "../../../../lib/api/types";

export async function POST(request: Request): Promise<Response> {
  let body: LoginRequest;
  try {
    body = (await request.json()) as LoginRequest;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const loginRes = await fetch(`${BACKEND_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!loginRes.ok) return passthroughResponse(loginRes);

  const tokens = (await loginRes.json()) as TokenPair;
  await setAuthCookies(tokens);

  const meRes = await fetch(`${BACKEND_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) return passthroughResponse(meRes);

  const user = (await meRes.json()) as UserPublic;
  return Response.json({ user });
}
