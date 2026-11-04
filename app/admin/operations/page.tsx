"use client";

import { useEffect, useState } from "react";
import { operationsApi } from "@/lib/api/client";
import type { OperationsSnapshot } from "@/lib/api/types";
import { useI18n, type MessageKey } from "@/lib/i18n/LocaleProvider";

export default function OperationsPage() {
  const { t, locale } = useI18n();
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    operationsApi.sessions()
      .then(data => { if (active) { setSnapshot(data); setError(false); setLoading(false); } })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [revision]);

  const refresh = () => { setLoading(true); setRevision(value => value + 1); };
  const date = (value: string) => new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const metrics = snapshot && [
    [t("operations.avatar"), snapshot.connected_by_mode.topic_discussion],
    [t("operations.cartoon"), snapshot.connected_by_mode.voice_practice],
    [t("operations.connecting"), snapshot.connecting],
    [t("operations.disconnected"), snapshot.disconnected],
    [t("operations.failures"), snapshot.connection_failures_24h],
    [t("operations.ended"), snapshot.ended_24h],
    [t("operations.handoffs"), snapshot.handoffs_24h],
  ] as const;

  return <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">{t("operations.title")}</h1><p className="mt-2 text-sm text-muted">{t("operations.description")}</p></div>
      <button type="button" onClick={refresh} disabled={loading} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue disabled:opacity-50">{t("operations.refresh")}</button>
    </header>
    {snapshot && <p className="mt-3 text-xs text-muted">{t("operations.observedAt", { time: date(snapshot.generated_at) })}</p>}
    {error && <div role="alert" className="mt-5 rounded-xl border border-line bg-card p-4 text-sm">{t("operations.loadError")}</div>}
    {loading && !snapshot && <p role="status" className="mt-5 text-sm text-muted">{t("common.loading")}</p>}
    {metrics && <>
      <section aria-label={t("operations.title")} className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, count]) => <article key={label} className="rounded-2xl border border-line bg-card p-5 shadow-card"><p className="text-sm text-muted">{label}</p><strong className="mt-2 block text-3xl text-brand-blue">{count}</strong></article>)}
      </section>
      <p className="mt-4 text-xs text-muted">{t("operations.sourceNote")}</p>
      <section className="mt-6 rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-bold">{t("operations.recent")}</h2>
        {snapshot!.recent_sessions.length === 0 ? <p className="mt-4 text-sm text-muted">{t("operations.noSessions")}</p> :
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-start text-sm"><thead><tr className="border-b border-line text-muted"><th className="py-2 text-start">ID</th><th className="text-start">{t("operations.mode")}</th><th className="text-start">{t("operations.state")}</th><th className="text-start">{t("operations.started")}</th><th className="text-start">{t("operations.outcome")}</th></tr></thead><tbody>
            {snapshot!.recent_sessions.map(session => <tr key={session.id} className="border-b border-line"><td className="py-3 font-mono text-xs" title={session.id}>{session.id.slice(0, 8)}</td><td>{session.mode === "topic_discussion" ? t("operations.avatarMode") : t("operations.cartoonMode")}</td><td>{t(`operations.states.${session.state}` as MessageKey)}</td><td>{date(session.started_at)}</td><td>{session.end_reason ? t(`operations.reasons.${session.end_reason}` as MessageKey) : "—"}</td></tr>)}
          </tbody></table></div>}
      </section>
      <p className="mt-4 text-xs text-muted">{t("operations.pendingSignals")}</p>
    </>}
  </main>;
}
