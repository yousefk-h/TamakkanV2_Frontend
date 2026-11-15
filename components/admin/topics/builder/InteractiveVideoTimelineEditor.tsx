"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, topicsApi } from "@/lib/api/client";
import type { InteractiveVideoCheckpoint, LessonExercise, TranscriptSegment, TranscriptState } from "@/lib/api/types";

const SUPPORTED = new Set<LessonExercise["kind"]>(["multiple_choice", "image_completion", "listening", "grammar", "reading", "game", "writing", "reflection", "word_order", "error_correction", "dialogue_completion"]);

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  const seconds = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

function checkpoint(exerciseIndex: number, timestampSeconds: number): InteractiveVideoCheckpoint {
  return { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, timestamp_seconds: Math.round(timestampSeconds * 10) / 10, kind: "exercise", exercise_index: exerciseIndex, completion_rule: "submitted" };
}

/** A Practice with Mariam marker needs both of these authored before it can be saved - mirrors the existing
 * exercise path's own implicit rule (an exercise checkpoint always already points at a real exercise_index; this is
 * just this kind's equivalent "must point at something real" check). */
function practiceInvalid(item: InteractiveVideoCheckpoint) {
  return (item.kind ?? "exercise") === "practice_with_mariam" && (!item.conversation_goal?.trim() || !item.opening_line?.trim());
}

export function InteractiveVideoTimelineEditor({
  topicId, uploadedVideoUrl, exercises, checkpoints, transcriptSegments, transcriptState, enabled, onSaved, onDirtyChange,
}: {
  topicId: string;
  uploadedVideoUrl: string | null;
  exercises: LessonExercise[];
  checkpoints: InteractiveVideoCheckpoint[];
  transcriptSegments: TranscriptSegment[];
  transcriptState: TranscriptState | null;
  enabled: boolean;
  onSaved: (checkpoints: InteractiveVideoCheckpoint[]) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Fix 4: the native <video> had no loading/error UI at all - a 404'd or
  // otherwise failed source just silently showed a bare background. Tracks
  // the real media lifecycle (not a CSS/sizing concern - that part was
  // already correct) so a failure gets a clear message and a working retry.
  const [videoLoadState, setVideoLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [videoRetryKey, setVideoRetryKey] = useState(0);
  const retryVideo = () => {
    setVideoLoadState("loading");
    setVideoRetryKey(key => key + 1);
    videoRef.current?.load();
  };
  // A new/changed source URL (new upload, or switching topics) starts its own
  // fresh load/error lifecycle - never keep showing a stale error/loading
  // state from a previous video.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setVideoLoadState("loading"); }, [uploadedVideoUrl]);
  const [items, setItems] = useState(checkpoints);
  const [selectedId, setSelectedId] = useState<string | null>(checkpoints[0]?.id ?? null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "Convert to Practice with Mariam": a lightweight inline form over an existing exercise-pointing checkpoint,
  // pre-filled with sensible defaults, calling the dedicated convert endpoint rather than folding into the general
  // kind switch below (switching kind on an AI-suggested exercise checkpoint client-side would silently discard the
  // exercise it pointed at with no server record of the conversion).
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertDraft, setConvertDraft] = useState({ learning_objective: "", conversation_goal: "", opening_line: "", session_duration_minutes: 2 });
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // The persisted parent timeline can change after a save/refetch. Reset this
  // local editor draft deliberately; it is not an external subscription.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setItems(checkpoints); setSelectedId(current => checkpoints.some(item => item.id === current) ? current : checkpoints[0]?.id ?? null); setSaved(true); onDirtyChange(false); }, [checkpoints, onDirtyChange]);
  const eligibleExercises = useMemo(() => exercises.map((exercise, index) => ({ exercise, index })).filter(({ exercise }) => SUPPORTED.has(exercise.kind)), [exercises]);
  const eligibleIndexSet = useMemo(() => new Set(eligibleExercises.map(({ index }) => index)), [eligibleExercises]);
  // Fix 2: an "exercise" checkpoint whose exercise_index now points at a
  // deleted/incompatible activity (e.g. an exercise kind change, or a delete
  // elsewhere left it stale) - flagged inline instead of hiding the whole
  // Studio UI behind one generic banner.
  const isOrphanedCheckpoint = (item: InteractiveVideoCheckpoint) =>
    (item.kind ?? "exercise") === "exercise" && (item.exercise_index === undefined || !eligibleIndexSet.has(item.exercise_index));
  const selectedIndex = items.findIndex(item => item.id === selectedId);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;
  const sorted = [...items].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
  // Some Cloudinary delivery URLs expose an infinite media duration until
  // enough bytes are buffered. Never let that leak into the authoring UI as
  // Infinity:NaN:NaN. The approved timestamped transcript gives a safe
  // display fallback; saving still relies on the server-side timeline rules.
  const transcriptEnd = transcriptSegments.reduce((latest, segment) => Math.max(latest, segment.start + segment.duration), 0);
  const checkpointEnd = items.reduce((latest, item) => Math.max(latest, item.timestamp_seconds), 0);
  const timelineDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : Math.max(transcriptEnd, checkpointEnd, currentTime, 1);
  const hasMediaDuration = Number.isFinite(duration) && duration > 0;

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(timelineDuration || time, time));
    setCurrentTime(video.currentTime);
  };
  const change = (id: string, patch: Partial<InteractiveVideoCheckpoint>) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    setSaved(false); onDirtyChange(true); setError(null);
  };
  const addAtPlayhead = () => {
    const first = eligibleExercises.find(({ index }) => !items.some(item => item.exercise_index === index));
    if (!first) { setError("Every compatible exercise is already attached. Create another exercise to add a new checkpoint."); return; }
    const created = checkpoint(first.index, currentTime);
    setItems(current => [...current, created].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    setSelectedId(created.id); setSaved(false); onDirtyChange(true); setError(null);
  };
  const remove = () => {
    if (!selected) return;
    setItems(current => current.filter(item => item.id !== selected.id));
    setSelectedId(null); setSaved(false); onDirtyChange(true);
  };
  const invalidPractice = items.some(practiceInvalid);
  const startConvert = (item: InteractiveVideoCheckpoint) => {
    setConvertingId(item.id);
    setConvertError(null);
    setConvertDraft({ learning_objective: item.learning_objective ?? "", conversation_goal: item.conversation_goal ?? "", opening_line: item.opening_line ?? "", session_duration_minutes: item.session_duration_minutes ?? 2 });
  };
  const confirmConvert = async () => {
    if (!selected || !convertingId) return;
    if (!convertDraft.conversation_goal.trim() || !convertDraft.opening_line.trim()) { setConvertError("A conversation goal and an opening line are required."); return; }
    setConverting(true); setConvertError(null);
    try {
      const updated = await topicsApi.convertCheckpointToPractice(topicId, convertingId, convertDraft);
      setItems(updated.interactive_video_checkpoints);
      setConvertingId(null);
      onSaved(updated.interactive_video_checkpoints); setSaved(true); onDirtyChange(false);
    } catch (err) { setConvertError(err instanceof ApiError ? err.message : "This checkpoint could not be converted."); }
    finally { setConverting(false); }
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const ordered = [...items].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
      const updated = await topicsApi.updateInteractiveVideoTimeline(topicId, ordered);
      setItems(updated.interactive_video_checkpoints); setSelectedId(updated.interactive_video_checkpoints[0]?.id ?? null);
      onSaved(updated.interactive_video_checkpoints); setSaved(true); onDirtyChange(false);
    } catch (err) { setError(err instanceof ApiError ? err.message : "The video timeline could not be saved."); }
    finally { setSaving(false); }
  };
  const handleTime = () => {
    const video = videoRef.current; if (!video) return;
    setCurrentTime(video.currentTime);
  };
  const activeSegment = transcriptSegments.findIndex(segment => currentTime >= segment.start && currentTime <= segment.start + segment.duration);

  if (!enabled) return <div className="rounded-2xl border border-brand-blue/30 bg-brand-primary-pale p-5 text-sm text-ink">Save the Interactive Video flow choice first. Your draft exercises stay untouched.</div>;
  if (!uploadedVideoUrl) return <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><b>Add a video to start editing.</b><p className="mt-1">Interactive playback needs a teacher-uploaded video. YouTube can remain a lesson source, but controllable YouTube checkpoints are not available yet.</p></div>;
  // Fix 2: only collapse to the generic banner when there is truly nothing to
  // show - no compatible exercise to attach a NEW checkpoint to, AND no
  // existing checkpoints at all. An orphaned checkpoint (one that used to
  // point at a now-deleted/incompatible exercise) still gets shown below,
  // clearly flagged, instead of being hidden behind this banner.
  if (!eligibleExercises.length && !items.length) return <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><b>Create a compatible exercise above first.</b><p className="mt-1">Interactive activities are authored in this Video Studio and each checkpoint reuses one answerable activity.</p></div>;

  return <section className="mx-auto max-w-[1240px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-extrabold text-ink">Place the pauses</h3><p className="mt-1 max-w-2xl text-sm text-muted">Click a point on the video timeline to adjust it. The student experience is previewed separately, so this screen stays for authoring.</p></div><div className={`rounded-full px-3 py-2 text-sm font-bold ${saving ? "bg-brand-primary-pale text-brand-blue" : saved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{saving ? "Saving…" : saved ? "Saved" : "Unsaved changes"}</div></header>
    <div className="min-w-0 space-y-4">
        {!eligibleExercises.length && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><b>No compatible activities available.</b><p className="mt-1">Create a compatible exercise above to add a new checkpoint. Existing checkpoints are still shown below.</p></div>}
        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-brand-navy shadow-card">
          <video key={videoRetryKey} ref={videoRef} src={uploadedVideoUrl} controls preload="metadata" className="block aspect-video h-auto w-full max-w-full object-contain" onLoadStart={() => setVideoLoadState("loading")} onCanPlay={() => setVideoLoadState("ready")} onLoadedData={() => setVideoLoadState("ready")} onError={() => setVideoLoadState("error")} onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={handleTime} onSeeking={event => setCurrentTime(event.currentTarget.currentTime)} />
          {videoLoadState === "loading" && <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center bg-brand-navy/70 text-sm font-bold text-white">Loading video…</div>}
          {videoLoadState === "error" && <div role="alert" className="absolute inset-0 grid place-items-center bg-brand-navy/90 p-4 text-center text-sm text-white"><div><p className="font-bold">Video could not be loaded.</p><p className="mt-1 text-white/70">Check the source and try again.</p><button type="button" onClick={retryVideo} className="mt-3 min-h-10 rounded-lg bg-white px-4 text-sm font-bold text-brand-navy">Retry</button></div></div>}
          <div className="flex items-center justify-between bg-brand-navy px-4 py-3 text-sm text-white"><span>{formatTime(currentTime)}</span><span className="text-white/70">{hasMediaDuration ? formatTime(duration) : `Transcript timing: ${formatTime(timelineDuration)}`}</span></div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-extrabold text-ink">Timeline</h4><p className="text-xs text-muted">Click the ruler to seek. Select a marker to edit it.</p></div><button type="button" onClick={addAtPlayhead} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">+ Add checkpoint at {formatTime(currentTime)}</button></div><div className="relative pt-8"><div className="flex justify-between text-xs text-muted">{[0, .25, .5, .75, 1].map(value => <span key={value}>{formatTime(timelineDuration * value)}</span>)}</div><div role="slider" tabIndex={0} aria-label="Video timeline" aria-valuemin={0} aria-valuemax={Math.round(timelineDuration)} aria-valuenow={Math.round(currentTime)} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); seek(((event.clientX - rect.left) / rect.width) * timelineDuration); }} onKeyDown={event => { if (event.key === "ArrowLeft") seek(currentTime - 5); if (event.key === "ArrowRight") seek(currentTime + 5); }} className="relative mt-3 h-14 cursor-pointer rounded-xl bg-brand-primary-pale ring-offset-2 focus:outline-none focus:ring-2 focus:ring-brand-blue"><span className="absolute inset-y-0 w-0.5 bg-brand-coral" style={{ left: `${timelineDuration ? (currentTime / timelineDuration) * 100 : 0}%` }} />{sorted.map((item, index) => <button key={item.id} type="button" aria-label={`Checkpoint ${index + 1} at ${formatTime(item.timestamp_seconds)}${isOrphanedCheckpoint(item) ? " - activity removed" : ""}`} onClick={event => { event.stopPropagation(); setSelectedId(item.id); seek(item.timestamp_seconds); }} className={`absolute top-3 grid size-8 -translate-x-1/2 place-items-center rounded-full border-2 text-xs font-extrabold shadow-sm ${selectedId === item.id ? "border-brand-navy bg-brand-cyan text-white" : isOrphanedCheckpoint(item) ? "border-brand-coral bg-brand-coral-pale text-brand-coral" : "border-brand-blue bg-card text-brand-blue"}`} style={{ left: `${timelineDuration ? Math.min(100, (item.timestamp_seconds / timelineDuration) * 100) : 0}%` }}>{index + 1}</button>)}</div></div>{!items.length && <div className="mt-4 rounded-xl border border-dashed border-brand-blue bg-brand-primary-pale p-5 text-center text-sm text-ink"><b>No checkpoints yet.</b><p className="mt-1 text-muted">Seek to a learning moment and add your first checkpoint.</p></div>}
        {items.some(isOrphanedCheckpoint) && <ul className="mt-4 space-y-1.5">{sorted.map((item, index) => isOrphanedCheckpoint(item) && <li key={item.id} className="rounded-lg border border-brand-coral/40 bg-brand-coral-pale px-3 py-2 text-xs font-bold text-brand-coral">Checkpoint {index + 1} ({formatTime(item.timestamp_seconds)}): This checkpoint&apos;s activity was removed — reassign or delete it.</li>)}</ul>}</div>
        {selected && (() => {
          const kind = selected.kind ?? "exercise";
          const isPractice = kind === "practice_with_mariam";
          return <div className="rounded-2xl border border-brand-blue/30 bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wide text-brand-blue">Selected marker</p><h4 className="text-lg font-extrabold text-ink">Checkpoint {sorted.findIndex(item => item.id === selected.id) + 1} · {formatTime(selected.timestamp_seconds)}</h4></div><button type="button" onClick={remove} className="rounded-lg border border-brand-coral px-3 py-2 text-sm font-bold text-brand-coral">Delete</button></div>
            <div className="mt-4 flex gap-2" role="tablist" aria-label="Checkpoint activity">
              <button type="button" role="tab" aria-selected={!isPractice} onClick={() => change(selected.id, { kind: "exercise", exercise_index: selected.exercise_index ?? eligibleExercises[0]?.index })} className={`min-h-10 rounded-lg px-3 text-sm font-bold ${!isPractice ? "bg-brand-blue text-white" : "border border-line bg-bg text-ink"}`}>Activity</button>
              <button type="button" role="tab" aria-selected={isPractice} onClick={() => change(selected.id, { kind: "practice_with_mariam", exercise_index: undefined, session_duration_minutes: selected.session_duration_minutes ?? 2 })} className={`min-h-10 rounded-lg px-3 text-sm font-bold ${isPractice ? "bg-brand-blue text-white" : "border border-line bg-bg text-ink"}`}>Practice with Mariam</button>
              {!isPractice && <button type="button" onClick={() => startConvert(selected)} className="ml-auto min-h-10 rounded-lg border border-line bg-bg px-3 text-sm font-bold text-brand-blue">Convert to Practice with Mariam…</button>}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-ink">Pause at <input type="range" min="0" max={Math.max(timelineDuration - .1, 0)} step="0.1" value={selected.timestamp_seconds} onChange={event => change(selected.id, { timestamp_seconds: Number(event.target.value) })} className="mt-2 block w-full accent-brand-blue" /><input type="number" min="0" max={timelineDuration || undefined} step="0.1" value={selected.timestamp_seconds} onChange={event => change(selected.id, { timestamp_seconds: Number(event.target.value) })} className="mt-2 min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm" aria-label="Exact checkpoint time in seconds" /><span className="mt-1 block text-xs font-normal text-muted">{formatTime(selected.timestamp_seconds)} · precise seconds</span></label>
              {isPractice ? <>
                <label className="text-sm font-bold text-ink">Session length (minutes)<input type="number" min={1} max={10} step={1} value={selected.session_duration_minutes ?? 2} onChange={event => change(selected.id, { session_duration_minutes: Math.min(10, Math.max(1, Number(event.target.value) || 1)) })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm" /></label>
                <label className="text-sm font-bold text-ink sm:col-span-2">Learning objective <span className="font-normal text-muted">(optional)</span><input type="text" value={selected.learning_objective ?? ""} onChange={event => change(selected.id, { learning_objective: event.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm" placeholder="What should the student practice here?" /></label>
                <label className="text-sm font-bold text-ink sm:col-span-2">Conversation goal<textarea value={selected.conversation_goal ?? ""} onChange={event => change(selected.id, { conversation_goal: event.target.value })} rows={2} className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" placeholder="What should Mariam steer the student toward?" /></label>
                <label className="text-sm font-bold text-ink sm:col-span-2">Opening line<textarea value={selected.opening_line ?? ""} onChange={event => change(selected.id, { opening_line: event.target.value })} rows={2} className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" placeholder="What Mariam says first" /></label>
                {practiceInvalid(selected) && <p role="alert" className="text-xs font-bold text-brand-coral sm:col-span-2">A conversation goal and an opening line are both required.</p>}
              </> : <>
                {isOrphanedCheckpoint(selected) && <p role="alert" className="text-xs font-bold text-brand-coral sm:col-span-2">This checkpoint&apos;s activity was removed — reassign or delete it.</p>}
                <label className="text-sm font-bold text-ink">Required activity{eligibleExercises.length
                  ? <select value={eligibleIndexSet.has(selected.exercise_index ?? -1) ? selected.exercise_index : ""} onChange={event => change(selected.id, { exercise_index: Number(event.target.value) })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm">
                      {!eligibleIndexSet.has(selected.exercise_index ?? -1) && <option value="" disabled>Choose a replacement activity…</option>}
                      {eligibleExercises.map(({ exercise, index }) => <option key={index} value={index}>#{index + 1} · {exercise.kind.replaceAll("_", " ")} · {exercise.prompt.slice(0, 52) || "Untitled activity"}</option>)}
                    </select>
                  : <p className="mt-2 text-xs text-muted">No compatible activity exists. Create one above, or delete this checkpoint.</p>}
                </label>
                <label className="text-sm font-bold text-ink sm:col-span-2">Resume video when<select value={selected.completion_rule} onChange={event => change(selected.id, { completion_rule: event.target.value as InteractiveVideoCheckpoint["completion_rule"] })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm"><option value="submitted">the student submits the activity</option><option value="correct">the answer is correct</option></select></label>
              </>}
            </div>
            {convertingId === selected.id && <div className="mt-4 rounded-xl border border-brand-blue/40 bg-brand-primary-pale p-4">
              <p className="text-sm font-extrabold text-ink">Convert this checkpoint to Practice with Mariam</p>
              <p className="mt-1 text-xs text-muted">This replaces the activity pointer in place; the exercise itself is left untouched in the lesson.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-ink sm:col-span-2">Learning objective <span className="font-normal text-muted">(optional)</span><input type="text" value={convertDraft.learning_objective} onChange={event => setConvertDraft(current => ({ ...current, learning_objective: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm" /></label>
                <label className="text-sm font-bold text-ink sm:col-span-2">Conversation goal<textarea value={convertDraft.conversation_goal} onChange={event => setConvertDraft(current => ({ ...current, conversation_goal: event.target.value }))} rows={2} className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-ink sm:col-span-2">Opening line<textarea value={convertDraft.opening_line} onChange={event => setConvertDraft(current => ({ ...current, opening_line: event.target.value }))} rows={2} className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" /></label>
                <label className="text-sm font-bold text-ink">Session length (minutes)<input type="number" min={1} max={10} step={1} value={convertDraft.session_duration_minutes} onChange={event => setConvertDraft(current => ({ ...current, session_duration_minutes: Math.min(10, Math.max(1, Number(event.target.value) || 1)) }))} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm" /></label>
              </div>
              {convertError && <p role="alert" className="mt-3 rounded-lg bg-brand-coral-pale p-2 text-xs text-brand-coral">{convertError}</p>}
              <div className="mt-3 flex gap-2"><button type="button" disabled={converting} onClick={() => void confirmConvert()} className="min-h-10 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{converting ? "Converting…" : "Convert"}</button><button type="button" onClick={() => setConvertingId(null)} className="min-h-10 rounded-lg border border-line bg-card px-3 text-sm font-bold text-ink">Cancel</button></div>
            </div>}
          </div>;
        })()}
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">{invalidPractice ? "A Practice with Mariam marker is missing its conversation goal or opening line." : items.length ? "Save before leaving Video Studio." : "Add a checkpoint to save a timeline."}</p><button type="button" disabled={saving || !items.length || saved || invalidPractice} onClick={() => void save()} className="min-h-11 rounded-lg bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving timeline…" : "Save timeline"}</button></div>
        {error && <p role="alert" className="rounded-lg bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
        {invalidPractice && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Every Practice with Mariam marker needs a conversation goal and an opening line before saving.</p>}
    </div>
    <details className="rounded-2xl border border-line bg-card p-4"><summary className="cursor-pointer font-extrabold text-ink">Transcript &amp; timestamps <span className="ml-2 text-sm font-normal text-muted">Open only when you need to find a spoken moment</span></summary>{transcriptState !== "approved_for_ai" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{transcriptSegments.length ? "Transcript is still awaiting approval. You can use it to navigate, but approve it in Source & transcript before publishing." : "No reviewed transcript yet. You can still place checkpoints manually."}</p>}<div className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">{transcriptSegments.map((segment, index) => <button key={`${segment.start}-${index}`} type="button" onClick={() => seek(segment.start)} dir="auto" className={`w-full rounded-xl border p-3 text-start text-sm transition ${activeSegment === index ? "border-brand-blue bg-brand-primary-pale" : "border-line bg-bg hover:border-brand-blue/50"}`}><span dir="ltr" className="mb-1 block text-xs font-bold text-brand-blue">{formatTime(segment.start)} – {formatTime(segment.start + segment.duration)}</span><span>{segment.text}</span></button>)}{!transcriptSegments.length && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Generate and review a transcript in the Source step to navigate by spoken text.</p>}</div></details>
  </section>;
}
