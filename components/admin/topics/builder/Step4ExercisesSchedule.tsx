"use client";

import { useState } from "react";
import type { CalendarTemplate, LessonExercise, Level } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const RESERVED_DAYS = new Set([5, 12, 19, 26]);
const DAYS = Array.from({ length: 30 }, (_, index) => index + 1).filter(day => !RESERVED_DAYS.has(day));
const SKILL_KINDS = ["video", "vocab", "image_completion", "listening", "grammar", "reading", "writing", "speaking", "game", "series"] as const;
const ANSWER_KINDS = new Set<LessonExercise["kind"]>(["multiple_choice", "image_completion", "listening", "grammar", "reading"]);
const AI_KINDS = new Set<LessonExercise["kind"]>(["multiple_choice", "reflection", "listening", "grammar", "reading", "writing", "speaking", "game", "series"]);

function newExercise(kind: LessonExercise["kind"]): LessonExercise {
  return {
    kind, prompt: kind === "video" ? "Watch the lesson video." : kind === "vocab" ? "Learn the key words." : "",
    options: ANSWER_KINDS.has(kind) ? ["", ""] : [], correct_option: ANSWER_KINDS.has(kind) ? 0 : null,
    explanation: "", content: "", arabic_note: "", media_url: "", pairs: kind === "game" ? [{ left: "", right: "" }, { left: "", right: "" }] : [], min_words: kind === "writing" ? 20 : 0,
  };
}

export function Step4ExercisesSchedule({ exercises, onExercisesChange, templates, loadingTemplates, templateId, onTemplateIdChange, day, onDayChange, level, hasVideo, hasVocabulary, canAiDraft, generatingIndex, suggestions, onGenerate, onAcceptSuggestions, onDiscardSuggestions }: {
  exercises: LessonExercise[];
  onExercisesChange: (exercises: LessonExercise[]) => void;
  templates: CalendarTemplate[];
  loadingTemplates: boolean;
  templateId: string;
  onTemplateIdChange: (id: string) => void;
  day: number | null;
  onDayChange: (day: number | null) => void;
  level: Level;
  hasVideo: boolean;
  hasVocabulary: boolean;
  canAiDraft: boolean;
  generatingIndex: number | null;
  suggestions: { index: number; exercises: LessonExercise[] } | null;
  onGenerate: (index: number, count: number) => void;
  onAcceptSuggestions: () => void;
  onDiscardSuggestions: () => void;
}) {
  const { t } = useI18n();
  const [draftCount, setDraftCount] = useState(3);
  const applicable = templates.filter(template => template.kind === "custom" || template.level === level);
  const selected = applicable.find(template => template.id === templateId);
  const update = (index: number, changes: Partial<LessonExercise>) =>
    onExercisesChange(exercises.map((exercise, i) => i === index ? { ...exercise, ...changes } : exercise));

  return <section className="mx-auto max-w-[820px] space-y-7">
    <div>
      <h3 className="text-xl font-bold text-ink">{t("builder.exerciseTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t("builder.exerciseDesc")}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SKILL_KINDS.map(kind => {
          const labels = { video: t("builder.skillVideo"), vocab: t("builder.skillVocab"), image_completion: t("builder.skillImages"), listening: t("builder.skillListening"), grammar: t("builder.skillGrammar"), reading: t("builder.skillReading"), writing: t("builder.skillWriting"), speaking: t("builder.skillSpeaking"), game: t("builder.skillGame"), series: t("builder.skillSeries") };
          const notes = { video: t("builder.skillVideoDesc"), vocab: t("builder.skillVocabDesc"), image_completion: t("builder.skillImagesDesc"), listening: t("builder.skillListeningDesc"), grammar: t("builder.skillGrammarDesc"), reading: t("builder.skillReadingDesc"), writing: t("builder.skillWritingDesc"), speaking: t("builder.skillSpeakingDesc"), game: t("builder.skillGameDesc"), series: t("builder.skillSeriesDesc") };
          const disabled = kind === "video" && !hasVideo || kind === "vocab" && !hasVocabulary;
          return <button key={kind} type="button" disabled={disabled} onClick={() => onExercisesChange([...exercises, newExercise(kind)])} className="min-h-24 rounded-xl border border-line bg-card p-3 text-start hover:border-brand-blue hover:bg-brand-primary-pale disabled:cursor-not-allowed disabled:opacity-50">
            <b className="block text-sm text-ink">+ {labels[kind]}</b><span className="mt-1 block text-xs text-muted">{notes[kind]}</span>
          </button>;
        })}
      </div>
      {exercises.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t("builder.noExercises")}</p>}
      <div className="mt-4 space-y-4">
        {exercises.map((exercise, index) => <div key={index} className="rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">{index + 1}. {exercise.kind.replaceAll("_", " ")}</b>
            <div className="flex gap-2">
              <button type="button" disabled={index === 0} onClick={() => { const next = [...exercises]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onExercisesChange(next); }} className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-40" aria-label={t("builder.moveUp")}>↑</button>
              <button type="button" disabled={index === exercises.length - 1} onClick={() => { const next = [...exercises]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onExercisesChange(next); }} className="min-h-11 min-w-11 rounded-lg border border-line disabled:opacity-40" aria-label={t("builder.moveDown")}>↓</button>
              <button type="button" onClick={() => onExercisesChange(exercises.filter((_, i) => i !== index))} className="min-h-11 rounded-lg border border-line px-3 text-sm text-brand-coral">{t("builder.removeExercise")}</button>
            </div>
          </div>
          <label className="mt-3 block text-sm font-semibold">{t("builder.exercisePrompt")}
            <textarea value={exercise.prompt} maxLength={500} onChange={event => update(index, { prompt: event.target.value })} rows={2} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3 font-normal" />
          </label>
          {AI_KINDS.has(exercise.kind) && <div className="mt-3 rounded-lg border border-brand-blue/20 bg-brand-primary-pale/40 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold">{t("builder.aiQuestionCount")}
                <select value={draftCount} onChange={event => setDraftCount(Number(event.target.value))} className="mt-1 block min-h-11 rounded-lg border border-line bg-card px-2 text-sm">{[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count}</option>)}</select>
              </label>
              <button type="button" disabled={!canAiDraft || generatingIndex !== null} onClick={() => onGenerate(index, draftCount)} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">{generatingIndex === index ? t("builder.aiGenerating") : t("builder.aiGenerate")}</button>
            </div>
            <p className="mb-0 mt-2 text-xs text-muted">{canAiDraft ? t("builder.aiReviewHint") : t("builder.aiNeedsSource")}</p>
            {suggestions?.index === index && <div className="mt-3 rounded-lg border border-line bg-card p-3">
              <b className="text-sm">{t("builder.aiSuggestions")}</b>
              <ol className="mt-2 list-inside list-decimal space-y-3 text-sm">{suggestions.exercises.map((item, i) => <li key={i}>
                <b>{item.prompt}</b>
                {item.content && <span className="mt-1 block whitespace-pre-wrap ps-5 text-xs text-muted">{item.content}</span>}
                {item.arabic_note && <span dir="rtl" className="mt-1 block ps-5 text-xs text-muted">{item.arabic_note}</span>}
                {item.options.length > 0 && <span className="mt-1 block ps-5 text-xs text-muted">{item.options.join(" · ")} · {t("builder.correctAnswer")}: {item.options[item.correct_option ?? 0]}</span>}
                {item.pairs.length > 0 && <span className="mt-1 block ps-5 text-xs text-muted">{item.pairs.map(pair => `${pair.left} → ${pair.right}`).join(" · ")}</span>}
              </li>)}</ol>
              <div className="mt-3 flex gap-2"><button type="button" onClick={onAcceptSuggestions} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">{t("builder.aiUseSuggestions")}</button><button type="button" onClick={onDiscardSuggestions} className="min-h-11 rounded-lg border border-line px-4 text-sm">{t("builder.aiDiscard")}</button></div>
            </div>}
          </div>}
          {exercise.kind === "image_completion" && <label className="mt-3 block text-sm font-semibold">{t("builder.imageUrl")}
            <input type="url" value={exercise.media_url} onChange={event => update(index, { media_url: event.target.value })} placeholder="https://…" className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-bg px-3 font-normal" />
          </label>}
          {(["listening", "grammar", "reading", "series"] as LessonExercise["kind"][]).includes(exercise.kind) && <label className="mt-3 block text-sm font-semibold">{exercise.kind === "listening" ? t("builder.listeningScript") : exercise.kind === "grammar" ? t("builder.grammarRule") : exercise.kind === "series" ? t("builder.episodeText") : t("builder.readingPassage")}
            <textarea value={exercise.content} maxLength={5000} onChange={event => update(index, { content: event.target.value })} rows={4} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3 font-normal" />
          </label>}
          {exercise.kind === "grammar" && <label className="mt-3 block text-sm font-semibold">{t("builder.arabicNote")}
            <textarea dir="rtl" value={exercise.arabic_note} maxLength={1000} onChange={event => update(index, { arabic_note: event.target.value })} rows={2} className="mt-1 block w-full rounded-lg border border-line bg-bg p-3 font-normal" />
          </label>}
          {exercise.kind === "writing" && <label className="mt-3 block text-sm font-semibold">{t("builder.minimumWords")}
            <input type="number" min={0} max={500} value={exercise.min_words} onChange={event => update(index, { min_words: Number(event.target.value) })} className="mt-1 block min-h-11 w-28 rounded-lg border border-line bg-bg px-3 font-normal" />
          </label>}
          {exercise.kind === "game" && <div className="mt-3 space-y-2"><p className="text-sm font-semibold">{t("builder.matchPairs")}</p>
            {exercise.pairs.map((pair, pairIndex) => <div key={pairIndex} className="grid grid-cols-2 gap-2">
              <input value={pair.left} maxLength={500} onChange={event => update(index, { pairs: exercise.pairs.map((item, i) => i === pairIndex ? { ...item, left: event.target.value } : item) })} placeholder={t("builder.pairLeft")} className="min-h-11 min-w-0 rounded-lg border border-line bg-bg px-3 text-sm" />
              <input value={pair.right} maxLength={500} onChange={event => update(index, { pairs: exercise.pairs.map((item, i) => i === pairIndex ? { ...item, right: event.target.value } : item) })} placeholder={t("builder.pairRight")} className="min-h-11 min-w-0 rounded-lg border border-line bg-bg px-3 text-sm" />
            </div>)}
            <div className="flex gap-3">{exercise.pairs.length < 8 && <button type="button" onClick={() => update(index, { pairs: [...exercise.pairs, { left: "", right: "" }] })} className="min-h-11 text-sm font-bold text-brand-blue">{t("builder.addPair")}</button>}{exercise.pairs.length > 2 && <button type="button" onClick={() => update(index, { pairs: exercise.pairs.slice(0, -1) })} className="min-h-11 text-sm text-brand-coral">{t("builder.removePair")}</button>}</div>
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
        </div>)}
      </div>
    </div>
    <div className="rounded-2xl border border-line bg-card p-5">
      <h3 className="text-xl font-bold text-ink">{t("builder.scheduleTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t("builder.scheduleDesc")}</p>
      {loadingTemplates ? <p className="mt-3 text-sm text-muted">{t("common.loading")}</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">{t("builder.planLabel")}
          <select value={templateId} onChange={event => { onTemplateIdChange(event.target.value); onDayChange(null); }} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-bg px-3 font-normal">
            <option value="">{t("builder.noPlan")}</option>
            {applicable.map(template => <option key={template.id} value={template.id}>{template.name}{template.is_active ? ` · ${t("builder.activePlan")}` : ""}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">{t("builder.dayLabel")}
          <select value={day ?? ""} disabled={!templateId} onChange={event => onDayChange(event.target.value ? Number(event.target.value) : null)} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-bg px-3 font-normal disabled:opacity-50">
            <option value="">{t("builder.noDay")}</option>
            {DAYS.map(value => <option key={value} value={value}>{t("builder.dayOption", { day: value })}</option>)}
          </select>
        </label>
      </div>}
      {selected && !selected.is_active && selected.kind === "standard" && <p className="mt-3 text-xs text-muted">{t("builder.inactivePlanHint")}</p>}
      {!loadingTemplates && applicable.length === 0 && <p className="mt-3 text-sm text-muted">{t("builder.createPlanHint")}</p>}
    </div>
  </section>;
}
