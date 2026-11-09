"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StudentActivity } from "@/components/analytics/StudentActivity";
import { Icon } from "@/components/ui/Icon";
import { CourseCard } from "@/components/topics/CourseCard";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { LEVEL_ORDER, LEVEL_LABEL, LEVEL_EMOJI } from "@/lib/topics/helpers";
import { useAuth } from "@/lib/auth/AuthContext";
import { useMyClasses } from "@/lib/hooks/useClasses";
import { useMySessions } from "@/lib/hooks/useSessions";
import { useStudentProgress } from "@/lib/hooks/useProgress";
import { asUtcIso, formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Dashboard counters use saved activity and the assigned calendar's lesson status. */
export default function StudentHomePage() {
  const { t } = useI18n();
  const HOW_IT_WORKS = [
    { step: "1", title: t("studentHome.howStep1Title"), desc: t("studentHome.howStep1Desc") },
    { step: "2", title: t("studentHome.howStep2Title"), desc: t("studentHome.howStep2Desc") },
    { step: "3", title: t("studentHome.howStep3Title"), desc: t("studentHome.howStep3Desc") },
    { step: "4", title: t("studentHome.howStep4Title"), desc: t("studentHome.howStep4Desc") },
  ];
  const { topics, topicsByLevel, loading, error: topicsError, refetch: refetchTopics } = useTopicsContext();
  useEffect(() => {
    refetchTopics();
    window.addEventListener("focus", refetchTopics);
    return () => window.removeEventListener("focus", refetchTopics);
  }, [refetchTopics]);
  const allTopics = topics ?? [];
  const currentTopic = allTopics.find(topic => topic.lesson_status === "current")
    ?? allTopics.find(topic => topic.lesson_status === "missed")
    ?? allTopics.find(topic => topic.lesson_status === "done");
  const level = currentTopic?.level ?? LEVEL_ORDER.find(l => (topicsByLevel[l]?.length ?? 0) > 0);
  const items = level ? topicsByLevel[level]! : [];
  const recommended = items.filter(topic => topic.id !== currentTopic?.id);
  const completedTopics = allTopics.filter(topic => topic.lesson_status === "done").length;
  const lessonPercent = allTopics.length ? Math.round(completedTopics / allTopics.length * 100) : 0;

  const { state } = useAuth();
  const classesEnabled = state.status === "authenticated" && state.user.role === "student";
  const { sessions: reportSessions } = useMySessions(classesEnabled);
  const { progress, loading: progressLoading, error: progressError, refetch: refetchProgress } = useStudentProgress(classesEnabled);
  const challengeDay = progress?.challenge_day ?? 0;
  const challengeTotal = progress?.challenge_total_days ?? 30;
  const challengePercent = lessonPercent;
  const planReady = !loading && !topicsError && allTopics.length > 0;
  const latestReport = (reportSessions ?? [])
    .filter((s): s is typeof s & { report: NonNullable<(typeof s)["report"]> } => s.report !== null)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0]?.report ?? null;
  const { classes: myClasses } = useMyClasses(classesEnabled);
  const [now] = useState(() => Date.now());
  const upcomingSessions = (myClasses ?? [])
    .filter(c => new Date(asUtcIso(c.scheduled_at)).getTime() >= now)
    .sort((a, b) => new Date(asUtcIso(a.scheduled_at)).getTime() - new Date(asUtcIso(b.scheduled_at)).getTime())
    .slice(0, 2);

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <section className="relative z-0 grid grid-cols-1 gap-6 overflow-hidden rounded-[20px] bg-gradient-to-br from-brand-hero-start via-brand-hero-mid to-brand-hero-end p-6 text-white shadow-(--shadow-brand-hero) md:grid-cols-[1fr_140px_170px] md:items-center md:p-7">
        <div>
          <span className="text-xs font-bold tracking-wide opacity-90">{t("studentHome.challengeBadge")}</span>
          <h2 className="my-2 text-[28px] tracking-tight md:text-[32px]">
            {progressLoading ? t("common.loading") : progressError ? t("analytics.planError") : progress?.program_start_date
              ? challengeDay > 0 ? t("studentHome.challengeDay", { day: challengeDay }) : t("analytics.notStarted")
              : t("analytics.noPlan")}{" "}
            {challengeDay > 0 && <em className="text-base font-medium not-italic opacity-80">{t("studentHome.challengeDayOf", { total: challengeTotal })}</em>}
          </h2>
          <p className="m-0 text-sm opacity-90">{t("studentHome.challengeMomentum")}</p>
          {progress && !progressError && <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <b>{t("studentHome.challengeStreak", { count: progress.current_streak })}</b>
            {progress.program_start_date && <span className="opacity-75">{t("studentHome.challengeRemaining", { count: Math.max(0, challengeTotal - challengeDay) })}</span>}
          </div>}
          {progressError && <button onClick={refetchProgress} className="mt-3 min-h-11 underline">{t("mobile.retry")}</button>}
        </div>
        <div
          className="relative mx-auto grid size-27 place-items-center rounded-full"
          style={{ background: `conic-gradient(white 0 ${challengePercent}%, rgba(255,255,255,.25) ${challengePercent}%)` }}
        >
          <div className="absolute inset-[13px] rounded-full bg-brand-ring" />
          <div className="relative z-10 text-center">
            <strong className="block text-xl">{planReady ? `${challengePercent}%` : "—"}</strong>
            <span className="block max-w-24 text-[10px] leading-tight opacity-80">{t("analytics.planProgress")}</span>
          </div>
        </div>
        <Link href="/student/challenge" className="relative z-10 rounded-[10px] border border-white/50 bg-white/15 px-4 py-3 text-center text-xs font-bold">
          {t("studentHome.viewChallenge")} <span className="float-right">→</span>
        </Link>
      </section>

      {topicsError && <div role="alert" className="mt-4 rounded-xl border border-line bg-card p-4 text-sm"><p>{t("analytics.planError")}</p><button onClick={refetchTopics} className="mt-2 min-h-11 font-bold text-brand-blue">{t("mobile.retry")}</button></div>}
      {planReady && <p className="mt-3 text-xs leading-relaxed text-muted">{t("analytics.planCount", { done: completedTopics, total: allTopics.length })} · {t("analytics.planNote")}</p>}
      <section className="mt-8 flex items-end justify-between gap-4">
        <div>
          <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("studentHome.continueLearning")}</span>
          <h2 className="my-1 text-2xl tracking-tight">{t(currentTopic?.lesson_status === "done" ? "analytics.reviewLesson" : "analytics.availableLesson")}</h2>
          <p className="m-0 text-xs text-muted">
            {level
              ? t("studentHome.nextLessonInTrack", { level: LEVEL_LABEL[level] })
              : loading
                ? t("studentHome.loadingLessons")
                : t("studentHome.noTopicsAssigned")}
          </p>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {currentTopic && level ? (
          <article className="grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
            <div className={`relative grid aspect-video place-items-center text-4xl ${currentTopic.thumbnail_url ? "" : "bg-gradient-to-br from-brand-blue/15 to-brand-blue/5"}`}>
              {currentTopic.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote origin (YouTube or Cloudinary), not worth next/image's remote-pattern config for a catalogue thumbnail
                <img src={currentTopic.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">{LEVEL_EMOJI[level]}</span>
              )}
              <Link
                href="/student/enrollments"
                aria-label={t("studentHome.startLesson")}
                className="absolute left-1/2 top-1/2 grid size-[50px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white/25 bg-white text-brand-blue"
              >
                <Icon name="play" className="size-5" />
              </Link>
            </div>
            <div className="flex flex-col justify-center gap-2 p-5">
              <span className="text-xs font-extrabold tracking-wide text-brand-blue">
                {t("studentHome.lessonProgress", { level: LEVEL_LABEL[level], total: items.length })}
              </span>
              <h3 className="m-0 text-lg">{currentTopic.title}</h3>

              <Link
                href="/student/enrollments"
                className="mt-1 inline-flex w-fit items-center gap-2 rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
              >
                <Icon name="play" className="size-4" /> {t("studentHome.startHere")}
              </Link>
            </div>
          </article>
        ) : (
          <article className="rounded-2xl border border-line bg-card p-5 shadow-card">
            <p className="m-0 text-sm text-muted">
              {loading ? t("studentHome.loadingLessons") : topicsError ? t("analytics.planError") : allTopics.length ? t("analytics.noAvailable") : t("studentHome.noTopicsAssignedContact")}
            </p>
          </article>
        )}

        <article className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-muted">{t("studentHome.latestScore")}</span>
              <h3 className="m-0 mt-1 text-[15px]">{t("studentHome.speakingAnalysis")}</h3>
            </div>
            {latestReport && (
              <b className="text-2xl text-brand-blue">
                {latestReport.overall_score ?? t("learningReport.notScored")}
                {latestReport.overall_score !== null && <small className="text-xs text-muted">/100</small>}
              </b>
            )}
          </div>
          <div className="my-4 grid gap-3">
            {!latestReport && <p className="m-0 text-sm text-muted">{t("studentProgress.noReportsYet")}</p>}
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
          <Link href="/student/progress" className="block border-t border-line pt-3.5 text-sm font-bold text-brand-blue">
            {t("studentHome.viewDetailedReport")} <span className="float-right">→</span>
          </Link>
        </article>
      </div>

      {level && (
        <>
          <section className="mt-8 flex items-center justify-between gap-4">
            <div>
              <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("studentHome.recommendedForYou")}</span>
              <h2 className="my-1 text-2xl tracking-tight">{t("studentHome.moreLessonsIn", { level: LEVEL_LABEL[level] })}</h2>
            </div>
            <Link href="/student/enrollments" className="whitespace-nowrap text-sm font-bold text-brand-blue">
              {t("studentHome.browseAllLessons")} →
            </Link>
          </section>
          <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
            {recommended.map((topic, i) => (
              <div key={topic.id} className="w-[240px] flex-none sm:w-[260px]">
                <CourseCard topic={topic} index={i + 1} lessonHref="/student/enrollments" />
              </div>
            ))}
            {recommended.length === 0 && <p className="text-sm text-muted">{t("studentHome.noOtherLessons")}</p>}
          </div>
        </>
      )}

      <section className="mt-8 rounded-2xl border border-line bg-card p-6 shadow-card">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map(({ step, title, desc }) => (
            <div key={title}>
              <span className="grid size-7 place-items-center rounded-full bg-brand-primary-pale text-sm font-bold text-brand-blue">{step}</span>
              <b className="mt-2 block">{title}</b>
              <p className="m-0 mt-1 text-xs text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_.8fr]">
        <article className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-[15px]">{t("studentHome.upcomingSessions")}</h3>
            <Link href="/student/classes" className="text-sm font-bold text-brand-blue">{t("studentHome.viewCalendar")}</Link>
          </div>
          {upcomingSessions.length === 0 && <p className="mt-3 text-sm text-muted">{t("studentHome.noUpcomingClasses")}</p>}
          {upcomingSessions.map(c => {
            const date = new Date(asUtcIso(c.scheduled_at));
            return (
              <div key={c.id} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-t border-line py-3.5">
                <div className={`grid h-11 w-[42px] place-items-center rounded-[9px] ${c.kind === "one_to_one" ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-primary-pale text-brand-blue"}`}>
                  <b className="text-base leading-none">{date.getUTCDate()}</b>
                  <span className="text-[11px]">{date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}</span>
                </div>
                <div>
                  <span className={`block text-[11px] font-extrabold ${c.kind === "one_to_one" ? "text-brand-cyan" : "text-brand-blue"}`}>
                    {c.kind === "one_to_one" ? t("studentHome.oneToOneCoaching") : t("studentHome.groupClass")}
                  </span>
                  <b className="mt-0.5 block text-sm">{c.title}</b>
                  <p className="m-0 mt-0.5 text-xs text-muted">{formatDateTime(c.scheduled_at)}</p>
                </div>
                <a
                  href={c.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-bold text-brand-blue"
                >
                  {t("studentHome.join")}
                </a>
              </div>
            );
          })}
        </article>
        {classesEnabled && <StudentActivity />}
      </section>
    </main>
  );
}
