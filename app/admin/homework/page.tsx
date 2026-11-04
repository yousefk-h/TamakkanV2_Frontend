"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, homeworkApi } from "@/lib/api/client";
import type { HomeworkKind, HomeworkPublic, Level, PlanType } from "@/lib/api/types";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function AdminHomeworkPage() {
  const { t, locale } = useI18n();
  const { students } = useStudentsContext();
  const { topics } = useTopicsContext();
  const [items, setItems] = useState<HomeworkPublic[] | null>(null);
  const [kind, setKind] = useState<HomeworkKind>("lesson");
  const [audienceMode, setAudienceMode] = useState<"program" | "level" | "students">("program");
  const [program, setProgram] = useState<PlanType>("standard");
  const [level, setLevel] = useState<Level>("beginner");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try { setItems(await homeworkApi.listForStaff()); }
    catch { setError(t("homework.loadFailed")); }
  }, [t]);
  // Initial API synchronization; state updates happen after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const roster = useMemo(() => students ?? [], [students]);
  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase();
    return query ? roster.filter(student => `${student.full_name} ${student.email}`.toLocaleLowerCase().includes(query)) : roster;
  }, [roster, studentSearch]);
  const recipientIds = useMemo(() => {
    if (audienceMode === "program") return roster.filter(student => student.plan === program).map(student => student.id);
    if (audienceMode === "level") return roster.filter(student => student.assigned_level === level).map(student => student.id);
    return selectedStudents;
  }, [audienceMode, roster, program, level, selectedStudents]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      await homeworkApi.create({ title: String(data.get("title")), instructions: String(data.get("instructions")), kind, due_at: new Date(String(data.get("due_at"))).toISOString(), participant_ids: recipientIds, topic_id: kind === "lesson" ? String(data.get("topic_id")) : undefined, external_url: kind === "link" ? String(data.get("external_url")) : undefined });
      event.currentTarget.reset(); setSelectedStudents([]); setKind("lesson"); await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("homework.saveFailed")); }
    finally { setSaving(false); }
  };
  return <main className="mx-auto max-w-[1200px] px-4 py-7 md:px-7">
    <header><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("homework.teacherEyebrow")}</p><h1 className="mt-2 text-2xl font-bold">{t("homework.title")}</h1><p className="mt-2 text-sm text-muted">{t("homework.teacherDesc")}</p></header>
    <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-line bg-card p-5 shadow-card md:grid-cols-2">
      <label className="text-sm font-bold">{t("homework.assignmentTitle")}<input required name="title" maxLength={200} className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal" /></label>
      <label className="text-sm font-bold">{t("homework.type")}<select value={kind} onChange={e => setKind(e.target.value as HomeworkKind)} className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal">{(["lesson", "writing", "audio", "link"] as const).map(value => <option key={value} value={value}>{t(`homework.kind.${value}`)}</option>)}</select></label>
      {kind === "lesson" && <label className="text-sm font-bold">{t("homework.lesson")}<select required name="topic_id" className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal"><option value="">{t("homework.chooseLesson")}</option>{topics?.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>}
      {kind === "link" && <label className="text-sm font-bold">{t("homework.link")}<input required name="external_url" type="url" placeholder="https://" className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal" /></label>}
      <label className="text-sm font-bold">{t("homework.dueDate")}<input required name="due_at" type="datetime-local" className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-bg px-3 font-normal" /></label>
      <label className="text-sm font-bold md:col-span-2">{t("homework.instructions")}<textarea name="instructions" rows={3} maxLength={5000} className="mt-1 block w-full rounded-xl border border-line bg-bg p-3 font-normal" /></label>
      <fieldset className="md:col-span-2">
        <legend className="text-sm font-bold">{t("homework.recipients")}</legend>
        <p className="mt-1 text-xs text-muted">{t("homework.recipientsHelp")}</p>
        <div className="mt-3 grid grid-cols-3 rounded-xl bg-bg p-1" role="group" aria-label={t("homework.recipients")}>
          {(["program", "level", "students"] as const).map(mode => <button key={mode} type="button" onClick={() => setAudienceMode(mode)} className={`min-h-11 rounded-lg px-2 text-xs font-bold sm:text-sm ${audienceMode === mode ? "bg-card text-brand-blue shadow-sm" : "text-muted"}`}>{t(`homework.audience.${mode}`)}</button>)}
        </div>
        <div className="mt-3 rounded-xl border border-line p-3">
          {audienceMode === "program" && <label className="grid gap-1.5 text-sm font-bold">{t("homework.chooseProgram")}<select value={program} onChange={e => setProgram(e.target.value as PlanType)} className="min-h-11 rounded-xl border border-line bg-bg px-3 font-normal"><option value="standard">{t("shared.planStandard")}</option><option value="pro">{t("shared.planPro")}</option></select></label>}
          {audienceMode === "level" && <label className="grid gap-1.5 text-sm font-bold">{t("homework.chooseLevel")}<select value={level} onChange={e => setLevel(e.target.value as Level)} className="min-h-11 rounded-xl border border-line bg-bg px-3 font-normal"><option value="beginner">{t("homework.levelBeginner")}</option><option value="intermediate">{t("homework.levelIntermediate")}</option><option value="advanced">{t("homework.levelAdvanced")}</option></select></label>}
          {audienceMode === "students" && <>
            <div className="flex flex-wrap gap-2"><input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder={t("homework.searchStudents")} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm" /><button type="button" onClick={() => setSelectedStudents(Array.from(new Set([...selectedStudents, ...visibleStudents.map(student => student.id)])))} className="min-h-11 rounded-xl border border-line px-3 text-xs font-bold">{t("homework.selectVisible")}</button><button type="button" onClick={() => setSelectedStudents([])} className="min-h-11 px-3 text-xs font-bold text-brand-coral">{t("homework.clear")}</button></div>
            <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{visibleStudents.map(student => <label key={student.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-bg px-3 text-sm"><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={e => setSelectedStudents(current => e.target.checked ? Array.from(new Set([...current, student.id])) : current.filter(id => id !== student.id))} /><span className="min-w-0"><b className="block truncate font-medium">{student.full_name}</b><small className="block truncate text-muted">{student.email}</small></span></label>)}</div>
          </>}
          <div className={`mt-3 rounded-xl p-3 text-sm font-bold ${recipientIds.length ? "bg-brand-primary-pale text-brand-blue" : "bg-brand-coral-pale text-brand-coral"}`}>{recipientIds.length ? t("homework.recipientCount", { count: recipientIds.length }) : t("homework.noRecipients")}</div>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-brand-coral md:col-span-2">{error}</p>}
      <button disabled={saving || recipientIds.length === 0} className="min-h-12 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-40 md:col-span-2">{saving ? t("common.loading") : t("homework.assign")}</button>
    </form>
    <section className="mt-8"><h2 className="text-xl font-bold">{t("homework.assigned")}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items?.map(item => <article key={item.id} className="rounded-2xl border border-line bg-card p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-brand-blue">{t(`homework.kind.${item.kind}`)}</span><span className="text-xs text-muted">{new Date(item.due_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</span></div><h3 className="mt-3 font-bold">{item.title}</h3><p className="mt-2 text-sm text-muted">{t("homework.assignedCount", { count: item.participant_ids.length })}</p><button type="button" onClick={() => void homeworkApi.cancel(item.id).then(load)} className="mt-3 min-h-11 text-sm font-bold text-brand-coral">{t("homework.cancel")}</button></article>)}</div></section>
  </main>;
}
