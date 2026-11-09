"use client";

import { useEffect, useState } from "react";
import { ApiError, programsApi } from "@/lib/api/client";
import type { ProgramPublic, ProgramTopicPublic, ProgramTopicStatus, TopicListItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Displays the lessons available to this Program.  Batch dates, teaching
 * team and students are deliberately managed from the Batch workspace. */
export function ProgramTopicManager({ program, topics, canManage }: { program: ProgramPublic; topics: TopicListItem[]; canManage: boolean }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ProgramTopicPublic[]>([]);
  const [topicId, setTopicId] = useState("");
  const [programLevelId, setProgramLevelId] = useState(program.levels[0]?.id ?? "");
  const [status, setStatus] = useState<ProgramTopicStatus>("draft");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => setItems(await programsApi.listTopics(program.id));
  useEffect(() => {
    let active = true;
    programsApi.listTopics(program.id).then(values => { if (active) setItems(values); }).catch(() => { if (active) setError("Could not load this program's topics."); });
    return () => { active = false; };
  }, [program.id]);
  const available = topics.filter(topic => !items.some(item => item.topic_id === topic.id));

  const add = async () => {
    if (!topicId) return;
    setSaving(true); setError("");
    try { await programsApi.assignTopic(program.id, { topic_id: topicId, program_level_id: programLevelId, status }); setTopicId(""); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not add the Topic."); }
    finally { setSaving(false); }
  };
  const save = async (item: ProgramTopicPublic) => {
    setSaving(true); setError("");
    try { await programsApi.updateTopic(program.id, item.topic_id, { program_level_id: item.program_level_id, status: item.status }); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not update the Topic placement."); }
    finally { setSaving(false); }
  };

  return <section className="grid gap-4">
    <div><h2 className="text-lg font-bold">Lessons in this program</h2><p className="mt-1 text-sm text-muted">These are the lessons a Batch can teach. Open a Batch to choose dates, teachers, students and the weekly schedule.</p></div>
    <div className="grid gap-3">
      {program.levels.map(stage => {
        const stageItems = items.filter(item => item.program_level_id === stage.id);
        return <article key={stage.id} className="rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{stage.name}</h3><span className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-bold text-brand-blue">{stageItems.length}</span></div>
          {stageItems.length === 0 ? <p className="mt-3 text-sm text-muted">{t("programWorkspace.noTopicsAtLevel")}</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {stageItems.map(item => <li key={item.id} className="rounded-xl border border-line bg-bg px-3 py-2 text-sm"><b>{item.topic_title}</b><span className="ms-2 text-xs text-muted">{item.status === "published" ? "Published" : "Draft"}</span></li>)}
          </ul>}
        </article>;
      })}
    </div>
    {canManage && <details className="rounded-2xl border border-line bg-card p-4">
      <summary className="cursor-pointer text-sm font-bold text-brand-blue">Add or organize lessons</summary>
      <div className="mt-4 grid gap-3 border-t border-line pt-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={topicId} onChange={e => setTopicId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm"><option value="">Choose a lesson from the Topic Library…</option>{available.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select>
          <select value={programLevelId} onChange={e => setProgramLevelId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm">{program.levels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <label className="grid gap-1 text-xs font-bold">Publication<select value={status} onChange={e => setStatus(e.target.value as ProgramTopicStatus)} className="min-h-11 rounded-lg border border-line bg-card px-2 font-normal"><option value="draft">Draft</option><option value="published">Published</option></select></label>
        </div>
        <button type="button" disabled={!topicId || saving} onClick={add} className="min-h-11 w-fit rounded-lg bg-brand-blue px-3 text-sm font-bold text-white disabled:opacity-40">Add lesson to this program</button>
        {items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-line bg-bg p-3"><b className="text-sm">{item.topic_title}</b><div className="grid grid-cols-2 gap-2"><select value={item.program_level_id ?? ""} onChange={e => setItems(current => current.map((value, i) => i === index ? { ...value, program_level_id: e.target.value } : value))} className="min-h-10 rounded-lg border border-line bg-card px-2 text-xs">{program.levels.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select><select value={item.status} onChange={e => setItems(current => current.map((value, i) => i === index ? { ...value, status: e.target.value as ProgramTopicStatus } : value))} className="min-h-10 rounded-lg border border-line bg-card px-2 text-xs"><option value="draft">Draft</option><option value="published">Published</option></select></div><div className="flex gap-3"><button type="button" disabled={saving} onClick={() => save(item)} className="min-h-10 text-sm font-bold text-brand-blue">Save placement</button><button type="button" disabled={saving} onClick={async () => { await programsApi.removeTopic(program.id, item.topic_id); await load(); }} className="min-h-10 text-sm font-bold text-brand-coral">Remove from Program</button></div></div>)}
      </div>
    </details>}
    {error && <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale p-2 text-xs text-brand-coral">{error}</p>}
  </section>;
}
