// Center Admin Users dashboard filters/paging: pure filters -> API params mapping, and the result-range label.
// Search/status/paging themselves run on the server (GET /users); nothing here filters data.
//
// Run with: npm run test:lists
import assert from "node:assert/strict";
import { test } from "node:test";

const { DEFAULT_USERS_FILTERS, USERS_PAGE_SIZE, hasActiveUsersFilters, resultRange, toUsersApiParams } = await import(
  new URL("../lib/users/usersFilters.ts", import.meta.url).href
);

test("defaults: no search, no status filter", () => {
  assert.deepEqual(DEFAULT_USERS_FILTERS, { search: "", status: "all" });
  assert.equal(hasActiveUsersFilters(DEFAULT_USERS_FILTERS), false);
});

test("toUsersApiParams omits empty search and 'all' status", () => {
  assert.deepEqual(toUsersApiParams(DEFAULT_USERS_FILTERS, 1, USERS_PAGE_SIZE), { page: 1, limit: USERS_PAGE_SIZE });
});

test("toUsersApiParams trims search and includes a real status", () => {
  const filters = { search: "  alice  ", status: "active" };
  assert.deepEqual(toUsersApiParams(filters, 2, 20), { page: 2, limit: 20, search: "alice", status: "active" });
});

test("a search of only whitespace counts as no search", () => {
  assert.equal(hasActiveUsersFilters({ search: "   ", status: "all" }), false);
  assert.deepEqual(toUsersApiParams({ search: "   ", status: "all" }, 1, 20), { page: 1, limit: 20 });
});

test("hasActiveUsersFilters is true for either a search or a non-'all' status", () => {
  assert.equal(hasActiveUsersFilters({ search: "bob", status: "all" }), true);
  assert.equal(hasActiveUsersFilters({ search: "", status: "inactive" }), true);
});

test("resultRange: null when there is nothing to show", () => {
  assert.equal(resultRange(0, 1, 20, 0), null);
  assert.equal(resultRange(5, 1, 20, 0), null);
});

test("resultRange: the visible slice of the total, from a response already in hand", () => {
  assert.deepEqual(resultRange(45, 1, 20, 20), { from: 1, to: 20, total: 45 });
  assert.deepEqual(resultRange(45, 3, 20, 5), { from: 41, to: 45, total: 45 });
});
