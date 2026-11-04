import { BACKEND_BASE_URL, passthroughResponse } from "../../../../../lib/api/server/backend";

/** Public, narrowly scoped auth endpoints. No cookies or session tokens needed. */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await params;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (action !== "request" && action !== "confirm") return new Response(null, { status: 404, headers });
  let payload: Record<string, string>;
  try {
    const body: unknown = await request.json();
    const key = action === "request" ? "email" : "token";
    const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
    if (typeof value !== "string" || value.length > 320) throw new Error("Invalid field");
    payload = { [key]: value };
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 422, headers });
  }
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/auth/email-verification/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    const result = await passthroughResponse(response);
    Object.entries(headers).forEach(([key, value]) => result.headers.set(key, value));
    return result;
  } catch {
    return Response.json({ detail: "Email verification is temporarily unavailable. Try again." }, { status: 503, headers });
  }
}
