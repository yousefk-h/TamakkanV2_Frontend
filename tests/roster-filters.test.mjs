// Student List filters: search, level, plan, email verification and alerts. No browser, no network.
//
// Run with: npm run test:lists
import assert from "node:assert/strict";
import { test } from "node:test";

const { DEFAULT_ROSTER_FILTERS, filterRoster, hasActiveFilters, rosterFiltersKey } = await import(
  new URL("../lib/students/rosterFilters.ts", import.meta.url).href
);

const student = (id, overrides = {}) => ({
  id,
  created_at: "2026-09-01T00:00:00",
  updated_at: "2026-09-01T00:00:00",
  email: `${id}@example.com`,
  full_name: id,
  role: "student",
  is_active: true,
  email_verification_status: "verified",
  plan: "standard",
  assigned_level: "beginner",
  assigned_topic_ids: [],
  assigned_plan_template_id: null,
  max_session_duration_minutes: 15,
  duration_override_minutes: null,
  program_start_date: "2026-09-01",
  ...overrides,
});

const roster = [
  student("lina", { full_name: "Lina Haddad", email: "lina.h@school.jo" }),
  student("omar", { full_name: "Omar Saleh", assigned_level: "advanced", email_verification_status: "pending" }),
  student("rana", { full_name: "Rana Khoury", plan: "pro", assigned_level: null, assigned_topic_ids: ["t1"] }),
  student("sami", { full_name: "Sami Nasser", assigned_level: "intermediate", email_verification_status: "not_required" }),
];
const alerts = {
  omar: { pending_rollover_count: 2, missed_submission_days: [], has_alerts: true },
  rana: { pending_rollover_count: 0, missed_submission_days: [], has_alerts: false },
};
const ids = list => list.map(s => s.id);
const filter = (overrides, alertMap = alerts) => ids(filterRoster(roster, { ...DEFAULT_ROSTER_FILTERS, ...overrides }, alertMap));

test("defaults: no filters, the whole roster in its original order", () => {
  assert.deepEqual(filter({}), ["lina", "omar", "rana", "sami"]);
  assert.equal(hasActiveFilters(DEFAULT_ROSTER_FILTERS), false);
});

test("search matches name or email, case-insensitively, ignoring surrounding spaces", () => {
  assert.deepEqual(filter({ query: "rana" }), ["rana"]);
  assert.deepEqual(filter({ query: "  OMAR " }), ["omar"]);
  assert.deepEqual(filter({ query: "school.jo" }), ["lina"]);
  assert.deepEqual(filter({ query: "nobody" }), []);
  assert.equal(hasActiveFilters({ ...DEFAULT_ROSTER_FILTERS, query: "   " }), false);
});

test("level and plan filters", () => {
  assert.deepEqual(filter({ level: "advanced" }), ["omar"]);
  assert.deepEqual(filter({ plan: "pro" }), ["rana"]);
  assert.deepEqual(filter({ plan: "standard" }), ["lina", "omar", "sami"]);
  // Pro students have no level, so any level choice excludes them.
  assert.deepEqual(filter({ plan: "pro", level: "beginner" }), []);
});

test("email verification filter matches the exact status", () => {
  assert.deepEqual(filter({ verification: "pending" }), ["omar"]);
  assert.deepEqual(filter({ verification: "verified" }), ["lina", "rana"]);
});

test("alerts filter: a student missing from the alerts map counts as no alerts", () => {
  assert.deepEqual(filter({ alerts: "with" }), ["omar"]);
  assert.deepEqual(filter({ alerts: "without" }), ["lina", "rana", "sami"]);
});

test("alerts filter matches nobody while alerts are still loading, rather than guessing", () => {
  assert.deepEqual(filter({ alerts: "with" }, null), []);
  assert.deepEqual(filter({ alerts: "without" }, null), []);
  assert.deepEqual(filter({ alerts: "all" }, null), ["lina", "omar", "rana", "sami"]);
});

test("filters combine with AND", () => {
  assert.deepEqual(filter({ plan: "standard", verification: "pending", alerts: "with" }), ["omar"]);
  assert.deepEqual(filter({ query: "a", level: "intermediate" }), ["sami"]);
});

test("reset key changes with any filter but ignores query case/whitespace", () => {
  const base = rosterFiltersKey(DEFAULT_ROSTER_FILTERS);
  for (const change of [{ query: "x" }, { level: "advanced" }, { plan: "pro" }, { verification: "pending" }, { alerts: "with" }]) {
    assert.notEqual(rosterFiltersKey({ ...DEFAULT_ROSTER_FILTERS, ...change }), base, JSON.stringify(change));
  }
  assert.equal(
    rosterFiltersKey({ ...DEFAULT_ROSTER_FILTERS, query: " Lina " }),
    rosterFiltersKey({ ...DEFAULT_ROSTER_FILTERS, query: "lina" }),
  );
});
