"use client";

import { useMemo, useState } from "react";
import { PageHead } from "@/components/layout/PageHead";
import { FilterChips } from "@/components/ui/FilterChips";
import { Pagination } from "@/components/ui/Pagination";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { Avatar } from "@/components/admin/shared";
import { ApiError, submissionsApi } from "@/lib/api/client";
import { usePagination } from "@/lib/hooks/usePagination";
import { useSubmissionsForAdmin } from "@/lib/hooks/useSubmissions";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { formatDate, formatDuration } from "@/lib/format";
import type { SubmissionPublic, UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const SUBMISSION_FILTERS = ["All", "Needs review", "Reviewed"] as const;

type Group = { studentId: string; student: UserPublic | undefined; subs: SubmissionPublic[] };

/** Every end-of-week video check-in across the admin's own students, grouped by
 * student - split out of AI Reports into its own tab since "which student
 * submitted what" is a distinct question from the (mock) per-session AI
 * report grid. A master/detail layout, not a flat list: pick a student on
 * the left, their check-ins render on the right, inside this same page -
 * no navigation to the student's full profile required just to review a
 * video. */
export default function AdminSubmissionsPage() {
  const { t } = useI18n();
  const FILTER_LABELS: Record<(typeof SUBMISSION_FILTERS)[number], string> = {
    All: t("adminSubmissions.filterAll"),
    "Needs review": t("adminSubmissions.filterNeedsReview"),
    Reviewed: t("adminSubmissions.filterReviewed"),
  };
  const [filter, setFilter] = useState<(typeof SUBMISSION_FILTERS)[number]>("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { submissions, loading, refetch } = useSubmissionsForAdmin();
  const { students } = useStudentsContext();
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  const studentById = useMemo(() => {
    const map = new Map<string, UserPublic>();
    (students ?? []).forEach(s => map.set(s.id, s));
    return map;
  }, [students]);

  const allSubmissions = submissions ?? [];
  const unreviewedCount = allSubmissions.filter(s => !s.reviewed).length;

  const filtered = allSubmissions.filter(s =>
    filter === "All" ? true : filter === "Needs review" ? !s.reviewed : s.reviewed,
  );

  const groups = useMemo(() => {
    const byStudent = new Map<string, SubmissionPublic[]>();
    filtered.forEach(s => {
      const list = byStudent.get(s.student_id) ?? [];
      list.push(s);
      byStudent.set(s.student_id, list);
    });
    const q = query.trim().toLowerCase();
    return Array.from(byStudent.entries())
      .map(([studentId, subs]) => ({
        studentId,
        student: studentById.get(studentId),
        subs: subs.slice().sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1)),
      }))
      .filter(g => !q || (g.student?.full_name.toLowerCase().includes(q) ?? false))
      .sort((a, b) => (a.subs[0].submitted_at < b.subs[0].submitted_at ? 1 : -1));
  }, [filtered, studentById, query]);

  const [groupPage, groupAnchor] = usePagination(groups, { resetKey: `${filter}|${query.trim().toLowerCase()}` });
  // Nobody picked yet: show the first student on the page being viewed, not
  // groups[0] - that one may be on another page of the roster entirely.
  const selected: Group | undefined = groups.find(g => g.studentId === selectedId) ?? (selectedId ? undefined : groupPage.items[0]);
  const [checkInPage, checkInAnchor] = usePagination(selected?.subs ?? [], { resetKey: `${selected?.studentId ?? ""}|${filter}` });

  const handleToggleReviewed = async (s: SubmissionPublic) => {
    setMarkingId(s.id);
    setMarkError(null);
    try {
      await submissionsApi.markReviewed(s.id, !s.reviewed);
      refetch();
    } catch (err) {
      setMarkError(err instanceof ApiError ? err.message : t("adminSubmissions.updateFailed"));
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead
        eyebrow={t("adminSubmissions.eyebrow")}
        title={t("adminSubmissions.title")}
        desc={t("adminSubmissions.desc")}
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            {unreviewedCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-[#ffb547] to-[#ff8b37] px-2.5 py-1 text-xs font-extrabold text-white">
                {t("adminSubmissions.newCount", { count: unreviewedCount })}
              </span>
            )}
            <FilterChips
              options={[...SUBMISSION_FILTERS]}
              value={filter}
              onChange={v => setFilter(v as (typeof SUBMISSION_FILTERS)[number])}
              labels={FILTER_LABELS}
              aria-label={t("adminSubmissions.filterSubmissions")}
            />
          </div>
        }
      />

      {markError && (
        <p role="alert" className="mt-3 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {markError}
        </p>
      )}

      {loading && <p className="mt-4 text-sm text-muted">{t("adminSubmissions.loading")}</p>}

      {!loading && groups.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          {allSubmissions.length === 0 ? t("adminSubmissions.noneYet") : t("adminSubmissions.noneMatchFilter")}
        </p>
      )}

      {!loading && groups.length > 0 && (
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:items-start xl:grid-cols-[280px_minmax(0,1fr)]">
          {/* Student roster - hidden on mobile once a student is picked, so the
              detail pane below gets the full-width screen instead of a
              squeezed split. */}
          <section
            ref={groupAnchor}
            className={`min-w-0 scroll-mt-24 rounded-2xl border border-line bg-card p-2 shadow-card ${selectedId ? "hidden md:block" : ""}`}
          >
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t("adminSubmissions.searchByName")}
              className="mb-2 w-full rounded-[10px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brand-blue"
            />
            <div className="grid gap-0.5">
              {groupPage.items.map(g => {
                const active = g.studentId === selected?.studentId;
                const needsReview = g.subs.filter(s => !s.reviewed).length;
                return (
                  <button
                    key={g.studentId}
                    type="button"
                    onClick={() => setSelectedId(g.studentId)}
                    className={`flex min-w-0 items-center gap-2.5 rounded-[10px] p-2.5 text-start ${
                      active ? "bg-brand-blue/10" : "hover:bg-bg"
                    }`}
                  >
                    <Avatar name={g.student?.full_name ?? t("adminSubmissions.unknownStudent")} />
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[13px]">{g.student?.full_name ?? t("adminSubmissions.unknownStudent")}</b>
                      <small className="text-xs text-muted">
                        {t(g.subs.length === 1 ? "adminSubmissions.checkIn" : "adminSubmissions.checkIns", { count: g.subs.length })}
                      </small>
                    </div>
                    {needsReview > 0 && (
                      <b className="rounded-full bg-brand-coral px-1.5 py-0.5 text-[11px] text-white">{needsReview}</b>
                    )}
                  </button>
                );
              })}
            </div>
            <Pagination pagination={groupPage} label={t("adminSubmissions.title")} variant="compact" className="mt-1 border-t border-line pt-2" />
          </section>

          {/* Selected student's check-ins, inline in this same page. */}
          {selected && (
            <section
              ref={checkInAnchor}
              className={`min-w-0 scroll-mt-24 rounded-2xl border border-line bg-card p-4 shadow-card ${selectedId ? "" : "hidden md:block"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button type="button" onClick={() => setSelectedId(null)} aria-label={t("studentDetail.backToStudents")} className="me-1 min-h-11 min-w-11 shrink-0 text-sm font-bold text-brand-blue md:hidden">
                    ←
                  </button>
                  <Avatar name={selected.student?.full_name ?? t("adminSubmissions.unknownStudent")} />
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <b className="block text-sm">{selected.student?.full_name ?? t("adminSubmissions.unknownStudent")}</b>
                    <small className="text-xs text-muted">
                      {t(selected.subs.length === 1 ? "adminSubmissions.checkIn" : "adminSubmissions.checkIns", { count: selected.subs.length })} ·{" "}
                      {t("adminSubmissions.needReview", { count: selected.subs.filter(s => !s.reviewed).length })}
                    </small>
                  </div>
                </div>
              </div>
              <div className="grid gap-1">
                {checkInPage.items.map(s => (
                  <div
                    key={s.id}
                    className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-3.5 border-t border-line py-3.5 first:border-0 2xl:grid-cols-[32px_minmax(0,1fr)_260px_auto]"
                  >
                    <span className="text-lg">🎥</span>
                    <div className="min-w-0">
                      <b className="block text-xs">{s.label}</b>
                      <small className="text-xs text-muted">
                        {formatDuration(s.duration_seconds)} · {formatDate(s.submitted_at)}
                      </small>
                    </div>
                    {s.media_deleted ? (
                      <p className="col-span-2 m-0 text-xs text-muted 2xl:col-span-1">{t("adminSubmissions.expired")}</p>
                    ) : (
                      <VideoPlayer
                        src={s.media_url}
                        className="col-span-2 max-w-[420px] 2xl:col-span-1"
                      />
                    )}
                    <button
                      type="button"
                      disabled={markingId === s.id}
                      onClick={() => handleToggleReviewed(s)}
                      className={
                        s.reviewed
                          ? "col-span-2 justify-self-start text-sm font-bold text-brand-blue disabled:opacity-40 2xl:col-span-1"
                          : "col-span-2 justify-self-start rounded-[10px] bg-brand-blue px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40 2xl:col-span-1"
                      }
                    >
                      {s.reviewed ? t("adminSubmissions.reviewed") : t("adminSubmissions.markReviewed")}
                    </button>
                  </div>
                ))}
              </div>
              <Pagination
                pagination={checkInPage}
                label={selected.student?.full_name ?? t("adminSubmissions.unknownStudent")}
                className="border-t border-line pt-3"
              />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
