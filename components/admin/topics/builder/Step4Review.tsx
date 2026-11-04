import type { Level, VocabularyItem, VoicePromptMode } from "@/lib/api/types";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function Step4Review({
  level,
  title,
  avatarPrompt,
  voicePromptMode,
  voicePrompt,
  openingLine,
  warmUpQuestions,
  vocabulary,
}: {
  level: Level;
  title: string;
  avatarPrompt: string;
  voicePromptMode: VoicePromptMode;
  voicePrompt: string;
  openingLine: string;
  warmUpQuestions: string[];
  vocabulary: VocabularyItem[];
}) {
  const { t } = useI18n();
  const vocabularyBlock = vocabulary.length
    ? vocabulary.map(v => `- ${v.term} (${v.theme || "General"}): ${v.example_sentence}`).join("\n")
    : "(none yet)";
  const promptBlock = `ADMIN INSTRUCTION\n${avatarPrompt}\n\nOPENING LINE\n${openingLine}\n\nWARM-UP QUESTIONS\n${warmUpQuestions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n")}\n\nTARGET LANGUAGE\n${vocabularyBlock}`;
  // What the Voice Practice agent receives: the same prompt unless the
  // teacher chose separate prompts and wrote one (mirrors the backend's
  // `TopicContent.voice_practice_prompt`).
  const effectiveVoicePrompt = voicePromptMode === "separate" && voicePrompt.trim() ? voicePrompt : avatarPrompt;
  const voiceBlock = `LESSON PROMPT\n${effectiveVoicePrompt}\n\nOPENING LINE\n${openingLine}\n\nLEVEL\n${LEVEL_LABEL[level]}`;

  return (
    <section className="mx-auto max-w-[720px]">
      <div className="mb-6">
        <h3 className="m-0 text-xl tracking-tight text-ink md:text-2xl">{t("builder.step4Title")}</h3>
        <p className="mt-1.5 text-sm text-muted">{t("builder.step4Desc")}</p>
      </div>
      <div className="rounded-2xl bg-gradient-to-r from-brand-navy to-brand-primary-dark p-5 text-white">
        <span className="inline-block rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold tracking-wide text-white">{t("builder.levelBadge")}</span>
        <h2 className="mb-1 mt-2 text-xl">{LEVEL_LABEL[level]}</h2>
        <p className="m-0 text-sm text-brand-primary-light">{title}</p>
      </div>
      <div className="mt-5 rounded-2xl bg-brand-navy p-4">
        <span className="text-xs font-extrabold tracking-wide text-brand-cyan">{t("builder.finalAvatarContext", { title })}</span>
        <pre className="mt-2.5 max-h-[220px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-brand-primary-light/80">{promptBlock}</pre>
      </div>
      <div className="mt-3 rounded-2xl bg-brand-navy p-4">
        <span className="text-xs font-extrabold tracking-wide text-brand-cyan">
          {t("builder.finalVoiceContext", { title })} · {voicePromptMode === "separate" ? t("builder.promptModeSeparate") : t("builder.promptModeShared")}
        </span>
        <pre className="mt-2.5 max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-brand-primary-light/80">{voiceBlock}</pre>
      </div>
    </section>
  );
}
