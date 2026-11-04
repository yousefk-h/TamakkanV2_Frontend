"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, exerciseAttemptsApi } from "@/lib/api/client";
import type { ExerciseAttemptPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const PAGE_SIZE = 30;

export default function ExerciseReviewPage() {
  const { t, locale } = useI18n();
  const [pendingOnly, setPendingOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState<ExerciseAttemptPublic[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    exerciseAttemptsApi.reviewQueue({ pending_only: pendingOnly, limit: PAGE_SIZE, skip: page * PAGE_SIZE })
      .then(result => { if (active) { setItems(result); setLoadError(null); } })
      .catch(error => { if (active) { setItems([]); setLoadError(error instanceof ApiError ? error.message : t("exerciseReview.loadError")); } });
    return () => { active = false; };
  }, [pendingOnly, page, reload, t]);

  const submitReview = async (event: FormEvent<HTMLFormElement>, attempt: ExerciseAttemptPublic) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const score = Number(data.get("score"));
    const feedback = String(data.get("feedback") ?? "");
    if (!Number.isInteger(score) || score < 0 || score > 100) { setSaveError(t("exerciseReview.scoreError")); return; }
    setSavingId(attempt.id);
    setSaveError(null);
    try {
      const updated = await exerciseAttemptsApi.review(attempt.id, { score, feedback });
      setItems(current => current?.map(item => item.id === updated.id ? updated : item) ?? []);
      setReload(value => value + 1);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : t("exerciseReview.saveError"));
    } finally {
      setSavingId(null);
    }
  };

  return <main className="mx-auto max-w-[1150px] px-4 py-7 md:px-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("exerciseReview.eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{t("exerciseReview.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{t("exerciseReview.desc")}</p></div>
      <div className="flex gap-2" role="group" aria-label={t("exerciseReview.filterLabel")}>
        <button type="button" aria-pressed={pendingOnly} onClick={() => { setPendingOnly(true); setPage(0); setItems(null); }} className={`min-h-11 rounded-lg px-4 text-sm font-bold ${pendingOnly ? "bg-brand-blue text-white" : "border border-line bg-card text-brand-blue"}`}>{t("exerciseReview.pending")}</button>
        <button type="button" aria-pressed={!pendingOnly} onClick={() => { setPendingOnly(false); setPage(0); setItems(null); }} className={`min-h-11 rounded-lg px-4 text-sm font-bold ${!pendingOnly ? "bg-brand-blue text-white" : "border border-line bg-card text-brand-blue"}`}>{t("exerciseReview.all")}</button>
      </div>
    </header>
    {loadError && <p role="alert" className="mt-5 rounded-lg bg-brand-coral-pale p-3 text-sm text-brand-coral">{loadError}</p>}
    {saveError && <p role="alert" className="mt-5 rounded-lg bg-brand-coral-pale p-3 text-sm text-brand-coral">{saveError}</p>}
    {items === null && <p role="status" className="mt-6 text-sm text-muted">{t("common.loading")}</p>}
    {items?.length === 0 && !loadError && <p className="mt-6 rounded-xl border border-line bg-card p-5 text-sm text-muted">{pendingOnly ? t("exerciseReview.emptyPending") : t("exerciseReview.emptyAll")}</p>}
    <div className="mt-6 space-y-4">{items?.map(attempt => <article key={attempt.id} className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><b className="text-base text-ink">{attempt.student_name}</b><p className="mt-1 text-sm text-muted">{attempt.topic_title} · {attempt.exercise_kind.replaceAll("_", " ")} · {new Date(attempt.created_at).toLocaleString(locale)}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${attempt.reviewed ? "bg-green-100 text-green-800" : "bg-brand-primary-pale text-brand-blue"}`}>{attempt.reviewed ? t("exerciseReview.reviewed") : t("exerciseReview.needsReview")}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-bg p-4"><p className="mb-1 text-xs font-bold text-muted">{t("exerciseReview.question")}</p><p className="m-0 whitespace-pre-wrap text-sm text-ink">{attempt.exercise_prompt}</p></div>
        <div className="rounded-xl bg-bg p-4"><p className="mb-1 text-xs font-bold text-muted">{t("exerciseReview.answer")}</p><p className="m-0 whitespace-pre-wrap text-sm text-ink">{attempt.answer_display}</p></div>
      </div>
      {attempt.correct !== null && <p className="mt-3 text-xs text-muted">{attempt.correct ? t("exerciseReview.autoCorrect") : t("exerciseReview.autoIncorrect")}</p>}
      <form key={`${attempt.id}:${attempt.updated_at}`} onSubmit={event => void submitReview(event, attempt)} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <label className="text-sm font-semibold text-ink">{t("exerciseReview.score")}
          <input name="score" type="number" min={0} max={100} required defaultValue={attempt.score ?? ""} className="mt-1 block min-h-11 w-24 rounded-lg border border-line bg-bg px-3 font-normal" />
        </label>
        <label className="min-w-[220px] flex-1 text-sm font-semibold text-ink">{t("exerciseReview.feedback")}
          <input name="feedback" maxLength={2000} defaultValue={attempt.feedback} placeholder={t("exerciseReview.feedbackPlaceholder")} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-bg px-3 font-normal" />
        </label>
        <button type="submit" disabled={savingId === attempt.id} className="min-h-11 rounded-lg bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-50">{savingId === attempt.id ? t("common.loading") : t("exerciseReview.saveReview")}</button>
      </form>
      <Link href={`/admin/students/${attempt.student_id}`} className="mt-3 inline-block text-xs font-semibold text-brand-blue">{t("exerciseReview.openStudent")}</Link>
    </article>)}</div>
    {items && <div className="mt-6 flex items-center justify-between gap-3">
      <button type="button" disabled={page === 0} onClick={() => { setPage(value => value - 1); setItems(null); }} className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm disabled:opacity-40">{t("exerciseReview.previous")}</button>
      <span className="text-sm text-muted">{t("exerciseReview.page", { page: page + 1 })}</span>
      <button type="button" disabled={items.length < PAGE_SIZE} onClick={() => { setPage(value => value + 1); setItems(null); }} className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm disabled:opacity-40">{t("exerciseReview.next")}</button>
    </div>}
  </main>;
}
