import type { PracticeMode } from "../api/types";

/** The AI Reports page's filters, their URL form and their API form - pure, so `tests/report-filters.test.mjs` covers it
 * without a browser. Filtering itself is server-side (`GET /sessions`); nothing here filters data. */

export const REPORT_STATUSES = ["any", "scored", "not_scored", "needs_review", "reviewed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_MODES = ["topic_discussion", "voice_practice"] as const;

export const DATE_PRESETS = ["all", "today", "last7", "last30", "custom"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export interface ReportFilters {
  /** Free text: student name, e-mail or topic title. */
  search: string;
  studentId: string;
  topicId: string;
  /** `any` = every report (the page only ever lists sessions that have one). */
  status: ReportStatus;
  mode: "" | PracticeMode;
  datePreset: DatePreset;
  /** Only used with `datePreset === "custom"`; `YYYY-MM-DD`. */
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_REPORT_FILTERS: ReportFilters = {
  search: "",
  studentId: "",
  topicId: "",
  status: "any",
  mode: "",
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
};

export const REPORT_PAGE_SIZES = [10, 20, 50] as const;
export const SEARCH_DEBOUNCE_MS = 400;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The viewer's own IANA time zone (the browser's). Never a fixed zone: a teacher in Amman and one in Los Angeles each get
 * "today" in their own timezone. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function zoneParts(ms: number, timeZone: string): Record<string, number> {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(timeZone, f);
  }
  const out: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== "literal") out[part.type] = Number(part.value);
  return out;
}

/** The calendar day (`YYYY-MM-DD`) an instant falls on in `timeZone`. */
export function dayInZone(instant: Date, timeZone: string = browserTimeZone()): string {
  const p = zoneParts(instant.getTime(), timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Offset of `timeZone` from UTC at an instant, in ms (positive east of Greenwich). */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const p = zoneParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The UTC instant at which calendar day `day` begins in `timeZone` (handles DST: the offset is re-read at the result). */
export function zonedDayStart(day: string, timeZone: string = browserTimeZone()): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let ms = wall - zoneOffsetMs(wall, timeZone);
  const corrected = wall - zoneOffsetMs(ms, timeZone);
  if (corrected !== ms) ms = corrected;
  return new Date(ms);
}

/** Inclusive day range, in the viewer's timezone, for a preset (`null` = no date restriction).
 * "Last 7 days" = today and the six days before it. */
export function datePresetRange(preset: DatePreset, now: Date, timeZone: string = browserTimeZone()): { from: string; to: string } | null {
  const today = dayInZone(now, timeZone);
  if (preset === "today") return { from: today, to: today };
  if (preset === "last7") return { from: addDays(today, -6), to: today };
  if (preset === "last30") return { from: addDays(today, -29), to: today };
  return null;
}

/** Local calendar days -> the half-open UTC range the backend filters on: `[started_from, started_before)`.
 * The start of the first day and the start of the day AFTER the last one, both in `timeZone`, as ISO instants. */
export function dayRangeToUtc(range: { from?: string; to?: string }, timeZone: string = browserTimeZone()): { started_from?: string; started_before?: string } {
  const out: { started_from?: string; started_before?: string } = {};
  if (range.from) out.started_from = zonedDayStart(range.from, timeZone).toISOString();
  if (range.to) out.started_before = zonedDayStart(addDays(range.to, 1), timeZone).toISOString();
  return out;
}

/** "Showing 11–20 of 42": the visible slice of the filtered total. `null` when there is nothing to show. */
export function resultRange(total: number, page: number, limit: number, itemCount: number): { from: number; to: number; total: number } | null {
  if (total <= 0 || itemCount <= 0) return null;
  const from = (page - 1) * limit + 1;
  return { from, to: from + itemCount - 1, total };
}

type ParamSource = { get(name: string): string | null };

/** Reads filters + page from a query string. Anything unknown or malformed falls back to the default - a hand-edited URL
 * can never put the page in an invalid state. */
export function parseReportFilters(params: ParamSource): { filters: ReportFilters; page: number } {
  const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const value = params.get(name);
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  };
  const day = (name: string) => {
    const value = params.get(name) ?? "";
    return DAY.test(value) ? value : "";
  };
  const datePreset = pick("date", DATE_PRESETS, "all");
  const pageNumber = Number(params.get("page"));
  return {
    filters: {
      search: (params.get("q") ?? "").slice(0, 100),
      studentId: params.get("student_id") ?? "",
      topicId: params.get("topic_id") ?? "",
      status: pick("status", REPORT_STATUSES, "any"),
      mode: pick("mode", ["", ...REPORT_MODES] as const, ""),
      datePreset,
      dateFrom: datePreset === "custom" ? day("from") : "",
      dateTo: datePreset === "custom" ? day("to") : "",
    },
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  };
}

/** The shareable query string: defaults are omitted, page 1 is omitted. */
export function toSearchParams(filters: ReportFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.studentId) params.set("student_id", filters.studentId);
  if (filters.topicId) params.set("topic_id", filters.topicId);
  if (filters.status !== "any") params.set("status", filters.status);
  if (filters.mode) params.set("mode", filters.mode);
  if (filters.datePreset !== "all") {
    params.set("date", filters.datePreset);
    if (filters.datePreset === "custom") {
      if (filters.dateFrom) params.set("from", filters.dateFrom);
      if (filters.dateTo) params.set("to", filters.dateTo);
    }
  }
  if (page > 1) params.set("page", String(page));
  return params;
}

/** The `GET /sessions` query for these filters. Dates are sent as explicit UTC instants computed from the viewer's local days. Always asks for a paged response of sessions that HAVE a report. */
export function toApiParams(filters: ReportFilters, page: number, limit: number, now: Date, timeZone: string = browserTimeZone()): Record<string, string | number> {
  const api: Record<string, string | number> = { report_status: filters.status, page, limit };
  if (filters.search.trim()) api.search = filters.search.trim();
  if (filters.studentId) api.student_id = filters.studentId;
  if (filters.topicId) api.topic_id = filters.topicId;
  if (filters.mode) api.mode = filters.mode;
  let range: { from?: string; to?: string } | null = datePresetRange(filters.datePreset, now, timeZone);
  if (filters.datePreset === "custom") {
    let from = filters.dateFrom;
    let to = filters.dateTo;
    if (from && to && from > to) [from, to] = [to, from];
    range = { from, to };
  }
  if (range) Object.assign(api, dayRangeToUtc(range, timeZone));
  return api;
}

/** How many of the dropdown filters are set (the "Filters (3)" badge). Free-text search is its own box, so not counted. */
export function activeFilterCount(filters: ReportFilters): number {
  return [filters.studentId, filters.topicId, filters.status !== "any", filters.mode, filters.datePreset !== "all"].filter(Boolean).length;
}

export function hasActiveFilters(filters: ReportFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.search.trim() !== "";
}
