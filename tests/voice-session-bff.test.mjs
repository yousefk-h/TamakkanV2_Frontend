// Voice Practice through the real BFF proxy (app/api/backend/[...path]/route.ts)
// while access tokens expire: two tabs of one student plus a second student
// start/end sessions concurrently and every backend call must be made as the
// right user, with each refresh token spent exactly once. Complements the H1
// suite (bff-refresh.test.mjs), which it does not replace.
//
// Run with: npm run test:voice
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createCookieJar, requestCookies } from "./helpers/next-headers-mock.mjs";

process.env.API_BASE_URL = "http://backend.test/api/v1";
process.env.AUTH_COOKIE_PREFIX = "tamakkan";

const { POST } = await import(new URL("../app/api/backend/[...path]/route.ts", import.meta.url).href);

const ACCESS_COOKIE = "tamakkan_access_token";
const REFRESH_COOKIE = "tamakkan_refresh_token";

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function createFakeBackend() {
  const refreshTokens = new Map();
  const accessTokens = new Map();
  const sessions = new Map(); // session id -> { owner, mode, ended }
  const refreshCalls = [];
  const calls = [];
  let counter = 0;
  const backend = {
    refreshCalls,
    calls,
    sessions,
    issueRefreshToken(user) {
      const token = `refresh-${user}-${++counter}`;
      refreshTokens.set(token, user);
      return token;
    },
    async fetch(url, init = {}) {
      const { pathname } = new URL(String(url));
      if (pathname === "/api/v1/auth/refresh") {
        const { refresh_token: token } = JSON.parse(init.body);
        refreshCalls.push(token);
        await delay(40);
        const user = refreshTokens.get(token);
        if (!user) return json(401, { detail: "Invalid or expired refresh token" });
        refreshTokens.delete(token);
        const access = `access-${user}-${++counter}`;
        accessTokens.set(access, user);
        return json(200, { access_token: access, refresh_token: backend.issueRefreshToken(user), token_type: "bearer" });
      }
      const user = accessTokens.get((init.headers?.Authorization ?? "").replace(/^Bearer /, ""));
      if (!init.headers?.Authorization) return json(403, { detail: "Not authenticated" });
      if (!user) return json(401, { detail: "Could not validate credentials" });
      const body = init.body ? JSON.parse(await init.body.text()) : undefined;
      calls.push({ user, pathname, body });
      if (pathname === "/api/v1/sessions/start") {
        const id = `s${++counter}`;
        sessions.set(id, { owner: user, mode: body.mode ?? "topic_discussion", ended: false });
        const prefix = body.mode === "voice_practice" ? "voice" : "mariam";
        return json(200, { session_id: id, room_name: `${prefix}-${id}`, participant_token: `jwt-${user}-${id}`, server_url: "wss://x", max_duration_minutes: 15 });
      }
      const end = pathname.match(/^\/api\/v1\/sessions\/(\w+)\/end$/);
      if (end) {
        const session = sessions.get(end[1]);
        if (!session) return json(404, { detail: "Session not found" });
        if (session.owner !== user) return json(403, { detail: "This session does not belong to you" });
        session.ended = true;
        return json(200, { id: end[1], state: "ended" });
      }
      return json(404, { detail: "Not Found" });
    },
  };
  return backend;
}

function post(jar, path, body, { afterMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      requestCookies.run(jar, async () => {
        try {
          const request = new Request(`http://frontend.test/api/backend/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const response = await POST(request, { params: Promise.resolve({ path: path.split("/") }) });
          resolve({ status: response.status, body: await response.json(), cookies: jar.snapshot() });
        } catch (error) {
          reject(error);
        }
      });
    }, afterMs);
  });
}

const expiredJar = refreshToken => createCookieJar({ [ACCESS_COOKIE]: "expired", [REFRESH_COOKIE]: refreshToken });

let backend;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  backend = createFakeBackend();
  globalThis.fetch = (url, init) => backend.fetch(url, init);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("two tabs of one student and another student start voice/avatar sessions during concurrent refreshes", async () => {
  const aliceToken = backend.issueRefreshToken("alice");
  const bobToken = backend.issueRefreshToken("bob");
  const aliceTab1 = expiredJar(aliceToken);
  const aliceTab2 = expiredJar(aliceToken);
  const bobTab = expiredJar(bobToken);

  const [a1, a2, b] = await Promise.all([
    post(aliceTab1, "sessions/start", { topic_id: "music", mode: "voice_practice" }),
    post(aliceTab2, "sessions/start", { topic_id: "music" }, { afterMs: 3 }),
    post(bobTab, "sessions/start", { topic_id: "travel", mode: "voice_practice" }, { afterMs: 5 }),
  ]);

  for (const result of [a1, a2, b]) assert.equal(result.status, 200);
  // Each refresh token spent once; Alice's two tabs share hers.
  assert.deepEqual([...backend.refreshCalls].sort(), [aliceToken, bobToken].sort());
  assert.match(a1.cookies[ACCESS_COOKIE], /^access-alice-/);
  assert.equal(a1.cookies[REFRESH_COOKIE], a2.cookies[REFRESH_COOKIE]);
  assert.match(b.cookies[ACCESS_COOKIE], /^access-bob-/);

  // Every backend call was made as the user whose tab sent it.
  const starts = backend.calls.filter(c => c.pathname === "/api/v1/sessions/start");
  assert.deepEqual(
    starts.map(c => [c.user, c.body.topic_id, c.body.mode ?? "topic_discussion"]).sort(),
    [["alice", "music", "topic_discussion"], ["alice", "music", "voice_practice"], ["bob", "travel", "voice_practice"]],
  );
  assert.match(a1.body.participant_token, /^jwt-alice-/);
  assert.match(b.body.participant_token, /^jwt-bob-/);
  assert.match(a1.body.room_name, /^voice-/);
  assert.match(a2.body.room_name, /^mariam-/);
  assert.notEqual(a1.body.room_name, b.body.room_name);
});

test("ending a voice session during a refresh only ever acts as its own student", async () => {
  const aliceJar = createCookieJar({ [REFRESH_COOKIE]: backend.issueRefreshToken("alice") });
  const bobJar = createCookieJar({ [REFRESH_COOKIE]: backend.issueRefreshToken("bob") });
  const alice = await post(aliceJar, "sessions/start", { topic_id: "music", mode: "voice_practice" });
  const bob = await post(bobJar, "sessions/start", { topic_id: "travel", mode: "voice_practice" });

  // Both access cookies expire again; both end at once, and Alice's tab also
  // (maliciously or by a bug) tries to end Bob's session.
  aliceJar.set(ACCESS_COOKIE, "expired");
  bobJar.set(ACCESS_COOKIE, "expired");
  const endBody = { end_reason: "user_ended", browser_transcript: [] };
  const [aliceEnd, bobEnd, cross] = await Promise.all([
    post(aliceJar, `sessions/${alice.body.session_id}/end`, endBody),
    post(bobJar, `sessions/${bob.body.session_id}/end`, endBody, { afterMs: 3 }),
    post(aliceJar, `sessions/${bob.body.session_id}/end`, endBody, { afterMs: 6 }),
  ]);

  assert.equal(aliceEnd.status, 200);
  assert.equal(bobEnd.status, 200);
  assert.equal(cross.status, 403);
  const ends = backend.calls.filter(c => c.pathname.endsWith("/end"));
  assert.deepEqual(
    ends.map(c => [c.user, c.pathname.split("/")[4]]).sort(),
    [["alice", alice.body.session_id], ["alice", bob.body.session_id], ["bob", bob.body.session_id]].sort(),
  );
});
