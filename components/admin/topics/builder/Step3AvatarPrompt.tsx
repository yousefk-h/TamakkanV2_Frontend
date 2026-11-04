import type { ArabicInterventionLevel, VocabularyItem, VoicePromptMode } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const EMPTY_VOCAB_ITEM: VocabularyItem = { term: "", theme: "", example_sentence: "", arabic_meaning: "" };
const ARABIC_INTERVENTION_LEVELS: ArabicInterventionLevel[] = ["low", "medium", "high"];

export function Step3AvatarPrompt({
  title,
  avatarPrompt,
  onAvatarPromptChange,
  voicePromptMode,
  onVoicePromptModeChange,
  voicePrompt,
  onVoicePromptChange,
  openingLine,
  onOpeningLineChange,
  warmUpQuestions,
  onWarmUpQuestionsChange,
  vocabulary,
  onVocabularyChange,
  arabicSupportEnabled,
  onArabicSupportEnabledChange,
  arabicInterventionLevel,
  onArabicInterventionLevelChange,
  draftPending,
  canDraftContent,
  draftingContent,
  onDraftContent,
  regeneratingContent,
  onRegenerateContent,
}: {
  title: string;
  avatarPrompt: string;
  onAvatarPromptChange: (v: string) => void;
  voicePromptMode: VoicePromptMode;
  onVoicePromptModeChange: (v: VoicePromptMode) => void;
  voicePrompt: string;
  onVoicePromptChange: (v: string) => void;
  openingLine: string;
  onOpeningLineChange: (v: string) => void;
  warmUpQuestions: string[];
  onWarmUpQuestionsChange: (qs: string[]) => void;
  vocabulary: VocabularyItem[];
  onVocabularyChange: (v: VocabularyItem[]) => void;
  /** Teacher-controlled only - never shown to or editable by a student (see
   * the backend's own disclosure rule for this field). */
  arabicSupportEnabled: boolean;
  onArabicSupportEnabledChange: (v: boolean) => void;
  arabicInterventionLevel: ArabicInterventionLevel;
  onArabicInterventionLevelChange: (v: ArabicInterventionLevel) => void;
  /** True while a background Gemini call may still be filling in whichever
   * of avatar prompt/opening line/warm-up questions/vocabulary were empty at
   * approval time - see ProgramBuilder's poll effect. */
  draftPending: boolean;
  /** The backend requires an approved transcript to draft from - true once
   * the transcript has reached `approved_for_ai`. */
  canDraftContent: boolean;
  draftingContent: boolean;
  onDraftContent: () => void;
  /** True while a regenerate call is in flight. */
  regeneratingContent: boolean;
  /** Replaces avatar prompt/opening line/warm-up questions/vocabulary
   * outright, including any that already have a value - unlike
   * `onDraftContent`, which only fills a gap. */
  onRegenerateContent: () => void;
}) {
  const { t } = useI18n();
  const updateItem = (i: number, patch: Partial<VocabularyItem>) =>
    onVocabularyChange(vocabulary.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <section className="mx-auto max-w-[720px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-xl tracking-tight text-ink md:text-2xl">{t("builder.step3Title")}</h3>
          <p className="mt-1.5 text-sm text-muted">{t("builder.step3Desc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canDraftContent || draftingContent || regeneratingContent || draftPending}
            onClick={onDraftContent}
            title={canDraftContent ? t("builder.fillEmptyFieldsHint") : t("builder.fillEmptyFieldsUnavailable")}
            className="whitespace-nowrap rounded-[9px] border border-brand-primary-light bg-brand-primary-pale px-3.5 py-2 text-sm font-bold text-brand-blue disabled:cursor-not-allowed disabled:opacity-40"
          >
            {draftingContent ? t("builder.fillingEmptyFields") : t("builder.fillEmptyFields")}
          </button>
          <button
            type="button"
            disabled={!canDraftContent || draftingContent || regeneratingContent || draftPending}
            onClick={onRegenerateContent}
            title={canDraftContent ? t("builder.regenerateContentHint") : t("builder.fillEmptyFieldsUnavailable")}
            className="whitespace-nowrap rounded-[9px] border border-brand-coral bg-brand-coral-pale px-3.5 py-2 text-sm font-bold text-brand-coral disabled:cursor-not-allowed disabled:opacity-40"
          >
            {regeneratingContent ? t("builder.regeneratingContent") : t("builder.regenerateContent")}
          </button>
        </div>
      </div>

      {draftPending && (
        <p className="mb-4 rounded-lg bg-brand-primary-pale px-3 py-2 text-sm text-brand-blue">{t("builder.draftingNotice")}</p>
      )}

      <fieldset className="mb-4 grid gap-2">
        <legend className="mb-1.5 text-sm font-bold text-ink">{t("builder.promptModeLabel")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["shared", "separate"] as const).map(mode => (
            <label
              key={mode}
              className={`flex cursor-pointer items-start gap-2 rounded-[10px] border px-3 py-2.5 text-sm ${
                voicePromptMode === mode ? "border-brand-blue bg-brand-primary-pale" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="voice-prompt-mode"
                value={mode}
                checked={voicePromptMode === mode}
                onChange={() => onVoicePromptModeChange(mode)}
                className="mt-1 accent-brand-blue"
              />
              <span>
                <b className="block text-ink">{mode === "shared" ? t("builder.promptModeShared") : t("builder.promptModeSeparate")}</b>
                <span className="text-xs text-muted">{mode === "shared" ? t("builder.promptModeSharedDesc") : t("builder.promptModeSeparateDesc")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mb-4 grid gap-1.5 text-sm font-bold text-ink">
        {voicePromptMode === "shared" ? t("builder.sharedPromptLabel", { title }) : t("builder.promptForAvatar", { title })}
        <textarea
          rows={6}
          value={avatarPrompt}
          onChange={e => onAvatarPromptChange(e.target.value)}
          className="rounded-[10px] border-2 border-brand-primary-light bg-brand-primary-pale px-3 py-2.5 text-sm leading-relaxed text-ink outline-brand-blue"
        />
      </label>

      {voicePromptMode === "separate" && (
        <label className="mb-4 grid gap-1.5 text-sm font-bold text-ink">
          {t("builder.voicePromptLabel", { title })}
          <textarea
            rows={6}
            value={voicePrompt}
            onChange={e => onVoicePromptChange(e.target.value)}
            className="rounded-[10px] border-2 border-brand-primary-light bg-brand-primary-pale px-3 py-2.5 text-sm leading-relaxed text-ink outline-brand-blue"
          />
          <span className="text-xs font-normal text-muted">
            {voicePrompt.trim() ? t("builder.voicePromptHint") : t("builder.voicePromptEmptyFallback")}
          </span>
        </label>
      )}

      <label className="grid gap-1.5 text-sm font-bold text-ink">
        {t("builder.openingLine")}
        <input
          value={openingLine}
          onChange={e => onOpeningLineChange(e.target.value)}
          className="rounded-[10px] border border-line px-3 py-2.5 text-sm text-ink outline-brand-blue"
        />
      </label>

      <fieldset className="mt-6 grid gap-2 rounded-[10px] border border-line p-3.5">
        <legend className="px-1 text-sm font-bold text-ink">{t("builder.arabicSupportLabel")}</legend>
        <p className="m-0 text-xs text-muted">{t("builder.arabicSupportHint")}</p>
        <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
          <input
            type="checkbox"
            checked={arabicSupportEnabled}
            onChange={e => onArabicSupportEnabledChange(e.target.checked)}
            className="size-4 accent-brand-blue"
          />
          {t("builder.arabicSupportEnable")}
        </label>

        {arabicSupportEnabled && (
          <div className="mt-2 grid gap-2">
            <span className="text-xs font-bold text-ink">{t("builder.arabicInterventionLevelLabel")}</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {ARABIC_INTERVENTION_LEVELS.map(level => (
                <label
                  key={level}
                  className={`flex cursor-pointer items-start gap-2 rounded-[10px] border px-3 py-2.5 text-sm ${
                    arabicInterventionLevel === level ? "border-brand-blue bg-brand-primary-pale" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="arabic-intervention-level"
                    value={level}
                    checked={arabicInterventionLevel === level}
                    onChange={() => onArabicInterventionLevelChange(level)}
                    className="mt-1 accent-brand-blue"
                  />
                  <span>
                    <b className="block text-ink">
                      {level === "low"
                        ? t("builder.arabicInterventionLow")
                        : level === "medium"
                          ? t("builder.arabicInterventionMedium")
                          : t("builder.arabicInterventionHigh")}
                    </b>
                    <span className="text-xs text-muted">
                      {level === "low"
                        ? t("builder.arabicInterventionLowDesc")
                        : level === "medium"
                          ? t("builder.arabicInterventionMediumDesc")
                          : t("builder.arabicInterventionHighDesc")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <b className="text-sm">{t("builder.warmUpQuestions")}</b>
          <button
            type="button"
            onClick={() => onWarmUpQuestionsChange([...warmUpQuestions, "New warm-up question"])}
            className="text-xs font-bold text-brand-blue"
          >
            {t("builder.addQuestion")}
          </button>
        </div>
        <div className="grid gap-2">
          {warmUpQuestions.map((q, i) => (
            <div key={i} className="grid grid-cols-[25px_minmax(0,1fr)_44px] items-center gap-2">
              <span aria-hidden="true" className="grid size-[23px] place-items-center rounded-[7px] bg-brand-primary-pale text-xs font-bold text-brand-blue">
                {i + 1}
              </span>
              <input
                aria-label={t("builder.questionN", { n: i + 1 })}
                value={q}
                onChange={e => onWarmUpQuestionsChange(warmUpQuestions.map((x, j) => (j === i ? e.target.value : x)))}
                className="rounded-[10px] border border-line px-3 py-2 text-sm text-ink outline-brand-blue"
              />
              <button
                type="button"
                aria-label={t("builder.removeQuestionN", { n: i + 1 })}
                onClick={() => onWarmUpQuestionsChange(warmUpQuestions.filter((_, j) => j !== i))}
                className="text-lg text-muted"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <b className="text-sm">{t("builder.vocabulary")}</b>
            <p className="m-0 text-xs text-muted">
              {draftPending ? t("builder.vocabularyDraftingNotice") : t("builder.vocabularyAutoDrafted")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onVocabularyChange([...vocabulary, { ...EMPTY_VOCAB_ITEM }])}
            className="whitespace-nowrap text-xs font-bold text-brand-blue"
          >
            {t("builder.addWord")}
          </button>
        </div>
        <div className="grid gap-2.5">
          {vocabulary.length === 0 && !draftPending && (
            <p className="rounded-[10px] border border-dashed border-line px-3 py-3 text-sm text-muted">{t("builder.noVocabularyYet")}</p>
          )}
          {vocabulary.map((v, i) => (
            <div key={i} className="grid grid-cols-1 gap-1.5 rounded-[10px] border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                aria-label={t("builder.vocabTermN", { n: i + 1 })}
                placeholder={t("builder.termPlaceholder")}
                value={v.term}
                onChange={e => updateItem(i, { term: e.target.value })}
                className="rounded-[9px] border border-line px-2.5 py-2 text-sm font-bold text-ink outline-brand-blue"
              />
              <input
                aria-label={t("builder.vocabThemeN", { n: i + 1 })}
                placeholder={t("builder.themePlaceholder")}
                value={v.theme}
                onChange={e => updateItem(i, { theme: e.target.value })}
                className="rounded-[9px] border border-line px-2.5 py-2 text-sm text-ink outline-brand-blue sm:col-start-2"
              />
              <button
                type="button"
                aria-label={t("builder.removeVocabN", { n: i + 1 })}
                onClick={() => onVocabularyChange(vocabulary.filter((_, j) => j !== i))}
                className="justify-self-end text-lg text-muted sm:col-start-3 sm:row-start-1"
              >
                ×
              </button>
              <input
                aria-label={t("builder.vocabExampleN", { n: i + 1 })}
                placeholder={t("builder.examplePlaceholder")}
                value={v.example_sentence}
                onChange={e => updateItem(i, { example_sentence: e.target.value })}
                className="rounded-[9px] border border-line px-2.5 py-2 text-sm text-ink outline-brand-blue sm:col-span-2"
              />
              <input
                aria-label={t("builder.vocabArabicN", { n: i + 1 })}
                placeholder={t("builder.arabicPlaceholder")}
                dir="rtl"
                value={v.arabic_meaning}
                onChange={e => updateItem(i, { arabic_meaning: e.target.value })}
                className="rounded-[9px] border border-line px-2.5 py-2 text-right text-sm text-ink outline-brand-blue sm:col-span-2"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
