"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, LevelTag, PlanBadge } from "@/components/admin/shared";
import { ApiError, submissionsApi } from "@/lib/api/client";
import { usePagination } from "@/lib/hooks/usePagination";
import { useSessionsForAdmin } from "@/lib/hooks/useSessions";
import { useStudentAlert } from "@/lib/hooks/useStudentAlerts";
import { formatDate, formatDuration } from "@/lib/format";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import type { SubmissionPublic, UserPublic } from "@/lib/api/types";
import { type MessageKey, useI18n } from "@/lib/i18n/LocaleProvider";
import { LearningReportDetails } from "@/components/reports/LearningReportDetails";
import { Pagination } from "@/components/ui/Pagination";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { EmailVerificationStatus } from "./EmailVerificationStatus";

function sessionLimitLabel(student: UserPublic, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  const effective = student.duration_override_minutes ?? student.max_session_duration_minutes;
  return student.duration_override_minutes != null
    ? t("adminStudents.sessionLimitRaised", { minutes: effective })
    : t("adminStudents.sessionLimitMinutes", { minutes: effective });
}

/** Full student profile, built entirely on real `UserPublic` + real topics +
 * real submissions + real AI session reports (this student's own rows out of
 * `useSessionsForAdmin`, filtered by `student_id` client-side - there's no
 * per-student session-list endpoint, and the admin's own roster is already a
 * small, already-fetched list). The old per-topic AI-analysis grid and
 * "recorded audio by topic" section are still gone - the per-lesson audio
 * task was removed from the player (the one real recording flow is the
 * end-of-week video check-in, not topic-tied, so there's nothing to group
 * by topic anymore), and per-topic scoring was never part of this feature. */
export function StudentDetailPage({
  student,
  onEditPlan,
  onManageAccount,
}: {
  student: UserPublic;
  onEditPlan: () => void;
  onManageAccount: () => void;
}) {
  const { t } = useI18n();
  const { topics, topicsByLevel } = useTopicsContext();
  const { sessions } = useSessionsForAdmin();
  const { alerts } = useStudentAlert(student.id);
  const [submissions, setSubmissions] = useState<SubmissionPublic[] | null>(null);
  const [submissionsFailed, setSubmissionsFailed] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    submissionsApi
      .listForAdmin({ student_id: student.id })
      .then(result => {
        if (!cancelled) setSubmissions(result);
      })
      .catch(() => {
        if (!cancelled) setSubmissionsFailed(true);
      });
    return () => { cancelled = true; };
  }, [student.id]);

  const assignedTopicIdSet = new Set(student.assigned_topic_ids);
  const studentTopics =
    student.plan === "standard" && student.assigned_level
      ? (topicsByLevel[student.assigned_level] ?? [])
      : student.plan === "pro"
        ? (topics ?? []).filter(topic => assignedTopicIdSet.has(topic.id))
        : [];

  const mySubs = submissions ?? [];
  const [checkInPage, checkInAnchor] = usePagination(mySubs);
  const myReportedSessions = (sessions ?? [])
    .filter((s): s is typeof s & { report: NonNullable<(typeof s)["report"]> } => s.student_id === student.id && s.report !== null)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  const latestReport = myReportedSessions[0]?.report ?? null;

  const handleToggleReviewed = async (s: SubmissionPublic) => {
    setMarkingId(s.id);
    setMarkError(null);
    try {
      const updated = await submissionsApi.markReviewed(s.id, !s.reviewed);
      setSubmissions(prev => (prev ?? []).map(x => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setMarkError(err instanceof ApiError ? err.message : t("studentDetail.updateFailed"));
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <Link href="/admin/students" className="mb-3.5 inline-block text-sm font-bold text-brand-blue">
        ← {t("studentDetail.backToStudents")}
      </Link>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <Avatar name={student.full_name} size="lg" />
        <div className="min-w-0 basis-48 flex-1 [overflow-wrap:anywhere]">
          <h2 className="m-0 mb-2 text-xl">{student.full_name}</h2>
          <p className="m-0 mb-2 text-xs text-muted">{student.email}</p>
          <EmailVerificationStatus user={student} allowResend />
          <div className="flex flex-wrap gap-2">
            {student.plan && <PlanBadge plan={student.plan === "pro" ? "pro" : "standard"} />}
            <LevelTag>
              {student.plan === "standard" && student.assigned_level
                ? LEVEL_LABEL[student.assigned_level]
                : student.plan === "pro"
                  ? t("studentDetail.customPlan", { count: student.assigned_topic_ids.length })
                  : t("studentDetail.unassigned")}
            </LevelTag>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onEditPlan} className="text-sm font-bold text-brand-blue">
            {student.plan ? t("studentDetail.editPlan") : t("studentDetail.assignClass")}
          </button>
          <button
            type="button"
            onClick={onManageAccount}
            className="rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.22)]"
          >
            {t("studentDetail.manageAccount")}
          </button>
        </div>
      </div>

      <section className="metric-grid mt-4 grid gap-4">
        {(
          [
            [t("studentDetail.topicsAssigned"), String(studentTopics.length), student.plan ? t("studentDetail.inCurrentPlan") : t("studentDetail.noPlanYet")],
            [t("studentDetail.sessionLimit"), sessionLimitLabel(student, t), t("studentDetail.perSession")],
            [t("studentDetail.checkInsSubmitted"), String(mySubs.length), t("studentDetail.needReview", { count: mySubs.filter(s => !s.reviewed).length })],
            [t("studentDetail.joined"), formatDate(student.created_at), t("studentDetail.accountCreated")],
          ] as const
        ).map(([label, value, note]) => (
          <article className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-4 shadow-card" key={label}>
            <span className="text-[13px] text-muted">{label}</span>
            <b className="text-xl">{value}</b>
            <small className="text-xs text-muted">{note}</small>
          </article>
        ))}
      </section>

      {alerts && (
        <section
          className={`mt-8 rounded-2xl border p-5 shadow-card ${alerts.has_alerts ? "border-brand-coral/30 bg-brand-coral/10" : "border-line bg-card"}`}
        >
          <span className={`text-[13px] font-extrabold tracking-wide ${alerts.has_alerts ? "text-brand-coral" : "text-brand-blue"}`}>
            {t("studentDetail.alerts")}
          </span>
          {alerts.has_alerts ? (
            <div className="mt-2 grid gap-1.5">
              {alerts.pending_rollover_count > 0 && (
                <p className="m-0 text-sm text-brand-coral">
                  {t(alerts.pending_rollover_count === 1 ? "studentDetail.rolledOverLesson" : "studentDetail.rolledOverLessonsPlural", {
                    count: alerts.pending_rollover_count,
                  })}
                </p>
              )}
              {alerts.missed_submission_days.length > 0 && (
                <p className="m-0 text-sm text-brand-coral">
                  {t("studentDetail.missedCheckIns", { days: alerts.missed_submission_days.join(", ") })}
                </p>
              )}
            </div>
          ) : (
            <p className="m-0 mt-2 text-sm text-muted">{t("studentDetail.allCaughtUp")}</p>
          )}
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("studentDetail.aiAnalysis")}</span>
          {latestReport && (
            <b className="text-2xl text-brand-blue">
              {latestReport.overall_score ?? t("learningReport.notScored")}
              {latestReport.overall_score !== null && <small className="text-xs text-muted">/100</small>}
            </b>
          )}
        </div>
        {!latestReport ? (
          <p className="m-0 mt-2 text-sm text-muted">{t("studentDetail.aiAnalysisUnavailable")}</p>
        ) : (
          <>
            <p className="m-0 mt-2 text-sm text-muted">
              {t(myReportedSessions.length === 1 ? "studentDetail.reportsCount" : "studentDetail.reportsCountPlural", { count: myReportedSessions.length })}
            </p>
            <div className="my-4 grid gap-3">
              {[
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
              ))}
            </div>
            <p className="m-0 border-t border-line pt-3 text-sm leading-relaxed text-ink">{latestReport.summary}</p>
            <LearningReportDetails report={latestReport} />
            <Link href="/admin/reports" className="mt-3 inline-block text-sm font-bold text-brand-blue">
              {t("studentDetail.viewAllReports")} →
            </Link>
          </>
        )}
      </section>

      <section className="mb-4 mt-8">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("studentDetail.weeklyCheckIns")}</span>
        <h2 className="mt-1 text-2xl tracking-tight text-ink">{t("studentDetail.endOfWeekSubmissions")}</h2>
      </section>
      {markError && (
        <p role="alert" className="mb-3 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {markError}
        </p>
      )}
      {submissionsFailed ? (
        <p role="alert" className="text-muted">{t("studentDetail.submissionsLoadFailed")}</p>
      ) : submissions === null ? (
        <p className="text-muted">{t("common.loading")}</p>
      ) : mySubs.length === 0 ? (
        <p className="text-muted">{t("studentDetail.noSubmissionsYet")}</p>
      ) : (
        <section ref={checkInAnchor} className="grid scroll-mt-24 gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
          {checkInPage.items.map(s => (
            <div
              key={s.id}
              className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-3 border-t border-line pt-3 first:border-0 first:pt-0 xl:grid-cols-[32px_minmax(0,1fr)_260px_auto]"
            >
              <span className="text-lg">🎥</span>
              <div className="min-w-0">
                <b className="block text-xs">{s.label}</b>
                <small className="text-xs text-muted">
                  {formatDuration(s.duration_seconds)} · {formatDate(s.submitted_at)}
                </small>
              </div>
              {s.media_deleted ? (
                <p className="col-span-2 m-0 text-xs text-muted xl:col-span-1">{t("studentDetail.expired")}</p>
              ) : (
                <VideoPlayer
                  src={s.media_url}
                  className="col-span-2 max-w-[260px] xl:col-span-1"
                />
              )}
              <button
                type="button"
                disabled={markingId === s.id}
                onClick={() => handleToggleReviewed(s)}
                className={
                  s.reviewed
                    ? "col-span-2 justify-self-start text-sm font-bold text-brand-blue disabled:opacity-40 xl:col-span-1"
                    : "col-span-2 justify-self-start rounded-[10px] bg-brand-blue px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40 xl:col-span-1"
                }
              >
                {s.reviewed ? t("studentDetail.reviewed") : t("studentDetail.markReviewed")}
              </button>
            </div>
          ))}
          <Pagination pagination={checkInPage} label={t("studentDetail.endOfWeekSubmissions")} className="border-t border-line pt-3" />
        </section>
      )}
    </main>
  );
}
