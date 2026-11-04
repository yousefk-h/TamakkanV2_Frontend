"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { exerciseAttemptsApi } from "@/lib/api/client";
import type { ExerciseAttemptPublic } from "@/lib/api/types";
import { useClassesForAdmin } from "@/lib/hooks/useClasses";
import { useStudentAlerts } from "@/lib/hooks/useStudentAlerts";
import { useSubmissionsForAdmin } from "@/lib/hooks/useSubmissions";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** A teacher's daily work queue, using existing scoped APIs and observed data. */
export function TeacherHome({ name }: { name: string }) {
  const { t, locale } = useI18n();
  const { students, loading: studentsLoading, error: studentsError, refetch: refreshStudents } = useStudentsContext();
  const { classes, loading: classesLoading, error: classesError, refetch: refreshClasses } = useClassesForAdmin();
  const { submissions, loading: submissionsLoading, error: submissionsError, refetch: refreshSubmissions } = useSubmissionsForAdmin({ reviewed: false });
  const { alerts, loading: alertsLoading, error: alertsError, refetch: refreshAlerts } = useStudentAlerts();
  const [lessonAnswers, setLessonAnswers] = useState<ExerciseAttemptPublic[] | null>(null);
  const [lessonAnswersError, setLessonAnswersError] = useState(false);
  const [answersReload, setAnswersReload] = useState(0);
  useEffect(() => {
    let active = true;
    exerciseAttemptsApi.reviewQueue({ pending_only: true, limit: 4 }).then(items => {
      if (active) { setLessonAnswers(items); setLessonAnswersError(false); }
    }).catch(() => { if (active) { setLessonAnswers([]); setLessonAnswersError(true); } });
    return () => { active = false; };
  }, [answersReload]);
  const [now] = useState(() => Date.now());
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
  const upcoming = (classes ?? [])
    .filter(item => { const time = Date.parse(item.scheduled_at); return time >= now && time < weekEnd; })
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))
    .slice(0, 4);
  const studentById = new Map((students ?? []).map(student => [student.id, student]));
  const needingAttention = (students ?? []).filter(student => alerts?.[student.id]?.has_alerts).slice(0, 4);
  const pending = (submissions ?? []).slice().sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at)).slice(0, 4);
  const loading = studentsLoading || classesLoading || submissionsLoading || alertsLoading || lessonAnswers === null;
  const error = studentsError || classesError || submissionsError || alertsError || lessonAnswersError;
  const refresh = () => { refreshStudents(); refreshClasses(); refreshSubmissions(); refreshAlerts(); setAnswersReload(value => value + 1); };
  const when = (value: string) => new Date(value).toLocaleString(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("teacherHome.eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold">{t("teacherHome.greeting", { name: name.split(" ")[0] || name })}</h1>
        <p className="mt-2 text-sm text-muted">{t("teacherHome.description")}</p></div>
      <button type="button" onClick={refresh} disabled={loading} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue disabled:opacity-50">{t("teacherHome.refresh")}</button>
    </header>
    {error && <p role="alert" className="mt-5 rounded-xl border border-line bg-card p-4 text-sm">{t("teacherHome.loadError")}</p>}
    {loading && <p role="status" className="mt-4 text-sm text-muted">{t("common.loading")}</p>}
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t("teacherHome.classesTitle")}</h2><Link href="/admin/classes" className="text-sm font-bold text-brand-blue">{t("teacherHome.viewAll")}</Link></div>
        {upcoming.length === 0 && !classesLoading ? <p className="mt-4 text-sm text-muted">{t("teacherHome.noClasses")}</p> : upcoming.map(item =>
          <div key={item.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0"><div className="min-w-0 flex-1"><b className="block text-sm">{item.title}</b><span className="text-xs text-muted">{when(item.scheduled_at)} · {t("teacherHome.students", { count: item.participant_ids.length })}</span></div><a href={item.meet_link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-blue">{t("teacherHome.join")}</a></div>)}
      </section>
      <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t("teacherHome.reviewTitle")}</h2><Link href="/admin/submissions" className="text-sm font-bold text-brand-blue">{t("teacherHome.viewAll")}</Link></div>
        {pending.length === 0 && !submissionsLoading ? <p className="mt-4 text-sm text-muted">{t("teacherHome.noReviews")}</p> : pending.map(item =>
          <div key={item.id} className="flex items-center gap-3 border-b border-line py-3 text-sm last:border-0"><div className="min-w-0 flex-1"><b className="block truncate">{studentById.get(item.student_id)?.full_name ?? t("teacherHome.student")}</b><span className="text-xs text-muted">{item.label} · {when(item.submitted_at)}</span></div><Link href="/admin/submissions" className="min-h-11 content-center font-bold text-brand-blue">{t("teacherHome.review")}</Link></div>)}
      </section>
      <section className="rounded-2xl border border-line bg-card p-5 shadow-card lg:col-span-2">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t("teacherHome.reviewLessonAnswers")}</h2><Link href="/admin/exercise-review" className="text-sm font-bold text-brand-blue">{t("teacherHome.viewAll")}</Link></div>
        {lessonAnswers?.length === 0 && !lessonAnswersError && <p className="mt-4 text-sm text-muted">{t("exerciseReview.emptyPending")}</p>}
        {lessonAnswers && lessonAnswers.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{lessonAnswers.map(item =>
          <Link key={item.id} href="/admin/exercise-review" className="rounded-xl border border-line p-4 hover:bg-bg"><b className="block text-sm">{item.student_name}</b><span className="mt-1 block text-xs text-muted">{item.topic_title} · {item.exercise_kind.replaceAll("_", " ")}</span></Link>)}</div>}
      </section>
      <section className="rounded-2xl border border-line bg-card p-5 shadow-card lg:col-span-2">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t("teacherHome.attentionTitle")}</h2><Link href="/admin/students" className="text-sm font-bold text-brand-blue">{t("teacherHome.viewAll")}</Link></div>
        <p className="mt-1 text-xs text-muted">{t("teacherHome.attentionNote")}</p>
        {needingAttention.length === 0 && !alertsLoading && !studentsLoading ? <p className="mt-4 text-sm text-muted">{t("teacherHome.noAlerts")}</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2">{needingAttention.map(student => {
          const alert = alerts![student.id];
          return <Link key={student.id} href={`/admin/students/${student.id}`} className="rounded-xl border border-line p-4 hover:bg-bg"><b className="block text-sm">{student.full_name}</b><span className="mt-1 block text-xs text-muted">{t("teacherHome.alertDetail", { lessons: alert.pending_rollover_count, checkins: alert.missed_submission_days.length })}</span></Link>;
        })}</div>}
      </section>
    </div>
    <nav aria-label={t("teacherHome.quickActions")} className="mt-6 flex flex-wrap gap-3"><Link href="/admin/topics" className="inline-flex min-h-11 items-center rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">{t("teacherHome.planLesson")}</Link><Link href="/admin/exercise-review" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue">{t("teacherHome.reviewLessonAnswers")}</Link><Link href="/admin/calendars" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue">{t("teacherHome.openCalendar")}</Link><Link href="/admin/reports" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue">{t("teacherHome.openReports")}</Link></nav>
  </main>;
}
