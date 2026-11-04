"use client";

import { useState } from "react";
import type { TopicPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const ANSWER_KINDS = new Set(["multiple_choice", "image_completion", "listening", "grammar", "reading"]);

export function LessonExercises({ topic, onVideo, onDiscuss }: { topic: TopicPublic; onVideo: () => void; onDiscuss: () => void }) {
  const { t } = useI18n();
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [matches, setMatches] = useState<Record<number, Record<number, number>>>({});
  const speak = (value: string) => {
    if (!value || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  return <div className="space-y-5">
    <div><h3 className="text-lg font-bold text-ink">{t("player.exercisesTitle")}</h3><p className="mt-1 text-xs text-muted">{t("player.exercisesLocalNotice")}</p></div>
    {topic.lesson_exercises.map((exercise, index) => <section key={index} className="rounded-xl border border-line bg-bg p-4">
      <span className="text-xs font-bold uppercase tracking-wide text-brand-blue">{index + 1} · {exercise.kind.replaceAll("_", " ")}</span>
      <p className="mb-3 mt-2 text-sm font-bold text-ink">{exercise.prompt}</p>

      {exercise.kind === "video" && <button type="button" onClick={onVideo} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">{t("player.openVideo")}</button>}

      {exercise.kind === "vocab" && <div className="grid gap-2 sm:grid-cols-2">{topic.vocabulary.map(word => <div key={word.term} className="rounded-lg border border-line bg-card p-3">
        <div className="flex items-center justify-between gap-2"><b className="text-sm">{word.term}</b><button type="button" onClick={() => speak(word.term)} className="min-h-11 min-w-11 rounded-lg border border-line" aria-label={`${t("player.hearWord")} ${word.term}`}>🔊</button></div>
        {word.arabic_meaning && <p dir="rtl" className="my-1 text-sm text-muted">{word.arabic_meaning}</p>}{word.example_sentence && <p className="mb-0 text-xs text-muted">{word.example_sentence}</p>}
      </div>)}</div>}

      {exercise.kind === "image_completion" && exercise.media_url && <div className="mb-3 overflow-hidden rounded-xl border border-line bg-card">
        {/* Teacher-supplied URL is validated as http(s) by the API; arbitrary lesson images cannot use next/image's static host allowlist. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={exercise.media_url} alt={exercise.prompt} className="max-h-80 w-full object-contain" />
      </div>}

      {exercise.kind === "listening" && <button type="button" onClick={() => speak(exercise.content)} className="mb-3 min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-bold text-brand-blue">🔊 {t("player.playListening")}</button>}

      {(["grammar", "reading", "series"] as string[]).includes(exercise.kind) && <div className="mb-3 whitespace-pre-wrap rounded-lg border border-line bg-card p-4 text-sm leading-relaxed text-ink">
        {exercise.content}{exercise.arabic_note && <p dir="rtl" className="mb-0 mt-3 text-muted">{exercise.arabic_note}</p>}
        {exercise.kind === "series" && <button type="button" onClick={() => speak(exercise.content)} className="mt-3 min-h-11 rounded-lg border border-line px-3 text-brand-blue">🔊 {t("player.hearEpisode")}</button>}
      </div>}

      {ANSWER_KINDS.has(exercise.kind) && <>
        <div className="space-y-2">{exercise.options.map((option, optionIndex) => <label key={optionIndex} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${checked[index] && optionIndex === exercise.correct_option ? "border-green-600 bg-green-50 text-green-900" : checked[index] && choices[index] === optionIndex ? "border-brand-coral bg-brand-coral-pale" : "border-line bg-card"}`}>
          <input type="radio" name={`exercise-${index}`} checked={choices[index] === optionIndex} disabled={!!checked[index]} onChange={() => setChoices(current => ({ ...current, [index]: optionIndex }))} />{option}
        </label>)}</div>
        {!checked[index] ? <button type="button" disabled={choices[index] === undefined} onClick={() => setChecked(current => ({ ...current, [index]: true }))} className="mt-3 min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{t("player.checkAnswer")}</button> : <p role="status" className="mt-3 text-sm font-semibold">{choices[index] === exercise.correct_option ? t("player.correctAnswer") : t("player.tryAgainNextTime")}{exercise.explanation ? ` — ${exercise.explanation}` : ""}</p>}
      </>}

      {exercise.kind === "game" && <div className="space-y-2">
        {exercise.pairs.map((pair, pairIndex) => <div key={pairIndex} className="flex items-center gap-2 rounded-lg border border-line bg-card p-2 text-sm">
          <b className="min-w-0 flex-1">{pair.left}</b><span aria-hidden="true">→</span>
          <select value={matches[index]?.[pairIndex] ?? ""} disabled={!!checked[index]} onChange={event => setMatches(current => ({ ...current, [index]: { ...current[index], [pairIndex]: Number(event.target.value) } }))} aria-label={`${t("player.matchFor")} ${pair.left}`} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2">
            <option value="">{t("player.chooseMatch")}</option>{exercise.pairs.map((_, reversedIndex) => { const originalIndex = exercise.pairs.length - 1 - reversedIndex; return <option key={originalIndex} value={originalIndex}>{exercise.pairs[originalIndex].right}</option>; })}
          </select>
        </div>)}
        {!checked[index] ? <button type="button" disabled={exercise.pairs.some((_, i) => matches[index]?.[i] === undefined)} onClick={() => setChecked(current => ({ ...current, [index]: true }))} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{t("player.checkAnswer")}</button> : <p role="status" className="text-sm font-semibold">{exercise.pairs.every((_, i) => matches[index]?.[i] === i) ? t("player.correctAnswer") : t("player.tryAgainNextTime")}</p>}
      </div>}

      {(["writing", "reflection"] as string[]).includes(exercise.kind) && <label className="block text-sm text-muted">{t("player.yourResponse")}
        <textarea value={responses[index] ?? ""} onChange={event => setResponses(current => ({ ...current, [index]: event.target.value }))} rows={4} className="mt-2 block w-full rounded-lg border border-line bg-card p-3 text-ink" />
        {exercise.kind === "writing" && <span className="mt-1 block text-xs">{t("player.wordCount", { count: (responses[index] ?? "").trim().split(/\s+/).filter(Boolean).length, minimum: exercise.min_words })}</span>}
      </label>}

      {exercise.kind === "speaking" && <button type="button" onClick={onDiscuss} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">{t("player.startSpeaking")}</button>}
    </section>)}
  </div>;
}
