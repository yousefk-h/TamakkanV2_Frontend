"use client";
import Link from "next/link";
import { MetricCard } from "@/components/ui/MetricCard";
import { Avatar, PlanBadge } from "@/components/admin/shared";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { AdminActivitySummary } from "@/components/analytics/ActivitySummary";

export default function AdminHomePage() {
  const { t } = useI18n();
  const { students, loading, error, refetch } = useStudentsContext();
  const roster = students ?? [];
  const awaiting = roster.filter(s => s.plan === null);
  return <main className="mx-auto max-w-[1510px] px-4 py-6 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("adminHome.eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t("mobile.rosterTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{t("mobile.rosterDesc")}</p></div>
      <Link href="/admin/topics" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-blue px-5 py-3 text-sm font-bold text-white">{t("adminHome.manageTopics")}</Link>
    </header>
    {error ? <section role="alert" className="mt-6 rounded-2xl border border-line bg-card p-6"><p>{t("mobile.error")}</p><button onClick={refetch} className="mt-3 min-h-11 rounded-xl border border-line px-4 font-bold">{t("mobile.retry")}</button></section> : loading ? <section role="status" className="mt-6 rounded-2xl border border-line bg-card p-8 text-muted">{t("mobile.loading")}</section> : <>
      <section className="metric-grid mt-6 grid gap-3 sm:gap-4">
        <MetricCard label={t("mobile.students")} value={String(roster.length)} delta={t("mobile.current")} icon="people" />
        <MetricCard label={t("mobile.active")} value={String(roster.filter(s => s.is_active).length)} delta={t("mobile.accounts")} icon="challenge" tone={1} />
        <MetricCard label={t("mobile.assigned")} value={String(roster.length - awaiting.length)} delta={t("mobile.plans")} icon="lessons" tone={2} />
        <MetricCard label={t("mobile.waiting")} value={String(awaiting.length)} delta={t("mobile.needsPlan")} icon="report" tone={3} warn />
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold text-ink">{t("adminHome.awaitingAssignment")}</h3><span className="rounded-full bg-brand-primary-pale px-3 py-1 font-bold text-brand-blue">{awaiting.length}</span></div>
          {roster.length === 0 ? <div className="py-5"><h4 className="text-lg font-bold">{t("mobile.empty")}</h4><p className="mt-2 text-sm leading-relaxed text-muted">{t("mobile.emptyDesc")}</p></div> : awaiting.length === 0 ? <p className="py-4 text-sm text-muted">{t("mobile.allAssigned")}</p> : awaiting.slice(0,3).map((s,i) => <div key={s.id} className="flex flex-wrap items-center gap-3 border-t border-line py-4"><Avatar name={s.full_name} tone={i} /><span className="min-w-0 flex-1 break-words text-sm font-bold">{s.full_name}</span><Link href={`/admin/students/${s.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-bold text-brand-blue">{t("adminHome.assign")}</Link></div>)}
          <Link href="/admin/students" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-brand-blue">{t("adminHome.viewAllStudents")}</Link>
        </section>
        <AdminActivitySummary />
      </div>
      {roster.length > 0 && <section className="mt-5 rounded-2xl border border-line bg-card p-5 sm:p-6"><h3 className="mb-4 font-bold text-ink">{t("mobile.roster")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{roster.slice(0,6).map((s,i) => <Link key={s.id} href={`/admin/students/${s.id}`} className="flex min-w-0 items-start gap-3 rounded-xl border border-line p-4 hover:bg-bg"><Avatar name={s.full_name} tone={i%3} /><div className="min-w-0 flex-1"><b className="block break-words text-sm">{s.full_name}</b><p className="my-1 break-all text-sm text-muted">{s.email}</p>{s.plan ? <PlanBadge plan={s.plan} /> : <span className="text-xs text-muted">{t("mobile.waiting")}</span>}</div></Link>)}</div>
        <Link href="/admin/students" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-brand-blue">{t("adminHome.viewAllNStudents",{ count:roster.length })}</Link>
      </section>}
    </>}
  </main>;
}
