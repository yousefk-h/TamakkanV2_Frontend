"use client";

import Link from "next/link";
import type { ActivityAnalytics } from "@/lib/api/types";
import { useAnalytics } from "@/lib/hooks/useAnalytics";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function AnalyticsStatus({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  const { t } = useI18n();
  if (error) return <div role="alert" className="rounded-xl border border-line bg-card p-4 text-sm"><p>{t("analytics.error")}</p><button onClick={retry} className="mt-2 min-h-11 font-bold text-brand-blue">{t("mobile.retry")}</button></div>;
  return loading ? <p role="status" className="py-5 text-sm text-muted">{t("analytics.loading")}</p> : null;
}

export function ActivityTotals({ data, student = false, compact = false }: { data: ActivityAnalytics; student?: boolean; compact?: boolean }) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const values = [
    [student ? "analytics.topics" : "analytics.active", student ? data.topics_practiced : data.active_students],
    ["analytics.sessions", data.completed_sessions],
    ["analytics.minutes", data.session_minutes],
    ["analytics.submissions", data.submissions],
  ] as const;
  return <dl className={`grid grid-cols-2 gap-3 ${student || compact ? "" : "lg:grid-cols-4"}`}>{values.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-line bg-card p-4 [overflow-wrap:anywhere]">
    <dt className="text-xs leading-relaxed text-muted">{t(label)}</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-ink">{number.format(value)}</dd>
  </div>)}</dl>;
}

export function ActivityPeriod({ data }: { data: ActivityAnalytics }) {
  const { t, locale } = useI18n();
  const format = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return <p className="text-xs leading-relaxed text-muted">{format(data.start_date)} – {format(data.end_date)} · {t("analytics.utc")}</p>;
}

export function AdminActivitySummary() {
  const { t } = useI18n();
  const { data, loading, error, refetch } = useAnalytics("admin", 30);
  return <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{t("analytics.last30")}</h3>{data && <ActivityPeriod data={data} />}</div>
      <Link href="/admin/analytics" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-blue">{t("analytics.viewAll")}</Link></div>
    <AnalyticsStatus loading={loading} error={error} retry={refetch} />
    {data && <><ActivityTotals data={data} compact /><p className="mt-3 text-xs leading-relaxed text-muted">{t("analytics.activityNote")}</p></>}
  </section>;
}
