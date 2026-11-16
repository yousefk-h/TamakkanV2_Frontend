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
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
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
  const [dayPickerOpen, setDayPickerOpen] = useState<number | null>(null);
  const todaysCourses = days.find(d => d.day === currentDay && !restDays.includes(currentDay))?.courses ?? [];
  const todaysTopic = todaysCourses.find(c => c.state === "current")?.topic ?? todaysCourses[0]?.topic;

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
              (!progress?.program_start_date || !progress?.program_name) ? (progress?.has_multiple_enrollments ? t("studentHome.multipleEnrollmentsHeading") : t("analytics.noPlan")) : currentDay === 0 ? t("analytics.notStarted") : t("studentHome.challengeDay", { day: currentDay })}{" "}
            {currentDay > 0 && <em className="text-base font-medium not-italic opacity-80">{t("studentHome.challengeDayOf", { total: challengeTotal })}</em>}
          </h2>
          <p className="m-0 text-sm opacity-90">{progress?.has_multiple_enrollments ? t("studentHome.multipleEnrollmentsNotice") : t("studentHome.challengeMomentum")}</p>
          {progress && !progressError && <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <b>{t("studentHome.challengeStreak", { count: progress?.current_streak ?? 0 })}</b>
            <span className="opacity-75">{t("studentHome.challengeRemaining", { count: Math.max(0, challengeTotal - currentDay) })}</span>
          </div>}
          {progressError && <button onClick={refetchProgress} className="mt-3 min-h-11 underline">{t("mobile.retry")}</button>}
        </div>
        <div
          className="relative mx-auto grid size-27 place-items-center rounded-full"
          style={{ background: `conic-gradient(white 0 ${challengePercent}%, rgba(255,255,255,.25) ${challengePercent}%)` }}
        >
          <div className="absolute inset-[13px] rounded-full bg-brand-ring" />
          <div className="relative z-10 text-center">
            <strong className="block text-xl">{progress?.program_start_date && !progressError ? `${challengePercent}%` : "—"}</strong>
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

      <section className="mt-8">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("challenge.dayByDay")}</span>
        <h2 className="my-1 text-2xl tracking-tight">{t("challenge.calendarTitle")}</h2>
        <p className="m-0 text-xs text-muted">{t("challenge.calendarHint")}</p>
      </section>

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
          <div className="grid grid-cols-4 gap-2.5 min-[360px]:grid-cols-5 sm:grid-cols-6 md:grid-cols-10">
            {days.map(d => {
              const isEndOfWeek = restDays.includes(d.day);
              // End-of-week cells track their own check-in status, distinct
              // from the lesson day-state computed alongside: a check-in
              // day that's come and gone with nothing submitted is
              // "missed", not just "done" (reads identical to a completed
              // lesson) or "🎥" (reads identical to one that hasn't
              // unlocked yet). Those three used to be visually
              // indistinguishable - this is the actual gap the platform
              // plan calls out, preserved here.
              const endOfWeekStatus: EndOfWeekStatus | null = isEndOfWeek
                ? endOfWeekSubmissions[d.day]
                  ? "submitted"
                  : d.state === "locked"
                  ? "locked"
                  : d.state === "current"
                  ? "current"
                  : "missed"
                : null;
              const endOfWeekStatusLabel = endOfWeekStatus
                ? {
                    submitted: t("challenge.statusSubmitted"),
                    current: t("challenge.statusCurrent"),
                    locked: t("challenge.statusLocked"),
                    missed: t("challenge.statusMissed"),
                  }[endOfWeekStatus]
                : "";
              const courseTitles = d.courses.map(c => c.topic.title).join(", ");
              const dayClasses = classesByDay.get(d.day) ?? [];
              const hasLiveClass = dayClasses.length > 0;
              const liveClassTitles = dayClasses.map(c => `${c.title} (${formatDateTime(c.scheduled_at)})`).join(", ");
              const label =
                (isEndOfWeek
                  ? t("challenge.endOfWeekAriaLabel", { day: d.day, status: endOfWeekStatusLabel })
                  : t("challenge.lessonAriaLabel", { day: d.day, title: courseTitles }) +
                    (d.state === "done"
                      ? t("challenge.completedSuffix")
                      : d.state === "missed"
                      ? t("challenge.missedSuffix")
                      : d.state === "locked"
                      ? t("challenge.lockedSuffix")
                      : "")) + (hasLiveClass ? t("challenge.liveClassAriaSuffix", { title: liveClassTitles }) : "");

              // Gradients instead of flat fills, plus a lift-and-glow on
              // hover for every interactive (non-disabled) cell - the whole
              // point of this pass being "more vibrant", not just correct.
              const colorClasses = isEndOfWeek
                ? endOfWeekStatus === "submitted"
                  ? "bg-gradient-to-br from-[#fff0de] to-[#ffe1bb] text-[#b8661f]"
                  : endOfWeekStatus === "current"
                  ? "bg-gradient-to-br from-[#ff9a4d] to-[#ff7a1f] text-white shadow-[0_6px_16px_rgba(255,139,55,.4)]"
                  : endOfWeekStatus === "missed"
                  ? "bg-gradient-to-br from-brand-coral/15 to-brand-coral/5 text-brand-coral"
                  : "bg-gradient-to-br from-[#fff4e9] to-[#ffe9d2] text-[#c9772a]"
                : d.state === "done"
                ? "bg-gradient-to-br from-[#e8faf4] to-[#c9f3e2] text-[#0f9e78]"
                : d.state === "current"
                ? "bg-gradient-to-br from-brand-blue to-brand-selected text-white shadow-[0_8px_18px_rgb(var(--brand-shadow-rgb)/.45)]"
                : d.state === "missed"
                ? "bg-gradient-to-br from-brand-coral/15 to-brand-coral/5 text-brand-coral"
                : "bg-bg text-muted";
              const interactive = !(d.state === "locked" && !isEndOfWeek) && endOfWeekStatus !== "locked";
              const cellClasses = `relative grid aspect-square place-items-center gap-0.5 rounded-xl text-center transition-all duration-150 ${colorClasses} ${
                interactive ? "hover:-translate-y-0.5 hover:shadow-lg" : ""
              }`;
              // A small glowing dot, not another emoji - the day cell
              // already carries up to two icon badges (missed-warning,
              // multi-course count); a plain colored dot reads as "there's
              // something else here" without competing with those for
              // attention or meaning.
              const liveClassBadge = hasLiveClass && (
                <i
                  aria-hidden="true"
                  title={liveClassTitles}
                  className="absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-accent-indigo shadow-[0_0_0_2px_rgba(255,255,255,.6)] not-italic"
                />
              );

              if (isEndOfWeek) {
                const locked = endOfWeekStatus === "locked";
                return (
                  <button
                    key={d.day}
                    type="button"
                    title={endOfWeekStatus === "missed" ? t("challenge.endOfWeekTitleMissed") : t("challenge.endOfWeekTitle")}
                    aria-label={label}
                    disabled={locked}
                    onClick={() => setEndOfWeekOpen(d.day)}
                    className={`${cellClasses} ${locked ? "cursor-not-allowed opacity-55" : ""}`}
                  >
                    <em className="absolute right-1 top-0.5 text-[11px] not-italic">{endOfWeekStatus === "missed" ? "⚠" : "🎥"}</em>
                    <b className="text-xs font-extrabold">{d.day}</b>
                    <span className="text-xs">{endOfWeekStatus === "submitted" ? "✓" : endOfWeekStatus === "missed" ? "!" : "🎥"}</span>
                    {liveClassBadge}
                  </button>
                );
              }

              if (d.state === "locked" || d.courses.length === 0) {
                return (
                  <div key={d.day} title={courseTitles} aria-label={label} className={`${cellClasses} cursor-not-allowed opacity-55`}>
                    <b className="text-xs font-extrabold">{d.day}</b>
                    <span className="text-xs">⛓</span>
                    {liveClassBadge}
                  </div>
                );
              }

              const countBadge = d.courses.length > 1 && (
                <em className="absolute left-1 top-0.5 grid size-3.5 place-items-center rounded-full bg-black/20 text-[9px] not-italic">
                  {d.courses.length}
                </em>
              );

              if (d.courses.length === 1) {
                const only = d.courses[0];
                return (
                  <Link key={d.day} href={`/student/lessons/${only.topic.id}`} title={only.topic.title} aria-label={label} className={cellClasses}>
                    {d.state === "missed" && <em className="absolute right-1 top-0.5 text-[11px] not-italic">⚠</em>}
                    <b className="text-xs font-extrabold">{d.day}</b>
                    <span className="text-xs">{d.state === "done" ? "✓" : d.state === "missed" ? "!" : "●"}</span>
                    {liveClassBadge}
                  </Link>
                );
              }

              return (
                <button
                  key={d.day}
                  type="button"
                  title={courseTitles}
                  aria-label={label}
                  onClick={() => setDayPickerOpen(d.day)}
                  className={cellClasses}
                >
                  {d.state === "missed" && <em className="absolute right-1 top-0.5 text-[11px] not-italic">⚠</em>}
                  {countBadge}
                  <b className="text-xs font-extrabold">{d.day}</b>
                  <span className="text-xs">{d.state === "done" ? "✓" : d.state === "missed" ? "!" : "●"}</span>
                  {liveClassBadge}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3.5 text-[11px] text-muted">
            <span className="flex items-center gap-1"><i className="not-italic">✓</i> {t("challenge.legendDone")}</span>
            <span className="flex items-center gap-1"><i className="not-italic">●</i> {t("challenge.legendCurrent")}</span>
            <span className="flex items-center gap-1"><i className="not-italic">!</i> {t("challenge.legendMissed")}</span>
            <span className="flex items-center gap-1"><i className="not-italic">⛓</i> {t("challenge.legendLocked")}</span>
            <span className="flex items-center gap-1"><i className="not-italic">🎥</i> {t("challenge.legendCheckin")}</span>
            <span className="flex items-center gap-1">
              <i aria-hidden="true" className="size-1.5 rounded-full bg-accent-indigo not-italic" /> {t("challenge.legendLiveClass")}
            </span>
          </div>
        </div>
      )}

      {dayPickerOpen !== null && (
        <Dialog
          ariaLabel={t("challenge.pickACourse")}
          onClose={() => setDayPickerOpen(null)}
          dismissOnBackdropClick
          className="w-[min(420px,92vw)] rounded-2xl border-0 bg-card p-0 shadow-[0_20px_60px_rgba(0,0,0,.3)] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        >
            <div className="relative bg-gradient-to-br from-brand-blue to-brand-selected px-5 py-4 pe-16 text-white">
              <DialogCloseButton className="absolute end-2 top-2 text-white" />
              <span className="text-[11px] font-bold tracking-wide opacity-80">{t("challenge.dayByDay")}</span>
              <h3 className="mt-0.5 text-lg font-extrabold">{t("challenge.dayNCourses", { day: dayPickerOpen })}</h3>
            </div>
            <div className="p-4">
              <ul className="grid gap-2">
                {(days.find(d => d.day === dayPickerOpen)?.courses ?? []).map(c => {
                  const stateStyle =
                    c.state === "done"
                      ? { bg: "bg-gradient-to-br from-[#e8faf4] to-[#c9f3e2]", ring: "ring-[#0f9e78]/20", icon: "✓", iconBg: "bg-[#0f9e78] text-white" }
                      : c.state === "missed"
                      ? { bg: "bg-gradient-to-br from-brand-coral/15 to-brand-coral/5", ring: "ring-brand-coral/20", icon: "!", iconBg: "bg-brand-coral text-white" }
                      : c.state === "current"
                      ? { bg: "bg-gradient-to-br from-brand-primary-pale to-white", ring: "ring-brand-blue/25", icon: "→", iconBg: "bg-brand-blue text-white" }
                      : { bg: "bg-bg", ring: "ring-line", icon: "⛓", iconBg: "bg-line text-muted" };
                  return (
                    <li key={c.topic.id}>
                      {c.state === "locked" ? (
                        <span className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted opacity-70 ring-1 ${stateStyle.bg} ${stateStyle.ring}`}>
                          <em className={`grid size-7 flex-none place-items-center rounded-full text-xs not-italic ${stateStyle.iconBg}`}>{stateStyle.icon}</em>
                          {c.topic.title}
                        </span>
                      ) : (
                        <Link
                          href={`/student/lessons/${c.topic.id}`}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-ink ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md ${stateStyle.bg} ${stateStyle.ring}`}
                        >
                          <em className={`grid size-7 flex-none place-items-center rounded-full text-xs not-italic ${stateStyle.iconBg}`}>{stateStyle.icon}</em>
                          {c.topic.title}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>

              {(classesByDay.get(dayPickerOpen) ?? []).length > 0 && (
                <div className="mt-3 grid gap-2 border-t border-line pt-3">
                  <span className="text-[11px] font-extrabold tracking-wide text-accent-indigo">{t("challenge.liveClassesHeading")}</span>
                  {(classesByDay.get(dayPickerOpen) ?? []).map(c => (
                    <a
                      key={c.id}
                      href={c.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-accent-indigo/10 to-accent-indigo/5 px-3 py-2.5 text-sm font-bold text-ink ring-1 ring-accent-indigo/25 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <em className="grid size-7 flex-none place-items-center rounded-full bg-accent-indigo text-xs not-italic text-white">🎦</em>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.title}</span>
                        <span className="block text-xs font-normal text-muted">{formatDateTime(c.scheduled_at)}</span>
                      </span>
                      <span className="flex-none text-xs font-extrabold text-accent-indigo">{t("challenge.joinClass")} →</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
        </Dialog>
      )}

      <section className="mt-8">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("challenge.rewards")}</span>
        <h2 className="my-1 text-2xl tracking-tight">{t("challenge.milestones")}</h2>
      </section>
      <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        {(progress?.milestones ?? CHALLENGE_MILESTONE_DAYS.map(day => ({ day, reached: false }))).map(m => (
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

      {(todaysTopic ?? topics[0]) && (
        <div className="mt-5">
          <Link
            href={`/student/lessons/${(todaysTopic ?? topics[0]).id}`}
            className="inline-flex items-center gap-2 rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
          >
            {t("challenge.continueDay", { day: currentDay })} <span>→</span>
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
