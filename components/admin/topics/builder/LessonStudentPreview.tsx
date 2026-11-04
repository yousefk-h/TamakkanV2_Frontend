"use client";

import type { LessonExercise, Level, VocabularyItem } from "@/lib/api/types";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function LessonStudentPreview({ title, level, levelName, exercises, vocabulary }: {
  title: string;
  level: Level;
  levelName?: string;
  exercises: LessonExercise[];
  vocabulary: VocabularyItem[];
}) {
  const { t } = useI18n();
  return <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[30px] border-[8px] border-brand-navy bg-bg shadow-2xl">
    <header className="bg-brand-navy px-5 py-4 text-white">
      <p className="text-xs font-bold uppercase tracking-wider text-brand-cyan">{levelName || LEVEL_LABEL[level]}</p>
      <h2 className="mt-1 text-xl">{title || t("builder.previewUntitled")}</h2>
      <p className="mt-1 text-xs text-brand-primary-light/80">{t("builder.previewStudentNotice")}</p>
    </header>
    <div className="max-h-[68vh] space-y-3 overflow-y-auto p-4">
      {exercises.length === 0 && <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">{t("builder.previewEmpty")}</p>}
      {exercises.map((exercise, index) => <article key={index} className="rounded-2xl border border-line bg-card p-4 shadow-card">
        <span className="text-xs font-bold uppercase tracking-wide text-brand-blue">{index + 1} · {exercise.kind.replaceAll("_", " ")}</span>
        <p className="mb-3 mt-2 text-sm font-bold text-ink">{exercise.prompt || t("builder.previewMissingPrompt")}</p>
        {exercise.kind === "video" && <div className="grid aspect-video place-items-center rounded-xl bg-brand-navy text-3xl text-white">▶</div>}
        {exercise.kind === "vocab" && <div className="grid gap-2">{vocabulary.slice(0, 3).map(word => <div key={word.term} className="rounded-lg bg-bg p-2 text-sm"><b>{word.term}</b>{word.arabic_meaning && <span dir="rtl" className="ms-2 text-muted">{word.arabic_meaning}</span>}</div>)}</div>}
        {/* eslint-disable-next-line @next/next/no-img-element -- teacher media may use any validated remote origin */}
        {exercise.kind === "image_completion" && exercise.media_url && <img src={exercise.media_url} alt="" className="max-h-52 w-full rounded-xl object-contain" />}
        {exercise.kind === "listening" && <div className="rounded-xl bg-bg p-3 text-center text-sm">🔊 {exercise.audio_url ? t("builder.previewUploadedAudio") : t("builder.previewGeneratedVoice")}</div>}
        {["grammar", "reading", "series"].includes(exercise.kind) && exercise.content && <p className="whitespace-pre-wrap rounded-xl bg-bg p-3 text-sm text-ink">{exercise.content}</p>}
        {exercise.options.length > 0 && <div className="space-y-2">{exercise.options.map((option, optionIndex) => <div key={optionIndex} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm"><span className="size-4 rounded-full border border-muted" />{option || `${t("builder.answerOption")} ${optionIndex + 1}`}</div>)}</div>}
        {exercise.kind === "writing" && <div className="h-24 rounded-xl border border-line bg-bg" />}
        {exercise.kind === "speaking" && <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm">🎙️ {t("builder.previewRecordVoice")}</div>}
        {exercise.kind === "game" && <div className="grid grid-cols-2 gap-2 text-sm">{exercise.pairs.flatMap((pair, pairIndex) => [<span key={`l-${pairIndex}`} className="rounded-lg bg-bg p-2">{pair.left}</span>, <span key={`r-${pairIndex}`} className="rounded-lg bg-bg p-2">{pair.right}</span>])}</div>}
      </article>)}
    </div>
  </div>;
}
