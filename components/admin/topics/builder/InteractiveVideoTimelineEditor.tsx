"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, topicsApi } from "@/lib/api/client";
import type { InteractiveVideoCheckpoint, LearningObjective, LessonExercise, TranscriptSegment, TranscriptState, VocabularyItem } from "@/lib/api/types";
import { Step4ExercisesSchedule } from "./Step4ExercisesSchedule";
import { ExercisePreviewCard } from "./LessonStudentPreview";

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
  onExercisesChange, hasVideo, hasVocabulary, canAiDraft, generatingIndex, suggestions, onGenerate, onAcceptSuggestions, onDiscardSuggestions, exercisesDirty,
  learningObjectives, vocabulary,
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
  /** The video question list is authored here now (a single concise
   * checkpoint/activity workspace instead of two stacked panels) - these are
   * the same callbacks the old standalone `Step4ExercisesSchedule` compact
   * instance used, reused unchanged, never a second exercise-editing form. */
  onExercisesChange: (exercises: LessonExercise[]) => void;
  hasVideo: boolean;
  hasVocabulary: boolean;
  canAiDraft: boolean;
  generatingIndex: number | null;
  suggestions: { index: number; exercises: LessonExercise[] } | null;
  onGenerate: (index: number, count: number) => void;
  onAcceptSuggestions: () => void;
  onDiscardSuggestions: () => void;
  exercisesDirty: boolean;
  /** Approved lesson objectives, used only to prefill a Practice with Mariam
   * marker's learning objective when a teacher switches a checkpoint to that
   * kind and hasn't written one yet - never fabricated goal/opening-line text. */
  learningObjectives: LearningObjective[];
  vocabulary: VocabularyItem[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // the native <video> had no loading/error UI at all - a 404'd or
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewActiveId, setPreviewActiveId] = useState<string | null>(null);
  // The headless question editor: Video Studio owns the checkpoint/activity
  // list layout, but reuses the exact same add/edit question modal and form
  // from `Step4ExercisesSchedule` rather than rebuilding it - this just tells
  // that hidden instance which question to open.
  const [questionEditorRequest, setQuestionEditorRequest] = useState<number | "add" | null>(null);

  // The persisted parent timeline can change after a save/refetch. Reset this
  // local editor draft deliberately; it is not an external subscription.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setItems(checkpoints); setSelectedId(current => checkpoints.some(item => item.id === current) ? current : null); setSaved(true); onDirtyChange(false); }, [checkpoints, onDirtyChange]);
  const eligibleExercises = useMemo(() => exercises.map((exercise, index) => ({ exercise, index })).filter(({ exercise }) => SUPPORTED.has(exercise.kind)), [exercises]);
  const eligibleIndexSet = useMemo(() => new Set(eligibleExercises.map(({ index }) => index)), [eligibleExercises]);
  // an "exercise" checkpoint whose exercise_index now points at a
  // deleted/incompatible activity (e.g. an exercise kind change, or a delete
  // elsewhere left it stale) - flagged inline instead of hiding the whole
  // Studio UI behind one generic banner.
  const isOrphanedCheckpoint = (item: InteractiveVideoCheckpoint) =>
    (item.kind ?? "exercise") === "exercise" && (item.exercise_index === undefined || !eligibleIndexSet.has(item.exercise_index));
  const placedIndexSet = useMemo(() => new Set(items.filter(item => (item.kind ?? "exercise") === "exercise" && item.exercise_index !== undefined).map(item => item.exercise_index as number)), [items]);
  const unplacedExercises = useMemo(() => eligibleExercises.filter(({ index }) => !placedIndexSet.has(index)), [eligibleExercises, placedIndexSet]);
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
  // Requirement: never allow a checkpoint at or after the real video length.
  const maxValidTimestamp = hasMediaDuration ? Math.max(duration - 0.1, 0) : timelineDuration;
  const timestampInvalid = (item: InteractiveVideoCheckpoint) => hasMediaDuration && item.timestamp_seconds >= duration;

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
  const changeTimestamp = (id: string, value: number) => {
    const clamped = Math.max(0, Math.min(maxValidTimestamp, Number.isFinite(value) ? value : 0));
    change(id, { timestamp_seconds: clamped });
  };
  // The server rejects two checkpoints at (or out of) the same chronological
  // instant. Quietly nudging a new one forward past the nearest neighbor
  // avoids a confusing "could not be saved" round trip for the common case of
  // adding/placing a checkpoint right where another already sits.
  const nextSafeTimestamp = (base: number) => {
    const taken = new Set(items.map(item => Math.round(item.timestamp_seconds * 1000) / 1000));
    let candidate = Math.min(base, maxValidTimestamp);
    while (taken.has(Math.round(candidate * 1000) / 1000) && candidate < maxValidTimestamp) candidate = Math.min(candidate + 1, maxValidTimestamp);
    return candidate;
  };
  const addAtPlayhead = () => {
    const first = eligibleExercises.find(({ index }) => !placedIndexSet.has(index));
    if (!first) { setError("Every compatible exercise is already attached. Create another exercise to add a new checkpoint."); return; }
    const created = checkpoint(first.index, nextSafeTimestamp(currentTime));
    setItems(current => [...current, created].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    setSelectedId(created.id); setSaved(false); onDirtyChange(true); setError(null);
  };
  const placeExercise = (index: number) => {
    const created = checkpoint(index, nextSafeTimestamp(currentTime));
    setItems(current => [...current, created].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    setSelectedId(created.id); setSaved(false); onDirtyChange(true); setError(null);
  };
  const remove = () => {
    if (!selected) return;
    setItems(current => current.filter(item => item.id !== selected.id));
    setSelectedId(null); setSaved(false); onDirtyChange(true);
  };
  const invalidPractice = items.some(practiceInvalid);
  const hasInvalidTimestamp = items.some(timestampInvalid);
  const cancelChanges = () => {
    setItems(checkpoints);
    setSelectedId(null);
    setError(null);
    setSaved(true);
    onDirtyChange(false);
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const ordered = [...items].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
      const updated = await topicsApi.updateInteractiveVideoTimeline(topicId, ordered);
      setItems(updated.interactive_video_checkpoints); setSelectedId(null);
      onSaved(updated.interactive_video_checkpoints); setSaved(true); onDirtyChange(false);
    } catch (err) { setError(err instanceof ApiError ? err.message : "The video timeline could not be saved."); }
    finally { setSaving(false); }
  };
  const handleTime = () => {
    const video = videoRef.current; if (!video) return;
    setCurrentTime(video.currentTime);
  };
  const activeSegment = transcriptSegments.findIndex(segment => currentTime >= segment.start && currentTime <= segment.start + segment.duration);
  const filteredTranscript = transcriptSegments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => !transcriptQuery.trim() || segment.text.toLowerCase().includes(transcriptQuery.trim().toLowerCase()));

  const questionEditor = <Step4ExercisesSchedule
    topicId={topicId} exercises={exercises} onExercisesChange={onExercisesChange} hasVideo={hasVideo} hasVocabulary={hasVocabulary}
    canAiDraft={canAiDraft} generatingIndex={generatingIndex} suggestions={suggestions} onGenerate={onGenerate} onAcceptSuggestions={onAcceptSuggestions} onDiscardSuggestions={onDiscardSuggestions}
    lessonDraftJob={null} draftExercises={[]} onGenerateLessonDraft={() => undefined} lessonDraftStarting={false} lessonDraftError={null}
    onAcceptDraftExercise={() => undefined} onRejectDraftExercise={() => undefined} onRegenerateDraftExercise={() => undefined} draftExerciseActionIndex={null}
    exercisesDirty={exercisesDirty} interactiveVideo compact hideOwnList
    openRequest={questionEditorRequest} onOpenRequestHandled={() => setQuestionEditorRequest(null)}
  />;

  if (!enabled) return <>{questionEditor}<div className="rounded-2xl border border-brand-blue/30 bg-brand-primary-pale p-5 text-sm text-ink">Save the Interactive Video flow choice first. Your draft exercises stay untouched.</div></>;
  if (!uploadedVideoUrl) return <>{questionEditor}<div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><b>Add a video to start editing.</b><p className="mt-1">Interactive playback needs a teacher-uploaded video. YouTube can remain a lesson source, but controllable YouTube checkpoints are not available yet.</p></div></>;
  // only collapse to the generic banner when there is truly nothing to
  // show - no compatible exercise to attach a NEW checkpoint to, AND no
  // existing checkpoints at all. Offer a direct way out (add a question)
  // instead of a dead-end "go create one elsewhere" message.
  if (!eligibleExercises.length && !items.length) return <>{questionEditor}<div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><b>Create a compatible exercise above first.</b><p className="mt-1">Interactive activities are authored in this Video Studio and each checkpoint reuses one answerable activity.</p><button type="button" onClick={() => setQuestionEditorRequest("add")} className="mt-3 min-h-10 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">+ Add a question</button></div></>;

  const checkpointTitle = (item: InteractiveVideoCheckpoint) => {
    if ((item.kind ?? "exercise") === "practice_with_mariam") return item.opening_line?.trim() || "Practice with Mariam";
    const exercise = item.exercise_index !== undefined ? exercises[item.exercise_index] : undefined;
    return exercise?.prompt?.trim() || "Untitled question";
  };

  const listPanel = <div className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <div><h4 className="font-extrabold text-ink">Checkpoints</h4><p className="text-xs text-muted">Click one to seek and edit it. Click a marker on the timeline instead for the same result.</p></div>
      <span className="shrink-0 rounded-full bg-brand-primary-pale px-2.5 py-1 text-xs font-bold text-brand-blue">{items.length} on timeline</span>
    </div>
    {!items.length && <div className="rounded-xl border border-dashed border-brand-blue bg-brand-primary-pale p-4 text-center text-sm text-ink"><b>No checkpoints yet.</b><p className="mt-1 text-muted">Seek to a learning moment and add your first checkpoint.</p></div>}
    {items.length > 0 && <ol className="space-y-2">
      {sorted.map((item, index) => {
        const broken = isOrphanedCheckpoint(item);
        const invalid = practiceInvalid(item) || timestampInvalid(item);
        return <li key={item.id}>
          <button type="button" onClick={() => { setSelectedId(item.id); seek(item.timestamp_seconds); }}
            aria-current={selectedId === item.id} aria-label={`Checkpoint ${index + 1} at ${formatTime(item.timestamp_seconds)}${broken ? " - activity removed" : ""}`}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-start transition ${selectedId === item.id ? "border-brand-navy bg-brand-primary-pale" : broken || invalid ? "border-brand-coral bg-brand-coral-pale/40" : "border-line bg-bg hover:border-brand-blue/60"}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-xs font-extrabold text-brand-blue">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-muted"><span dir="ltr">{formatTime(item.timestamp_seconds)}</span><span>·</span><span className="uppercase tracking-wide">{(item.kind ?? "exercise") === "practice_with_mariam" ? "Practice with Mariam" : "Question"}</span></span>
              <span className="mt-0.5 block truncate text-sm font-semibold text-ink">{checkpointTitle(item)}</span>
              {broken && <span role="alert" className="mt-0.5 block text-xs font-bold text-brand-coral">This checkpoint&apos;s activity was removed — reassign or delete it.</span>}
              {!broken && invalid && <span role="alert" className="mt-0.5 block text-xs font-bold text-brand-coral">Needs attention before saving.</span>}
            </span>
          </button>
        </li>;
      })}
    </ol>}
    <button type="button" onClick={addAtPlayhead} className="min-h-11 w-full rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">+ Add checkpoint at {formatTime(currentTime)}</button>

    <div className="border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2"><h5 className="text-xs font-extrabold uppercase tracking-wide text-muted">Questions not yet on the timeline</h5><span className="text-xs text-muted">{unplacedExercises.length}</span></div>
      {!unplacedExercises.length && <p className="mt-2 text-xs text-muted">Every compatible question is placed on the timeline.</p>}
      {unplacedExercises.length > 0 && <ul className="mt-2 space-y-2">
        {unplacedExercises.map(({ exercise, index }) => <li key={index} className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-2.5">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">#{index + 1} · {exercise.prompt || "Untitled question"}</span>
          <button type="button" onClick={() => placeExercise(index)} className="min-h-9 shrink-0 rounded-lg border border-brand-blue px-2.5 text-xs font-bold text-brand-blue">Place</button>
          <button type="button" onClick={() => setQuestionEditorRequest(index)} className="min-h-9 shrink-0 rounded-lg border border-line px-2.5 text-xs font-bold text-ink">Edit</button>
        </li>)}
      </ul>}
      <button type="button" onClick={() => setQuestionEditorRequest("add")} className="mt-3 min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm font-bold text-brand-blue">+ Add a new question</button>
    </div>
  </div>;

  const editorPanel = selected && (() => {
    const kind = selected.kind ?? "exercise";
    const isPractice = kind === "practice_with_mariam";
    const indexInSorted = sorted.findIndex(item => item.id === selected.id);
    const defaultObjective = learningObjectives[0]?.text ?? "";
    return <div className="space-y-4 rounded-2xl border border-brand-blue/30 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setSelectedId(null)} className="min-h-10 rounded-lg px-2 text-sm font-bold text-brand-blue">‹ Back to checkpoints</button>
        <button type="button" onClick={remove} className="min-h-10 rounded-lg border border-brand-coral px-3 text-sm font-bold text-brand-coral">Delete</button>
      </div>
      <div><p className="text-xs font-extrabold uppercase tracking-wide text-brand-blue">Checkpoint {indexInSorted + 1}</p><h4 className="text-lg font-extrabold text-ink">{formatTime(selected.timestamp_seconds)}</h4></div>
      <div className="flex gap-2" role="tablist" aria-label="Checkpoint activity">
        <button type="button" role="tab" aria-selected={!isPractice} onClick={() => change(selected.id, { kind: "exercise", exercise_index: selected.exercise_index ?? eligibleExercises[0]?.index })} className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${!isPractice ? "bg-brand-blue text-white" : "border border-line bg-bg text-ink"}`}>Question</button>
        <button type="button" role="tab" aria-selected={isPractice} onClick={() => change(selected.id, { kind: "practice_with_mariam", exercise_index: undefined, session_duration_minutes: selected.session_duration_minutes ?? 2, learning_objective: selected.learning_objective || defaultObjective })} className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold ${isPractice ? "bg-brand-blue text-white" : "border border-line bg-bg text-ink"}`}>Practice with Mariam</button>
      </div>
      <label className="block text-sm font-bold text-ink">Pause at
        <input type="range" min="0" max={maxValidTimestamp} step="0.1" value={selected.timestamp_seconds} onChange={event => changeTimestamp(selected.id, Number(event.target.value))} className="mt-2 block w-full accent-brand-blue" />
        <input type="number" min="0" max={maxValidTimestamp || undefined} step="0.1" value={selected.timestamp_seconds} onChange={event => changeTimestamp(selected.id, Number(event.target.value))} className="mt-2 min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm" aria-label="Exact checkpoint time in seconds" />
        <span className="mt-1 block text-xs font-normal text-muted">{formatTime(selected.timestamp_seconds)} · precise seconds</span>
        {timestampInvalid(selected) && <span role="alert" className="mt-1 block text-xs font-bold text-brand-coral">This pause point is at or after the end of the video. Move it earlier.</span>}
      </label>
      {isPractice ? <>
        <label className="block text-sm font-bold text-ink">Session length (minutes)<input type="number" min={1} max={10} step={1} value={selected.session_duration_minutes ?? 2} onChange={event => change(selected.id, { session_duration_minutes: Math.min(10, Math.max(1, Number(event.target.value) || 1)) })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm" /></label>
        <label className="block text-sm font-bold text-ink">Learning objective <span className="font-normal text-muted">(optional)</span><input type="text" value={selected.learning_objective ?? ""} onChange={event => change(selected.id, { learning_objective: event.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm" placeholder="What should the student practice here?" /></label>
        <label className="block text-sm font-bold text-ink">Conversation goal<textarea value={selected.conversation_goal ?? ""} onChange={event => change(selected.id, { conversation_goal: event.target.value })} rows={2} className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" placeholder="What should Mariam steer the student toward?" /></label>
        <label className="block text-sm font-bold text-ink">Opening line<textarea value={selected.opening_line ?? ""} onChange={event => change(selected.id, { opening_line: event.target.value })} rows={2} className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" placeholder="What Mariam says first" /></label>
        {practiceInvalid(selected) && <p role="alert" className="text-xs font-bold text-brand-coral">A conversation goal and an opening line are both required.</p>}
      </> : <>
        {isOrphanedCheckpoint(selected) && <p role="alert" className="text-xs font-bold text-brand-coral">This checkpoint&apos;s activity was removed — reassign or delete it.</p>}
        <label className="block text-sm font-bold text-ink">Required activity{eligibleExercises.length
          ? <select value={eligibleIndexSet.has(selected.exercise_index ?? -1) ? selected.exercise_index : ""} onChange={event => change(selected.id, { exercise_index: Number(event.target.value) })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm">
              {!eligibleIndexSet.has(selected.exercise_index ?? -1) && <option value="" disabled>Choose a replacement activity…</option>}
              {eligibleExercises.map(({ exercise, index }) => <option key={index} value={index}>#{index + 1} · {exercise.kind.replaceAll("_", " ")} · {exercise.prompt.slice(0, 52) || "Untitled activity"}</option>)}
            </select>
          : <p className="mt-2 text-xs text-muted">No compatible activity exists. Create one below, or delete this checkpoint.</p>}
        </label>
        {selected.exercise_index !== undefined && eligibleIndexSet.has(selected.exercise_index) && <button type="button" onClick={() => setQuestionEditorRequest(selected.exercise_index ?? "add")} className="min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm font-bold text-brand-blue">Edit this question&apos;s content →</button>}
        <label className="block text-sm font-bold text-ink">Resume video when<select value={selected.completion_rule} onChange={event => change(selected.id, { completion_rule: event.target.value as InteractiveVideoCheckpoint["completion_rule"] })} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm"><option value="submitted">the student submits the activity</option><option value="correct">the answer is correct</option></select></label>
      </>}
    </div>;
  })();

  return <section className="mx-auto max-w-[1400px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-extrabold text-ink">Place the pauses</h3><p className="mt-1 max-w-2xl text-sm text-muted">Click a point on the video timeline to adjust it. The student experience is previewed separately, so this screen stays for authoring.</p></div><div className={`rounded-full px-3 py-2 text-sm font-bold ${saving ? "bg-brand-primary-pale text-brand-blue" : saved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{saving ? "Saving…" : saved ? "Saved" : "Unsaved changes"}</div></header>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="min-w-0 space-y-4">
        {!eligibleExercises.length && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><b>No compatible activities available.</b><p className="mt-1">Create a compatible exercise below to add a new checkpoint. Existing checkpoints are still shown below.</p></div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => { setPreviewActiveId(sorted[0]?.id ?? null); setPreviewOpen(true); }} className="min-h-10 rounded-lg border border-line bg-card px-3 text-sm font-bold text-brand-blue">Preview as student</button>
          <button type="button" onClick={() => setTranscriptOpen(true)} className="min-h-10 rounded-lg border border-line bg-card px-3 text-sm font-bold text-ink">Transcript &amp; timestamps</button>
        </div>
        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-brand-navy shadow-card">
          <video key={videoRetryKey} ref={videoRef} src={uploadedVideoUrl} controls preload="metadata" className="block aspect-video h-auto w-full max-w-full object-contain" onLoadStart={() => setVideoLoadState("loading")} onCanPlay={() => setVideoLoadState("ready")} onLoadedData={() => setVideoLoadState("ready")} onError={() => setVideoLoadState("error")} onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={handleTime} onSeeking={event => setCurrentTime(event.currentTarget.currentTime)} />
          {videoLoadState === "loading" && <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center bg-brand-navy/70 text-sm font-bold text-white">Loading video…</div>}
          {videoLoadState === "error" && <div role="alert" className="absolute inset-0 grid place-items-center bg-brand-navy/90 p-4 text-center text-sm text-white"><div><p className="font-bold">Video could not be loaded.</p><p className="mt-1 text-white/70">Check the source and try again.</p><button type="button" onClick={retryVideo} className="mt-3 min-h-10 rounded-lg bg-white px-4 text-sm font-bold text-brand-navy">Retry</button></div></div>}
          <div className="flex items-center justify-between bg-brand-navy px-4 py-3 text-sm text-white"><span>{formatTime(currentTime)}</span><span className="text-white/70">{hasMediaDuration ? formatTime(duration) : `Transcript timing: ${formatTime(timelineDuration)}`}</span></div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
          <div className="mb-3"><h4 className="font-extrabold text-ink">Timeline</h4><p className="text-xs text-muted">Click the ruler to seek. Click a marker to select its checkpoint.</p></div>
          <div className="relative pt-8">
            <div className="flex justify-between text-xs text-muted">{[0, .25, .5, .75, 1].map(value => <span key={value}>{formatTime(timelineDuration * value)}</span>)}</div>
            <div role="slider" tabIndex={0} aria-label="Video timeline" aria-valuemin={0} aria-valuemax={Math.round(timelineDuration)} aria-valuenow={Math.round(currentTime)} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); seek(((event.clientX - rect.left) / rect.width) * timelineDuration); }} onKeyDown={event => { if (event.key === "ArrowLeft") seek(currentTime - 5); if (event.key === "ArrowRight") seek(currentTime + 5); }} className="relative mt-3 h-14 cursor-pointer rounded-xl bg-brand-primary-pale ring-offset-2 focus:outline-none focus:ring-2 focus:ring-brand-blue">
              <span className="absolute inset-y-0 w-0.5 bg-brand-coral" style={{ left: `${timelineDuration ? (currentTime / timelineDuration) * 100 : 0}%` }} />
              {sorted.map((item, index) => <button key={item.id} type="button" aria-label={`Checkpoint ${index + 1} at ${formatTime(item.timestamp_seconds)}${isOrphanedCheckpoint(item) ? " - activity removed" : ""}`} onClick={event => { event.stopPropagation(); setSelectedId(item.id); seek(item.timestamp_seconds); }} className={`absolute top-3 grid size-8 -translate-x-1/2 place-items-center rounded-full border-2 text-xs font-extrabold shadow-sm ${selectedId === item.id ? "border-brand-navy bg-brand-cyan text-white" : isOrphanedCheckpoint(item) ? "border-brand-coral bg-brand-coral-pale text-brand-coral" : "border-brand-blue bg-card text-brand-blue"}`} style={{ left: `${timelineDuration ? Math.min(100, (item.timestamp_seconds / timelineDuration) * 100) : 0}%` }}>{index + 1}</button>)}
            </div>
          </div>
        </div>
      </div>

      <div className="relative min-w-0">
        {selected && <div onClick={() => setSelectedId(null)} className="hidden max-lg:fixed max-lg:inset-0 max-lg:z-[65] max-lg:block max-lg:bg-slate-950/40" aria-hidden="true" />}
        <div className={selected
          ? "lg:sticky lg:top-0 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[70] max-lg:max-h-[88vh] max-lg:overflow-y-auto max-lg:rounded-t-3xl max-lg:border-t max-lg:border-line max-lg:shadow-2xl"
          : "lg:sticky lg:top-0"}>
          {selected ? editorPanel : listPanel}
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">{invalidPractice ? "A Practice with Mariam marker is missing its conversation goal or opening line." : hasInvalidTimestamp ? "A checkpoint is at or after the end of the video." : items.length ? "Save before leaving Video Studio." : "Add a checkpoint to save a timeline."}</p>
      <div className="flex gap-2">
        <button type="button" disabled={saving || saved} onClick={cancelChanges} className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-bold text-ink disabled:opacity-40">Cancel</button>
        <button type="button" disabled={saving || !items.length || saved || invalidPractice || hasInvalidTimestamp} onClick={() => void save()} className="min-h-11 rounded-lg bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving timeline…" : "Save timeline"}</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
    {invalidPractice && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Every Practice with Mariam marker needs a conversation goal and an opening line before saving.</p>}
    {hasInvalidTimestamp && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Move every checkpoint before the end of the video before saving.</p>}

    {questionEditor}

    {transcriptOpen && <div className="fixed inset-0 z-[75] flex justify-end bg-slate-950/40" onClick={() => setTranscriptOpen(false)}>
      <div onClick={event => event.stopPropagation()} className="flex h-full w-full max-w-md flex-col overflow-hidden bg-bg shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line p-4"><h4 className="font-extrabold text-ink">Transcript &amp; timestamps</h4><button type="button" onClick={() => setTranscriptOpen(false)} aria-label="Close transcript" className="grid size-10 place-items-center rounded-lg border border-line text-lg">×</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {transcriptState !== "approved_for_ai" && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{transcriptSegments.length ? "Transcript is still awaiting approval. You can use it to navigate, but approve it in Source & transcript before publishing." : "No reviewed transcript yet. You can still place checkpoints manually."}</p>}
          <input type="search" value={transcriptQuery} onChange={event => setTranscriptQuery(event.target.value)} placeholder="Search the transcript…" className="mb-3 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm" />
          <div className="grid gap-2">
            {filteredTranscript.map(({ segment, index }) => <button key={`${segment.start}-${index}`} type="button" onClick={() => seek(segment.start)} dir="auto" className={`w-full rounded-xl border p-3 text-start text-sm transition ${activeSegment === index ? "border-brand-blue bg-brand-primary-pale" : "border-line bg-card hover:border-brand-blue/50"}`}><span dir="ltr" className="mb-1 block text-xs font-bold text-brand-blue">{formatTime(segment.start)} – {formatTime(segment.start + segment.duration)}</span><span>{segment.text}</span></button>)}
            {!filteredTranscript.length && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{transcriptSegments.length ? "No lines match your search." : "Generate and review a transcript in the Source step to navigate by spoken text."}</p>}
          </div>
        </div>
      </div>
    </div>}

    {previewOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setPreviewOpen(false)}>
      <div onClick={event => event.stopPropagation()} className="relative max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-bg p-4 shadow-2xl sm:p-6">
        <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Close preview" className="absolute right-4 top-4 grid size-11 place-items-center rounded-xl border-2 border-brand-coral bg-brand-coral-pale text-2xl font-bold leading-none text-brand-coral">×</button>
        <div className="pr-14"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-blue">Student preview</p><h4 className="mt-1 text-xl font-extrabold text-ink">What a student sees at each pause</h4><p className="mt-1 text-sm text-muted">This does not publish anything or record any student activity. Pick a checkpoint to see its pause screen.</p></div>
        <div className="mt-4 grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {sorted.map((item, index) => <button key={item.id} type="button" onClick={() => setPreviewActiveId(item.id)} className={`min-h-11 shrink-0 rounded-lg border px-3 text-start text-sm font-bold ${previewActiveId === item.id ? "border-brand-navy bg-brand-primary-pale text-ink" : "border-line bg-card text-muted"}`}>{index + 1} · {formatTime(item.timestamp_seconds)}</button>)}
            {!sorted.length && <p className="text-sm text-muted">No checkpoints yet.</p>}
          </div>
          <div className="min-w-0">
            {(() => {
              const active = sorted.find(item => item.id === previewActiveId) ?? sorted[0];
              if (!active) return <p className="text-sm text-muted">Add a checkpoint to preview it.</p>;
              if ((active.kind ?? "exercise") === "practice_with_mariam") return <div className="rounded-2xl border border-line bg-card p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-blue">🗣️ Practice with Mariam</span>
                <p className="mb-2 mt-2 text-sm font-bold text-ink">{active.opening_line || "Mariam will open the conversation here."}</p>
                {active.conversation_goal && <p className="text-sm text-ink"><b>Goal:</b> {active.conversation_goal}</p>}
                <p className="mt-3 text-xs text-muted">Live spoken practice is not simulated in this preview.</p>
              </div>;
              const exercise = active.exercise_index !== undefined ? exercises[active.exercise_index] : undefined;
              return exercise ? <ExercisePreviewCard exercise={exercise} index={active.exercise_index ?? 0} vocabulary={vocabulary} /> : <p className="text-sm text-brand-coral">This checkpoint&apos;s activity is missing.</p>;
            })()}
          </div>
        </div>
      </div>
    </div>}
  </section>;
}
