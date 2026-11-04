"use client";

import { Icon } from "@/components/ui/Icon";
import type { PaginationState } from "@/lib/hooks/usePagination";
import { pageRange } from "@/lib/pagination";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const PAGE_BUTTON = "grid min-h-11 min-w-11 place-items-center rounded-lg px-2 text-sm transition-colors sm:min-h-9 sm:min-w-9";
const STEP_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-sm font-bold text-brand-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:text-muted disabled:opacity-40 disabled:hover:bg-card sm:min-h-9 sm:min-w-9";

/** The one paging control every list/table/grid uses - drive it with
 * `usePagination`. Renders nothing while everything fits on one page at the
 * smallest size, so short lists look exactly as they did before.
 *
 * `variant="compact"` is for narrow columns (a 240px sidebar, a per-level
 * card): previous/next and the item range only, no page numbers or page-size
 * picker. */
export function Pagination({
  pagination,
  label,
  variant = "full",
  className = "",
}: {
  pagination: Omit<PaginationState<unknown>, "items">;
  /** What's being paged, for screen readers - e.g. "Student roster pages". */
  label: string;
  variant?: "full" | "compact";
  className?: string;
}) {
  const { t } = useI18n();
  const { page, pageCount, pageSize, pageSizes, total, from, to, setPage, setPageSize } = pagination;
  if (total <= pageSizes[0]) return null;
  // Wrapped in a left-to-right isolate (LRI...PDI): after Arabic text the
  // bidi algorithm treats digits as Arabic numbers, and a dash between two
  // of those doesn't join them - "11-20" would render reversed as "20-11".
  const range = `⁦${from}–${to}⁩`;

  const previous = (
    <button
      type="button"
      onClick={() => setPage(page - 1)}
      disabled={page <= 1}
      aria-label={t("pagination.previous")}
      className={STEP_BUTTON}
    >
      <Icon name="chevronLeft" className="size-4 rtl:rotate-180" />
      {variant === "full" && <span className="hidden pe-1 sm:inline">{t("pagination.previous")}</span>}
    </button>
  );
  const next = (
    <button
      type="button"
      onClick={() => setPage(page + 1)}
      disabled={page >= pageCount}
      aria-label={t("pagination.next")}
      className={STEP_BUTTON}
    >
      {variant === "full" && <span className="hidden ps-1 sm:inline">{t("pagination.next")}</span>}
      <Icon name="chevronRight" className="size-4 rtl:rotate-180" />
    </button>
  );

  if (variant === "compact") {
    return (
      <nav aria-label={label} className={`flex items-center justify-between gap-2 ${className}`}>
        {previous}
        <span aria-live="polite" className="text-xs text-muted">
          {t("pagination.range", { range, total })}
        </span>
        {next}
      </nav>
    );
  }

  return (
    <nav aria-label={label} className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span aria-live="polite">{t("pagination.showing", { range, total })}</span>
        <label className="flex items-center gap-1.5">
          {t("pagination.perPage")}
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="h-9 rounded-lg border border-line bg-bg px-2 text-xs text-ink outline-none focus:border-brand-blue"
          >
            {pageSizes.map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        {previous}
        <span className="px-2 text-xs text-muted sm:hidden">{t("pagination.pageOf", { page, count: pageCount })}</span>
        <ul className="m-0 hidden list-none items-center gap-1 p-0 sm:flex">
          {pageRange(page, pageCount).map(item =>
            typeof item === "number" ? (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => setPage(item)}
                  aria-label={t("pagination.goToPage", { page: item })}
                  aria-current={item === page ? "page" : undefined}
                  className={`${PAGE_BUTTON} ${item === page ? "bg-brand-primary-pale font-bold text-brand-blue" : "text-muted hover:bg-bg"}`}
                >
                  {item}
                </button>
              </li>
            ) : (
              <li key={item} aria-hidden="true" className="grid min-w-6 place-items-center text-sm text-muted">
                …
              </li>
            ),
          )}
        </ul>
        {next}
      </div>
    </nav>
  );
}
