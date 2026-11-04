"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { homeworkApi } from "@/lib/api/client";
import type { HomeworkPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function StudentHomeworkPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<HomeworkPublic[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { homeworkApi.listMine().then(setItems).catch(() => { setItems([]); setFailed(true); }); }, []);
  const [now] = useState(() => Date.now());
  return <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
    <header><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("homework.studentEyebrow")}</p><h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{t("homework.title")}</h1><p className="mt-2 text-sm text-muted">{t("homework.studentDesc")}</p></header>
    {items === null && <p className="mt-6 text-sm text-muted">{t("common.loading")}</p>}
    {failed && <p role="alert" className="mt-6 rounded-xl bg-brand-coral-pale p-4 text-sm text-brand-coral">{t("homework.loadFailed")}</p>}
    {items?.length === 0 && !failed && <p className="mt-6 rounded-2xl border border-line bg-card p-5 text-sm text-muted">{t("homework.emptyStudent")}</p>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{items?.map(item => {
      const overdue = Date.parse(item.due_at) < now;
      return <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${overdue ? "bg-brand-coral-pale text-brand-coral" : "bg-brand-primary-pale text-brand-blue"}`}>{overdue ? t("homework.overdue") : t("homework.due", { date: new Date(item.due_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}</span><span className="text-xs font-bold uppercase text-muted">{t(`homework.kind.${item.kind}`)}</span></div>
        <h2 className="mt-4 text-lg font-bold text-ink">{item.title}</h2>{item.topic_title && <p className="mt-1 text-sm text-brand-blue">{item.topic_title}</p>}<p className="mt-3 flex-1 whitespace-pre-wrap text-sm text-muted">{item.instructions}</p>
        {item.topic_id && <Link href={`/student/lessons/${item.topic_id}`} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">{t("homework.openLesson")}</Link>}
        {item.external_url && <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">{t("homework.openLink")}</a>}
      </article>;
    })}</div>
  </main>;
}
