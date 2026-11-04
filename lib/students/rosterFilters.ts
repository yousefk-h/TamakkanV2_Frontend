import type { Level, StudentAlerts, UserPublic } from "../api/types";

/** The Student List's filter state and matching rules - pure, so
 * `tests/roster-filters.test.mjs` can cover them without rendering the page.
 * Every filter narrows (AND), and "all"/"" means that filter is off. */
export interface RosterFilters {
  /** Case-insensitive substring of the student's name *or* email. */
  query: string;
  level: "all" | Level;
  plan: "all" | "standard" | "pro";
  verification: "all" | "verified" | "pending";
  alerts: "all" | "with" | "without";
}

export const DEFAULT_ROSTER_FILTERS: RosterFilters = {
  query: "",
  level: "all",
  plan: "all",
  verification: "all",
  alerts: "all",
};

/** True when anything narrows the list - drives "Clear filters" and the
 * "N of M students" count. A whitespace-only query doesn't count. */
export function hasActiveFilters(filters: RosterFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.level !== "all" ||
    filters.plan !== "all" ||
    filters.verification !== "all" ||
    filters.alerts !== "all"
  );
}

/** One string identifying the filter combination - `usePagination`'s
 * `resetKey`, so changing any filter returns the roster to page 1. */
export function rosterFiltersKey(filters: RosterFilters): string {
  return [filters.query.trim().toLowerCase(), filters.level, filters.plan, filters.verification, filters.alerts].join("|");
}

/** `alerts` is the roster-wide `GET /users/alerts` map, fetched separately
 * from the roster itself - `null` while it's still loading, in which case
 * the alerts filter matches nothing either way rather than guessing. */
export function filterRoster(
  students: readonly UserPublic[],
  filters: RosterFilters,
  alerts: Record<string, StudentAlerts> | null,
): UserPublic[] {
  const query = filters.query.trim().toLowerCase();
  return students.filter(s => {
    if (query && !s.full_name.toLowerCase().includes(query) && !s.email.toLowerCase().includes(query)) return false;
    if (filters.level !== "all" && s.assigned_level !== filters.level) return false;
    if (filters.plan !== "all" && s.plan !== filters.plan) return false;
    if (filters.verification !== "all" && s.email_verification_status !== filters.verification) return false;
    if (filters.alerts !== "all") {
      if (alerts === null) return false;
      const hasAlerts = alerts[s.id]?.has_alerts ?? false;
      if (hasAlerts !== (filters.alerts === "with")) return false;
    }
    return true;
  });
}
