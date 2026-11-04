"use client";

import { useAnalytics } from "@/lib/hooks/useAnalytics";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { ActivityPeriod, ActivityTotals, AnalyticsStatus } from "./ActivitySummary";

export function StudentActivity() {
  const { t, locale } = useI18n();
  const { data, loading, error, refetch } = useAnalytics("student", 7);
  return <article className="rounded-2xl border border-line bg-card p-5 shadow-card">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-[15px] font-bold">{t("analytics.last7")}</h3><button className="min-h-11 text-sm font-bold text-brand-blue disabled:opacity-50" disabled={loading} onClick={refetch}>{t("analytics.refresh")}</button></div>
    <AnalyticsStatus loading={loading} error={error} retry={refetch} />
    {data && <><ActivityPeriod data={data} /><div className="mt-4"><ActivityTotals data={data} student /></div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{t("analytics.activityNote")}</p>
      <div className="mt-5 flex justify-between gap-2" aria-label={t("analytics.activeDays")}>{data.daily.map(day => {
        const date = new Date(`${day.date}T00:00:00Z`);
        const active = day.active_students > 0;
        const label = t(active ? "analytics.practiceDay" : "analytics.inactiveDay", { date: date.toLocaleDateString(locale, { timeZone: "UTC" }) });
        return <div key={day.date} title={label} aria-label={label} className="grid min-w-0 place-items-center gap-2"><i aria-hidden="true" className={`block size-2 rounded-full ${active ? "bg-brand-blue" : "bg-line"}`} /><span className="text-[11px] text-muted">{date.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" })}</span></div>;
      })}</div>
    </>}
  </article>;
}
