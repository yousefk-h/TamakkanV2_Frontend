"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { enrollmentsApi, topicsApi } from "@/lib/api/client";
import type { EnrollmentPublic, EnrollmentSchedule, LessonDayState, TopicListItem } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const stateClass: Record<LessonDayState, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-800", current: "border-brand-blue bg-brand-primary-pale text-brand-blue",
  missed: "border-amber-200 bg-amber-50 text-amber-900", locked: "border-line bg-bg text-muted",
};

function stateLabel(state: LessonDayState, t: ReturnType<typeof useI18n>["t"]) {
  if (state === "done") return t("enrollments.completed");
  if (state === "current") return t("enrollments.available");
  if (state === "missed") return t("enrollments.catchUp");
  return t("enrollments.locked");
}

/** Canonical student curriculum entry point. Enrollment context is always
 * passed to the player; legacy data is used only when no Enrollment exists. */
export default function MyEnrollmentsPage() {
  const { state } = useAuth();
  const { t } = useI18n();
  const [enrollments, setEnrollments] = useState<EnrollmentPublic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<EnrollmentSchedule | null>(null);
  const [legacyTopics, setLegacyTopics] = useState<TopicListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const items = await enrollmentsApi.listMine();
      setEnrollments(items);
      setSelectedId(current => current ?? items[0]?.id ?? null);
      if (items.length === 0) setLegacyTopics(await topicsApi.list());
    } catch { setError(true); } finally { setLoaded(true); }
  }, []);

  // Initial API synchronization; state is updated only after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (state.status === "authenticated") void load(); }, [state, load]);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void enrollmentsApi.schedule(selectedId).then(value => { if (!cancelled) setSchedule(value); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const selectEnrollment = (id: string) => {
    setSchedule(null);
    setSelectedId(id);
  };

  if (state.status !== "authenticated") return null;
  return <main className="mx-auto max-w-5xl p-4 pb-28 md:p-8 lg:pb-8">
    <header className="mb-6 max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("enrollments.eyebrow")}</p>
      <h1 className="mt-2 text-2xl font-bold md:text-3xl">{t("enrollments.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("enrollments.description")}</p>
    </header>
    {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t("enrollments.loadError")}</p>}
    {loaded && enrollments.length === 0 && <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">{t("enrollments.legacyTitle")}</h2>
      {legacyTopics.length === 0 ? <p className="mt-2 text-sm text-muted">{t("enrollments.empty")}</p> : <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {legacyTopics.map(topic => {
          const lessonState = topic.lesson_status ?? "locked";
          return <li key={topic.id} className={`rounded-xl border p-4 ${stateClass[lessonState]}`}>
            <p className="font-bold">{topic.title}</p><p className="mt-1 text-xs font-semibold">{stateLabel(lessonState, t)}</p>
            {lessonState !== "locked" && <Link href={`/student/lessons/${topic.id}`} className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-blue shadow-sm">{t("enrollments.openTopic")}</Link>}
          </li>;
        })}
      </ul>}
    </section>}
    {enrollments.length > 0 && <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <ul className="grid content-start gap-2" aria-label={t("enrollments.enrollmentList")}>
        {enrollments.map(enrollment => <li key={enrollment.id}><button type="button" onClick={() => selectEnrollment(enrollment.id)} aria-pressed={selectedId === enrollment.id}
          className={`w-full rounded-2xl border p-4 text-start shadow-card ${selectedId === enrollment.id ? "border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-blue">{enrollment.program_name ?? enrollment.program_id}</p><p className="mt-1 font-bold">{enrollment.program_level_name ?? enrollment.program_level_id}</p>
          {enrollment.cohort_name && <p className="mt-1 text-xs text-muted">{enrollment.cohort_name}</p>}
        </button></li>)}
      </ul>
      <section className="rounded-2xl border border-line bg-card p-5 shadow-card" aria-live="polite">
        {!schedule && <p className="text-sm text-muted">{t("enrollments.loadingSchedule")}</p>}
        {schedule && !schedule.has_template && <p className="text-sm text-muted">{t("enrollments.noSchedule")}</p>}
        {schedule && schedule.has_template && <><p className="text-sm text-muted">{t("enrollments.currentDay", { day: String(schedule.current_day), total: String(schedule.total_days) })}</p><ul className="mt-3 grid gap-2">
          {schedule.days.map(day => <li key={day.day} className={`rounded-xl border px-3 py-3 text-sm ${day.locked ? "border-line bg-bg" : "border-brand-blue"}`}>
            <p className="font-bold">{t("enrollments.dayLabel", { day: String(day.day) })}</p>
            {day.topic_ids.length > 0 && <div className="mt-2 grid gap-2">{day.topic_ids.map(topicId => {
              const topicState = day.topic_states[topicId] ?? (day.locked ? "locked" : "current");
              const title = day.topic_titles[topicId] ?? t("enrollments.lessonFallback");
              return <div key={topicId} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${stateClass[topicState]}`}>
                <span className="font-semibold">{title}</span><span className="text-xs font-bold">{stateLabel(topicState, t)}</span>
                {topicState !== "locked" && <Link href={`/student/lessons/${topicId}?enrollmentId=${selectedId}`} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-blue shadow-sm">{t("enrollments.openTopic")}</Link>}
              </div>;
            })}</div>}
          </li>)}
          {schedule.days.length === 0 && <li className="text-sm text-muted">{t("enrollments.noDays")}</li>}
        </ul>
        {/* A template can genuinely have fewer authored days than its advertised `total_days` (e.g. content still
        being added) - say so plainly instead of silently stopping the list, which otherwise looks like a broken
        page rather than real, honestly-incomplete content. Never fabricates the missing days. */}
        {schedule.days.length > 0 && schedule.days.length < schedule.total_days && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {t("enrollments.contentNotYetAdded", { from: String(schedule.days.length + 1), total: String(schedule.total_days) })}
        </p>}</>}
      </section>
    </div>}
  </main>;
}
