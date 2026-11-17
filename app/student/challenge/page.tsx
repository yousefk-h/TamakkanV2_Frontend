"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { useStudentSubmissionsContext } from "@/lib/submissions/StudentSubmissionsContext";
import { useChallengeCalendar, useStudentProgress } from "@/lib/hooks/useProgress";
import { useMyClasses } from "@/lib/hooks/useClasses";
import { useAuth } from "@/lib/auth/AuthContext";
import { LEVEL_ORDER } from "@/lib/topics/helpers";
import { EndOfWeekTaskModal } from "@/components/student/challenge/EndOfWeekTaskModal";
import { LearningPath, type PathNode } from "@/components/student/journey/LearningPath";
import { Dialog } from "@/components/ui/Dialog";
import { type MessageKey, useI18n } from "@/lib/i18n/LocaleProvider";
import { asUtcIso, formatDateTime } from "@/lib/format";
import type { LessonDayState, LiveClassPublic, TopicListItem } from "@/lib/api/types";

// Worst-first, mirroring the backend's own `resolve_topic_statuses`
// precedence (done wins outright; otherwise current beats missed beats
// locked) - used here the other way around, to pick the *worst* state
// present on a multi-course day for the cell's overall color.
const STATE_SEVERITY: Record<LessonDayState, number> = { missed: 3, current: 2, done: 1, locked: 0 };
const worstState = (states: LessonDayState[]): LessonDayState =>
  states.reduce((worst, s) => (STATE_SEVERITY[s] > STATE_SEVERITY[worst] ? s : worst), "locked" as LessonDayState);

const CHALLENGE_MILESTONE_DAYS = [10, 20, 30];

const MILESTONE_ICON: Record<number, string> = { 10: "🎖️", 20: "🏅", 30: "🏆" };
const MILESTONE_REWARD_KEY: Record<number, MessageKey> = {
  10: "challenge.milestone10Reward",
  20: "challenge.milestone20Reward",
  30: "challenge.milestone30Reward",
};
const MILESTONE_NOTE_KEY: Record<number, MessageKey> = {
  10: "challenge.milestone10Note",
  20: "challenge.milestone20Note",
  30: "challenge.milestone30Note",
};

type EndOfWeekStatus = "submitted" | "current" | "locked" | "missed";

/** Replaces the old `StudentChallenge` - the "30-Day Zero to Hero" calendar.
 * `currentDay`, the milestone reached-state, and now the day-by-day lesson
 * schedule itself all come from the backend (`useStudentProgress`/
 * `useChallengeCalendar`, both backed by `ProgressService`) instead of a
 * hardcoded constant and a naive `topics[i % topics.length]` cycle. A day
 * whose lesson wasn't completed ("missed") carries the same topic into the
 * next lesson day rather than silently marking it done - see
 * `ProgressService.get_lesson_schedule`. End-of-week check-ins still get
 * their own 4 visual states (submitted/current/locked/missed), unrelated
 * to the lesson rollover - see the `endOfWeekStatus` derivation below. */
export default function StudentChallengePage() {
  const { t } = useI18n();
  const { topicsByLevel } = useTopicsContext();
  const { submissions, refetch } = useStudentSubmissionsContext();
  const { progress, error: progressError, loading: progressLoading, refetch: refetchProgress } = useStudentProgress();
  const { calendar } = useChallengeCalendar();
  const { state: authState } = useAuth();
  const isStudent = authState.status === "authenticated" && authState.user.role === "student";
  const { classes: myClasses } = useMyClasses(isStudent);
  const currentDay = progress?.challenge_day ?? 0;
  const challengeTotal = progress?.challenge_total_days ?? 30;
  const restDays = calendar?.rest_days ?? [];
  const challengePercent = Math.round((currentDay / challengeTotal) * 100);
  // Flattened across every level this student is entitled to - a Standard
  // plan naturally has just one level's worth here; a Pro plan's hand-picked
  // topics can span several. Only used here to know whether the student has
  // any topics at all, and to look lesson-day topics up by id.
  const topics = LEVEL_ORDER.flatMap(l => topicsByLevel[l] ?? []);
  const topicsById = useMemo(() => new Map(topics.map(topic => [topic.id, topic])), [topics]);
  const [endOfWeekOpen, setEndOfWeekOpen] = useState<number | null>(null);

  // The student's own list is already newest-first (see `list_for_student`),
  // so the first match per day is the current one even when a resubmission
  // left an older, replaced document in the same history.
  const endOfWeekSubmissions = useMemo(() => {
    const byDay: Record<number, { url: string; seconds: number }> = {};
    for (const s of submissions ?? []) {
      if (s.kind !== "friday_video" || s.day == null || s.day in byDay) continue; // wire value unchanged, see SubmissionKind
      byDay[s.day] = { url: s.media_url, seconds: s.duration_seconds };
    }
    return byDay;
  }, [submissions]);

  // Challenge day N is always `program_start_date + (N-1) days` - a strictly
  // linear mapping, no gaps or pauses (see `ProgressService._program_today`,
  // which computes the same formula in reverse). Matching each class's
  // `scheduled_at` against that gives the day cell it belongs on, without
  // needing a backend change - both past and upcoming classes are already
  // returned by `GET /classes/me` (see `LiveClassService.list_for_student`).
  const classesByDay = useMemo(() => {
    const map = new Map<number, LiveClassPublic[]>();
    if (!progress?.program_start_date) return map;
    const [startYear, startMonth, startDay] = progress.program_start_date.split("-").map(Number);
    const startUtcMs = Date.UTC(startYear, startMonth - 1, startDay);
    for (const c of myClasses ?? []) {
      const classDate = new Date(asUtcIso(c.scheduled_at));
      const classUtcMs = Date.UTC(classDate.getUTCFullYear(), classDate.getUTCMonth(), classDate.getUTCDate());
      const day = Math.round((classUtcMs - startUtcMs) / 86_400_000) + 1;
      if (day < 1 || day > challengeTotal) continue;
      const list = map.get(day) ?? [];
      list.push(c);
      map.set(day, list);
    }
    return map;
  }, [myClasses, progress, challengeTotal]);

  const lessonSlotByDay = useMemo(() => new Map((calendar?.lesson_days ?? []).map(slot => [slot.day, slot])), [calendar]);
  type DayCourse = { topic: TopicListItem; state: LessonDayState };
  const days: { day: number; state: LessonDayState; courses: DayCourse[] }[] =
    topics.length === 0
      ? []
      : Array.from({ length: challengeTotal }, (_, i) => {
          const day = i + 1;
          if (restDays.includes(day)) {
            // End-of-week check-ins sit outside the lesson rollover
            // entirely - their own state is just "has today reached this
            // day yet", same rule the lesson schedule itself uses for its
            // own locked/reached cutoff.
            const endOfWeekDayState: LessonDayState = day < currentDay ? "done" : day === currentDay ? "current" : "locked";
            return { day, state: endOfWeekDayState, courses: [] };
          }
          const slot = lessonSlotByDay.get(day);
          const courses: DayCourse[] = (slot?.topics ?? [])
            .map(t => {
              const topic = topicsById.get(t.topic_id);
              return topic ? { topic, state: t.state } : null;
            })
            .filter((c): c is DayCourse => !!c);
          return { day, state: worstState(courses.map(c => c.state)), courses };
        });
  const todaysEndOfWeekTask = restDays.includes(currentDay);
  const pendingCount = calendar?.pending_count ?? 0;
  const [lockedExplainer, setLockedExplainer] = useState<PathNode | null>(null);

  // `program_name` is null whenever no real calendar actually resolved for this student (see the heading below) -
  // every other number on this page (percent ring, remaining-days count, milestones) must agree with that same
  // gate, or the page can show "no plan" next to a populated percentage/milestone set, exactly the
  // self-contradiction this page was reported to still have after an earlier fix only touched the heading text.
  const hasRealPlan = !!(progress?.program_start_date && progress?.program_name) && !progressError;

  // Week-by-week navigation: Week N covers days (N-1)*7+1..N*7 of the program's own real duration (never a fixed
  // 30 - `challengeTotal` is `challenge_total_days` from the real resolved template, whatever its actual length
  // is), so this works unchanged for a program shorter or longer than 30 days. Starts on the week containing
  // today's real day.
  const totalWeeks = Math.max(1, Math.ceil(challengeTotal / 7));
  const [weekIndex, setWeekIndex] = useState(() => Math.min(totalWeeks - 1, Math.max(0, Math.floor((Math.max(1, currentDay) - 1) / 7))));
  // `days` is already cheaply recomputed per render (not itself memoized) - chunking it is just as cheap, so this
  // intentionally isn't wrapped in its own useMemo (which would need `days` as a dependency and gain nothing).
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const clampedWeekIndex = Math.min(weekIndex, Math.max(0, weeks.length - 1));
  const visibleDays = weeks[clampedWeekIndex] ?? [];
  const weekFirstDay = clampedWeekIndex * 7 + 1;
  const weekLastDay = Math.min(challengeTotal, weekFirstDay + 6);

  // COMPLETION-policy programs have no calendar date/duration at all - `challenge_total_days` is a real lesson-node
  // count, never a calendar length - so the map here is built straight from the real template order
  // (`calendar.lesson_days`, already flattened per lesson, never per calendar day) instead of the date-driven
  // `days`/`weeks` construction above, which stays exactly as it was for SCHEDULE-policy programs.
  const isCompletion = (progress?.unlock_policy ?? calendar?.unlock_policy) === "completion";
  const completionNodes: PathNode[] = (calendar?.lesson_days ?? []).flatMap(slot =>
    slot.topics
      .map((ts): PathNode | null => {
        const topic = topicsById.get(ts.topic_id);
        return topic ? { id: topic.id, title: topic.title, state: ts.state, kind: "lesson", href: `/student/lessons/${topic.id}` } : null;
      })
      .filter((node): node is PathNode => node !== null)
  );
  const scheduleNodes: PathNode[] = visibleDays.flatMap((d): PathNode[] => {
    if (restDays.includes(d.day)) {
      const endOfWeekStatus: EndOfWeekStatus = endOfWeekSubmissions[d.day] ? "submitted" : d.state === "locked" ? "locked" : d.state === "current" ? "current" : "missed";
      const nodeState: LessonDayState = endOfWeekStatus === "submitted" ? "done" : endOfWeekStatus === "missed" ? "missed" : endOfWeekStatus === "locked" ? "locked" : "current";
      return [{ id: `checkin-${d.day}`, title: t("challenge.endOfWeekTaskTitle"), state: nodeState, kind: "checkin", day: d.day, groupLabel: t("challenge.dayLabel", { day: d.day }) }];
    }
    const dayClasses = classesByDay.get(d.day) ?? [];
    const liveClassTitle = dayClasses.length > 0 ? dayClasses.map(c => `${c.title} (${formatDateTime(c.scheduled_at)})`).join(", ") : undefined;
    // A locked future day's `courses` is only a *preview* of whatever is currently backlogged (see the backend's
    // own `_build_schedule` docstring - "not a commitment about what will actually land there"), so the exact
    // same not-yet-completed topic can legitimately repeat across many future days. Showing that one real topic's
    // title as if it were each day's own distinct lesson would be misleading (and gives every locked node the same
    // React key) - a locked node gets a generic placeholder label and a day-qualified key instead; only a real
    // current/done/missed node shows its real lesson title.
    return d.courses.map((c, index): PathNode => ({
      id: `${c.topic.id}-day${d.day}`, title: c.state === "locked" ? t("challenge.lockedLessonPlaceholder") : c.topic.title, state: c.state, kind: "lesson",
      href: `/student/lessons/${c.topic.id}`,
      liveClassTitle: index === 0 ? liveClassTitle : undefined,
      groupLabel: index === 0 ? t("challenge.dayLabel", { day: d.day }) : undefined,
    }));
  });
  const pathNodes = isCompletion ? completionNodes : scheduleNodes;
  // The "Continue" shortcut always resumes the actual current lesson node, never a guessed
  // first-of-level topic - falls back to the student's first entitled topic only when nothing
  // in the currently-visible path is "current" (e.g. a schedule-mode program showing a past week).
  const continueNode = pathNodes.find(n => n.kind !== "checkin" && n.state === "current");
  const continueHref = continueNode?.href ?? (topics[0] ? `/student/lessons/${topics[0].id}` : null);

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <section className="relative z-0 grid grid-cols-1 gap-6 overflow-hidden rounded-[20px] bg-gradient-to-br from-brand-hero-start via-brand-hero-mid to-brand-hero-end p-6 text-white shadow-(--shadow-brand-hero-strong) md:grid-cols-[1fr_140px] md:items-center md:p-7">
        <div>
          <span className="text-xs font-bold tracking-wide opacity-90">
            {progress?.program_name ? t("studentHome.journeyBadgeFor", { program: progress.program_name }) : t("studentHome.journeyBadgeGeneric")}
          </span>
          <h2 className="my-2 text-[28px] tracking-tight md:text-[32px]">
            {progressLoading ? t("common.loading") : progressError ? t("analytics.planError") :
              /* `program_name` is null whenever no real calendar actually resolved for this student - including a
              stale legacy `program_start_date` left pointing at a Program/level that no longer has an active
              template (see `ProgressService._resolve_program_context`/`_resolve_template`). Checking it here,
              not just `program_start_date`, is what keeps this heading from ever claiming a day count while the
              lesson list below is genuinely empty. */
              (!progress?.program_start_date || !progress?.program_name)
                ? (progress?.has_multiple_enrollments ? t("studentHome.multipleEnrollmentsHeading") : t("analytics.noPlan"))
                : currentDay === 0
                ? t("analytics.notStarted")
                : isCompletion
                ? t("challenge.lessonProgress", { day: currentDay })
                : t("studentHome.challengeDay", { day: currentDay })}{" "}
            {currentDay > 0 && (
              <em className="text-base font-medium not-italic opacity-80">
                {isCompletion ? t("challenge.lessonProgressOf", { total: challengeTotal }) : t("studentHome.challengeDayOf", { total: challengeTotal })}
              </em>
            )}
          </h2>
          <p className="m-0 text-sm opacity-90">{progress?.has_multiple_enrollments ? t("studentHome.multipleEnrollmentsNotice") : t("studentHome.challengeMomentum")}</p>
          {/* Gated on the exact same `hasRealPlan` the heading above uses - these numbers must never show a
          populated percentage/streak/remaining-days next to a "no plan assigned" heading, which was the reported
          self-contradiction left over after an earlier fix that only touched the heading text. */}
          {hasRealPlan && <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <b>{t("studentHome.challengeStreak", { count: progress?.current_streak ?? 0 })}</b>
            <span className="opacity-75">
              {isCompletion
                ? t("challenge.lessonsRemaining", { count: Math.max(0, challengeTotal - currentDay) })
                : t("studentHome.challengeRemaining", { count: Math.max(0, challengeTotal - currentDay) })}
            </span>
          </div>}
          {progressError && <button onClick={refetchProgress} className="mt-3 min-h-11 underline">{t("mobile.retry")}</button>}
        </div>
        <div
          className="relative mx-auto grid size-27 place-items-center rounded-full"
          style={{ background: `conic-gradient(white 0 ${hasRealPlan ? challengePercent : 0}%, rgba(255,255,255,.25) ${hasRealPlan ? challengePercent : 0}%)` }}
        >
          <div className="absolute inset-[13px] rounded-full bg-brand-ring" />
          <div className="relative z-10 text-center">
            <strong className="block text-xl">{hasRealPlan ? `${challengePercent}%` : "—"}</strong>
            <span className="block max-w-24 text-[10px] leading-tight opacity-80">{t("studentHome.challengeComplete")}</span>
          </div>
        </div>
      </section>

      {todaysEndOfWeekTask && (
        <section className="mt-4.5 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
          <span className="grid size-11.5 flex-none place-items-center rounded-xl bg-brand-primary-pale text-xl">🎥</span>
          <div className="min-w-0 basis-56 flex-1">
            <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("challenge.endOfWeekTaskLabel")}</span>
            <h3 className="my-1 text-sm">{t("challenge.endOfWeekTaskTitle")}</h3>
            <p className="m-0 max-w-[520px] text-sm text-muted">{t("challenge.endOfWeekTaskDesc")}</p>
          </div>
          {endOfWeekSubmissions[currentDay] ? (
            <span className="ml-auto rounded-full bg-[#e8faf4] px-2.5 py-1.5 text-sm font-bold text-[#15a87c]">{t("challenge.submitted")}</span>
          ) : (
            <button
              type="button"
              onClick={() => setEndOfWeekOpen(currentDay)}
              className="ml-auto rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
            >
              {t("challenge.recordVideo")} →
            </button>
          )}
        </section>
      )}

      <section className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("challenge.dayByDay")}</span>
          <h2 className="my-1 text-2xl tracking-tight">{t("challenge.calendarTitle")}</h2>
          <p className="m-0 text-xs text-muted">{isCompletion ? t("challenge.calendarHintCompletion") : t("challenge.calendarHint")}</p>
        </div>
        {/* Explicit week-by-week navigation, independent of the program's real length (`totalWeeks` derives from
        `challengeTotal`, never a hardcoded 30) - browsing never bypasses lock state, it only changes which 7
        days are rendered below; every cell keeps the exact same locked/current/done/missed logic either way.
        COMPLETION-policy programs have no calendar date at all, so there is no "week" to page through - every
        real lesson node renders in one continuous path instead. */}
        {!isCompletion && weeks.length > 1 && <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWeekIndex(i => Math.max(0, i - 1))} disabled={clampedWeekIndex === 0}
            aria-label={t("challenge.previousWeek")} className="grid size-10 min-h-10 place-items-center rounded-full border border-line bg-card text-sm font-bold disabled:opacity-40">‹</button>
          <span className="min-w-28 text-center text-sm font-bold">{t("challenge.weekOf", { week: clampedWeekIndex + 1, total: weeks.length })}</span>
          <button type="button" onClick={() => setWeekIndex(i => Math.min(weeks.length - 1, i + 1))} disabled={clampedWeekIndex >= weeks.length - 1}
            aria-label={t("challenge.nextWeek")} className="grid size-10 min-h-10 place-items-center rounded-full border border-line bg-card text-sm font-bold disabled:opacity-40">›</button>
        </div>}
      </section>
      {!isCompletion && weeks.length > 1 && <p className="mt-1 text-xs text-muted">{t("challenge.weekRange", { from: weekFirstDay, to: weekLastDay })}</p>}

      {pendingCount > 0 && (
        <section className="mt-4 flex items-center gap-3 rounded-2xl border border-brand-coral/30 bg-brand-coral/10 p-4">
          <span className="text-xl">⏰</span>
          <p className="m-0 text-sm text-brand-coral">
            {t(pendingCount === 1 ? "challenge.pendingReminder" : "challenge.pendingReminderPlural", { count: pendingCount })}
          </p>
        </section>
      )}

      {topics.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("challenge.noTopicsCalendar")}</p>
      ) : calendar && !calendar.has_template ? (
        <p className="mt-4 text-sm text-muted">{t("challenge.noTemplateYet")}</p>
      ) : (
        <div className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
          <LearningPath nodes={pathNodes} onLockedClick={setLockedExplainer} onCheckinClick={node => setEndOfWeekOpen(node.day ?? null)} />
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3.5 text-[11px] text-muted">
            <span className="flex items-center gap-1"><i className="not-italic">✓</i> {t("challenge.legendDone")}</span>
            <span className="flex items-center gap-1"><i className="not-italic">●</i> {t("challenge.legendCurrent")}</span>
            {!isCompletion && <span className="flex items-center gap-1"><i className="not-italic">!</i> {t("challenge.legendMissed")}</span>}
            <span className="flex items-center gap-1"><i className="not-italic">🔒</i> {t("challenge.legendLocked")}</span>
            {!isCompletion && <span className="flex items-center gap-1"><i className="not-italic">🎥</i> {t("challenge.legendCheckin")}</span>}
            <span className="flex items-center gap-1">
              <i aria-hidden="true" className="size-1.5 rounded-full bg-accent-indigo not-italic" /> {t("challenge.legendLiveClass")}
            </span>
          </div>
        </div>
      )}

      {lockedExplainer && (
        <Dialog
          ariaLabel={t("challenge.lockedExplainerTitle")}
          onClose={() => setLockedExplainer(null)}
          dismissOnBackdropClick
          className="w-[min(380px,92vw)] rounded-2xl border-0 bg-card p-5 shadow-[0_20px_60px_rgba(0,0,0,.3)] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        >
          <h3 className="text-lg font-extrabold">{t("challenge.lockedExplainerTitle")}</h3>
          <p className="mt-1 text-sm font-bold text-ink">{lockedExplainer.title}</p>
          <p className="mt-2 text-sm text-muted">{isCompletion ? t("challenge.lockedExplainerCompletion") : t("challenge.lockedExplainerSchedule")}</p>
          <button type="button" onClick={() => setLockedExplainer(null)} className="mt-4 min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">
            {t("challenge.close")}
          </button>
        </Dialog>
      )}

      {/* Milestones are a SCHEDULE-only, calendar-day concept (days 10/20/30) - a COMPLETION-policy program's
      `challenge_day` is a lesson-node count, not a date, so these thresholds would be a meaningless coincidence
      (the backend already sends an empty `milestones` array for that policy; this just hides the section too). */}
      {!isCompletion && (
        <>
          <section className="mt-8">
            <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("challenge.rewards")}</span>
            <h2 className="my-1 text-2xl tracking-tight">{t("challenge.milestones")}</h2>
          </section>
          <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            {(hasRealPlan ? progress?.milestones ?? [] : CHALLENGE_MILESTONE_DAYS.map(day => ({ day, reached: false }))).map(m => (
              <article
                key={m.day}
                className={`rounded-2xl border border-line bg-card p-4 text-center shadow-card ${m.reached ? "" : "opacity-45 grayscale"}`}
              >
                <span className="mb-2 block text-2xl">{MILESTONE_ICON[m.day]}</span>
                <b className="block text-sm">{t("challenge.milestoneDay", { day: m.day, reward: t(MILESTONE_REWARD_KEY[m.day]) })}</b>
                <p className="m-0 mt-1 text-xs leading-relaxed text-muted">
                  {m.reached ? t(MILESTONE_NOTE_KEY[m.day]) : t("challenge.milestoneLocked", { day: m.day })}
                </p>
              </article>
            ))}
          </div>
        </>
      )}

      {hasRealPlan && continueHref && (
        <div className="mt-5">
          <Link href={continueHref} className="inline-flex items-center gap-2 rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]">
            {isCompletion ? t("studentHome.startLesson") : t("challenge.continueDay", { day: currentDay })} <span>→</span>
          </Link>
        </div>
      )}

      {endOfWeekOpen !== null && (
        <EndOfWeekTaskModal
          day={endOfWeekOpen}
          existingSubmission={endOfWeekSubmissions[endOfWeekOpen]}
          onClose={() => setEndOfWeekOpen(null)}
          onSubmitted={refetch}
        />
      )}
    </main>
  );
}
