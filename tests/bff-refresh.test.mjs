// Regression tests for the BFF proxy's refresh-and-retry
// (app/api/backend/[...path]/route.ts). They drive the real route handler
// with a per-request cookie jar (see helpers/next-headers-mock.mjs) against a
// fake backend that rotates refresh tokens single-use, the same way
// the backend's AuthService.refresh does.
//
// Run with: npm run test:bff
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createCookieJar, requestCookies } from "./helpers/next-headers-mock.mjs";

process.env.API_BASE_URL = "http://backend.test/api/v1";
process.env.AUTH_COOKIE_PREFIX = "tamakkan";

const { GET } = await import(new URL("../app/api/backend/[...path]/route.ts", import.meta.url).href);

const ACCESS_COOKIE = "tamakkan_access_token";
const REFRESH_COOKIE = "tamakkan_refresh_token";
// Long enough that requests fired a few ms apart overlap one refresh round trip.
const REFRESH_LATENCY_MS = 50;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function createFakeBackend() {
  const validRefreshTokens = new Map(); // raw refresh token -> user (single-use)
  const validAccessTokens = new Map(); // access token -> user
  const throwingRefreshTokens = new Set();
  const refreshCalls = [];
  let counter = 0;

  const backend = {
    refreshCalls,
    issueRefreshToken(user) {
      const token = `refresh-${user}-${++counter}`;
      validRefreshTokens.set(token, user);
      return token;
    },
    throwOnNextRefresh(token) {
      throwingRefreshTokens.add(token);
    },
    async fetch(url, init = {}) {
      const { pathname } = new URL(String(url));
      if (pathname === "/api/v1/auth/refresh") {
        const { refresh_token: token } = JSON.parse(init.body);
        refreshCalls.push(token);
        await delay(REFRESH_LATENCY_MS);
        if (throwingRefreshTokens.delete(token)) throw new TypeError("fetch failed");
        const user = validRefreshTokens.get(token);
        if (!user) return json(401, { detail: "Invalid or expired refresh token" });
        validRefreshTokens.delete(token);
        const accessToken = `access-${user}-${++counter}`;
        validAccessTokens.set(accessToken, user);
        return json(200, { access_token: accessToken, refresh_token: backend.issueRefreshToken(user), token_type: "bearer" });
      }
      if (pathname === "/api/v1/me") {
        const authorization = init.headers?.Authorization;
        // FastAPI's HTTPBearer answers a missing header with 403, not 401.
        if (!authorization) return json(403, { detail: "Not authenticated" });
        const user = validAccessTokens.get(authorization.replace(/^Bearer /, ""));
        return user ? json(200, { email: `${user}@example.com` }) : json(401, { detail: "Could not validate credentials" });
      }
      return json(404, { detail: "Not Found" });
    },
  };
  return backend;
}

/** Simulates one browser request to GET /api/backend/me carrying `jar`'s cookies. */
function requestMe(jar, { afterMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      requestCookies.run(jar, async () => {
        try {
          const response = await GET(new Request("http://frontend.test/api/backend/me"), {
            params: Promise.resolve({ path: ["me"] }),
          });
          resolve({ status: response.status, body: await response.json(), cookies: jar.snapshot() });
        } catch (error) {
          reject(error);
        }
      });
    }, afterMs);
  });
}

function expiredSessionJar(refreshToken) {
  return createCookieJar({ [ACCESS_COOKIE]: "expired-access-token", [REFRESH_COOKIE]: refreshToken });
}

function assertSessionOf(result, user) {
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { email: `${user}@example.com` });
  assert.match(result.cookies[ACCESS_COOKIE], new RegExp(`^access-${user}-`));
  assert.match(result.cookies[REFRESH_COOKIE], new RegExp(`^refresh-${user}-`));
}

let backend;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  backend = createFakeBackend();
  globalThis.fetch = (url, init) => backend.fetch(url, init);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("concurrent refreshes for different users keep each user's own session", async () => {
  const aliceToken = backend.issueRefreshToken("alice");
  const bobToken = backend.issueRefreshToken("bob");

  const [alice, bob] = await Promise.all([
    requestMe(expiredSessionJar(aliceToken)),
    requestMe(expiredSessionJar(bobToken), { afterMs: 5 }),
  ]);

  assertSessionOf(alice, "alice");
  assertSessionOf(bob, "bob");
  assert.deepEqual([...backend.refreshCalls].sort(), [aliceToken, bobToken].sort());
});

test("refreshed cookies keep their httpOnly/sameSite/path attributes", async () => {
  const jar = expiredSessionJar(backend.issueRefreshToken("alice"));
  await requestMe(jar);

  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    const options = jar.optionsFor(name);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/");
  }
});

test("concurrent requests from the same user share a single refresh", async () => {
  const token = backend.issueRefreshToken("alice");

  const results = await Promise.all([
    requestMe(expiredSessionJar(token)),
    requestMe(expiredSessionJar(token), { afterMs: 2 }),
    requestMe(expiredSessionJar(token), { afterMs: 4 }),
  ]);

  // The backend's refresh tokens are single-use: a second refresh with the
  // same token would be rejected and log the user out.
  assert.deepEqual(backend.refreshCalls, [token]);
  for (const result of results) assertSessionOf(result, "alice");
  const successors = new Set(results.map((result) => result.cookies[REFRESH_COOKIE]));
  assert.equal(successors.size, 1);
});

test("a failed refresh logs out only its own user (it started second)", async () => {
  const aliceToken = backend.issueRefreshToken("alice");

  const [alice, carol] = await Promise.all([
    requestMe(expiredSessionJar(aliceToken)),
    requestMe(expiredSessionJar("refresh-carol-revoked"), { afterMs: 5 }),
  ]);

  assertSessionOf(alice, "alice");
  assert.equal(carol.status, 401);
  assert.deepEqual(carol.cookies, {});
});

test("a failed refresh does not log out another user refreshing at the same time (it started first)", async () => {
  const aliceToken = backend.issueRefreshToken("alice");

  const [carol, alice] = await Promise.all([
    requestMe(expiredSessionJar("refresh-carol-revoked")),
    requestMe(expiredSessionJar(aliceToken), { afterMs: 5 }),
  ]);

  assert.equal(carol.status, 401);
  assert.deepEqual(carol.cookies, {});
  assertSessionOf(alice, "alice");
});

test("a settled refresh is not reused by a later request with the same old token", async () => {
  const token = backend.issueRefreshToken("alice");

  assertSessionOf(await requestMe(expiredSessionJar(token)), "alice");

  // A tab still holding the pre-rotation cookies, arriving after the first
  // refresh finished, must hit the backend itself - and the backend rejects
  // the already-rotated token.
  const stale = await requestMe(expiredSessionJar(token));
  assert.deepEqual(backend.refreshCalls, [token, token]);
  assert.equal(stale.status, 401);
  assert.deepEqual(stale.cookies, {});
});

test("a refresh that throws does not poison later refreshes with the same token", async () => {
  const token = backend.issueRefreshToken("alice");
  backend.throwOnNextRefresh(token);

  await assert.rejects(requestMe(expiredSessionJar(token)), /fetch failed/);

  assertSessionOf(await requestMe(expiredSessionJar(token)), "alice");
  assert.deepEqual(backend.refreshCalls, [token, token]);
});

test("requests with no access cookie (403 from the backend) refresh per user", async () => {
  const aliceJar = createCookieJar({ [REFRESH_COOKIE]: backend.issueRefreshToken("alice") });
  const bobJar = createCookieJar({ [REFRESH_COOKIE]: backend.issueRefreshToken("bob") });

  const [alice, bob] = await Promise.all([requestMe(aliceJar), requestMe(bobJar, { afterMs: 5 })]);

  assertSessionOf(alice, "alice");
  assertSessionOf(bob, "bob");
});
