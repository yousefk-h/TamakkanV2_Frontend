"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHead } from "@/components/layout/PageHead";
import { Pagination } from "@/components/ui/Pagination";
import { Avatar, StatusPill } from "@/components/admin/shared";
import { ActiveFilterChips, ReportFilterBar, type FilterChip } from "@/components/admin/reports/ReportFilterBar";
import { ApiError, sessionsApi } from "@/lib/api/client";
import { useReportPage } from "@/lib/hooks/useReportPage";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { asUtcIso, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  DEFAULT_REPORT_FILTERS,
  REPORT_PAGE_SIZES,
  SEARCH_DEBOUNCE_MS,
  hasActiveFilters,
  parseReportFilters,
  resultRange,
  toApiParams,
  toSearchParams,
  type ReportFilters,
} from "@/lib/reports/reportFilters";
import type { ListReportsParams, LiveSessionListItem } from "@/lib/api/types";
import { LearningReportDetails } from "@/components/reports/LearningReportDetails";

/** A real per-session AI speaking report grid - each row is a session that ended with a real, trusted transcript and got
 * a report (`app.core.session_scoring`, `LiveSessionService.generate_report`). A session with no report yet simply isn't
 * shown here - there's nothing to review yet. Real end-of-week video check-ins live on their own "Submissions" tab.
 *
 * Search, filters and paging all run on the server (`GET /sessions`); the filters live in the URL (`lib/reports/reportFilters.ts`)
 * so a refresh, the back button and a shared link all show the same view. */
export default function AdminReportsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, page } = useMemo(() => parseReportFilters(searchParams), [searchParams]);
  const [limit, setLimit] = useState<number>(REPORT_PAGE_SIZES[0]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const { students } = useStudentsContext();
  const { topics } = useTopicsContext();

  const apiParams = toApiParams(filters, page, limit, new Date()) as unknown as ListReportsParams;
  const { data, loading, error, refetch } = useReportPage(apiParams);
  const sessions = (data?.items ?? []).filter((s): s is LiveSessionListItem & { report: NonNullable<LiveSessionListItem["report"]> } => s.report !== null);
  const total = data?.total ?? 0;
  // The visible slice of the filtered total, from the response we already have (no extra request).
  const range = data ? resultRange(total, data.page, data.limit, data.items.length) : null;

  const studentById = useMemo(() => new Map((students ?? []).map(s => [s.id, s])), [students]);
  const topicById = useMemo(() => new Map((topics ?? []).map(topic => [topic.id, topic])), [topics]);

  // ---- URL state ----------------------------------------------------------------------------------------------
  const navigate = useCallback(
    (next: ReportFilters, nextPage: number, how: "push" | "replace") => {
      const query = toSearchParams(next, nextPage).toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (how === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router, pathname],
  );

  // What is typed in the box, and the last text WE committed to the URL. A different URL value (back/forward) replaces the
  // text; our own commit never does, so typing during the URL update is never clobbered.
  const [searchText, setSearchText] = useState(filters.search);
  const [committedSearch, setCommittedSearch] = useState(filters.search);
  if (filters.search !== committedSearch) {
    setCommittedSearch(filters.search);
    setSearchText(filters.search);
  }

  // The filters/page we last navigated to. Every change builds on THIS, not on the render's snapshot of the URL: the router
  // updates the URL asynchronously, so two quick changes (or a debounced search landing mid-change) would otherwise each
  // start from the old URL and the second would silently undo the first. A different URL (back/forward) replaces it.
  // `ownQueries` are the query strings of navigations we started that the URL has not reached yet: when the URL arrives at
  // one of them it is just us catching up (keep `desired`, a later change may already be in flight); any other URL
  // (back/forward, a pasted link) is external and replaces `desired`.
  const desired = useRef({ filters, page });
  const ownQueries = useRef<string[]>([]);
  const urlQuery = searchParams.toString();
  useEffect(() => {
    const own = ownQueries.current.indexOf(urlQuery);
    if (own >= 0) {
      ownQueries.current.splice(0, own + 1);
      return;
    }
    ownQueries.current = [];
    desired.current = { filters, page };
  }, [urlQuery, filters, page]);
  const go = useCallback(
    (next: ReportFilters, nextPage: number, how: "push" | "replace") => {
      desired.current = { filters: next, page: nextPage };
      ownQueries.current = [...ownQueries.current, toSearchParams(next, nextPage).toString()].slice(-8);
      navigate(next, nextPage, how);
    },
    [navigate],
  );
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  /** Any filter change goes back to page 1 and keeps every other active filter. */
  const applyPatch = (patch: Partial<ReportFilters>) => {
    clearTimeout(searchTimer.current);
    if (patch.search !== undefined) {
      setSearchText(patch.search);
      setCommittedSearch(patch.search);
    }
    go({ ...desired.current.filters, ...patch }, 1, "push");
  };
  const clearAll = () => {
    clearTimeout(searchTimer.current);
    setSearchText("");
    setCommittedSearch("");
    go(DEFAULT_REPORT_FILTERS, 1, "push");
  };
  const onSearchText = (text: string) => {
    setSearchText(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setCommittedSearch(text);
      go({ ...desired.current.filters, search: text }, 1, "replace");
    }, SEARCH_DEBOUNCE_MS);
  };

  // A page that no longer exists (a stale link, or the list shrank) lands on the last real one.
  useEffect(() => {
    if (!loading && !error && data && data.items.length === 0 && data.total > 0 && page > 1) {
      go(filters, Math.ceil(data.total / limit), "replace");
    }
  }, [loading, error, data, page, limit, filters, go]);

  // ---- paging (server-driven) -----------------------------------------------------------------------------------------
  const gridRef = useRef<HTMLDivElement>(null);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const pagination = {
    page: Math.min(page, pageCount),
    pageSize: limit,
    pageSizes: REPORT_PAGE_SIZES as readonly number[],
    pageCount,
    total,
    from,
    to: Math.min(total, from + limit - 1),
    setPage: (next: number) => {
      go(desired.current.filters, next, "push");
      if ((gridRef.current?.getBoundingClientRect().top ?? 0) < 0) gridRef.current?.scrollIntoView({ block: "start" });
    },
    setPageSize: (size: number) => {
      setLimit(size);
      go(desired.current.filters, 1, "push");
    },
  };

  // ---- chips ----------------------------------------------------------------------------------------------------------------
  const chips: FilterChip[] = [];
  if (filters.search.trim()) chips.push({ key: "search", label: t("adminReports.chipSearch", { value: filters.search.trim() }), clear: { search: "" } });
  if (filters.studentId) {
    const student = studentById.get(filters.studentId);
    chips.push({ key: "student", label: t("adminReports.chipStudent", { value: student?.full_name ?? filters.studentId }), clear: { studentId: "" } });
  }
  if (filters.topicId) chips.push({ key: "topic", label: t("adminReports.chipTopic", { value: topicById.get(filters.topicId)?.title ?? filters.topicId }), clear: { topicId: "" } });
  if (filters.status !== "any") {
    const statusLabel = {
      scored: t("adminReports.statusScored"),
      not_scored: t("adminReports.statusNotScored"),
      needs_review: t("adminReports.filterNeedsReview"),
      reviewed: t("adminReports.filterReviewed"),
    }[filters.status];
    chips.push({ key: "status", label: t("adminReports.chipStatus", { value: statusLabel }), clear: { status: "any" } });
  }
  if (filters.mode) {
    const modeLabel = filters.mode === "voice_practice" ? t("adminReports.modeVoice") : t("adminReports.modeAvatar");
    chips.push({ key: "mode", label: t("adminReports.chipMode", { value: modeLabel }), clear: { mode: "" } });
  }
  if (filters.datePreset !== "all") {
    const dateLabel =
      filters.datePreset === "today"
        ? t("adminReports.dateToday")
        : filters.datePreset === "last7"
          ? t("adminReports.dateLast7")
          : filters.datePreset === "last30"
            ? t("adminReports.dateLast30")
            : [filters.dateFrom || "…", filters.dateTo || "…"].join(" – ");
    chips.push({ key: "date", label: t("adminReports.chipDate", { value: dateLabel }), clear: { datePreset: "all", dateFrom: "", dateTo: "" } });
  }
  const filtersActive = hasActiveFilters(filters);

  const handleToggleReviewed = async (session: LiveSessionListItem) => {
    if (!session.report) return;
    setUpdatingId(session.id);
    setUpdateError(null);
    try {
      await sessionsApi.markReportReviewed(session.id, !session.report.reviewed);
      refetch();
    } catch (err) {
      setUpdateError(err instanceof ApiError ? err.message : t("adminReports.updateFailed"));
    } finally {
      setUpdatingId(null);
    }
  };

  const skillBars = (session: LiveSessionListItem & { report: NonNullable<LiveSessionListItem["report"]> }): [string, number | null][] => [
    [t(session.report.analysis ? "learningReport.textFluency" : "skillLabels.fluency"), session.report.fluency_score],
    [t("skillLabels.vocabulary"), session.report.vocabulary_score],
    [t("skillLabels.grammar"), session.report.grammar_score],
    [t("skillLabels.complexity"), session.report.complexity_score],
  ];

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead eyebrow={t("adminReports.eyebrow")} title={t("adminReports.title")} desc={t("adminReports.desc")} />

      <ReportFilterBar
        filters={filters}
        searchText={searchText}
        onSearchText={onSearchText}
        onChange={applyPatch}
        onClear={clearAll}
        students={students ?? []}
        topics={topics ?? []}
      />

      {!error && data && (range || filtersActive) && (
        <div className="mt-3 grid gap-2">
          {range && (
            <p aria-live="polite" className="m-0 text-xs text-muted">
              {range.total === 1
                ? t("adminReports.resultSingle")
                : t("adminReports.resultRange", { range: `\u2066${range.from}–${range.to}\u2069`, total: range.total })}
            </p>
          )}
          {filtersActive && <ActiveFilterChips chips={chips} onRemove={applyPatch} onClearAll={clearAll} />}
        </div>
      )}

      {updateError && (
        <p role="alert" className="mt-3 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {updateError}
        </p>
      )}

      {loading && !data && <p className="mt-4 text-sm text-muted">{t("adminReports.loading")}</p>}
      {error && <div role="alert" className="mt-4 rounded-xl border border-line bg-card p-4 text-sm"><p>{t("learningReport.unavailable")}</p><button className="mt-2 min-h-11 font-bold text-brand-blue" onClick={refetch}>{t("learningReport.retry")}</button></div>}
      {!loading && !error && data && total === 0 && (
        filtersActive ? (
          <div className="mt-4 rounded-xl border border-line bg-card p-4 text-sm">
            <p className="m-0 text-muted">{t("adminReports.noMatch")}</p>
            <button type="button" onClick={clearAll} className="mt-2 min-h-11 font-bold text-brand-blue">
              {t("adminReports.clearFilters")}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("adminReports.noReportsYet")}</p>
        )
      )}

      <div ref={gridRef} aria-busy={loading} className={`mt-4 grid scroll-mt-24 grid-cols-1 gap-4 transition-opacity lg:grid-cols-2 ${loading && data ? "opacity-60" : ""}`}>
        {sessions.map(session => {
          const student = studentById.get(session.student_id);
          const topic = session.topic_id ? topicById.get(session.topic_id) : undefined;
          const durationMinutes = session.ended_at
            ? Math.max(1, Math.round((new Date(asUtcIso(session.ended_at)).getTime() - new Date(asUtcIso(session.started_at)).getTime()) / 60000))
            : 0;
          return (
            <article key={session.id} className="rounded-2xl border border-line bg-card p-4.5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <Avatar name={student?.full_name ?? t("adminReports.unknownStudent")} />
                  <div>
                    <b className="block text-[13px]">{student?.full_name ?? t("adminReports.unknownStudent")}</b>
                    <small className="text-xs text-muted">
                      {formatDate(session.started_at)} · {t("adminReports.minutesAbbrev", { count: durationMinutes })}
                    </small>
                  </div>
                </div>
                <b className="text-2xl text-brand-blue">
                  {session.report.overall_score ?? t("learningReport.notScored")}
                  {session.report.overall_score !== null && <small className="text-xs text-muted">/100</small>}
                </b>
              </div>
              <p className="my-2.5 text-xs text-muted">
                {t("adminReports.topic")} <b className="text-ink">{topic?.title ?? t("adminReports.unknownTopic")}</b>
              </p>
              <div className="grid gap-2.5">
                {skillBars(session).map(([label, score]) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span>{label}</span>
                      <b>{score ?? "—"}</b>
                    </div>
                    <div className="h-1.5 rounded-full bg-line">
                      <i className="block h-full rounded-full bg-brand-blue" style={{ width: `${score ?? 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <details className="mt-3.5 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-bold text-brand-blue">{t("adminReports.aiSummary")}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">{session.report.summary}</p>
                <LearningReportDetails report={session.report} />
              </details>
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
                <StatusPill
                  status={session.report.reviewed ? t("adminReports.filterReviewed") : t("adminReports.filterNeedsReview")}
                  tone={session.report.reviewed ? "excellent" : "risk"}
                />
                <button
                  type="button"
                  disabled={updatingId === session.id}
                  onClick={() => handleToggleReviewed(session)}
                  className="text-xs font-bold text-brand-blue disabled:opacity-40"
                >
                  {session.report.reviewed ? t("adminReports.markUnreviewed") : t("adminReports.markReviewed")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <Pagination pagination={pagination} label={t("adminReports.title")} className="mt-4" />
    </main>
  );
}
