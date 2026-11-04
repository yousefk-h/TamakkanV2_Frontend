"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, levelProfilesApi } from "@/lib/api/client";
import type { Level, LevelProfilePublic } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { LEVEL_LABEL, LEVEL_ORDER } from "@/lib/topics/helpers";

export default function LevelsPage() {
  const { state } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<LevelProfilePublic[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [baseLevel, setBaseLevel] = useState<Level>("beginner");
  const [guidance, setGuidance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await levelProfilesApi.list()); }
    catch (err) { setError(err instanceof ApiError ? err.message : t("levels.loadError")); }
  }, [t]);

  useEffect(() => {
    if (state.status === "authenticated" && state.user.role !== "administrator") router.replace("/admin");
  }, [state, router]);
  // Initial API synchronization; state updates happen after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (state.status === "authenticated" && state.user.role === "administrator") void load(); }, [state, load]);

  if (state.status !== "authenticated" || state.user.role !== "administrator") return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      await levelProfilesApi.create({ code: code.trim().toLowerCase(), name: name.trim(), base_level: baseLevel, avatar_guidance: guidance.trim(), order_index: items.length });
      setName(""); setCode(""); setGuidance(""); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : t("levels.saveError")); }
    finally { setSaving(false); }
  };

  return <main className="mx-auto w-full max-w-6xl p-4 pb-28 md:p-8 lg:pb-8">
    <header className="mb-6"><h1 className="text-2xl font-bold text-ink md:text-3xl">{t("levels.title")}</h1><p className="mt-1 text-sm text-muted">{t("levels.description")}</p></header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={submit} className="grid h-fit gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold text-ink">{t("levels.add")}</h2>
        <label className="grid gap-1.5 text-sm font-bold">{t("levels.name")}<input required minLength={2} value={name} onChange={e => setName(e.target.value)} className="min-h-11 rounded-xl border border-line px-3" /></label>
        <label className="grid gap-1.5 text-sm font-bold">{t("levels.code")}<input required minLength={2} pattern="[a-z0-9][a-z0-9_-]*" value={code} onChange={e => setCode(e.target.value.replace(/\s+/g, "-"))} placeholder="pre-a1" className="min-h-11 rounded-xl border border-line px-3" /></label>
        <label className="grid gap-1.5 text-sm font-bold">{t("levels.base")}<select value={baseLevel} onChange={e => setBaseLevel(e.target.value as Level)} className="min-h-11 rounded-xl border border-line bg-card px-3">{LEVEL_ORDER.map(level => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}</select><small className="font-normal text-muted">{t("levels.baseHelp")}</small></label>
        <label className="grid gap-1.5 text-sm font-bold">{t("levels.guidance")}<textarea required minLength={10} rows={6} value={guidance} onChange={e => setGuidance(e.target.value)} placeholder={t("levels.guidancePlaceholder")} className="rounded-xl border border-line p-3" /><small className="font-normal text-muted">{t("levels.guidanceHelp")}</small></label>
        {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
        <button disabled={saving} className="min-h-11 rounded-xl bg-brand-blue px-4 font-bold text-white disabled:opacity-50">{saving ? t("common.saving") : t("levels.create")}</button>
      </form>
      <section className="space-y-3">
        {items.length === 0 ? <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("levels.empty")}</p> : items.map(item => <article key={item.id} className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-ink">{item.name}</h2><p className="text-xs text-muted">{item.code} · {t("levels.mappedTo", { level: LEVEL_LABEL[item.base_level] })}</p></div><button onClick={async () => { await levelProfilesApi.archive(item.id); await load(); }} className="min-h-11 rounded-xl border border-brand-coral px-3 text-sm font-bold text-brand-coral">{t("levels.archive")}</button></div>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-bg p-3 text-sm text-ink">{item.avatar_guidance}</p>
        </article>)}
      </section>
    </div>
  </main>;
}
