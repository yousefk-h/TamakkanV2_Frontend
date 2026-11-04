"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHead } from "@/components/layout/PageHead";
import { FilterChips } from "@/components/ui/FilterChips";
import { ActivityPeriod, ActivityTotals, AnalyticsStatus } from "@/components/analytics/ActivitySummary";
import { useAnalytics } from "@/lib/hooks/useAnalytics";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { asUtcIso } from "@/lib/format";

export default function AdminAnalyticsPage() {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<"7D" | "30D">("30D");
  const { data, loading, error, refetch } = useAnalytics("admin", range === "7D" ? 7 : 30);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const peak = Math.max(0, ...(data?.daily.map(day => day.active_students) ?? []));
  return <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
    <PageHead eyebrow={t("adminAnalytics.eyebrow")} title={t("adminAnalytics.title")} desc={t("analytics.description")}
      action={<FilterChips options={["7D", "30D"] as const} value={range} onChange={setRange} aria-label={t("adminAnalytics.period")} />} />
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <div>{data && <ActivityPeriod data={data} />}{data && <p className="mt-1 text-xs text-muted">{t("analytics.updated", { time: new Date(asUtcIso(data.generated_at)).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) })}</p>}</div>
      <button onClick={refetch} disabled={loading} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue disabled:opacity-50">{t("analytics.refresh")}</button>
    </div>
    <AnalyticsStatus loading={loading} error={error} retry={refetch} />
    {data && <>
      <ActivityTotals data={data} />
      <p className="mt-3 text-xs leading-relaxed text-muted">{t("analytics.activityNote")}</p>
      {data.completed_sessions === 0 && data.submissions === 0 && <div role="status" className="mt-5 rounded-xl bg-brand-primary-pale p-4"><b>{t("analytics.emptyTitle")}</b><p className="mt-1 text-sm text-muted">{t("analytics.emptyDescription")}</p></div>}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="min-w-0 rounded-2xl border border-line bg-card p-5">
          <h3 className="font-bold">{t("analytics.dailyTitle")}</h3><p className="mt-1 text-xs text-muted">{t("analytics.dailyNote")}</p>
          <div aria-label={t("analytics.dailyTitle")} className="mt-5 flex h-44 items-end gap-1 border-b border-line" dir="ltr">
            {data.daily.map(day => <div key={day.date} className="flex h-full min-w-0 flex-1 items-end" title={`${date(day.date)}: ${day.active_students}`}>
              <div aria-label={`${date(day.date)}: ${day.active_students}`} className="w-full rounded-t bg-brand-blue" style={{ height: `${day.active_students / Math.max(1, peak) * 100}%` }} />
            </div>)}
          </div><div className="mt-2 flex justify-between gap-2 text-xs text-muted" dir="ltr"><span>{date(data.start_date)}</span><span>{t("analytics.peak", { count: peak })}</span><span>{date(data.end_date)}</span></div>
          <details className="mt-4"><summary className="cursor-pointer py-3 text-sm font-bold text-brand-blue">{t("analytics.dailyTable")}</summary>
            <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-start text-sm"><thead><tr className="border-b border-line"><th className="py-2 text-start">{t("analytics.date")}</th><th>{t("analytics.active")}</th><th>{t("analytics.sessions")}</th><th>{t("analytics.submissions")}</th></tr></thead><tbody>{data.daily.map(day => <tr key={day.date} className="border-b border-line"><td className="py-2">{date(day.date)}</td><td className="text-center">{day.active_students}</td><td className="text-center">{day.completed_sessions}</td><td className="text-center">{day.submissions}</td></tr>)}</tbody></table></div>
          </details>
        </section>
        <section className="rounded-2xl border border-line bg-card p-5">
          <h3 className="font-bold">{t("analytics.returning")}</h3><p className="mt-3 text-3xl font-bold text-brand-blue">{data.returning_rate === null ? "—" : `${number.format(data.returning_rate)}%`}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{data.returning_rate === null ? t("analytics.noBaseline") : t("analytics.returningCount", { count: data.returning_students, total: data.previous_active_students, days: data.days })}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted">{t("analytics.returningNote")}</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4"><div><dt className="text-xs text-muted">{t("mobile.students")}</dt><dd className="mt-1 text-xl font-bold">{data.roster_students}</dd></div><div><dt className="text-xs text-muted">{t("analytics.topics")}</dt><dd className="mt-1 text-xl font-bold">{data.topics_practiced}</dd></div></dl>
        </section>
      </div>
      <section className="mt-5 rounded-2xl border border-line bg-card p-5">
        <h3 className="font-bold">{t("analytics.scores")}</h3><p className="mt-2 text-xs leading-relaxed text-muted">{t("analytics.scoresNote")}</p>
        {data.score_groups.length === 0 ? <p className="mt-4 text-sm text-muted">{t("analytics.noScores")}</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.score_groups.map(group => <article key={`${group.rubric}:${group.level}`} className="min-w-0 rounded-xl border border-line p-4">
          <h4 className="text-sm font-bold">{group.level === "beginner" ? t("analytics.beginner") : group.level === "intermediate" ? t("analytics.intermediate") : group.level === "advanced" ? t("analytics.advanced") : t("analytics.unknownLevel")}</h4>
          <p className="mt-1 text-xs text-muted">{group.rubric === "legacy" ? t("analytics.legacy") : t("analytics.textAssessment")}</p><p className="mt-3 text-2xl font-bold">{number.format(group.average_score)}<span className="text-xs text-muted">/100</span></p>
          <div className="mt-2 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-brand-blue" style={{ width: `${group.average_score}%` }} /></div>
          <p className="mt-3 text-xs text-muted">{t("analytics.sample", { reports: group.report_count, students: group.student_count })}</p>
        </article>)}</div>}
        <p className="mt-4 text-xs text-muted">{t("analytics.unscored", { count: data.unscored_sessions })}</p>
      </section>
      <section className="mt-5 rounded-2xl border border-line bg-card p-5"><h3 className="font-bold">{t("analytics.reviewTitle")}</h3><p className="mt-1 text-xs text-muted">{t("analytics.reviewNote")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Link href="/admin/reports" className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-line p-4 text-sm font-bold text-brand-blue"><span>{t("analytics.reportsPending")}</span><span>{data.reports_awaiting_review}</span></Link><Link href="/admin/submissions" className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-line p-4 text-sm font-bold text-brand-blue"><span>{t("analytics.recordingsPending")}</span><span>{data.submissions_awaiting_review}</span></Link></div>
      </section>
    </>}
  </main>;
}
