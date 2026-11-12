"use client";

import { useState } from "react";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { LessonDraftExerciseSuggestion, LessonDraftJob, LessonExercise } from "@/lib/api/types";
import { topicsApi, ApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { insertLessonBlock, moveLessonBlock } from "@/lib/lessonBuilder/order";
import { withExerciseDefaults } from "@/lib/topics/helpers";

const SKILL_KINDS = ["video", "vocab", "image_completion", "listening", "grammar", "reading", "writing", "speaking", "game", "series", "word_order", "error_correction", "dialogue_completion"] as const;
const ANSWER_KINDS = new Set<LessonExercise["kind"]>(["multiple_choice", "image_completion", "listening", "grammar", "reading"]);
const AI_KINDS = new Set<LessonExercise["kind"]>(["multiple_choice", "reflection", "listening", "grammar", "reading", "writing", "speaking", "game", "series", "word_order", "error_correction", "dialogue_completion"]);

function newExercise(kind: LessonExercise["kind"]): LessonExercise {
  return {
    kind, prompt: kind === "video" ? "Watch the lesson video." : kind === "vocab" ? "Learn the key words." : kind === "speaking" ? "Practice speaking with Mariam using this lesson." : kind === "word_order" ? "Put the words in the correct order." : kind === "error_correction" ? "Find and fix the mistake." : kind === "dialogue_completion" ? "Complete the dialogue." : "",
    options: ANSWER_KINDS.has(kind) ? ["", ""] : [], correct_option: ANSWER_KINDS.has(kind) ? 0 : null,
    explanation: "", content: "", arabic_note: "", media_url: "", audio_url: "", pairs: kind === "game" ? [{ left: "", right: "" }, { left: "", right: "" }] : [],
    ordering_words: kind === "word_order" ? ["", "", ""] : [],
    accepted_answers: kind === "error_correction" ? [""] : [],
    dialogue_turns: kind === "dialogue_completion" ? [
      { speaker: "A", text: "", is_blank: false, accepted_answers: [] },
      { speaker: "B", text: "", is_blank: true, accepted_answers: [""] },
    ] : [],
    min_words: kind === "writing" ? 20 : 0, allow_resubmit: true, deadline_at: null,
  };
}

function PaletteCard({ kind, label, note, disabled, onAdd }: { kind: (typeof SKILL_KINDS)[number]; label: string; note: string; disabled: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${kind}`, disabled });
  return <button ref={setNodeRef} type="button" disabled={disabled} onClick={onAdd} {...listeners} {...attributes}
    className={`min-h-28 w-full rounded-xl border border-line bg-card p-3 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue hover:bg-brand-primary-pale disabled:cursor-not-allowed disabled:opacity-50 ${isDragging ? "opacity-40" : ""}`}>
    <b className="block text-sm text-ink">+ {label}</b><span className="mt-1 block text-xs text-muted">{note}</span>
  </button>;
}

function BlockDragHandle({ index, label }: { index: number; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `block:${index}` });
  return <button ref={setNodeRef} type="button" {...listeners} {...attributes} aria-label={label}
    className={`min-h-11 min-w-11 cursor-grab touch-none rounded-lg border border-line bg-bg text-lg text-muted active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`} title={label}>⠿</button>;
}

export function Step4ExercisesSchedule({ topicId, exercises: rawExercises, onExercisesChange, hasVideo, hasVocabulary, canAiDraft, generatingIndex, suggestions, onGenerate, onAcceptSuggestions, onDiscardSuggestions, lessonDraftJob, draftExercises, onGenerateLessonDraft, lessonDraftStarting, lessonDraftError, onAcceptDraftExercise, onRejectDraftExercise, onRegenerateDraftExercise, draftExerciseActionIndex, exercisesDirty, interactiveVideo = false }: {
  topicId: string | null;
  exercises: LessonExercise[];
  onExercisesChange: (exercises: LessonExercise[]) => void;
  hasVideo: boolean;
  hasVocabulary: boolean;
  canAiDraft: boolean;
  generatingIndex: number | null;
  suggestions: { index: number; exercises: LessonExercise[] } | null;
  onGenerate: (index: number, count: number) => void;
  onAcceptSuggestions: () => void;
  onDiscardSuggestions: () => void;
  lessonDraftJob: LessonDraftJob | null;
  draftExercises: LessonDraftExerciseSuggestion[];
  onGenerateLessonDraft: () => void;
  lessonDraftStarting: boolean;
  lessonDraftError: string | null;
  onAcceptDraftExercise: (index: number) => void;
  onRejectDraftExercise: (index: number) => void;
  onRegenerateDraftExercise: (index: number) => void;
  draftExerciseActionIndex: number | null;
  exercisesDirty: boolean;
  /** Interactive activities live inside Video Studio. AI exercise drafting
   * stays out of this screen until its dedicated future generation stage is
   * actually shipped. */
  interactiveVideo?: boolean;
}) {
  const { t, locale } = useI18n();
  const exercises = rawExercises.map(withExerciseDefaults);
  const [draftCount, setDraftCount] = useState(3);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const update = (index: number, changes: Partial<LessonExercise>) =>
    onExercisesChange(exercises.map((exercise, i) => i === index ? { ...exercise, ...changes } : exercise));
  const uploadMedia = async (index: number, file: File, kind: "image" | "audio") => {
    if (!topicId) return;
    setUploadingIndex(index);
    setUploadError(null);
    try {
      const result = await topicsApi.uploadExerciseMedia(topicId, file);
      if (result.kind !== kind) throw new Error(t("builder.mediaTypeError"));
      update(index, kind === "image" ? { media_url: result.url } : { audio_url: result.url });
    } catch (error) {
      setUploadError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : t("builder.mediaUploadError"));
    } finally { setUploadingIndex(null); }
  };
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const id = String(event.active.id);
    const target = String(event.over?.id ?? "");
    if (!target.startsWith("slot:")) return;
    const at = Number(target.slice(5));
    if (!Number.isInteger(at) || at < 0 || at > exercises.length) return;
    if (id.startsWith("palette:")) {
      const kind = id.slice(8) as (typeof SKILL_KINDS)[number];
      if (!SKILL_KINDS.includes(kind) || kind === "video" && !hasVideo || kind === "vocab" && !hasVocabulary) return;
      onExercisesChange(insertLessonBlock(exercises, newExercise(kind), at));
    } else if (id.startsWith("block:")) {
      const from = Number(id.slice(6));
      if (!Number.isInteger(from) || from < 0 || from >= exercises.length || from === at || from + 1 === at) return;
      onExercisesChange(moveLessonBlock(exercises, from, at));
    }
  };

  const stepLabel: Record<LessonDraftJob["state"], string> = {
    pending: t("builder.lessonDraftStepPending"), running: t("builder.lessonDraftStepRunning"),
    done: t("builder.lessonDraftStepDone"), skipped: t("builder.lessonDraftStepSkipped"), failed: t("builder.lessonDraftStepFailed"),
  };
  const stepBadgeClass: Record<LessonDraftJob["state"], string> = {
    pending: "bg-line text-muted", running: "bg-brand-primary-pale text-brand-blue",
    done: "bg-brand-cyan/20 text-brand-cyan", skipped: "bg-line text-muted", failed: "bg-brand-coral-pale text-brand-coral",
  };
  const isLessonDraftRunning = lessonDraftJob?.state === "running";

  const availableSkillKinds = interactiveVideo ? SKILL_KINDS.filter(kind => kind !== "speaking") : SKILL_KINDS;

  return <section className="mx-auto max-w-[1200px] space-y-7">
    {!interactiveVideo && <div className="rounded-2xl border border-brand-blue/30 bg-brand-primary-pale/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink">{t("builder.lessonDraftTitle")}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("builder.lessonDraftDesc")}</p>
        </div>
        <button type="button" disabled={!canAiDraft || lessonDraftStarting || isLessonDraftRunning || exercisesDirty}
          onClick={onGenerateLessonDraft}
          className="min-h-11 shrink-0 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-50">
          {lessonDraftStarting || isLessonDraftRunning ? t("builder.lessonDraftRunning") : t("builder.lessonDraftButton")}
        </button>
      </div>
      {!canAiDraft && <p className="mt-2 text-xs text-muted">{t("builder.lessonDraftNeedsSource")}</p>}
      {exercisesDirty && <p className="mt-2 text-xs text-muted">{t("builder.lessonDraftDirtyHint")}</p>}
      {lessonDraftError && <p role="alert" className="mt-2 text-sm text-brand-coral">{lessonDraftError}</p>}
      {lessonDraftJob && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 font-bold ${stepBadgeClass[lessonDraftJob.content_step]}`}>{t("builder.lessonDraftContentStep")}: {stepLabel[lessonDraftJob.content_step]}</span>
        {Object.entries(lessonDraftJob.exercise_steps).map(([kind, state]) => (
          <span key={kind} title={lessonDraftJob.exercise_step_errors?.[kind]} className={`rounded-full px-3 py-1 font-bold capitalize ${stepBadgeClass[state]} ${state === "failed" ? "cursor-help" : ""}`}>{kind.replaceAll("_", " ")}: {stepLabel[state]}</span>
        ))}
      </div>}
      {lessonDraftJob?.state === "done" && <p className="mt-2 text-sm font-semibold text-brand-cyan">{t("builder.lessonDraftDone")}</p>}
      {lessonDraftJob?.state === "failed" && <div className="mt-2 grid gap-1">
        <p className="m-0 text-sm font-semibold text-brand-coral">{t("builder.lessonDraftPartialFailure")}</p>
        {Object.entries(lessonDraftJob.exercise_step_errors ?? {}).map(([kind, message]) => (
          <p key={kind} className="m-0 text-xs text-brand-coral"><b className="capitalize">{kind.replaceAll("_", " ")}</b>: {message}</p>
        ))}
        <p className="m-0 text-xs text-muted">{t("builder.lessonDraftRetryHint")}</p>
      </div>}
    </div>}

    {!interactiveVideo && draftExercises.length > 0 && <div className="rounded-2xl border border-line bg-card p-4">
      <h3 className="text-base font-bold text-ink">{t("builder.lessonDraftSuggestionsTitle")}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {draftExercises.map((suggestion, index) => <div key={index} className="rounded-xl border border-line bg-bg p-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-blue">{suggestion.kind.replaceAll("_", " ")}</span>
          <b className="mt-1 block text-sm text-ink">{suggestion.exercise.prompt}</b>
          {suggestion.exercise.content && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{suggestion.exercise.content}</p>}
          {suggestion.exercise.options.length > 0 && <p className="mt-1 text-xs text-muted">{suggestion.exercise.options.join(" · ")} · {t("builder.correctAnswer")}: {suggestion.exercise.options[suggestion.exercise.correct_option ?? 0]}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={exercisesDirty || draftExerciseActionIndex !== null} onClick={() => onAcceptDraftExercise(index)} className="min-h-10 rounded-lg bg-brand-blue px-3 text-xs font-bold text-white disabled:opacity-50">{t("builder.lessonDraftAccept")}</button>
            <button type="button" disabled={exercisesDirty || draftExerciseActionIndex !== null} onClick={() => onRegenerateDraftExercise(index)} className="min-h-10 rounded-lg border border-line px-3 text-xs font-bold disabled:opacity-50">{t("builder.lessonDraftRegenerate")}</button>
            <button type="button" disabled={exercisesDirty || draftExerciseActionIndex !== null} onClick={() => onRejectDraftExercise(index)} className="min-h-10 rounded-lg border border-line px-3 text-xs text-brand-coral disabled:opacity-50">{t("builder.lessonDraftReject")}</button>
          </div>
        </div>)}
      </div>
    </div>}

    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={event => setActiveDragId(String(event.active.id))} onDragCancel={() => setActiveDragId(null)} onDragEnd={handleDragEnd}>
      <div dir="ltr" className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)] lg:items-start">
      <aside dir={locale === "ar" ? "rtl" : "ltr"} className="min-w-0 rounded-2xl border border-line bg-bg p-3 lg:sticky lg:top-0">
        <h3 className="px-1 text-sm font-bold text-ink">{t("builder.skillPaletteTitle")}</h3>
        <p className="px-1 text-xs text-muted">{t("builder.dragHint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:max-h-[70vh] lg:overflow-y-auto">
          {availableSkillKinds.map(kind => {
            const labels = { video: t("builder.skillVideo"), vocab: t("builder.skillVocab"), image_completion: t("builder.skillImages"), listening: t("builder.skillListening"), grammar: t("builder.skillGrammar"), reading: t("builder.skillReading"), writing: t("builder.skillWriting"), speaking: t("builder.skillSpeaking"), game: t("builder.skillGame"), series: t("builder.skillSeries"), word_order: t("builder.skillWordOrder"), error_correction: t("builder.skillErrorCorrection"), dialogue_completion: t("builder.skillDialogue") };
            const notes = { video: t("builder.skillVideoDesc"), vocab: t("builder.skillVocabDesc"), image_completion: t("builder.skillImagesDesc"), listening: t("builder.skillListeningDesc"), grammar: t("builder.skillGrammarDesc"), reading: t("builder.skillReadingDesc"), writing: t("builder.skillWritingDesc"), speaking: t("builder.skillSpeakingDesc"), game: t("builder.skillGameDesc"), series: t("builder.skillSeriesDesc"), word_order: t("builder.skillWordOrderDesc"), error_correction: t("builder.skillErrorCorrectionDesc"), dialogue_completion: t("builder.skillDialogueDesc") };
            return <PaletteCard key={kind} kind={kind} label={labels[kind]} note={notes[kind]} disabled={kind === "video" && !hasVideo || kind === "vocab" && !hasVocabulary} onAdd={() => { onExercisesChange([...exercises, newExercise(kind)]); setExpandedIndex(null); }} />;
          })}
        </div>
      </aside>
      <div dir={locale === "ar" ? "rtl" : "ltr"} className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
      <h3 className="text-xl font-bold text-ink">{t("builder.exerciseTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t("builder.exerciseDesc")}</p>
      {exercises.length === 0 && <p className="mt-4 text-sm text-muted">{t("builder.noExercises")}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {exercises.map((exercise, index) => <div key={index} className={expandedIndex === index ? "fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" : ""}>
        <div className={`relative flex flex-col rounded-2xl border border-line bg-card p-4 shadow-sm ${expandedIndex === index ? "max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto pr-16 shadow-2xl" : "min-h-52 hover:border-brand-blue hover:shadow-md"}`}>
          {expandedIndex === index && <button type="button" onClick={() => setExpandedIndex(null)} className="absolute right-4 top-4 z-30 grid size-12 place-items-center rounded-xl border-2 border-brand-coral bg-brand-coral-pale text-2xl font-bold leading-none text-brand-coral shadow-sm transition hover:bg-brand-coral hover:text-white" aria-label="Close skill settings" title="Close">×</button>}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <button type="button" onClick={() => setExpandedIndex(index)} className="min-w-0 flex-1 text-start"><span className="grid size-9 place-items-center rounded-xl bg-brand-primary-pale text-sm font-bold text-brand-blue">{index + 1}</span><b className="mt-3 block text-base capitalize">{exercise.kind.replaceAll("_", " ")}</b><span className="mt-1 block min-h-10 text-xs leading-relaxed text-muted">{exercise.prompt || "Click to configure this activity"}</span></button>
            {expandedIndex === index && <div className="mr-12 flex flex-wrap gap-2"><BlockDragHandle index={index} label={t("builder.dragBlock", { number: index + 1 })} />
              <button type="button" disabled={index === 0} onClick={() => { const next = [...exercises]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onExercisesChange(next); }} className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-40" aria-label={t("builder.moveUp")}>↑</button>
              <button type="button" disabled={index === exercises.length - 1} onClick={() => { const next = [...exercises]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onExercisesChange(next); }} className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-40" aria-label={t("builder.moveDown")}>↓</button>
              <button type="button" onClick={() => onExercisesChange(exercises.filter((_, i) => i !== index))} className="min-h-11 rounded-lg border border-line px-3 text-sm text-brand-coral">{t("builder.removeExercise")}</button>
            </div>}
          </div>
          {expandedIndex !== index && <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-muted">Order</span><button type="button" disabled={index === 0} onClick={() => { const next = [...exercises]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onExercisesChange(next); }} className="grid size-10 place-items-center rounded-lg border border-line bg-bg text-lg font-bold text-brand-blue transition hover:border-brand-blue disabled:cursor-not-allowed disabled:opacity-30" aria-label={t("builder.moveUp")} title={t("builder.moveUp")}>←</button><button type="button" disabled={index === exercises.length - 1} onClick={() => { const next = [...exercises]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onExercisesChange(next); }} className="grid size-10 place-items-center rounded-lg border border-line bg-bg text-lg font-bold text-brand-blue transition hover:border-brand-blue disabled:cursor-not-allowed disabled:opacity-30" aria-label={t("builder.moveDown")} title={t("builder.moveDown")}>→</button></div>
            <button type="button" onClick={() => onExercisesChange(exercises.filter((_, i) => i !== index))} className="min-h-10 rounded-lg px-3 text-sm font-bold text-brand-coral">{t("builder.removeExercise")}</button>
          </div>}
          {expandedIndex === index && <>
          {exercise.kind !== "speaking" && <label className="mt-3 block text-sm font-semibold">{t("builder.exercisePrompt")}
            <textarea value={exercise.prompt} maxLength={500} onChange={event => update(index, { prompt: event.target.value })} rows={2} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3 font-normal" />
          </label>}
          {exercise.kind === "speaking" && <div className="mt-3 rounded-xl border border-brand-blue/20 bg-brand-primary-pale/40 p-4 text-sm text-ink">
            <b className="block">Core AI speaking practice</b>
            <p className="mb-0 mt-1 text-muted">This lesson already has its own Avatar/Cartoon context from step 3. Students open it from the lesson player; set its lesson time when placing this lesson on the Batch schedule.</p>
          </div>}
          {!interactiveVideo && AI_KINDS.has(exercise.kind) && <div className="mt-3 rounded-lg border border-brand-blue/20 bg-brand-primary-pale/40 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold">{t("builder.aiQuestionCount")}
                <select value={draftCount} onChange={event => setDraftCount(Number(event.target.value))} className="mt-1 block min-h-11 rounded-lg border border-line bg-card px-2 text-sm">{[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count}</option>)}</select>
              </label>
              <button type="button" disabled={!canAiDraft || generatingIndex !== null} onClick={() => onGenerate(index, draftCount)} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">{generatingIndex === index ? t("builder.aiGenerating") : t("builder.aiGenerate")}</button>
            </div>
            <p className="mb-0 mt-2 text-xs text-muted">{canAiDraft ? t("builder.aiReviewHint") : t("builder.aiNeedsSource")}</p>
            {suggestions?.index === index && <div className="mt-3 rounded-lg border border-line bg-card p-3">
              <b className="text-sm">{t("builder.aiSuggestions")}</b>
              <ol className="mt-2 list-inside list-decimal space-y-3 text-sm">{suggestions.exercises.map(withExerciseDefaults).map((item, i) => <li key={i}>
                <b>{item.prompt}</b>
                {item.content && <span className="mt-1 block whitespace-pre-wrap ps-5 text-xs text-muted">{item.content}</span>}
                {item.arabic_note && <span dir="rtl" className="mt-1 block ps-5 text-xs text-muted">{item.arabic_note}</span>}
                {item.options.length > 0 && <span className="mt-1 block ps-5 text-xs text-muted">{item.options.join(" · ")} · {t("builder.correctAnswer")}: {item.options[item.correct_option ?? 0]}</span>}
                {item.kind === "game" && item.pairs.length > 0 && <span className="mt-1 block ps-5 text-xs text-muted">{item.pairs.map(pair => `${pair.left} → ${pair.right}`).join(" · ")}</span>}
                {item.kind === "word_order" && item.ordering_words.length > 0 && <span className="mt-1 block ps-5 text-xs text-muted">{item.ordering_words.join(" ")}</span>}
                {item.kind === "error_correction" && item.accepted_answers.length > 0 && <span className="mt-1 block ps-5 text-xs text-muted">{item.content} → {item.accepted_answers.join(" / ")}</span>}
                {item.kind === "dialogue_completion" && item.dialogue_turns.length > 0 && <span className="mt-1 block ps-5 text-xs text-muted">{item.dialogue_turns.map(turn => turn.is_blank ? `${turn.speaker}: ___ (${turn.accepted_answers.join(" / ")})` : `${turn.speaker}: ${turn.text}`).join(" · ")}</span>}
              </li>)}</ol>
              <div className="mt-3 flex gap-2"><button type="button" onClick={onAcceptSuggestions} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">{t("builder.aiUseSuggestions")}</button><button type="button" onClick={onDiscardSuggestions} className="min-h-11 rounded-lg border border-line px-4 text-sm">{t("builder.aiDiscard")}</button></div>
            </div>}
          </div>}
          {exercise.kind === "image_completion" && <label className="mt-3 block text-sm font-semibold">{t("builder.imageUrl")}
            <input type="url" value={exercise.media_url} onChange={event => update(index, { media_url: event.target.value })} placeholder="https://…" className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-bg px-3 font-normal" />
          </label>}
          {exercise.kind === "image_completion" && <label className="mt-2 block text-sm font-semibold">{t("builder.uploadExerciseImage")}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!topicId || uploadingIndex !== null} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadMedia(index, file, "image"); event.target.value = ""; }} className="mt-1 block w-full text-sm font-normal" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {exercise.media_url && <img src={exercise.media_url} alt="" className="mt-2 max-h-40 rounded-lg object-contain" />}
          </label>}
          {exercise.kind === "listening" && <label className="mt-3 block text-sm font-semibold">{t("builder.uploadAudio")}
            <input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg" disabled={!topicId || uploadingIndex !== null} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadMedia(index, file, "audio"); event.target.value = ""; }} className="mt-1 block w-full text-sm font-normal" />
            {exercise.audio_url && <audio src={exercise.audio_url} controls className="mt-2 w-full" />}
          </label>}
          {uploadError && <p role="alert" className="mt-2 text-sm text-brand-coral">{uploadError}</p>}
          {(["listening", "grammar", "reading", "series", "error_correction"] as LessonExercise["kind"][]).includes(exercise.kind) && <label className="mt-3 block text-sm font-semibold">{exercise.kind === "listening" ? t("builder.listeningScript") : exercise.kind === "grammar" ? t("builder.grammarRule") : exercise.kind === "series" ? t("builder.episodeText") : exercise.kind === "error_correction" ? t("builder.incorrectSentence") : t("builder.readingPassage")}
            <textarea value={exercise.content} maxLength={5000} onChange={event => update(index, { content: event.target.value })} rows={exercise.kind === "error_correction" ? 2 : 4} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3 font-normal" />
          </label>}
          {exercise.kind === "grammar" && <label className="mt-3 block text-sm font-semibold">{t("builder.arabicNote")}
            <textarea dir="rtl" value={exercise.arabic_note} maxLength={1000} onChange={event => update(index, { arabic_note: event.target.value })} rows={2} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3 font-normal" />
          </label>}
          {exercise.kind === "writing" && <label className="mt-3 block text-sm font-semibold">{t("builder.minimumWords")}
            <input type="number" min={0} max={500} value={exercise.min_words} onChange={event => update(index, { min_words: Number(event.target.value) })} className="mt-1 block min-h-11 w-28 rounded-lg border border-line bg-bg px-3 font-normal" />
          </label>}
          {exercise.kind === "error_correction" && <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">{t("builder.acceptedAnswersLabel")}</p>
            <p className="text-xs text-muted">{t("builder.acceptedAnswersHint")}</p>
            {exercise.accepted_answers.map((answer, answerIndex) => <div key={answerIndex} className="flex items-center gap-2">
              <input value={answer} maxLength={500} onChange={event => update(index, { accepted_answers: exercise.accepted_answers.map((item, i) => i === answerIndex ? event.target.value : item) })} placeholder={t("builder.acceptedAnswerPlaceholder")} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
              {exercise.accepted_answers.length > 1 && <button type="button" onClick={() => update(index, { accepted_answers: exercise.accepted_answers.filter((_, i) => i !== answerIndex) })} className="min-h-11 min-w-11 rounded-lg border border-line" aria-label={t("builder.removeAcceptedAnswer")}>×</button>}
            </div>)}
            {exercise.accepted_answers.length < 10 && <button type="button" onClick={() => update(index, { accepted_answers: [...exercise.accepted_answers, ""] })} className="min-h-11 text-sm font-bold text-brand-blue">{t("builder.addAcceptedAnswer")}</button>}
            <label className="mt-2 block text-sm font-semibold">{t("builder.explanation")}
              <input value={exercise.explanation} maxLength={500} onChange={event => update(index, { explanation: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-bg px-3 font-normal" />
            </label>
          </div>}
          {exercise.kind === "dialogue_completion" && <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">{t("builder.dialogueTurnsLabel")}</p>
            <p className="text-xs text-muted">{t("builder.dialogueTurnsHint")}</p>
            {exercise.dialogue_turns.map((turn, turnIndex) => <div key={turnIndex} className="rounded-lg border border-line bg-card p-2.5">
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <input value={turn.speaker} maxLength={100} onChange={event => update(index, { dialogue_turns: exercise.dialogue_turns.map((item, i) => i === turnIndex ? { ...item, speaker: event.target.value } : item) })} placeholder={t("builder.speakerPlaceholder")} className="min-h-11 min-w-0 rounded-lg border border-line bg-bg px-3 text-sm" />
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={turn.is_blank} onChange={event => update(index, { dialogue_turns: exercise.dialogue_turns.map((item, i) => i === turnIndex ? { ...item, is_blank: event.target.checked, text: event.target.checked ? "" : item.text, accepted_answers: event.target.checked ? (item.accepted_answers.length ? item.accepted_answers : [""]) : [] } : item) })} className="size-4 accent-brand-blue" /> {t("builder.isBlankTurn")}
                </label>
              </div>
              {!turn.is_blank ? (
                <input value={turn.text} maxLength={500} onChange={event => update(index, { dialogue_turns: exercise.dialogue_turns.map((item, i) => i === turnIndex ? { ...item, text: event.target.value } : item) })} placeholder={t("builder.turnTextPlaceholder")} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm" />
              ) : (
                <div className="mt-2 space-y-1.5">
                  {turn.accepted_answers.map((answer, answerIndex) => <div key={answerIndex} className="flex items-center gap-2">
                    <input value={answer} maxLength={500} onChange={event => update(index, { dialogue_turns: exercise.dialogue_turns.map((item, i) => i === turnIndex ? { ...item, accepted_answers: item.accepted_answers.map((a, ai) => ai === answerIndex ? event.target.value : a) } : item) })} placeholder={t("builder.acceptedAnswerPlaceholder")} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
                    {turn.accepted_answers.length > 1 && <button type="button" onClick={() => update(index, { dialogue_turns: exercise.dialogue_turns.map((item, i) => i === turnIndex ? { ...item, accepted_answers: item.accepted_answers.filter((_, ai) => ai !== answerIndex) } : item) })} className="min-h-11 min-w-11 rounded-lg border border-line" aria-label={t("builder.removeAcceptedAnswer")}>×</button>}
                  </div>)}
                  {turn.accepted_answers.length < 5 && <button type="button" onClick={() => update(index, { dialogue_turns: exercise.dialogue_turns.map((item, i) => i === turnIndex ? { ...item, accepted_answers: [...item.accepted_answers, ""] } : item) })} className="text-xs font-bold text-brand-blue">{t("builder.addAcceptedAnswer")}</button>}
                </div>
              )}
              {exercise.dialogue_turns.length > 2 && <button type="button" onClick={() => update(index, { dialogue_turns: exercise.dialogue_turns.filter((_, i) => i !== turnIndex) })} className="mt-2 text-xs font-bold text-brand-coral">{t("builder.removeTurn")}</button>}
            </div>)}
            {exercise.dialogue_turns.length < 20 && <button type="button" onClick={() => update(index, { dialogue_turns: [...exercise.dialogue_turns, { speaker: exercise.dialogue_turns[exercise.dialogue_turns.length - 1]?.speaker === "A" ? "B" : "A", text: "", is_blank: false, accepted_answers: [] }] })} className="min-h-11 text-sm font-bold text-brand-blue">{t("builder.addTurn")}</button>}
          </div>}
          {([...ANSWER_KINDS, "writing", "game", "series", "word_order", "error_correction", "dialogue_completion"] as LessonExercise["kind"][]).includes(exercise.kind) && <fieldset className="mt-4 rounded-xl border border-line bg-bg p-3">
            <legend className="px-1 text-sm font-bold text-ink">Student submission</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={exercise.allow_resubmit} onChange={event => update(index, { allow_resubmit: event.target.checked })} className="size-4 accent-brand-blue" /> Students can edit and submit again</label>
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={!!exercise.deadline_at} onChange={event => update(index, { deadline_at: event.target.checked ? new Date(Date.now() + 7 * 86400000).toISOString() : null })} className="size-4 accent-brand-blue" /> Set a deadline</label>
            {exercise.deadline_at && <label className="mt-2 block text-sm font-semibold">Deadline
              <input type="datetime-local" value={exercise.deadline_at.slice(0, 16)} onChange={event => update(index, { deadline_at: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 font-normal" />
            </label>}
          </fieldset>}
          {exercise.kind === "game" && <div className="mt-3 space-y-2"><p className="text-sm font-semibold">{t("builder.matchPairs")}</p>
            {exercise.pairs.map((pair, pairIndex) => <div key={pairIndex} className="grid grid-cols-2 gap-2">
              <input value={pair.left} maxLength={500} onChange={event => update(index, { pairs: exercise.pairs.map((item, i) => i === pairIndex ? { ...item, left: event.target.value } : item) })} placeholder={t("builder.pairLeft")} className="min-h-11 min-w-0 rounded-lg border border-line bg-bg px-3 text-sm" />
              <input value={pair.right} maxLength={500} onChange={event => update(index, { pairs: exercise.pairs.map((item, i) => i === pairIndex ? { ...item, right: event.target.value } : item) })} placeholder={t("builder.pairRight")} className="min-h-11 min-w-0 rounded-lg border border-line bg-bg px-3 text-sm" />
            </div>)}
            <div className="flex gap-3">{exercise.pairs.length < 8 && <button type="button" onClick={() => update(index, { pairs: [...exercise.pairs, { left: "", right: "" }] })} className="min-h-11 text-sm font-bold text-brand-blue">{t("builder.addPair")}</button>}{exercise.pairs.length > 2 && <button type="button" onClick={() => update(index, { pairs: exercise.pairs.slice(0, -1) })} className="min-h-11 text-sm text-brand-coral">{t("builder.removePair")}</button>}</div>
          </div>}
          {exercise.kind === "word_order" && <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">{t("builder.sentenceWordsLabel")}</p>
            <p className="text-xs text-muted">{t("builder.sentenceWordsHint")}</p>
            {exercise.ordering_words.map((word, wordIndex) => <div key={wordIndex} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-xs font-bold text-muted">{wordIndex + 1}</span>
              <input value={word} maxLength={100} onChange={event => update(index, { ordering_words: exercise.ordering_words.map((item, i) => i === wordIndex ? event.target.value : item) })} placeholder={t("builder.wordPlaceholder")} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
              {exercise.ordering_words.length > 2 && <button type="button" onClick={() => update(index, { ordering_words: exercise.ordering_words.filter((_, i) => i !== wordIndex) })} className="min-h-11 min-w-11 rounded-lg border border-line" aria-label={t("builder.removeWord")}>×</button>}
            </div>)}
            {exercise.ordering_words.length < 20 && <button type="button" onClick={() => update(index, { ordering_words: [...exercise.ordering_words, ""] })} className="min-h-11 text-sm font-bold text-brand-blue">{t("builder.addSentenceWord")}</button>}
            {exercise.ordering_words.filter(w => w.trim()).length >= 2 && <p className="rounded-lg bg-bg p-2 text-xs text-muted">{t("builder.sentencePreview")}: {exercise.ordering_words.filter(w => w.trim()).join(" ")}</p>}
          </div>}
          {ANSWER_KINDS.has(exercise.kind) && <div className="mt-3 space-y-2">
            <p className="text-xs text-muted">{t("builder.correctAnswerHint")}</p>
            {exercise.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-2">
              <input type="radio" name={`correct-${index}`} checked={exercise.correct_option === optionIndex} onChange={() => update(index, { correct_option: optionIndex })} aria-label={`${t("builder.correctAnswer")} ${optionIndex + 1}`} />
              <input value={option} maxLength={500} onChange={event => update(index, { options: exercise.options.map((item, i) => i === optionIndex ? event.target.value : item) })} placeholder={`${t("builder.answerOption")} ${optionIndex + 1}`} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
              {exercise.options.length > 2 && <button type="button" onClick={() => update(index, { options: exercise.options.filter((_, i) => i !== optionIndex), correct_option: exercise.correct_option === optionIndex ? 0 : Math.max(0, (exercise.correct_option ?? 0) - Number((exercise.correct_option ?? 0) > optionIndex)) })} className="min-h-11 min-w-11 rounded-lg border border-line" aria-label={t("builder.removeOption")}>×</button>}
            </div>)}
            {exercise.options.length < 6 && <button type="button" onClick={() => update(index, { options: [...exercise.options, ""] })} className="min-h-11 text-sm font-bold text-brand-blue">{t("builder.addOption")}</button>}
            <label className="block text-sm font-semibold">{t("builder.explanation")}
              <input value={exercise.explanation} maxLength={500} onChange={event => update(index, { explanation: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-bg px-3 font-normal" />
            </label>
          </div>}
          </>}
        </div></div>)}
      </div>
      </div>
      <aside className="rounded-2xl border border-line bg-card p-4 xl:sticky xl:top-0">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Student preview</p>
        <p className="mt-1 text-sm text-muted">A live preview of the selected activity.</p>
        <div className="mt-4 rounded-[2rem] border-[7px] border-slate-800 bg-bg p-3 shadow-inner">
          {(() => { const item = exercises[expandedIndex ?? 0]; return item ? <div><p className="text-[10px] font-bold uppercase text-brand-blue">{item.kind.replaceAll("_", " ")}</p><h4 className="mt-2 text-sm font-bold text-ink">{item.prompt || "Your activity question will appear here"}</h4>{item.media_url && <div className="mt-3 grid min-h-24 place-items-center rounded-xl bg-brand-primary-pale text-xs text-brand-blue">Image</div>}{item.options.length > 0 && <div className="mt-3 grid gap-2">{item.options.map((option, optionIndex) => <div key={optionIndex} className="rounded-xl border border-line bg-card px-3 py-2 text-xs">○ {option || `Option ${optionIndex + 1}`}</div>)}</div>}{item.ordering_words.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{[...item.ordering_words].reverse().map((word, i) => <span key={i} className="rounded-lg border border-line bg-card px-2 py-1 text-xs">{word || `#${item.ordering_words.length - i}`}</span>)}</div>}{item.kind === "speaking" && <button type="button" className="mt-3 w-full rounded-xl bg-brand-blue px-3 py-2 text-xs font-bold text-white">Start speaking</button>}</div> : <p className="py-12 text-center text-xs text-muted">Add a skill to see the student view.</p>; })()}
        </div>
      </aside>
    </div>
    </div>
    <DragOverlay>{activeDragId ? <div className="rounded-xl border border-brand-blue bg-card p-3 text-sm font-bold shadow-lg">{activeDragId.startsWith("palette:") ? activeDragId.slice(8).replaceAll("_", " ") : t("builder.movingBlock")}</div> : null}</DragOverlay>
    </DndContext>
    <div className="rounded-2xl border border-brand-blue/20 bg-brand-primary-pale/40 p-4 text-sm text-ink">
      Save the reusable lesson here. Assign it to Programs from the Topic Library, then choose its day and order only in Calendars.
    </div>
  </section>;
}
