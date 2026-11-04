/** Pure paging math shared by `usePagination` and `<Pagination>` - no React,
 * so `tests/pagination.test.mjs` can exercise it directly.
 *
 * Paging is client-side: every list endpoint (except `GET /topics`) returns
 * its whole collection, and the roster/topic contexts double as id lookups
 * for other pages, so slicing what's already loaded is the one approach that
 * doesn't change any API contract. */

/** Rows/stacked items - tables, check-ins, classes, report cards. */
export const LIST_PAGE_SIZES = [10, 20, 50] as const;
/** Card grids that wrap to 2, 3 or 4 columns - multiples of 12 always fill
 * their last row. */
export const GRID_PAGE_SIZES = [12, 24, 48] as const;

export type PageItem = number | "start-ellipsis" | "end-ellipsis";

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** A page that's out of range (the list shrank after a delete or a refetch)
 * snaps to the nearest real one rather than rendering empty. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, Math.floor(page)), pageCount(total, pageSize));
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** 1-based positions of the first/last item on `page`, for "Showing 11-20 of 42" -
 * both 0 when there's nothing to show. */
export function pageBounds(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, from + pageSize - 1) };
}

/** After a page-size change, the page that keeps the first visible item on
 * screen - switching 10 -> 50 on page 3 lands on the page containing item 21,
 * not back on page 1. */
export function pageForItem(itemIndex: number, pageSize: number): number {
  return Math.floor(itemIndex / pageSize) + 1;
}

function range(start: number, end: number): number[] {
  return end < start ? [] : Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** Page buttons to render: always the first and last page, the current one
 * with one neighbour each side, and an ellipsis for any gap - a constant 7
 * slots once there are 7+ pages, so the control never changes width as you
 * page through. An ellipsis is only used when it hides 2+ pages; a gap of
 * exactly one page shows that page instead. */
export function pageRange(current: number, count: number): PageItem[] {
  if (count <= 7) return range(1, count);
  const siblingsStart = Math.max(Math.min(current - 1, count - 4), 3);
  const siblingsEnd = Math.min(Math.max(current + 1, 5), count - 2);
  return [
    1,
    siblingsStart > 3 ? "start-ellipsis" : 2,
    ...range(siblingsStart, siblingsEnd),
    siblingsEnd < count - 2 ? "end-ellipsis" : count - 1,
    count,
  ];
}
