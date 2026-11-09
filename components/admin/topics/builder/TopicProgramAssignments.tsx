"use client";

import { useEffect, useState } from "react";
import { ApiError, programsApi } from "@/lib/api/client";
import type { ProgramPublic, ProgramTopicPublic, ProgramTopicStatus } from "@/lib/api/types";

export function TopicProgramAssignments({ topicId }: { topicId: string }) {
  const [programs, setPrograms] = useState<ProgramPublic[]>([]);
  const [items, setItems] = useState<ProgramTopicPublic[]>([]);
  const [programId, setProgramId] = useState("");
  const [programLevelId, setProgramLevelId] = useState("");
  const [status, setStatus] = useState<ProgramTopicStatus>("draft");
  const [error, setError] = useState("");
  const load = async () => { const [programList, assignments] = await Promise.all([programsApi.list(), programsApi.assignmentsForTopic(topicId)]); setPrograms(programList); setItems(assignments); };
  useEffect(() => {
    let active = true;
    Promise.all([programsApi.list(), programsApi.assignmentsForTopic(topicId)])
      .then(([programList, assignments]) => { if (active) { setPrograms(programList); setItems(assignments); } })
      .catch(() => { if (active) setError("Could not load program assignments."); });
    return () => { active = false; };
  }, [topicId]);
  const selected = programs.find(program => program.id === programId);

  return <section className="mt-5 rounded-2xl border border-line bg-card p-4">
    <h3 className="text-base font-bold">Programs</h3><p className="mt-1 text-xs text-muted">The Topic content stays shared. These placement settings belong only to each selected Program.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <select value={programId} onChange={e => { setProgramId(e.target.value); const program = programs.find(value => value.id === e.target.value); setProgramLevelId(program?.levels[0]?.id ?? ""); }} className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm"><option value="">Choose a program…</option>{programs.filter(program => !items.some(item => item.program_id === program.id)).map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select>
      <select value={programLevelId} onChange={e => setProgramLevelId(e.target.value)} disabled={!selected} className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm">{(selected?.levels ?? []).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select>
      <select value={status} onChange={e => setStatus(e.target.value as ProgramTopicStatus)} className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm"><option value="draft">Draft</option><option value="published">Published</option></select>
    </div>
    <button type="button" disabled={!programId || !programLevelId} onClick={async () => { try { await programsApi.assignTopic(programId, { topic_id: topicId, program_level_id: programLevelId, status }); setProgramId(""); await load(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not assign the program."); } }} className="mt-3 min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">Assign to program</button>
    <div className="mt-3 grid gap-2">{items.map(item => { const program = programs.find(value => value.id === item.program_id); const stage = program?.levels.find(value => value.id === item.program_level_id); return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg p-3 text-sm"><span><b>{program?.name ?? "Program"}</b> · {stage?.name ?? "Legacy level"} · {item.status}</span><button type="button" onClick={async () => { await programsApi.removeTopic(item.program_id, topicId); await load(); }} className="min-h-10 font-bold text-brand-coral">Remove</button></div>; })}</div>
    {items.some(item => item.status === "published") && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Published students stay on the pinned revision. Edit safely, then publish again when the new revision is ready.</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-brand-coral-pale p-2 text-xs text-brand-coral">{error}</p>}
  </section>;
}
