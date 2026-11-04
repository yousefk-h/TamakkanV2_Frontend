"use client";

import { useState } from "react";
import { PageHead } from "@/components/layout/PageHead";
import { FilterChips } from "@/components/ui/FilterChips";
import { MetricCard } from "@/components/ui/MetricCard";
import { Pagination } from "@/components/ui/Pagination";
import { useAuth } from "@/lib/auth/AuthContext";
import { useMyClasses } from "@/lib/hooks/useClasses";
import { usePagination } from "@/lib/hooks/usePagination";
import { asUtcIso, formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const VIEWS = ["Upcoming", "Past"] as const;
type View = (typeof VIEWS)[number];

/** Phase 3: real Group classes & 1:1 coaching - a class an Administrator
 * scheduled you into, with a Google Meet link to join at the scheduled
 * time. Replaces the old fully-mock page (see DESIGN_SNAPSHOT.md); the old
 * "instructor"/rating concept is gone - there's no separate instructor
 * entity, and nothing tracks attendance or ratings yet. */
export default function StudentClassesPage() {
  const { t } = useI18n();
  const VIEW_LABELS: Record<View, string> = { Upcoming: t("studentClasses.viewUpcoming"), Past: t("studentClasses.viewPast") };
  const [view, setView] = useState<View>("Upcoming");
  const { state } = useAuth();
  const enabled = state.status === "authenticated" && state.user.role === "student";
  const { classes, loading } = useMyClasses(enabled);

  const [now] = useState(() => Date.now());
  const allClasses = classes ?? [];
  const upcoming = allClasses.filter(c => new Date(asUtcIso(c.scheduled_at)).getTime() >= now);
  const past = allClasses.filter(c => new Date(asUtcIso(c.scheduled_at)).getTime() < now);
  const visible = (view === "Upcoming" ? upcoming : past).slice().sort((a, b) => {
    const diff = new Date(asUtcIso(a.scheduled_at)).getTime() - new Date(asUtcIso(b.scheduled_at)).getTime();
    return view === "Upcoming" ? diff : -diff;
  });
  const [classPage, classAnchor] = usePagination(visible, { resetKey: view });

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead
        eyebrow={t("studentClasses.eyebrow")}
        title={t("studentClasses.title")}
        desc={t("studentClasses.desc")}
      />

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={t("studentClasses.upcomingClasses")} value={String(upcoming.length)} delta={t("studentClasses.onYourSchedule")} icon="calendar" />
        <MetricCard label={t("studentClasses.oneToOneSessions")} value={String(upcoming.filter(c => c.kind === "one_to_one").length)} delta={t("studentClasses.upcomingLabel")} icon="calendar" />
        <MetricCard label={t("studentClasses.groupClasses")} value={String(upcoming.filter(c => c.kind === "group").length)} delta={t("studentClasses.upcomingLabel")} icon="calendar" />
        <MetricCard label={t("studentClasses.pastClasses")} value={String(past.length)} delta={t("studentClasses.attendedSoFar")} icon="calendar" />
      </section>

      <section ref={classAnchor} className="mt-4.5 scroll-mt-24 rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="m-0 text-[15px]">{view === "Upcoming" ? t("studentClasses.viewUpcoming") : t("studentClasses.pastClasses")}</h3>
          <FilterChips options={[...VIEWS]} value={view} onChange={setView} labels={VIEW_LABELS} aria-label={t("studentClasses.scheduleViewLabel")} />
        </div>

        {loading && <p className="mt-3 text-sm text-muted">{t("studentClasses.loading")}</p>}
        {!loading && visible.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            {view === "Upcoming" ? t("studentClasses.noUpcoming") : t("studentClasses.noPast")}
          </p>
        )}

        {classPage.items.map(c => {
          const date = new Date(asUtcIso(c.scheduled_at));
          return (
            <div key={c.id} className="grid grid-cols-[44px_1fr] items-center gap-3 border-t border-line py-3.5 first:border-0 sm:grid-cols-[44px_1fr_auto]">
              <div className={`grid h-11 w-[42px] place-items-center rounded-[9px] ${c.kind === "one_to_one" ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-primary-pale text-brand-blue"}`}>
                <b className="text-base leading-none">{date.getUTCDate()}</b>
                <span className="text-[11px]">{date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <span className={`block text-[11px] font-extrabold ${c.kind === "one_to_one" ? "text-brand-cyan" : "text-brand-blue"}`}>
                  {c.kind === "one_to_one" ? t("studentClasses.oneToOneCoaching") : t("studentClasses.groupClass")}
                </span>
                <b className="mt-0.5 block text-sm">{c.title}</b>
                <p className="m-0 mt-0.5 text-xs text-muted">
                  {formatDateTime(c.scheduled_at)} · {t("studentClasses.minutesAbbrev", { count: c.duration_minutes })}
                </p>
              </div>
              {view === "Upcoming" ? (
                <a
                  href={c.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="col-span-2 justify-self-start rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-bold text-brand-blue sm:col-span-1 sm:justify-self-auto"
                >
                  {t("studentClasses.join")}
                </a>
              ) : (
                <span className="col-span-2 justify-self-start text-xs font-bold text-muted sm:col-span-1 sm:justify-self-auto">{t("studentClasses.held")}</span>
              )}
            </div>
          );
        })}
        <Pagination
          pagination={classPage}
          label={view === "Upcoming" ? t("studentClasses.viewUpcoming") : t("studentClasses.pastClasses")}
          className="border-t border-line pt-3.5"
        />
      </section>
    </main>
  );
}
