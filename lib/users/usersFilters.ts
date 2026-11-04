import type { ListStudentsParams, StudentStatusFilter } from "../api/types";

/** The Users dashboard's Students-tab filters, kept pure so `tests/users-filters.test.mjs` covers them without a
 * browser. Search/status/paging are all server-side (`GET /users`); nothing here filters data itself. */

export interface UsersFilters {
  search: string;
  status: StudentStatusFilter | "all";
}

export const DEFAULT_USERS_FILTERS: UsersFilters = { search: "", status: "all" };

export const USERS_PAGE_SIZE = 20;
export const USERS_SEARCH_DEBOUNCE_MS = 300;

/** Maps the UI's filter state + page to `GET /users`'s real query params. */
export function toUsersApiParams(filters: UsersFilters, page: number, limit: number = USERS_PAGE_SIZE): ListStudentsParams {
  const params: ListStudentsParams = { page, limit };
  const search = filters.search.trim();
  if (search) params.search = search;
  if (filters.status !== "all") params.status = filters.status;
  return params;
}

export function hasActiveUsersFilters(filters: UsersFilters): boolean {
  return filters.search.trim() !== "" || filters.status !== "all";
}

/** The visible 1-based range for the current page, from a response already in hand - no extra request. */
export function resultRange(total: number, page: number, limit: number, itemCount: number): { from: number; to: number; total: number } | null {
  if (total <= 0 || itemCount <= 0) return null;
  const from = (page - 1) * limit + 1;
  return { from, to: from + itemCount - 1, total };
}
