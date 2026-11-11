"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { ApiError, exerciseAttemptsApi, submissionsApi } from "@/lib/api/client";
import { Recorder } from "./Recorder";
import type { ExerciseAttemptPublic, TopicPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const ANSWER_KINDS = new Set(["multiple_choice", "image_completion", "listening", "grammar", "reading"]);

/** Deterministic per-exercise shuffle (Fisher-Yates with a small seeded
 * PRNG) rather than `Math.random()` - the same exercise must show the same
 * scrambled order across a re-render within one visit, and a real shuffle
 * (not just a reversal) gives a harder, more useful activity. */
function shuffledIndices(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  let state = seed || 1;
  const next = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state; };
  for (let i = order.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  // A shuffle that happens to land on the already-correct order teaches
  // nothing - force at least one swap away from it when there's room to.
  if (count > 1 && order.every((value, i) => value === i)) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

function ExerciseImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  if (failed) return <div role="status" className="mb-4 grid min-h-36 place-items-center rounded-2xl border border-dashed border-line bg-bg p-5 text-center text-sm text-muted"><div><ImageOff className="mx-auto mb-2 size-7" aria-hidden="true" /><p>{t("player.imageUnavailable")}</p></div></div>;
  return <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-bg">
    {/* Teacher media can use any API-validated http(s) origin. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} onError={() => setFailed(true)} className="max-h-80 min-h-36 w-full object-contain" />
  </div>;
}

export function LessonExercises({ topic, enrollmentId, onVideo, onDiscuss }: { topic: TopicPublic; enrollmentId?: string; onVideo: () => void; onDiscuss: () => void }) {
  const { t } = useI18n();
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [matches, setMatches] = useState<Record<number, Record<number, number>>>({});
  // Word Order: `orderPool[index]` is the remaining shuffled word indices
  // (not yet placed), `orderChosen[index]` is the indices the student has
  // picked so far, in the order picked - submitted verbatim as the answer.
  const [orderPool, setOrderPool] = useState<Record<number, number[]>>({});
  const [orderChosen, setOrderChosen] = useState<Record<number, number[]>>({});
  const [attempts, setAttempts] = useState<Record<number, ExerciseAttemptPublic>>({});
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [speakingStatus, setSpeakingStatus] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setChoices({});
    setChecked({});
    setResponses({});
    setMatches({});
    setAttempts({});
    setErrors({});
    setLoadError(false);
    // Word Order exercises always start shuffled (not yet attempted) -
    // overwritten below for any index that already has a saved attempt.
    const freshPool: Record<number, number[]> = {};
    const freshChosen: Record<number, number[]> = {};
    topic.lesson_exercises.forEach((exercise, index) => {
      if (exercise.kind === "word_order") {
        freshPool[index] = shuffledIndices(exercise.ordering_words.length, index + 1);
        freshChosen[index] = [];
      }
    });
    setOrderPool(freshPool);
    setOrderChosen(freshChosen);
    exerciseAttemptsApi.mine(topic.id, enrollmentId).then(items => {
      if (!active) return;
      setAttempts(Object.fromEntries(items.map(item => [item.exercise_index, item])));
      setChecked(Object.fromEntries(items.filter(item => item.correct !== null).map(item => [item.exercise_index, true])));
      setChoices(Object.fromEntries(items.filter(item => typeof item.answer === "number").map(item => [item.exercise_index, item.answer as number])));
      setResponses(Object.fromEntries(items.filter(item => typeof item.answer === "string").map(item => [item.exercise_index, item.answer as string])));
      const gameMatches = items.filter(item => Array.isArray(item.answer) && topic.lesson_exercises[item.exercise_index]?.kind === "game");
      setMatches(Object.fromEntries(gameMatches.map(item => [item.exercise_index, Object.fromEntries((item.answer as number[]).map((value, index) => [index, value]))])));
      const orderAttempts = items.filter(item => Array.isArray(item.answer) && topic.lesson_exercises[item.exercise_index]?.kind === "word_order");
      if (orderAttempts.length) {
        setOrderChosen(current => ({ ...current, ...Object.fromEntries(orderAttempts.map(item => [item.exercise_index, item.answer as number[]])) }));
        setOrderPool(current => ({ ...current, ...Object.fromEntries(orderAttempts.map(item => [item.exercise_index, []])) }));
      }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
    // topic.lesson_exercises is intentionally excluded - this effect already
    // re-runs on topic.updated_at, the one signal a new published revision
    // (and therefore new exercises) actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, topic.updated_at, enrollmentId]);
  const submit = async (index: number, answer: number | string | number[]) => {
    setBusyIndex(index);
    setErrors(current => ({ ...current, [index]: "" }));
    try {
      const attempt = await exerciseAttemptsApi.submit({ topic_id: topic.id, topic_updated_at: topic.updated_at, exercise_index: index, answer, enrollment_id: enrollmentId });
      setAttempts(current => ({ ...current, [index]: attempt }));
      if (attempt.correct !== null) setChecked(current => ({ ...current, [index]: true }));
    } catch (error) {
      setErrors(current => ({ ...current, [index]: error instanceof ApiError ? error.message : t("player.answerSaveFailed") }));
    } finally {
      setBusyIndex(null);
    }
  };
  const retry = (index: number) => {
    setChecked(current => ({ ...current, [index]: false }));
    setAttempts(current => { const next = { ...current }; delete next[index]; return next; });
    const exercise = topic.lesson_exercises[index];
    if (exercise?.kind === "word_order") {
      setOrderPool(current => ({ ...current, [index]: shuffledIndices(exercise.ordering_words.length, index + 1 + Date.now() % 1000) }));
      setOrderChosen(current => ({ ...current, [index]: [] }));
    }
  };
  const pickOrderWord = (index: number, wordIndex: number) => {
    setOrderPool(current => ({ ...current, [index]: (current[index] ?? []).filter(i => i !== wordIndex) }));
    setOrderChosen(current => ({ ...current, [index]: [...(current[index] ?? []), wordIndex] }));
  };
  const unpickOrderWord = (index: number, position: number) => {
    setOrderChosen(current => {
      const chosen = current[index] ?? [];
      const removed = chosen[position];
      setOrderPool(pool => ({ ...pool, [index]: [...(pool[index] ?? []), removed] }));
      return { ...current, [index]: chosen.filter((_, i) => i !== position) };
    });
  };
  const speak = (value: string) => {
    if (!value || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  return <div className="space-y-4 sm:space-y-5">
    <div className="rounded-2xl bg-brand-primary-pale p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold text-ink">{t("player.exercisesTitle")}</h2><p className="mt-1 text-xs leading-relaxed text-muted">{t("player.exercisesSavedNotice")}</p></div><span className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-sm font-extrabold text-brand-blue shadow-sm">{topic.lesson_exercises.length}</span></div>{loadError && <p role="alert" className="mt-2 text-sm text-brand-coral">{t("player.answersLoadFailed")}</p>}</div>
    {topic.lesson_exercises.map((exercise, index) => {
      const deadlinePassed = !!exercise.deadline_at && new Date(exercise.deadline_at).getTime() < Date.now();
      const submissionLocked = deadlinePassed || (!!attempts[index] && !exercise.allow_resubmit);
      return <section key={index} className="rounded-3xl border border-line bg-card p-4 shadow-[0_8px_24px_rgb(var(--brand-shadow-rgb)/.07)] sm:p-5">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-extrabold text-brand-blue">{t("player.exerciseProgress", { current: index + 1, total: topic.lesson_exercises.length })}</span><span className="rounded-full bg-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">{exercise.kind.replaceAll("_", " ")}</span></div>
      <h3 className="mb-4 mt-3 text-base font-extrabold leading-relaxed text-ink sm:text-lg">{exercise.prompt}</h3>

      {exercise.kind === "video" && <button type="button" onClick={onVideo} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white">{t("player.openVideo")}</button>}

      {exercise.kind === "vocab" && <div className="grid gap-2 sm:grid-cols-2">{topic.vocabulary.map(word => <div key={word.term} className="rounded-lg border border-line bg-card p-3">
        <div className="flex items-center justify-between gap-2"><b className="text-sm">{word.term}</b><button type="button" onClick={() => speak(word.term)} className="min-h-11 min-w-11 rounded-lg border border-line" aria-label={`${t("player.hearWord")} ${word.term}`}>🔊</button></div>
        {word.arabic_meaning && <p dir="rtl" className="my-1 text-sm text-muted">{word.arabic_meaning}</p>}{word.example_sentence && <p className="mb-0 text-xs text-muted">{word.example_sentence}</p>}
      </div>)}</div>}

      {exercise.kind === "image_completion" && exercise.media_url && <ExerciseImage src={exercise.media_url} alt={exercise.prompt} />}

      {exercise.kind === "listening" && (exercise.audio_url ? <audio src={exercise.audio_url} controls className="mb-3 w-full" /> : <button type="button" onClick={() => speak(exercise.content)} className="mb-3 min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-bold text-brand-blue">🔊 {t("player.playListening")}</button>)}

      {(["grammar", "reading", "series"] as string[]).includes(exercise.kind) && <div className="mb-3 whitespace-pre-wrap rounded-lg border border-line bg-card p-4 text-sm leading-relaxed text-ink">
        {exercise.content}{exercise.arabic_note && <p dir="rtl" className="mb-0 mt-3 text-muted">{exercise.arabic_note}</p>}
        {exercise.kind === "series" && <button type="button" onClick={() => speak(exercise.content)} className="mt-3 min-h-11 rounded-lg border border-line px-3 text-brand-blue">🔊 {t("player.hearEpisode")}</button>}
      </div>}

      {ANSWER_KINDS.has(exercise.kind) && <>
        <div className="space-y-2.5">{exercise.options.map((option, optionIndex) => <label key={optionIndex} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 text-sm leading-relaxed transition-colors ${checked[index] && optionIndex === attempts[index]?.correct_option ? "border-green-600 bg-green-50 text-green-900" : checked[index] && choices[index] === optionIndex ? "border-brand-coral bg-brand-coral-pale" : choices[index] === optionIndex ? "border-brand-blue bg-brand-primary-pale" : "border-line bg-bg"}`}>
          <input type="radio" name={`exercise-${index}`} checked={choices[index] === optionIndex} disabled={!!checked[index]} onChange={() => setChoices(current => ({ ...current, [index]: optionIndex }))} className="size-5 shrink-0 accent-brand-blue" /><span className="min-w-0 [overflow-wrap:anywhere]">{option}</span>
        </label>)}</div>
        {!checked[index] ? <button type="button" disabled={submissionLocked || choices[index] === undefined || busyIndex === index} onClick={() => void submit(index, choices[index])} className="mt-4 min-h-12 w-full rounded-2xl bg-brand-blue px-4 text-sm font-extrabold text-white shadow-[0_6px_16px_rgb(var(--brand-shadow-rgb)/.2)] disabled:opacity-40 sm:w-auto sm:min-w-40">{busyIndex === index ? t("player.savingAnswer") : t("player.checkAnswer")}</button> : <div role="status" className="mt-4 rounded-2xl bg-bg p-3 text-sm font-semibold"><p>{attempts[index]?.correct ? t("player.correctAnswer") : t("player.tryAgainNextTime")}{exercise.explanation ? ` — ${exercise.explanation}` : ""}</p>{!attempts[index]?.correct && exercise.allow_resubmit && !deadlinePassed && <button type="button" onClick={() => retry(index)} className="min-h-11 text-brand-blue">{t("player.retryAnswer")}</button>}</div>}
      </>}

      {exercise.kind === "game" && <div className="space-y-2">
        {exercise.pairs.map((pair, pairIndex) => <div key={pairIndex} className="flex items-center gap-2 rounded-lg border border-line bg-card p-2 text-sm">
          <b className="min-w-0 flex-1">{pair.left}</b><span aria-hidden="true">→</span>
          <select value={matches[index]?.[pairIndex] ?? ""} disabled={!!checked[index]} onChange={event => setMatches(current => ({ ...current, [index]: { ...current[index], [pairIndex]: Number(event.target.value) } }))} aria-label={`${t("player.matchFor")} ${pair.left}`} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2">
            <option value="">{t("player.chooseMatch")}</option>{exercise.pairs.map((_, reversedIndex) => { const originalIndex = exercise.pairs.length - 1 - reversedIndex; return <option key={originalIndex} value={originalIndex}>{exercise.pairs[originalIndex].right}</option>; })}
          </select>
        </div>)}
        {!checked[index] ? <button type="button" disabled={submissionLocked || busyIndex === index || exercise.pairs.some((_, i) => matches[index]?.[i] === undefined)} onClick={() => void submit(index, exercise.pairs.map((_, i) => matches[index][i]))} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{busyIndex === index ? t("player.savingAnswer") : t("player.checkAnswer")}</button> : <div role="status" className="text-sm font-semibold"><p>{attempts[index]?.correct ? t("player.correctAnswer") : t("player.tryAgainNextTime")}</p>{!attempts[index]?.correct && exercise.allow_resubmit && !deadlinePassed && <button type="button" onClick={() => retry(index)} className="min-h-11 text-brand-blue">{t("player.retryAnswer")}</button>}</div>}
      </div>}

      {exercise.kind === "word_order" && <div className="space-y-3">
        <p className="text-xs text-muted">{t("player.wordOrderHint")}</p>
        <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-line bg-bg p-3">
          {(orderChosen[index] ?? []).length === 0 && !checked[index] && <span className="text-xs text-muted">{t("player.wordOrderEmptyAssembled")}</span>}
          {(orderChosen[index] ?? []).map((wordIndex, position) => (
            <button key={position} type="button" disabled={!!checked[index] || submissionLocked}
              onClick={() => unpickOrderWord(index, position)}
              className={`min-h-11 rounded-xl border-2 px-3 text-sm font-semibold transition-colors ${
                checked[index] ? (attempts[index]?.correct ? "border-green-600 bg-green-50 text-green-900" : "border-brand-coral bg-brand-coral-pale") : "border-brand-blue bg-brand-primary-pale"
              }`}
              aria-label={`${t("player.removeWord")} ${exercise.ordering_words[wordIndex]}`}
            >{exercise.ordering_words[wordIndex]}</button>
          ))}
        </div>
        {!checked[index] && (orderPool[index] ?? []).length > 0 && <div className="flex flex-wrap gap-2">
          {(orderPool[index] ?? []).map(wordIndex => (
            <button key={wordIndex} type="button" disabled={submissionLocked}
              onClick={() => pickOrderWord(index, wordIndex)}
              className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-ink transition hover:border-brand-blue"
            >{exercise.ordering_words[wordIndex]}</button>
          ))}
        </div>}
        {!checked[index] ? (
          <button type="button" disabled={submissionLocked || busyIndex === index || (orderPool[index] ?? []).length > 0 || (orderChosen[index] ?? []).length === 0}
            onClick={() => void submit(index, orderChosen[index] ?? [])}
            className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40"
          >{busyIndex === index ? t("player.savingAnswer") : t("player.checkAnswer")}</button>
        ) : (
          <div role="status" className="text-sm font-semibold">
            <p>{attempts[index]?.correct ? t("player.correctAnswer") : t("player.wordOrderCorrectWas", { sentence: exercise.ordering_words.join(" ") })}</p>
            {!attempts[index]?.correct && exercise.allow_resubmit && !deadlinePassed && <button type="button" onClick={() => retry(index)} className="min-h-11 text-brand-blue">{t("player.retryAnswer")}</button>}
          </div>
        )}
      </div>}

      {(["writing", "reflection"] as string[]).includes(exercise.kind) && <label className="block text-sm text-muted">{t("player.yourResponse")}
        <textarea value={responses[index] ?? ""} maxLength={5000} onChange={event => setResponses(current => ({ ...current, [index]: event.target.value }))} rows={4} className="mt-2 block w-full rounded-lg border border-line bg-card p-3 text-ink" />
        {exercise.kind === "writing" && <span className="mt-1 block text-xs">{t("player.wordCount", { count: (responses[index] ?? "").trim().split(/\s+/).filter(Boolean).length, minimum: exercise.min_words })}</span>}
      </label>}
      {(["writing", "reflection"] as string[]).includes(exercise.kind) && <div className="mt-2">
        <button type="button" disabled={submissionLocked || busyIndex === index || !(responses[index] ?? "").trim() || responses[index]?.trim() === attempts[index]?.answer || exercise.kind === "writing" && (responses[index] ?? "").trim().split(/\s+/).filter(Boolean).length < exercise.min_words} onClick={() => void submit(index, responses[index] ?? "")} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{busyIndex === index ? t("player.savingAnswer") : t("player.submitAnswer")}</button>
        {attempts[index] && <p role="status" className="mt-2 text-sm text-muted">{attempts[index].reviewed ? t("player.answerReviewed", { score: attempts[index].score ?? 0 }) : t("player.awaitingTeacherReview")}{attempts[index].feedback && <span className="mt-1 block font-semibold text-ink">{t("player.teacherFeedback")}: {attempts[index].feedback}</span>}</p>}
      </div>}

      {errors[index] && <p role="alert" className="mt-3 text-sm text-brand-coral">{errors[index]}</p>}

      {exercise.kind === "speaking" && <div className="space-y-3">
        <Recorder mode="audio" maxSeconds={120} onSubmit={(blob) => {
          setSpeakingStatus(t("player.savingAnswer"));
          void submissionsApi.submitAudio(topic.id, blob).then(() => setSpeakingStatus(t("player.speakingSaved"))).catch(error => setSpeakingStatus(error instanceof ApiError ? error.message : t("player.answerSaveFailed")));
        }} />
        {speakingStatus && <p role="status" className="text-sm text-muted">{speakingStatus}</p>}
        <button type="button" onClick={onDiscuss} className="min-h-11 rounded-lg border border-line px-4 text-sm font-bold text-brand-blue">{t("player.startSpeaking")}</button>
      </div>}
      {submissionLocked && <p role="status" className="mt-3 text-sm text-muted">{deadlinePassed ? t("player.activityDeadlinePassed") : t("player.activityAlreadySubmitted")}</p>}
    </section>;
    })}
  </div>;
}
