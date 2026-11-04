"use client";

import { PageHead } from "@/components/layout/PageHead";
import { Pagination } from "@/components/ui/Pagination";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { usePagination } from "@/lib/hooks/usePagination";
import { useStudentSubmissionsContext } from "@/lib/submissions/StudentSubmissionsContext";
import { formatDate, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** "My Submissions" - every end-of-week video check-in the student has
 * recorded, newest first. Every real submission going forward is an
 * end-of-week video (the per-lesson audio task was removed from the
 * player), so this lists chronologically by day/date rather than grouping
 * by topic. */
export default function StudentSubmissionsPage() {
  const { t } = useI18n();
  const { submissions, loading, error } = useStudentSubmissionsContext();
  const list = submissions ?? [];
  const [submissionPage, submissionAnchor] = usePagination(list);

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead
        eyebrow={t("studentSubmissions.eyebrow")}
        title={t("studentSubmissions.title")}
        desc={t("studentSubmissions.desc")}
      />

      {loading && <p className="mt-4 text-sm text-muted">{t("studentSubmissions.loading")}</p>}
      {error && <p className="mt-4 text-sm text-muted">{t("studentSubmissions.loadError", { message: error.message })}</p>}
      {!loading && !error && list.length === 0 && (
        <p className="mt-4 text-sm text-muted">{t("studentSubmissions.noneYet")}</p>
      )}

      <div ref={submissionAnchor} className="mt-4 grid scroll-mt-24 gap-3">
        {submissionPage.items.map(s => (
          <article
            key={s.id}
            className="grid grid-cols-1 items-center gap-3.5 rounded-2xl border border-line bg-card p-4 shadow-card sm:grid-cols-[1fr_260px]"
          >
            <div className="min-w-0">
              <b className="block text-sm">{s.label}</b>
              <small className="text-xs text-muted">
                {formatDuration(s.duration_seconds)} · {formatDate(s.submitted_at)}
              </small>
              <p className={`m-0 mt-1.5 text-xs font-bold ${s.reviewed ? "text-[#15a87c]" : "text-brand-blue"}`}>
                {s.reviewed ? t("studentSubmissions.reviewed") : t("studentSubmissions.awaitingReview")}
              </p>
            </div>
            {s.media_deleted ? (
              <p className="m-0 text-xs text-muted">{t("studentSubmissions.expired")}</p>
            ) : (
              <VideoPlayer src={s.media_url} />
            )}
          </article>
        ))}
      </div>
      <Pagination pagination={submissionPage} label={t("studentSubmissions.title")} className="mt-4" />
    </main>
  );
}
