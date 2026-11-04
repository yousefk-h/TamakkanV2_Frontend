"use client";

import { PageHead } from "@/components/layout/PageHead";
import { TrendChart } from "@/components/ui/TrendChart";
import { Pagination } from "@/components/ui/Pagination";
import { LearningReportDetails } from "@/components/reports/LearningReportDetails";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { usePagination } from "@/lib/hooks/usePagination";
import { useMySessions } from "@/lib/hooks/useSessions";
import { useStudentProgress } from "@/lib/hooks/useProgress";
import { BADGE_DESC_KEY, BADGE_ICON, BADGE_ORDER, BADGE_TITLE_KEY } from "@/lib/badges";
import { asUtcIso, formatDate, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Reports, history and trends use completed sessions. Comparable trends
 * keep the same rubric, topic and level for the new learning analysis. */
export default function StudentProgressPage() {
  const { t, locale } = useI18n();
  const { sessions, loading, error, refetch } = useMySessions();
  const { topics } = useTopicsContext();
  const { progress, error: progressError, loading: progressLoading, refetch: refetchProgress } = useStudentProgress();
  const reported = (sessions ?? [])
    .filter((s): s is typeof s & { report: NonNullable<(typeof s)["report"]> } => s.report !== null)
    .sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
  // Oldest to newest, capped to a readable handful of points - same "last
  // few" intent as the fixed-length mock trend this replaces.
  const latestScored = reported.filter(s => s.report.overall_score !== null).at(-1);
  const trendSessions = reported.filter(s => s.report.overall_score !== null
    && (s.report.analysis?.rubric_version ?? "legacy") === (latestScored?.report.analysis?.rubric_version ?? "legacy")
    && (!latestScored?.report.analysis || (latestScored.report.analysis.target_level
      ? s.topic_id === latestScored.topic_id && s.report.analysis?.target_level === latestScored.report.analysis.target_level
      : s.id === latestScored.id))
  ).slice(-8);
  const latestReport = reported.length > 0 ? reported[reported.length - 1].report : null;
  const completedSessions = (sessions ?? []).filter(s => s.state === "ended").sort((a, b) => a.started_at < b.started_at ? 1 : -1);
  const [historyPage, historyAnchor] = usePagination(completedSessions);

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead
        eyebrow={t("studentProgress.eyebrow")}
        title={t("studentProgress.title")}
        desc={t("studentProgress.desc")}
      />
      {error && <div role="alert" className="mt-4 rounded-xl border border-line bg-card p-4 text-sm"><p>{t("learningReport.unavailable")}</p><button className="mt-2 min-h-11 font-bold text-brand-blue" onClick={refetch}>{t("learningReport.retry")}</button></div>}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-line bg-card p-5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-muted">{t("learningReport.recentScores")}</span>
              <h3 className="m-0 mt-1 text-[15px]">{t("studentProgress.scoreOverTime")}</h3>
            </div>
            {latestReport && (
              <b className="text-2xl text-brand-blue">
                {latestReport.overall_score ?? t("learningReport.notScored")}
                {latestReport.overall_score !== null && <small className="text-xs text-muted">/100</small>}
              </b>
            )}
          </div>
          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-muted">{t("common.loading")}</p>
            ) : trendSessions.length === 0 ? (
              <p className="text-sm text-muted">{t("studentProgress.noReportsYet")}</p>
            ) : (
              <TrendChart
                points={trendSessions.map(s => s.report.overall_score!)}
                labels={trendSessions.map(s => formatDate(s.started_at))}
                ariaLabel={t("studentProgress.trendAriaLabel")}
              />
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <span className="text-xs text-muted">{t("studentProgress.skillBreakdown")}</span>
          <h3 className="m-0 mt-1 text-[15px]">{t("studentProgress.latestAnalysis")}</h3>
          <div className="my-4 grid gap-3">
            {!loading && !latestReport && <p className="m-0 text-sm text-muted">{t("studentProgress.noReportsYet")}</p>}
            {latestReport && (
              [
                [t(latestReport.analysis ? "learningReport.textFluency" : "skillLabels.fluency"), latestReport.fluency_score, "bg-brand-blue"],
                [t("skillLabels.vocabulary"), latestReport.vocabulary_score, "bg-[#ff8b37]"],
                [t("skillLabels.grammar"), latestReport.grammar_score, "bg-brand-grammar"],
                [t("skillLabels.complexity"), latestReport.complexity_score, "bg-brand-cyan"],
              ].map(([label, score, color]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span>{label}</span>
                    <b>{score ?? "—"}</b>
                  </div>
                  <div className="h-1.5 rounded-full bg-line">
                    <i className={`block h-full rounded-full ${color}`} style={{ width: `${score ?? 0}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {latestReport && <article className="rounded-2xl border border-line bg-card p-5 shadow-card lg:col-span-3">
          <h3 className="font-bold text-ink">{t("studentProgress.latestAnalysis")}</h3>
          <p dir="auto" className="mt-3 text-sm leading-relaxed text-muted">{latestReport.summary}</p>
          <LearningReportDetails report={latestReport} />
        </article>}

        {progress && !progressError && <article className="rounded-2xl border border-line bg-card p-5 shadow-card lg:col-span-3">
          <h3 className="m-0 text-[15px]">{t("studentProgress.streakConsistency")}</h3>
          <div className="my-5 grid grid-cols-2">
            <div className="border-r border-line text-center">
              <b className="block text-xl">{progress?.current_streak ?? 0}</b>
              <span className="text-xs text-muted">{t("studentProgress.dayStreak")}</span>
            </div>
            <div className="text-center">
              <b className="block text-xl">{progress?.total_active_days ?? 0}</b>
              <span className="text-xs text-muted">{t("studentProgress.totalDays")}</span>
            </div>
          </div>
          <div className="flex justify-between">
            {(progress.last_7_days_dates ?? []).map((day, i) => (
              <div key={day} title={day} className="grid place-items-center gap-1.5">
                <i className={`block size-2 rounded-full ${progress?.last_7_days_active[i] ? "bg-brand-blue" : "bg-line"}`} />
                <span className="text-xs text-muted">{new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" })}</span>
              </div>
            ))}
          </div>
        </article>}
      </div>

      <section className="mt-8 flex items-center justify-between">
        <div>
          <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("studentProgress.achievements")}</span>
          <h2 className="my-1 text-2xl tracking-tight">{t("studentProgress.badgesEarned")}</h2>
        </div>
      </section>
      {progressError && <div role="alert" className="mt-3 rounded-xl border border-line bg-card p-4 text-sm"><p>{t("analytics.error")}</p><button className="min-h-11 font-bold text-brand-blue" onClick={refetchProgress}>{t("mobile.retry")}</button></div>}
      {progressLoading && <p role="status" className="mt-3 text-sm text-muted">{t("analytics.loading")}</p>}
      {progress && !progressError && <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {BADGE_ORDER.map(key => {
          const badge = progress?.badges.find(b => b.key === key);
          const earned = badge?.earned ?? false;
          return (
            <article
              key={key}
              className={`rounded-2xl border border-line bg-card p-4 text-center shadow-card ${earned ? "" : "opacity-45 grayscale"}`}
            >
              <span className="mb-2 block text-2xl">{BADGE_ICON[key]}</span>
              <b className="block text-sm">{t(BADGE_TITLE_KEY[key])}</b>
              <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{t(BADGE_DESC_KEY[key])}</p>
              <p className="m-0 mt-2 text-[11px] font-semibold text-brand-blue">
                {earned && badge?.earned_at ? t("badges.earnedOn", { date: formatDate(badge.earned_at) }) : t("badges.notYetEarned")}
              </p>
            </article>
          );
        })}
      </div>}

      <section ref={historyAnchor} className="mt-4.5 scroll-mt-24 rounded-2xl border border-line bg-card p-5 shadow-card">
        <span className="text-xs text-muted">{t("studentProgress.sessionHistory")}</span>
        <h3 className="m-0 mt-1 text-[15px]">{t("studentProgress.recentSessions")}</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-semibold">{t("studentProgress.colDate")}</th>
                <th className="py-2 font-semibold">{t("studentProgress.colMode")}</th>
                <th className="py-2 font-semibold">{t("studentProgress.colTopic")}</th>
                <th className="py-2 font-semibold">{t("studentProgress.colDuration")}</th>
                <th className="py-2 font-semibold">{t("studentProgress.colScore")}</th>
              </tr>
            </thead>
            <tbody>
              {historyPage.items.map(s => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="py-2.5"><b>{formatDate(s.started_at)}</b></td>
                  <td className="py-2.5">{t("learningReport.practiceSession")}</td>
                  <td className="py-2.5">{topics?.find(topic => topic.id === s.topic_id)?.title ?? t("adminReports.unknownTopic")}</td>
                  <td className="py-2.5">{s.ended_at ? formatDuration(Math.max(0, Math.round((new Date(asUtcIso(s.ended_at)).getTime() - new Date(asUtcIso(s.started_at)).getTime()) / 1000))) : "—"}</td>
                  <td className="py-2.5 text-brand-blue">{s.report?.overall_score != null ? `${s.report.overall_score}/100` : t("learningReport.notScored")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && completedSessions.length === 0 && <p className="mt-3 text-sm text-muted">{t("learningReport.historyEmpty")}</p>}
        <Pagination pagination={historyPage} label={t("studentProgress.recentSessions")} className="mt-3 border-t border-line pt-3" />
      </section>
    </main>
  );
}
