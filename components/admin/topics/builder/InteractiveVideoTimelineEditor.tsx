"use client";

import { useRef, useState } from "react";
import { ApiError, topicsApi } from "@/lib/api/client";
import type { InteractiveVideoCheckpoint, InteractiveVideoTimelineSuggestion, LessonExercise } from "@/lib/api/types";

function blankCheckpoint(exerciseIndex = 0): InteractiveVideoCheckpoint {
  return { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, timestamp_seconds: 0, exercise_index: exerciseIndex, completion_rule: "submitted" };
}

function timestamp(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function InteractiveVideoTimelineEditor({
  topicId, uploadedVideoUrl, exercises, checkpoints, drafts, canSuggest, enabled, onSaved,
}: {
  topicId: string;
  uploadedVideoUrl: string | null;
  exercises: LessonExercise[];
  checkpoints: InteractiveVideoCheckpoint[];
  drafts: InteractiveVideoTimelineSuggestion[];
  canSuggest: boolean;
  enabled: boolean;
  onSaved: (checkpoints: InteractiveVideoCheckpoint[]) => void;
}) {
  const [items, setItems] = useState(checkpoints);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState(drafts);
  const [suggesting, setSuggesting] = useState(false);
  const [draftAction, setDraftAction] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const update = (index: number, patch: Partial<InteractiveVideoCheckpoint>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => setItems(current => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const ordered = [...items].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
      const updated = await topicsApi.updateInteractiveVideoTimeline(topicId, ordered);
      const saved = updated.interactive_video_checkpoints;
      setItems(saved); onSaved(saved);
    } catch (err) { setError(err instanceof ApiError ? err.message : "The video timeline could not be saved."); }
    finally { setSaving(false); }
  };
  const pauseAtCheckpoint = () => {
    const video = videoRef.current;
    if (!video || previewIndex !== null) return;
    const next = items.findIndex(item => video.currentTime >= item.timestamp_seconds);
    if (next >= 0) { video.pause(); setPreviewIndex(next); }
  };
  const suggest = async () => {
    setSuggesting(true); setError(null);
    try { setSuggestions(await topicsApi.suggestInteractiveVideoTimeline(topicId)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Checkpoint suggestions could not be generated."); }
    finally { setSuggesting(false); }
  };
  const reviewSuggestion = async (id: string, action: "accept" | "reject") => {
    const index = suggestions.findIndex(item => item.id === id);
    if (index < 0) return;
    setDraftAction(id); setError(null);
    try {
      const updated = action === "accept"
        ? await topicsApi.acceptInteractiveVideoSuggestion(topicId, index)
        : await topicsApi.rejectInteractiveVideoSuggestion(topicId, index);
      setItems(updated.interactive_video_checkpoints);
      setSuggestions(updated.interactive_video_drafts);
      onSaved(updated.interactive_video_checkpoints);
    } catch (err) { setError(err instanceof ApiError ? err.message : "That checkpoint could not be updated."); }
    finally { setDraftAction(null); }
  };

  if (!uploadedVideoUrl) return <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><b>Upload a lesson video first.</b><p className="mt-1">Interactive Video uses the controllable uploaded-video player. YouTube checkpoints are intentionally unavailable until a reliable player integration exists.</p></div>;
  if (!enabled) return <div className="rounded-2xl border border-brand-blue/30 bg-brand-primary-pale p-4 text-sm text-ink">Save the Interactive Video choice first, then add its pause points.</div>;
  if (!exercises.length) return <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><b>Add an answerable exercise first.</b><p className="mt-1">A checkpoint always reuses an existing lesson exercise; it never creates a second activity system.</p></div>;
  return <section className="mt-5 space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
    <div><h4 className="text-lg font-extrabold text-ink">Interactive Video timeline</h4><p className="mt-1 text-sm text-muted">Students pause only at these teacher-approved moments. Each activity must be completed before playback resumes.</p></div>
    <div className="space-y-3">
      {items.map((item, index) => <article key={item.id} className="rounded-xl border border-line bg-bg p-3">
        <div className="mb-3 flex items-center justify-between gap-2"><b className="text-sm text-ink">Checkpoint {index + 1}</b><div className="flex gap-1"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="min-h-9 rounded-lg border border-line px-2 text-sm disabled:opacity-40" aria-label="Move checkpoint earlier">↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="min-h-9 rounded-lg border border-line px-2 text-sm disabled:opacity-40" aria-label="Move checkpoint later">↓</button><button type="button" onClick={() => setItems(current => current.filter((_, i) => i !== index))} className="min-h-9 rounded-lg border border-brand-coral px-2 text-sm font-bold text-brand-coral">Remove</button></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold text-ink">Pause at (seconds)<input type="number" min="0" step="0.1" value={item.timestamp_seconds} onChange={event => update(index, { timestamp_seconds: Number(event.target.value) })} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm" /></label><label className="text-xs font-bold text-ink">Required activity<select value={item.exercise_index} onChange={event => update(index, { exercise_index: Number(event.target.value) })} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm">{exercises.map((exercise, exerciseIndex) => <option key={exerciseIndex} value={exerciseIndex}>#{exerciseIndex + 1} · {exercise.kind.replaceAll("_", " ")} · {exercise.prompt.slice(0, 48) || "Untitled"}</option>)}</select></label><label className="text-xs font-bold text-ink">Resume when<select value={item.completion_rule} onChange={event => update(index, { completion_rule: event.target.value as InteractiveVideoCheckpoint["completion_rule"] })} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm"><option value="submitted">the student submits</option><option value="correct">the answer is correct</option></select></label></div>
      </article>)}
    </div>
    <button type="button" onClick={() => setItems(current => [...current, blankCheckpoint(0)])} className="min-h-11 rounded-lg border border-dashed border-brand-blue px-4 text-sm font-bold text-brand-blue">+ Add checkpoint</button>
    <div className="rounded-xl border border-line bg-bg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm text-ink">AI checkpoint suggestions</b><p className="mt-1 text-xs text-muted">Suggestions are private drafts. Review each one before it becomes a student pause.</p></div><button type="button" disabled={!canSuggest || suggesting} onClick={() => void suggest()} className="min-h-10 rounded-lg border border-brand-blue px-3 text-sm font-bold text-brand-blue disabled:cursor-not-allowed disabled:opacity-40">{suggesting ? "Suggesting…" : "Suggest checkpoints"}</button></div>
      {!canSuggest && <p className="mt-2 text-xs text-amber-900">Approve timestamped source material and learning objectives first to unlock suggestions.</p>}
      {suggestions.length > 0 && <div className="mt-3 space-y-2">{suggestions.map(suggestion => <div key={suggestion.id} className="rounded-lg border border-line bg-card p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><b>{timestamp(suggestion.timestamp_seconds)} · activity #{suggestion.exercise_index + 1}</b><p className="mt-1 text-muted">{suggestion.rationale}</p></div><div className="flex gap-2"><button type="button" disabled={draftAction !== null} onClick={() => void reviewSuggestion(suggestion.id, "accept")} className="min-h-9 rounded-lg bg-brand-blue px-3 text-xs font-bold text-white">Accept</button><button type="button" disabled={draftAction !== null} onClick={() => void reviewSuggestion(suggestion.id, "reject")} className="min-h-9 rounded-lg border border-brand-coral px-3 text-xs font-bold text-brand-coral">Reject</button></div></div></div>)}</div>}
    </div>
    <div className="rounded-xl border border-line bg-bg p-3"><b className="text-sm text-ink">Preview pause behavior</b><p className="mt-1 text-xs text-muted">This preview is local only. It never writes an exercise attempt, progress, or student record.</p><video ref={videoRef} src={uploadedVideoUrl} controls className="mt-3 aspect-video w-full rounded-lg bg-brand-navy" onTimeUpdate={pauseAtCheckpoint} /><div className="mt-2 text-xs text-muted">{items.map(item => `${timestamp(item.timestamp_seconds)} → activity #${item.exercise_index + 1}`).join(" · ") || "Add a checkpoint to preview it."}</div>{previewIndex !== null && <div className="mt-3 rounded-lg border border-brand-blue bg-card p-3 text-sm"><b>Paused for activity #{items[previewIndex].exercise_index + 1}</b><p className="mt-1 text-muted">The student will complete the existing activity here before playback resumes.</p><button type="button" onClick={() => { setPreviewIndex(null); void videoRef.current?.play(); }} className="mt-2 min-h-10 rounded-lg bg-brand-blue px-3 text-sm font-bold text-white">Resume preview</button></div>}</div>
    {error && <p role="alert" className="rounded-lg bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
    <button type="button" disabled={saving || !items.length} onClick={() => void save()} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving timeline…" : "Save timeline"}</button>
  </section>;
}
