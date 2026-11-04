"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, topicsApi } from "@/lib/api/client";
import type { ArabicInterventionLevel, Level, ReviewTranscriptEnglishResult, TranscriptSource, TranscriptState, VocabularyItem, VoicePromptMode } from "@/lib/api/types";
import { useTopic } from "@/lib/hooks/useTopics";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { Step1Basics } from "./Step1Basics";
import { Step2VideoTranscript } from "./Step2VideoTranscript";
import { Step3AvatarPrompt } from "./Step3AvatarPrompt";
import { Step4Review } from "./Step4Review";

const TRANSCRIPT_POLL_INTERVAL_MS = 4000;
const TRANSCRIPT_POLL_MAX_ATTEMPTS = 20;
// Content drafting (avatar prompt/opening line/warm-up questions/vocabulary)
// runs as a backend background task after approval (a second Gemini call),
// so it isn't ready the instant approval's response comes back - poll the
// same way the transcript pipeline itself does, since there's no "notify me
// when done" mechanism for either yet.
const DRAFT_POLL_INTERVAL_MS = 4000;
const DRAFT_POLL_MAX_ATTEMPTS = 20;

/** The backend has no batch-publish concept - every topic is its own resource
 * (POST/PATCH/DELETE /topics/{id}). This wizard operates on exactly one real
 * topic at a time: `topicId === null` is create mode (the first "Continue"
 * click is the actual `topicsApi.create()` call), non-null is edit mode
 * (pre-filled via `useTopic`). There's no local "draft" that gets published
 * at the end - each step persists via `topicsApi.update` as the admin moves
 * forward, so closing the dialog early never loses saved progress, only
 * whatever's mid-edit on the current step. */
export function ProgramBuilder({
  topicId: initialTopicId,
  initialLevel,
  onClose,
  onSaved,
}: {
  topicId: string | null;
  initialLevel: Level;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const BUILDER_STEPS = [t("builder.stepName1"), t("builder.stepName2"), t("builder.stepName3"), t("builder.stepName4")];
  const STEP_BLURBS = [t("builder.stepBlurb1"), t("builder.stepBlurb2"), t("builder.stepBlurb3"), t("builder.stepBlurb4")];
  const [topicId, setTopicId] = useState(initialTopicId);
  const { topic: loadedTopic, refetch: refetchTopic } = useTopic(topicId);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<Level>(initialLevel);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [orderIndex, setOrderIndex] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [warmUpQuestions, setWarmUpQuestions] = useState<string[]>(["What was the main idea in this lesson?"]);
  const [avatarPrompt, setAvatarPrompt] = useState("");
  // Voice Practice: shared (reuse `avatarPrompt`) unless the teacher picks
  // separate prompts. The choice is saved explicitly, never inferred from
  // whether `voicePrompt` happens to have text in it.
  const [voicePromptMode, setVoicePromptMode] = useState<VoicePromptMode>("shared");
  const [voicePrompt, setVoicePrompt] = useState("");
  // Optional, teacher-controlled Jordanian-Arabic clarification support -
  // off by default for a new topic (matches `TopicCreate`'s own explicit
  // `False` default - see that schema's own comment for why).
  const [arabicSupportEnabled, setArabicSupportEnabled] = useState(false);
  const [arabicInterventionLevel, setArabicInterventionLevel] = useState<ArabicInterventionLevel>("low");
  const [openingLine, setOpeningLine] = useState("");
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [transcriptState, setTranscriptState] = useState<TranscriptState | null>(null);
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource | null>(null);
  // The admin's editable copy - seeded from the pipeline's fetched text, but
  // not tied to it after that, so typing here doesn't fight the poll effect.
  const [editedTranscript, setEditedTranscript] = useState("");
  const [pollStatus, setPollStatus] = useState<"idle" | "polling" | "timeout">("idle");
  const [draftPollAttempts, setDraftPollAttempts] = useState(0);
  const [checkingEnglish, setCheckingEnglish] = useState(false);
  const [englishReview, setEnglishReview] = useState<ReviewTranscriptEnglishResult | null>(null);
  const [englishReviewError, setEnglishReviewError] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [draftingContent, setDraftingContent] = useState(false);
  const [regeneratingContent, setRegeneratingContent] = useState(false);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Seed the editable fields once the real topic loads (edit mode only -
  // create mode never has a `loadedTopic` until after step 1's first save).
  // This is genuinely syncing local edit-state from an external, async-loaded
  // source (`useTopic`'s own fetch) - there's no synchronous prop to read it
  // from instead.
  useEffect(() => {
    if (!loadedTopic) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(loadedTopic.title);
    setLevel(loadedTopic.level);
    setUnitId(loadedTopic.unit_id);
    setOrderIndex(loadedTopic.order_index);
    setYoutubeUrl(loadedTopic.youtube_urls[0] ?? "");
    setWarmUpQuestions(loadedTopic.warm_up_questions.length ? loadedTopic.warm_up_questions : ["What was the main idea in this lesson?"]);
    setAvatarPrompt(loadedTopic.avatar_prompt ?? "");
    setVoicePromptMode(loadedTopic.voice_prompt_mode ?? "shared");
    setVoicePrompt(loadedTopic.voice_prompt ?? "");
    // `null` means "legacy topic, predates this field" - treat the same as
    // the teacher never having turned it on (see `TopicContent
    // .arabic_support_enabled`'s own three-state comment on the backend).
    setArabicSupportEnabled(loadedTopic.arabic_support_enabled ?? false);
    setArabicInterventionLevel(loadedTopic.arabic_intervention_level ?? "low");
    setOpeningLine(loadedTopic.opening_line);
    setVocabulary(loadedTopic.vocabulary);
    setTranscriptState(loadedTopic.transcript_state);
    setTranscriptSource(loadedTopic.transcript_source);
    setEditedTranscript(loadedTopic.raw_transcript.map(seg => seg.text.trim()).join(" "));
    setPdfFilename(loadedTopic.pdf_filename ?? null);
  }, [loadedTopic]);

  useEffect(() => {
    if (pollStatus !== "polling" || !topicId) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      topicsApi
        .get(topicId)
        .then(t => {
          setTranscriptState(t.transcript_state);
          setTranscriptSource(t.transcript_source);
          setEditedTranscript(t.raw_transcript.map(seg => seg.text.trim()).join(" "));
          if (t.transcript_state !== "queued" && t.transcript_state !== "extracting") {
            setPollStatus("idle");
            clearInterval(interval);
          } else if (attempts >= TRANSCRIPT_POLL_MAX_ATTEMPTS) {
            setPollStatus("timeout");
            clearInterval(interval);
          }
        })
        .catch(() => {
          // transient error - keep polling until the attempt cap
        });
    }, TRANSCRIPT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollStatus, topicId]);

  // Avatar prompt/opening line/warm-up questions/vocabulary are a starting
  // point drafted by a background Gemini call after approval - not present
  // yet on the response `handleApproveTranscript` gets back. Poll a bounded
  // number of times so the admin sees them land without a manual refresh,
  // then stop either way (a genuinely empty draft is a real, if rare,
  // outcome - not distinguishable from "still running" without a real
  // progress signal, which the backend doesn't emit).
  //
  // Reads `loadedTopic` (the persisted truth), not the local editable
  // `avatarPrompt`/`openingLine`/etc. state, because that local state always
  // has its own non-empty placeholder fallback (see the seeding effect
  // above) even when nothing has ever been saved - checking it here would
  // make "still needs a draft" impossible to detect.
  const stillNeedsDraft =
    !!loadedTopic &&
    (loadedTopic.vocabulary.length === 0 ||
      !loadedTopic.avatar_prompt ||
      !loadedTopic.opening_line ||
      loadedTopic.warm_up_questions.length === 0);
  const draftPending = transcriptState === "approved_for_ai" && stillNeedsDraft && draftPollAttempts < DRAFT_POLL_MAX_ATTEMPTS;
  useEffect(() => {
    if (transcriptState !== "approved_for_ai" || !stillNeedsDraft) return;
    if (draftPollAttempts >= DRAFT_POLL_MAX_ATTEMPTS) return;
    const timeout = setTimeout(() => {
      setDraftPollAttempts(a => a + 1);
      refetchTopic();
    }, DRAFT_POLL_INTERVAL_MS);
    return () => clearTimeout(timeout);
  }, [transcriptState, stillNeedsDraft, draftPollAttempts, refetchTopic]);

  // A missing `arabic_meaning` on an individual vocabulary word is a
  // per-item gap, not a whole-field one - unlike the four conditions above,
  // it's expected to be true indefinitely for perfectly normal topics (any
  // word authored before this field existed, or one the admin typed by hand
  // without translating), so it must NOT feed `stillNeedsDraft`/the
  // automatic poll above: that combination previously made the "drafting…"
  // banner and its poll re-trigger on every single visit to an old topic.
  // This is tracked as its own, purely opt-in state instead - it only ever
  // starts polling in response to `handleDraftContent`'s own click, below.
  const [manualDraftTriggered, setManualDraftTriggered] = useState(false);
  const [manualDraftPollAttempts, setManualDraftPollAttempts] = useState(0);
  const hasVocabArabicGap = !!loadedTopic && loadedTopic.vocabulary.some(v => !v.arabic_meaning);
  // `manualDraftPending` naturally goes false on its own once there's
  // nothing left to fill or the attempt budget runs out - same shape as
  // `draftPending` above, so there's no explicit "stop polling" setState
  // to call from inside the effect below.
  const manualDraftPending = manualDraftTriggered && hasVocabArabicGap && manualDraftPollAttempts < DRAFT_POLL_MAX_ATTEMPTS;
  useEffect(() => {
    if (!manualDraftPending) return;
    const timeout = setTimeout(() => {
      setManualDraftPollAttempts(a => a + 1);
      refetchTopic();
    }, DRAFT_POLL_INTERVAL_MS);
    return () => clearTimeout(timeout);
  }, [manualDraftPending, manualDraftPollAttempts, refetchTopic]);

  const handleStep1Continue = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (!topicId) {
        const created = await topicsApi.create({ title: title.trim(), level, unit_id: unitId, order_index: orderIndex });
        setTopicId(created.id);
      } else {
        await topicsApi.update(topicId, { title: title.trim(), unit_id: unitId, order_index: orderIndex });
      }
      onSaved();
      setStep(2);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateTranscript = async () => {
    if (!topicId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await topicsApi.update(topicId, { youtube_urls: youtubeUrl ? [youtubeUrl] : [] });
      await topicsApi.generateTranscript(topicId);
      setPollStatus("polling");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.transcriptStartFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleApproveTranscript = async () => {
    if (!topicId) return;
    if (!window.confirm(t("builderErrors.approveConfirm"))) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await topicsApi.approveTranscript(topicId, { approved_transcript: editedTranscript });
      setTranscriptState(updated.transcript_state);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.approveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCheckEnglish = async () => {
    if (!topicId) return;
    setCheckingEnglish(true);
    setEnglishReviewError(null);
    setEnglishReview(null);
    try {
      const result = await topicsApi.reviewTranscriptEnglish(topicId, editedTranscript);
      setEnglishReview(result);
    } catch (err) {
      setEnglishReviewError(err instanceof ApiError ? err.message : t("builderErrors.englishCheckFailed"));
    } finally {
      setCheckingEnglish(false);
    }
  };

  const handleDraftContent = async () => {
    if (!topicId) return;
    setDraftingContent(true);
    setSaveError(null);
    try {
      await topicsApi.draftContent(topicId);
      // This call only starts the background task - the actual Gemini call
      // (both the whole-field draft and the per-item Arabic-meaning
      // backfill) finishes some seconds later. `manualDraftPolling` keeps
      // the button showing progress for that whole window, not just this
      // request's own near-instant round trip.
      setManualDraftPollAttempts(0);
      setManualDraftTriggered(true);
      await refetchTopic();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.draftContentFailed"));
    } finally {
      setDraftingContent(false);
    }
  };

  const handleRegenerateContent = async () => {
    if (!topicId) return;
    if (!window.confirm(t("builder.regenerateConfirm"))) return;
    setRegeneratingContent(true);
    setSaveError(null);
    try {
      await topicsApi.regenerateContent(topicId);
      // Same "background task, poll for it" shape as handleDraftContent -
      // this overwrites existing fields, so the loaded topic (and this
      // local edit state once it reloads) genuinely changes.
      setManualDraftPollAttempts(0);
      setManualDraftTriggered(true);
      await refetchTopic();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.regenerateContentFailed"));
    } finally {
      setRegeneratingContent(false);
    }
  };

  const handleUploadThumbnail = async (file: File) => {
    if (!topicId) return;
    setUploadingThumbnail(true);
    setSaveError(null);
    try {
      await topicsApi.uploadThumbnail(topicId, file);
      await refetchTopic();
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.thumbnailUploadFailed"));
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleRemoveThumbnail = async () => {
    if (!topicId) return;
    setUploadingThumbnail(true);
    setSaveError(null);
    try {
      await topicsApi.removeThumbnail(topicId);
      await refetchTopic();
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.thumbnailRemoveFailed"));
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleUploadPdf = async (file: File) => {
    if (!topicId) return;
    setUploadingPdf(true);
    setPdfError(null);
    try {
      const updated = await topicsApi.uploadPdf(topicId, file);
      setPdfFilename(updated.pdf_filename);
      onSaved();
    } catch (err) {
      setPdfError(err instanceof ApiError ? err.message : t("builderErrors.pdfUploadFailed"));
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleRemovePdf = async () => {
    if (!topicId) return;
    setUploadingPdf(true);
    setPdfError(null);
    try {
      await topicsApi.removePdf(topicId);
      setPdfFilename(null);
      onSaved();
    } catch (err) {
      setPdfError(err instanceof ApiError ? err.message : t("builderErrors.pdfRemoveFailed"));
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleApplyCorrections = () => {
    if (!englishReview) return;
    setEditedTranscript(englishReview.corrected_transcript);
    setEnglishReview(null);
  };

  const handleStep3Continue = async () => {
    if (!topicId) return;
    setSaving(true);
    setSaveError(null);
    try {
      // `guided_questions`/`useful_phrases`/`sentence_starters`/
      // `suggested_practice_schedule` stay empty - a real editor for those is
      // Epic C3 (rich content authoring), not built yet. Vocabulary itself is
      // real now: auto-drafted after transcript approval, editable here.
      const cleanedVocabulary = vocabulary.filter(v => v.term.trim());
      await topicsApi.update(topicId, {
        avatar_prompt: avatarPrompt,
        voice_prompt_mode: voicePromptMode,
        // Kept (unused) in shared mode so switching back restores it.
        voice_prompt: voicePrompt,
        arabic_support_enabled: arabicSupportEnabled,
        arabic_intervention_level: arabicInterventionLevel,
        opening_line: openingLine,
        warm_up_questions: warmUpQuestions,
        vocabulary: cleanedVocabulary,
      });
      onSaved();
      setStep(4);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      ariaLabel={t("builder.title")}
      className="fixed inset-0 z-[60] h-[calc(var(--dialog-available-height,100dvh)-24px)] w-full rounded-2xl border-0 bg-bg p-0"
    >
      <div className="grid h-full min-h-0 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="relative hidden flex-col overflow-y-auto bg-brand-navy p-6 text-white lg:flex">
          <DialogCloseButton className="absolute end-3 top-2 text-brand-primary-light/70" />
          <span className="mb-6 grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-cyan text-lg font-black italic">
            Z
          </span>
          <p className="text-xs font-extrabold tracking-[1.5px] text-brand-cyan">{t("builder.title").toUpperCase()}</p>
          <h2 className="mb-7 mt-1.5 text-xl leading-tight tracking-tight">{t("builder.navSubtitle")}</h2>
          <nav className="grid gap-1.5">
            {BUILDER_STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                disabled={!topicId && i > 0}
                onClick={() => topicId && setStep(i + 1)}
                className={`flex items-center gap-2.5 rounded-xl p-2.5 text-start disabled:cursor-not-allowed disabled:opacity-60 ${
                  step === i + 1 ? "bg-brand-primary-dark" : ""
                }`}
              >
                <span
                  className={`grid size-[29px] flex-none place-items-center rounded-full border text-sm font-extrabold ${
                    step > i + 1
                      ? "border-brand-cyan bg-brand-cyan text-white"
                      : step === i + 1
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-brand-primary-light/30 text-brand-primary-light"
                  }`}
                >
                  {step > i + 1 ? "✓" : i + 1}
                </span>
                <div>
                  <b className="block text-sm text-brand-primary-light">{s}</b>
                  <small className="text-[11px] text-brand-primary-light/70">{STEP_BLURBS[i]}</small>
                </div>
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-brand-primary-light/20 bg-brand-primary-dark p-4">
            <b className="text-sm">{t("builder.howThisWorks")}</b>
            <p className="m-0 mt-1.5 text-xs leading-relaxed text-brand-primary-light/70">{t("builder.howThisWorksDesc")}</p>
          </div>
        </aside>

        <main className="flex h-full min-h-0 min-w-0 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-card px-4 py-3.5 md:px-8">
            <div className="min-w-0">
              <span className="text-xs font-extrabold tracking-wide text-muted">
                {t("builder.stepOf", { step, total: BUILDER_STEPS.length, level: LEVEL_LABEL[level] })}
              </span>
              <h2 className="mt-0.5 text-lg md:text-xl">{BUILDER_STEPS[step - 1]}</h2>
            </div>
            <DialogCloseButton className="text-muted lg:hidden" />
          </header>

          {saveError && (
            <p role="alert" className="mx-4 mt-4 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral md:mx-8">
              {saveError}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            {step === 1 && (
              <Step1Basics
                title={title}
                onTitleChange={setTitle}
                level={level}
                onLevelChange={setLevel}
                levelLocked={!!topicId}
                unitId={unitId}
                onUnitIdChange={setUnitId}
                orderIndex={orderIndex}
                onOrderIndexChange={setOrderIndex}
              />
            )}
            {step === 2 && (
              <Step2VideoTranscript
                youtubeUrl={youtubeUrl}
                onYoutubeUrlChange={setYoutubeUrl}
                onGenerateTranscript={handleGenerateTranscript}
                saving={saving}
                pollStatus={pollStatus}
                transcriptState={transcriptState}
                transcriptSource={transcriptSource}
                editedTranscript={editedTranscript}
                onEditedTranscriptChange={setEditedTranscript}
                onApproveTranscript={handleApproveTranscript}
                approvedTranscript={loadedTopic?.approved_transcript ?? null}
                onCheckEnglish={handleCheckEnglish}
                checkingEnglish={checkingEnglish}
                englishReview={englishReview}
                englishReviewError={englishReviewError}
                onApplyCorrections={handleApplyCorrections}
                thumbnailUrl={loadedTopic?.thumbnail_url ?? null}
                hasCustomThumbnail={loadedTopic?.has_custom_thumbnail ?? false}
                onUploadThumbnail={handleUploadThumbnail}
                onRemoveThumbnail={handleRemoveThumbnail}
                uploadingThumbnail={uploadingThumbnail}
                pdfFilename={pdfFilename}
                onUploadPdf={handleUploadPdf}
                onRemovePdf={handleRemovePdf}
                uploadingPdf={uploadingPdf}
                pdfError={pdfError}
              />
            )}
            {step === 3 && (
              <Step3AvatarPrompt
                title={title}
                avatarPrompt={avatarPrompt}
                onAvatarPromptChange={setAvatarPrompt}
                voicePromptMode={voicePromptMode}
                onVoicePromptModeChange={setVoicePromptMode}
                voicePrompt={voicePrompt}
                onVoicePromptChange={setVoicePrompt}
                openingLine={openingLine}
                onOpeningLineChange={setOpeningLine}
                warmUpQuestions={warmUpQuestions}
                onWarmUpQuestionsChange={setWarmUpQuestions}
                vocabulary={vocabulary}
                onVocabularyChange={setVocabulary}
                arabicSupportEnabled={arabicSupportEnabled}
                onArabicSupportEnabledChange={setArabicSupportEnabled}
                arabicInterventionLevel={arabicInterventionLevel}
                onArabicInterventionLevelChange={setArabicInterventionLevel}
                draftPending={draftPending}
                canDraftContent={transcriptState === "approved_for_ai"}
                draftingContent={draftingContent || manualDraftPending}
                onDraftContent={handleDraftContent}
                regeneratingContent={regeneratingContent}
                onRegenerateContent={handleRegenerateContent}
              />
            )}
            {step === 4 && (
              <Step4Review
                level={level}
                title={title}
                avatarPrompt={avatarPrompt}
                voicePromptMode={voicePromptMode}
                voicePrompt={voicePrompt}
                openingLine={openingLine}
                warmUpQuestions={warmUpQuestions}
                vocabulary={vocabulary}
              />
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line bg-card px-4 py-3 md:px-8">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep(s => s - 1)}
              className="rounded-lg px-3 py-2.5 text-sm font-bold text-muted disabled:opacity-40"
            >
              {t("builder.back")}
            </button>
            {step === 1 ? (
              <button
                type="button"
                disabled={saving || !title.trim()}
                onClick={handleStep1Continue}
                className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : step === 2 ? (
              <button type="button" onClick={() => setStep(3)} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white">
                {t("builder.continueBtn")}
              </button>
            ) : step === 3 ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleStep3Continue}
                className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : (
              <button type="button" onClick={onClose} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-[#10ab91] px-4 py-2.5 text-sm font-bold text-white">
                {t("builder.done")}
              </button>
            )}
          </footer>
        </main>
      </div>
    </Dialog>
  );
}
