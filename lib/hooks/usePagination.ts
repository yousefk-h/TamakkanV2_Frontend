"use client";

import { useCallback, useState } from "react";
import { clampPage, LIST_PAGE_SIZES, pageBounds, pageCount, pageForItem, pageSlice } from "../pagination";

export interface PaginationState<T> {
  /** Just the current page's items - render this instead of the full list. */
  items: T[];
  page: number;
  pageSize: number;
  pageSizes: readonly number[];
  pageCount: number;
  total: number;
  /** 1-based position of the first/last item on this page (0 when empty). */
  from: number;
  to: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/** Callback ref for the list's container: going to another page from controls
 * below a long list scrolls the list's top back into view. */
export type ScrollAnchor = (element: HTMLElement | null) => void;

/** Client-side paging over an already-loaded list - see `lib/pagination.ts`
 * for why it isn't server-side. Pair with `<Pagination pagination={...} />`:
 *
 *   const [rosterPage, rosterAnchor] = usePagination(visible, { resetKey });
 *   <section ref={rosterAnchor}>{rosterPage.items.map(...)}</section>
 *
 * The anchor is a separate tuple slot, not a field of the state, on purpose:
 * the React Compiler lint treats any object a `ref={...}` prop reads from as
 * a ref, which would flag every `rosterPage.items` read during render.
 *
 * `resetKey` is whatever decides which items are in the list (a filter, a
 * search query, a tab) joined into one string: when it changes the list goes
 * back to page 1, rather than staying on, say, page 4 of a list that now has
 * one page. A string, not an object, so a fresh literal each render doesn't
 * count as a change. */
export function usePagination<T>(
  items: readonly T[],
  { resetKey = "", pageSizes = LIST_PAGE_SIZES }: { resetKey?: string; pageSizes?: readonly number[] } = {},
): [PaginationState<T>, ScrollAnchor] {
  const [requestedPage, setRequestedPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(pageSizes[0]);
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  // Adjusting state on a changed input during render, not in an effect - the
  // stale page is never painted. See react.dev "You Might Not Need an Effect".
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setRequestedPage(1);
  }

  const total = items.length;
  // Derived, not stored: a refetch or a delete that shrinks the list just
  // shows its new last page, with no effect needed to "fix" the state.
  const page = clampPage(requestedPage, total, pageSize);
  const { from, to } = pageBounds(page, pageSize, total);

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const setPage = useCallback(
    (next: number) => {
      setRequestedPage(next);
      // Only when the list's top has scrolled off-screen - paging a short
      // list that's fully visible shouldn't move the page at all.
      if (anchor && anchor.getBoundingClientRect().top < 0) anchor.scrollIntoView({ block: "start" });
    },
    [anchor],
  );

  const setPageSize = useCallback(
    (size: number) => {
      // Keep the first item currently on screen visible at the new size.
      setRequestedPage(pageForItem(Math.max(0, from - 1), size));
      setPageSizeState(size);
    },
    [from],
  );

  return [
    {
      items: pageSlice(items, page, pageSize),
      page,
      pageSize,
      pageSizes,
      pageCount: pageCount(total, pageSize),
      total,
      from,
      to,
      setPage,
      setPageSize,
    },
    setAnchor,
  ];
}
