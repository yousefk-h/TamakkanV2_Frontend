// AI Reports search/filters: URL <-> filters <-> API mapping (pure) and the page's wiring. No browser, no network.
// The mobile filter UI itself is exercised in a real browser (see the QA run in the change notes); here the wiring is pinned.
//
// Run with: npm run test:ui
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const {
  DEFAULT_REPORT_FILTERS, activeFilterCount, datePresetRange, dayInZone, dayRangeToUtc, hasActiveFilters, parseReportFilters, resultRange, toApiParams, toSearchParams, zonedDayStart,
} = await import(new URL("../lib/reports/reportFilters.ts", import.meta.url).href);
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const q = text => new URLSearchParams(text);
const AMMAN = "Asia/Amman"; // UTC+3 all year since 2022
const TODAY = new Date("2026-10-06T12:30:00Z"); // 15:30 on 6 Oct in Amman

test("defaults: an empty URL means no filters, page 1, and 'any report'", () => {
  const { filters, page } = parseReportFilters(q(""));
  assert.deepEqual(filters, DEFAULT_REPORT_FILTERS);
  assert.equal(page, 1);
  assert.equal(hasActiveFilters(filters), false);
  assert.equal(toSearchParams(filters, 1).toString(), "", "defaults and page 1 are not written to the URL");
});

test("URL round trip keeps every filter and the page", () => {
  const url = "q=alice&student_id=s1&topic_id=t1&status=scored&mode=voice_practice&date=custom&from=2026-09-01&to=2026-09-30&page=3";
  const { filters, page } = parseReportFilters(q(url));
  assert.deepEqual(filters, { search: "alice", studentId: "s1", topicId: "t1", status: "scored", mode: "voice_practice", datePreset: "custom", dateFrom: "2026-09-01", dateTo: "2026-09-30" });
  assert.equal(page, 3);
  assert.deepEqual(Object.fromEntries(toSearchParams(filters, page)), Object.fromEntries(q(url)));
});

test("a hand-edited URL can never produce an invalid state", () => {
  const { filters, page } = parseReportFilters(q("status=nonsense&mode=avatar&date=forever&page=-4&from=yesterday"));
  assert.equal(filters.status, "any");
  assert.equal(filters.mode, "");
  assert.equal(filters.datePreset, "all");
  assert.equal(page, 1);
  assert.equal(parseReportFilters(q("page=2.5")).page, 1);
  assert.equal(parseReportFilters(q("date=custom&from=2026-1-1&to=2026-10-06")).filters.dateFrom, "", "malformed custom dates are dropped");
  assert.equal(parseReportFilters(q(`q=${"x".repeat(300)}`)).filters.search.length, 100);
});

test("custom dates only count when the preset is custom", () => {
  assert.equal(parseReportFilters(q("date=last7&from=2026-09-01&to=2026-09-30")).filters.dateFrom, "");
});

test("API params: every filter maps to the backend's real query names and values", () => {
  const filters = { ...DEFAULT_REPORT_FILTERS, search: "  bob  ", studentId: "s1", topicId: "t1", status: "needs_review", mode: "topic_discussion" };
  assert.deepEqual(toApiParams(filters, 2, 10, TODAY, AMMAN), { report_status: "needs_review", page: 2, limit: 10, search: "bob", student_id: "s1", topic_id: "t1", mode: "topic_discussion" });
  assert.deepEqual(toApiParams(DEFAULT_REPORT_FILTERS, 1, 20, TODAY, AMMAN), { report_status: "any", page: 1, limit: 20 }, "'All reports' still asks only for sessions that HAVE a report");
});

test("date presets are inclusive calendar days in the viewer's timezone", () => {
  assert.equal(dayInZone(TODAY, AMMAN), "2026-10-06");
  assert.deepEqual(datePresetRange("today", TODAY, AMMAN), { from: "2026-10-06", to: "2026-10-06" });
  assert.deepEqual(datePresetRange("last7", TODAY, AMMAN), { from: "2026-09-30", to: "2026-10-06" });
  assert.deepEqual(datePresetRange("last30", TODAY, AMMAN), { from: "2026-09-07", to: "2026-10-06" });
  assert.equal(datePresetRange("all", TODAY, AMMAN), null);
});

test("local day -> UTC boundaries: half-open [start of first day, start of the day after the last), per timezone", () => {
  const api = toApiParams({ ...DEFAULT_REPORT_FILTERS, datePreset: "today" }, 1, 10, TODAY, AMMAN);
  assert.equal(api.started_from, "2026-10-05T21:00:00.000Z", "Amman midnight is 21:00 UTC the evening before");
  assert.equal(api.started_before, "2026-10-06T21:00:00.000Z");
  assert.equal(api.date_from, undefined, "calendar days are no longer sent; only explicit instants");
  assert.deepEqual(dayRangeToUtc({ from: "2026-10-06", to: "2026-10-06" }, "UTC"), { started_from: "2026-10-06T00:00:00.000Z", started_before: "2026-10-07T00:00:00.000Z" });
  assert.deepEqual(dayRangeToUtc({ from: "2026-10-06", to: "2026-10-06" }, "America/Los_Angeles"), { started_from: "2026-10-06T07:00:00.000Z", started_before: "2026-10-07T07:00:00.000Z" }, "PDT is UTC-7");
  assert.deepEqual(dayRangeToUtc({ from: "2026-12-01", to: "2026-12-01" }, "America/Los_Angeles"), { started_from: "2026-12-01T08:00:00.000Z", started_before: "2026-12-02T08:00:00.000Z" }, "PST is UTC-8");
  assert.deepEqual(dayRangeToUtc({ from: "2026-10-06", to: "2026-10-06" }, "Pacific/Kiritimati"), { started_from: "2026-10-05T10:00:00.000Z", started_before: "2026-10-06T10:00:00.000Z" }, "UTC+14");
});

test("DST: a 23-hour and a 25-hour local day get the right boundaries", () => {
  // US spring forward 8 Mar 2026: that local day is 23h long.
  const spring = dayRangeToUtc({ from: "2026-03-08", to: "2026-03-08" }, "America/New_York");
  assert.equal(spring.started_from, "2026-03-08T05:00:00.000Z");
  assert.equal(spring.started_before, "2026-03-09T04:00:00.000Z");
  // US fall back 1 Nov 2026: 25h long.
  const fall = dayRangeToUtc({ from: "2026-11-01", to: "2026-11-01" }, "America/New_York");
  assert.equal(fall.started_from, "2026-11-01T04:00:00.000Z");
  assert.equal(fall.started_before, "2026-11-02T05:00:00.000Z");
});

test("a session around local midnight belongs to the expected user-visible day", () => {
  const inDay = (iso, day, tz) => {
    const { started_from, started_before } = dayRangeToUtc({ from: day, to: day }, tz);
    return iso >= started_from && iso < started_before; // exactly the backend's half-open comparison
  };
  // Amman (UTC+3): 23:59 on the 5th local is 20:59 UTC; 00:00 on the 6th local is 21:00 UTC.
  assert.equal(inDay("2026-10-05T20:59:59.000Z", "2026-10-05", AMMAN), true);
  assert.equal(inDay("2026-10-05T20:59:59.000Z", "2026-10-06", AMMAN), false);
  assert.equal(inDay("2026-10-05T21:00:00.000Z", "2026-10-06", AMMAN), true, "the first instant of the local day is included");
  assert.equal(inDay("2026-10-05T21:00:00.000Z", "2026-10-05", AMMAN), false, "and is NOT part of the previous day");
  assert.equal(inDay("2026-10-06T20:59:59.999Z", "2026-10-06", AMMAN), true);
  assert.equal(inDay("2026-10-06T21:00:00.000Z", "2026-10-06", AMMAN), false, "the end is exclusive");
  // 01:30 UTC on the 6th is still the evening of the 5th in Los Angeles.
  assert.equal(inDay("2026-10-06T01:30:00.000Z", "2026-10-05", "America/Los_Angeles"), true);
  assert.equal(inDay("2026-10-06T01:30:00.000Z", "2026-10-06", "America/Los_Angeles"), false);
  assert.equal(dayInZone(new Date("2026-10-05T21:00:00Z"), AMMAN), "2026-10-06");
  assert.equal(dayInZone(new Date("2026-10-05T20:59:59Z"), AMMAN), "2026-10-05");
  // "today" itself follows the viewer: 22:00 UTC is already tomorrow in Amman, still today in UTC.
  const lateUtc = new Date("2026-10-05T22:00:00Z");
  assert.equal(datePresetRange("today", lateUtc, AMMAN).from, "2026-10-06");
  assert.equal(datePresetRange("today", lateUtc, "UTC").from, "2026-10-05");
  assert.equal(zonedDayStart("2026-10-06", AMMAN).toISOString(), "2026-10-05T21:00:00.000Z");
});

test("a custom range may be open-ended, and an inverted one is repaired instead of sent as an error", () => {
  const base = { ...DEFAULT_REPORT_FILTERS, datePreset: "custom" };
  const open = toApiParams({ ...base, dateFrom: "2026-09-01" }, 1, 10, TODAY, AMMAN);
  assert.equal(open.started_from, "2026-08-31T21:00:00.000Z");
  assert.equal(open.started_before, undefined);
  const swapped = toApiParams({ ...base, dateFrom: "2026-10-05", dateTo: "2026-09-01" }, 1, 10, TODAY, AMMAN);
  assert.equal(swapped.started_from, "2026-08-31T21:00:00.000Z");
  assert.equal(swapped.started_before, "2026-10-05T21:00:00.000Z", "inclusive last day 5 Oct -> exclusive start of 6 Oct");
});

test("result count: the visible slice of the filtered total, from the response alone", () => {
  assert.deepEqual(resultRange(42, 1, 10, 10), { from: 1, to: 10, total: 42 });
  assert.deepEqual(resultRange(42, 2, 10, 10), { from: 11, to: 20, total: 42 });
  assert.deepEqual(resultRange(42, 5, 10, 2), { from: 41, to: 42, total: 42 }, "last, partial page");
  assert.deepEqual(resultRange(1, 1, 10, 1), { from: 1, to: 1, total: 1 }, "singular");
  assert.deepEqual(resultRange(42, 2, 20, 20), { from: 21, to: 40, total: 42 }, "other page sizes");
  assert.equal(resultRange(0, 1, 10, 0), null, "zero results: nothing to count, the empty state shows instead");
});

test("the filter badge counts dropdown filters only; search is its own control", () => {
  assert.equal(activeFilterCount({ ...DEFAULT_REPORT_FILTERS, search: "x" }), 0);
  assert.equal(activeFilterCount({ ...DEFAULT_REPORT_FILTERS, studentId: "s", status: "scored", datePreset: "today" }), 3);
  assert.equal(hasActiveFilters({ ...DEFAULT_REPORT_FILTERS, search: "x" }), true);
  assert.equal(hasActiveFilters({ ...DEFAULT_REPORT_FILTERS, search: "   " }), false);
});

test("changing a filter resets to page 1, keeps the others, and clearing restores the defaults", () => {
  const { filters, page } = parseReportFilters(q("student_id=s1&topic_id=t1&status=scored&page=4"));
  assert.equal(page, 4);
  const changed = { ...filters, status: "reviewed" };
  // the page applies every change with page 1 - the resulting URL has no `page`, and still has the other filters
  const url = toSearchParams(changed, 1);
  assert.equal(url.get("page"), null);
  assert.equal(url.get("student_id"), "s1");
  assert.equal(url.get("topic_id"), "t1");
  assert.equal(url.get("status"), "reviewed");
  assert.equal(toSearchParams(DEFAULT_REPORT_FILTERS, 1).toString(), "");
  // paging keeps every filter
  const second = toSearchParams(filters, 2);
  assert.equal(second.get("page"), "2");
  assert.equal(second.get("student_id"), "s1");
  assert.equal(second.get("status"), "scored");
});

test("wiring: the page filters on the server, debounces search, resets to page 1 and keeps the card markup", () => {
  const page = read("app/admin/reports/page.tsx");
  assert.match(page, /useReportPage\(apiParams\)/, "data comes from the server-side paged hook");
  assert.doesNotMatch(page, /useSessionsForAdmin|\.filter\(s => filter ===|usePagination\(/, "no client-side filtering or client-side paging of the full list");
  assert.match(page, /SEARCH_DEBOUNCE_MS/, "search is debounced");
  assert.match(page, /setTimeout\(\(\) => \{[\s\S]*?"replace"\)/, "the debounced commit writes the URL");
  assert.match(page, /go\(\{ \.\.\.desired\.current\.filters, \.\.\.patch \}, 1, "push"\)/, "any filter change goes to page 1 keeping the others");
  assert.match(page, /go\(desired\.current\.filters, next, "push"\)/, "paging keeps every filter");
  assert.match(page, /useSearchParams\(\)/, "filters live in the URL");
  assert.match(page, /adminReports\.noMatch/, "an empty result has its own message");
  assert.match(page, /resultRange\(total, data\.page, data\.limit, data\.items\.length\)/, "the count comes from the response already in hand");
  assert.match(page, /<ActiveFilterChips/, "active filters are shown as removable chips");
  for (const card of ["<article key={session.id}", "skillBars(session)", "<LearningReportDetails report={session.report} />", "handleToggleReviewed(session)"]) {
    assert.ok(page.includes(card), `report card markup kept: ${card}`);
  }
});

test("wiring: mobile shows Search + a Filters button that opens the shared sheet (Dialog + sheet-dialog) with Apply and Clear", () => {
  const bar = read("components/admin/reports/ReportFilterBar.tsx");
  assert.match(bar, /md:hidden/, "the Filters button is mobile-only");
  assert.match(bar, /hidden flex-wrap[^"]*md:flex/, "the inline filters are desktop-only");
  assert.match(bar, /import \{ Dialog, DialogCloseButton \} from "@\/components\/ui\/Dialog"/, "the existing Dialog primitive is reused");
  assert.match(bar, /sheet-dialog/, "styled as a bottom sheet by the existing class");
  assert.match(bar, /adminReports\.filtersWithCount/, "the button shows the active count");
  for (const key of ["adminReports.apply", "adminReports.clearFilters", "adminReports.studentFilter", "adminReports.topicFilter", "adminReports.statusFilter", "adminReports.modeFilter", "adminReports.dateFilter"]) {
    assert.ok(bar.includes(key), `${key} is in the filter UI`);
  }
});

test("api: the reports list uses GET /sessions with the server-side params and the paged envelope", () => {
  const client = read("lib/api/client.ts");
  assert.match(client, /listReports: \(params: ListReportsParams\) => request<SessionPage>\(`\$\{BACKEND_PREFIX\}\/sessions`, \{ params \}\)/);
  assert.match(client, /listForAdmin: \(\) => request<LiveSessionListItem\[\]>\(`\$\{BACKEND_PREFIX\}\/sessions`\)/, "the plain list other pages use is unchanged");
});

test("i18n: every new report-filter string exists in English and Arabic", () => {
  const keys = ["searchPlaceholder", "studentFilter", "allStudents", "topicFilter", "allTopics", "statusFilter", "statusScored", "statusNotScored", "modeFilter", "allModes", "modeAvatar", "modeVoice", "dateFilter", "dateAll", "dateToday", "dateLast7", "dateLast30", "dateCustom", "dateFrom", "dateTo", "clearFilters", "clearAll", "filters", "filtersWithCount", "apply", "removeFilter", "chipSearch", "chipStudent", "chipTopic", "chipStatus", "chipMode", "chipDate", "resultRange", "resultSingle", "noMatch"];
  for (const file of ["lib/i18n/messages/en.ts", "lib/i18n/messages/ar.ts"]) {
    const src = read(file);
    for (const key of keys) assert.match(src, new RegExp(`\\b${key}:`), `${file} is missing ${key}`);
  }
  assert.match(read("lib/i18n/messages/en.ts"), /resultRange: "Showing \{range\} of \{total\} reports"/);
  assert.match(read("lib/i18n/messages/en.ts"), /resultSingle: "Showing 1 of 1 report"/);
  assert.match(read("lib/i18n/messages/en.ts"), /searchPlaceholder: "Search student, email or topic\.\.\."/);
});
