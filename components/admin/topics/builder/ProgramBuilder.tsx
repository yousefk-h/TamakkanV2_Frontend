"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, levelProfilesApi, topicsApi } from "@/lib/api/client";
import type { ArabicInterventionLevel, LearningObjective, LessonExercise, Level, LevelProfilePublic, ObjectiveSuggestion, ReviewTranscriptEnglishResult, TranscriptSource, TranscriptState, VocabularyItem, VoicePromptMode } from "@/lib/api/types";
import { useTopic } from "@/lib/hooks/useTopics";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { Step1Basics } from "./Step1Basics";
import { Step2VideoTranscript } from "./Step2VideoTranscript";
import { Step3AvatarPrompt } from "./Step3AvatarPrompt";
import { Step3LearningObjectives } from "./Step3LearningObjectives";
import { Step4Review } from "./Step4Review";
import { Step4ExercisesSchedule } from "./Step4ExercisesSchedule";
import { LessonStudentPreview } from "./LessonStudentPreview";
import { TopicProgramAssignments } from "./TopicProgramAssignments";

const TRANSCRIPT_POLL_INTERVAL_MS = 4000;
const TRANSCRIPT_POLL_MAX_ATTEMPTS = 20;
// Content drafting (avatar prompt/opening line/warm-up questions/vocabulary)
// runs as a backend background task after approval (a second Gemini call),
// so it isn't ready the instant approval's response comes back - poll the
// same way the transcript pipeline itself does, since there's no "notify me
// when done" mechanism for either yet.
const DRAFT_POLL_INTERVAL_MS = 4000;
const DRAFT_POLL_MAX_ATTEMPTS = 20;

function formatSourceTranscript(segments: { text: string }[], labels: string[]): string {
  if (new Set(labels).size <= 1) return segments.map(segment => segment.text.trim()).join(" ");
  const groups: { label: string; text: string[] }[] = [];
  segments.forEach((segment, index) => {
    const label = labels[index] || `Source ${index + 1}`;
    const last = groups.at(-1);
    if (last?.label === label) last.text.push(segment.text.trim());
    else groups.push({ label, text: [segment.text.trim()] });
  });
  return groups.map(group => `[SOURCE: ${group.label}]\n${group.text.join(" ")}`).join("\n\n");
}

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
  onComplete,
  hideProgramAssignments = false,
}: {
  topicId: string | null;
  initialLevel: Level;
  onClose: () => void;
  onSaved: () => void;
  onComplete?: (topicId: string) => Promise<void> | void;
  hideProgramAssignments?: boolean;
}) {
  const { t } = useI18n();
  const BUILDER_STEPS = [t("builder.stepName1"), t("builder.stepName2"), t("builder.stepName3"), t("builder.stepName4"), t("builder.stepName5"), t("builder.stepName6"), t("builder.stepName7")];
  const STEP_BLURBS = [t("builder.stepBlurb1"), t("builder.stepBlurb2"), t("builder.stepBlurb3"), t("builder.stepBlurb4"), t("builder.stepBlurb5"), t("builder.stepBlurb6"), t("builder.stepBlurb7")];
  const [topicId, setTopicId] = useState(initialTopicId);
  const { topic: loadedTopic, refetch: refetchTopic } = useTopic(topicId);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleDone = async () => {
    if (!topicId || !onComplete) {
      onClose();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onComplete(topicId);
      onSaved();
      onClose();
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<Level>(initialLevel);
  const [levelProfiles, setLevelProfiles] = useState<LevelProfilePublic[]>([]);
  const [levelProfileId, setLevelProfileId] = useState<string | null>(null);
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
  const [exercises, setExercises] = useState<LessonExercise[]>([]);
  const [exercisesDirty, setExercisesDirty] = useState(false);
  const [generatingExerciseIndex, setGeneratingExerciseIndex] = useState<number | null>(null);
  const [exerciseSuggestions, setExerciseSuggestions] = useState<{ index: number; exercises: LessonExercise[] } | null>(null);
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
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [uploadedVideoFilename, setUploadedVideoFilename] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [learningObjectives, setLearningObjectives] = useState<LearningObjective[]>([]);
  const [objectivesApproved, setObjectivesApproved] = useState(false);
  const [objectiveSuggestions, setObjectiveSuggestions] = useState<ObjectiveSuggestion[]>([]);
  const [savingObjectives, setSavingObjectives] = useState(false);
  const [suggestingObjectives, setSuggestingObjectives] = useState(false);
  const [objectivesError, setObjectivesError] = useState<string | null>(null);

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
    setLevelProfileId(loadedTopic.level_profile_id);
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
    if (!exercisesDirty) setExercises(loadedTopic.lesson_exercises ?? []);
    setTranscriptState(loadedTopic.transcript_state);
    setTranscriptSource(loadedTopic.transcript_source);
    setEditedTranscript(formatSourceTranscript(loadedTopic.raw_transcript, loadedTopic.transcript_source_labels));
    setPdfFilename(loadedTopic.pdf_filename ?? null);
    setUploadedVideoFilename(loadedTopic.uploaded_video_filename ?? null);
    setLearningObjectives(loadedTopic.learning_objectives ?? []);
    setObjectivesApproved(loadedTopic.objectives_approved ?? false);
    setObjectiveSuggestions(loadedTopic.objective_drafts ?? []);
  }, [loadedTopic, exercisesDirty]);

  useEffect(() => {
    let active = true;
    levelProfilesApi.list().then(items => { if (active) setLevelProfiles(items); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

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
          setEditedTranscript(formatSourceTranscript(t.raw_transcript, t.transcript_source_labels));
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

  // Slice C: the unified "Generate Lesson Draft" action. Same "background
  // task, poll via refetchTopic" shape as handleDraftContent/
  // handleRegenerateContent above - `lesson_draft_job.state` (not a local
  // flag) is the actual source of truth for whether it's still running,
  // since it's the server's own job, not this request's near-instant
  // round trip.
  const [lessonDraftStarting, setLessonDraftStarting] = useState(false);
  const [lessonDraftError, setLessonDraftError] = useState<string | null>(null);
  const [lessonDraftPollAttempts, setLessonDraftPollAttempts] = useState(0);
  const [draftExerciseActionIndex, setDraftExerciseActionIndex] = useState<number | null>(null);
  const lessonDraftJob = loadedTopic?.lesson_draft_job ?? null;
  const lessonDraftRunning = lessonDraftJob?.state === "running" && lessonDraftPollAttempts < DRAFT_POLL_MAX_ATTEMPTS;
  useEffect(() => {
    if (!lessonDraftRunning) return;
    const timeout = setTimeout(() => {
      setLessonDraftPollAttempts(a => a + 1);
      refetchTopic();
    }, DRAFT_POLL_INTERVAL_MS);
    return () => clearTimeout(timeout);
  }, [lessonDraftRunning, lessonDraftPollAttempts, refetchTopic]);

  const handleGenerateLessonDraft = async () => {
    if (!topicId) return;
    setLessonDraftStarting(true);
    setLessonDraftError(null);
    try {
      await topicsApi.generateLessonDraft(topicId);
      setLessonDraftPollAttempts(0);
      await refetchTopic();
    } catch (err) {
      setLessonDraftError(err instanceof ApiError ? err.message : t("builderErrors.lessonDraftFailed"));
    } finally {
      setLessonDraftStarting(false);
    }
  };

  // Accept/reject/regenerate all merge into the server's own persisted
  // `lesson_exercises`/`draft_exercises` - disabled while `exercisesDirty`
  // (unsaved local card edits) so a teacher's own in-progress edits in this
  // step are never silently overwritten by refetching the server's state
  // out from under them; they save first, then review suggestions.
  const handleDraftExerciseAction = async (index: number, action: "accept" | "reject" | "regenerate") => {
    if (!topicId || exercisesDirty) return;
    setDraftExerciseActionIndex(index);
    setLessonDraftError(null);
    try {
      if (action === "accept") await topicsApi.acceptDraftExercise(topicId, index);
      else if (action === "reject") await topicsApi.rejectDraftExercise(topicId, index);
      else await topicsApi.regenerateDraftExercise(topicId, index);
      await refetchTopic();
    } catch (err) {
      setLessonDraftError(err instanceof ApiError ? err.message : t("builderErrors.lessonDraftFailed"));
    } finally {
      setDraftExerciseActionIndex(null);
    }
  };

  const handleStep1Continue = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (!topicId) {
        const created = await topicsApi.create({ title: title.trim(), level, level_profile_id: levelProfileId, unit_id: unitId, order_index: orderIndex });
        setTopicId(created.id);
      } else {
        await topicsApi.update(topicId, { title: title.trim(), level_profile_id: levelProfileId, unit_id: unitId, order_index: orderIndex });
      }
      onSaved();
      setStep(2);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // Shared by the manual "Generate Transcript" button (YouTube-only sources)
  // and the automatic kick-off right after a PDF/video upload below - both
  // just need the one `generate-transcript` call plus switching the poller
  // on. `start_generation` on the backend already rejects a second call
  // while one is in flight (409, surfaced here as a normal error) so this
  // can never schedule two concurrent extraction runs for the same topic.
  const startTranscriptGeneration = async (): Promise<void> => {
    if (!topicId) return;
    await topicsApi.generateTranscript(topicId);
    setPollStatus("polling");
  };

  const handleGenerateTranscript = async () => {
    if (!topicId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await topicsApi.update(topicId, { youtube_urls: youtubeUrl ? [youtubeUrl] : [] });
      await startTranscriptGeneration();
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.transcriptStartFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleStep2Continue = async () => {
    if (!topicId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextUrls = youtubeUrl.trim() ? [youtubeUrl.trim()] : [];
      if (JSON.stringify(nextUrls) !== JSON.stringify(loadedTopic?.youtube_urls ?? [])) {
        await topicsApi.update(topicId, { youtube_urls: nextUrls });
      }
      onSaved();
      setStep(3);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
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
      await refetchTopic();
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

  const handleRemovePdf = async () => {
    if (!topicId) return;
    setUploadingPdf(true);
    try {
      await topicsApi.removePdf(topicId);
      setPdfFilename(null);
      onSaved();
    } catch (err) {
      setDocumentError(err instanceof ApiError ? err.message : "We couldn't remove that source. Please try again.");
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleUploadDocument = async (file: File) => {
    if (!topicId) return;
    setUploadingDocument(true);
    setDocumentError(null);
    try {
      const updated = await topicsApi.uploadDocument(topicId, file);
      setTranscriptState(updated.transcript_state);
      setTranscriptSource(updated.transcript_source);
      await refetchTopic();
      onSaved();
    } catch {
      setDocumentError("We couldn't read that document. Use a text-based PDF, DOCX, or PPTX under 20 MB and try again.");
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleAddTextSource = async (label: string, text: string): Promise<boolean> => {
    if (!topicId) return false;
    setUploadingDocument(true);
    setDocumentError(null);
    try {
      const updated = await topicsApi.addTextSource(topicId, { label, text });
      setTranscriptState(updated.transcript_state);
      setTranscriptSource(updated.transcript_source);
      await refetchTopic();
      onSaved();
      return true;
    } catch {
      setDocumentError("We couldn't add that text. Please check it and try again.");
    } finally {
      setUploadingDocument(false);
    }
    return false;
  };

  const handleRemoveDocument = async (index: number) => {
    if (!topicId) return;
    setUploadingDocument(true);
    setDocumentError(null);
    try {
      const updated = await topicsApi.removeDocument(topicId, index);
      setTranscriptState(updated.transcript_state);
      setTranscriptSource(updated.transcript_source);
      await refetchTopic();
      onSaved();
    } catch {
      setDocumentError("We couldn't remove that source. Please try again.");
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleUploadVideo = async (file: File) => {
    if (!topicId) return;
    setUploadingVideo(true);
    setVideoError(null);
    try {
      const updated = await topicsApi.uploadSourceVideo(topicId, file);
      setUploadedVideoFilename(updated.uploaded_video_filename);
      // Same reset-to-`queued` behavior as the PDF upload above - start
      // extraction right away instead of waiting on a separate manual click.
      setTranscriptState(updated.transcript_state);
      setTranscriptSource(updated.transcript_source);
      await startTranscriptGeneration();
      onSaved();
    } catch (err) {
      setVideoError(err instanceof ApiError ? err.message : "The video could not be uploaded.");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleRemoveVideo = async () => {
    if (!topicId) return;
    setUploadingVideo(true);
    setVideoError(null);
    try {
      await topicsApi.removeSourceVideo(topicId);
      setUploadedVideoFilename(null);
      onSaved();
    } catch (err) {
      setVideoError(err instanceof ApiError ? err.message : "The video could not be removed.");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleApplyCorrections = () => {
    if (!englishReview) return;
    setEditedTranscript(englishReview.corrected_transcript);
    setEnglishReview(null);
  };

  const handleSaveObjectives = async () => {
    if (!topicId) return;
    const objectives = learningObjectives
      .map(item => ({ ...item, text: item.text.trim() }))
      .filter(item => item.text);
    if (!objectives.length || objectives.length !== learningObjectives.length) {
      setObjectivesError(t("builder.objectivesValidation"));
      return;
    }
    setSavingObjectives(true); setObjectivesError(null);
    try {
      const updated = await topicsApi.updateObjectives(topicId, objectives);
      setLearningObjectives(updated.learning_objectives);
      setObjectivesApproved(updated.objectives_approved);
      onSaved();
    } catch (err) {
      setObjectivesError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally { setSavingObjectives(false); }
  };

  const handleSuggestObjectives = async () => {
    if (!topicId) return;
    setSuggestingObjectives(true); setObjectivesError(null);
    try { setObjectiveSuggestions(await topicsApi.suggestObjectives(topicId)); }
    catch (err) { setObjectivesError(err instanceof ApiError ? err.message : t("builder.objectivesSuggestFailed")); }
    finally { setSuggestingObjectives(false); }
  };

  const handleObjectiveSuggestionAction = async (index: number, action: "accept" | "reject") => {
    if (!topicId) return;
    setSavingObjectives(true); setObjectivesError(null);
    try {
      const updated = action === "accept"
        ? await topicsApi.acceptObjectiveSuggestion(topicId, index)
        : await topicsApi.rejectObjectiveSuggestion(topicId, index);
      setLearningObjectives(updated.learning_objectives);
      setObjectiveSuggestions(updated.objective_drafts ?? []);
      setObjectivesApproved(updated.objectives_approved);
      onSaved();
    } catch (err) { setObjectivesError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed")); }
    finally { setSavingObjectives(false); }
  };

  const handleApproveObjectives = async () => {
    if (!topicId) return;
    // Persist accepted/edited suggestions before the irreversible approval.
    const objectives = learningObjectives.map(item => ({ ...item, text: item.text.trim() })).filter(item => item.text);
    if (!objectives.length || objectives.length !== learningObjectives.length) { setObjectivesError(t("builder.objectivesValidation")); return; }
    setSavingObjectives(true); setObjectivesError(null);
    try {
      const saved = await topicsApi.updateObjectives(topicId, objectives);
      const approved = await topicsApi.approveObjectives(topicId);
      setLearningObjectives(approved.learning_objectives || saved.learning_objectives);
      setObjectivesApproved(approved.objectives_approved);
      onSaved();
    } catch (err) { setObjectivesError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed")); }
    finally { setSavingObjectives(false); }
  };

  const handleObjectivesContinue = async () => {
    if (learningObjectives.length && !objectivesApproved) {
      setObjectivesError(t("builder.objectivesApprovalRequired"));
      return;
    }
    setStep(4);
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
      setStep(5);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleStep4Continue = async () => {
    if (!topicId) return;
    const answeredKinds = new Set<LessonExercise["kind"]>(["multiple_choice", "image_completion", "listening", "grammar", "reading"]);
    if (exercises.some(exercise => !exercise.prompt.trim()
      || answeredKinds.has(exercise.kind) && (exercise.options.length < 2 || exercise.options.some(option => !option.trim()) || exercise.correct_option === null || exercise.correct_option >= exercise.options.length)
      || (["listening", "grammar", "reading", "series"] as LessonExercise["kind"][]).includes(exercise.kind) && !exercise.content.trim()
      || exercise.kind === "image_completion" && !/^https?:\/\//.test(exercise.media_url)
      || exercise.kind === "game" && (exercise.pairs.length < 2 || exercise.pairs.some(pair => !pair.left.trim() || !pair.right.trim())))) {
      setSaveError(t("builder.exerciseValidation"));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await topicsApi.update(topicId, { lesson_exercises: exercises.map(exercise => ({ ...exercise, prompt: exercise.prompt.trim(), options: exercise.options.map(option => option.trim()) })) });
      onSaved();
      setStep(6);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateExercises = async (index: number, count: number) => {
    if (!topicId) return;
    const exercise = exercises[index];
    setGeneratingExerciseIndex(index);
    setExerciseSuggestions(null);
    setSaveError(null);
    try {
      const draft = await topicsApi.draftExercises(topicId, { kind: exercise.kind, count, focus: exercise.prompt, content: exercise.content });
      setExerciseSuggestions({ index, exercises: draft.exercises });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builder.aiDraftFailed"));
    } finally {
      setGeneratingExerciseIndex(null);
    }
  };

  const handleAcceptSuggestions = () => {
    if (!exerciseSuggestions) return;
    const { index, exercises: drafts } = exerciseSuggestions;
    const current = exercises[index];
    const replacePlaceholder = current && !current.prompt.trim();
    setExercisesDirty(true);
    setExercises(previous => replacePlaceholder
      ? [...previous.slice(0, index), ...drafts, ...previous.slice(index + 1)]
      : [...previous.slice(0, index + 1), ...drafts, ...previous.slice(index + 1)]);
    setExerciseSuggestions(null);
  };

  return (
    <Dialog
      onClose={onClose}
      ariaLabel={t("builder.title")}
      className="fixed inset-0 z-[60] h-[calc(var(--dialog-available-height,100dvh)-24px)] w-full rounded-2xl border-0 bg-bg p-0"
    >
      <div className="flex h-full min-h-0">
        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-card px-4 py-3.5 md:px-8">
            <div className="min-w-0">
              <span className="text-xs font-extrabold tracking-wide text-muted">
                {t("builder.stepOf", { step, total: BUILDER_STEPS.length, level: LEVEL_LABEL[level] })}
              </span>
              <h2 className="mt-0.5 text-lg md:text-xl">{BUILDER_STEPS[step - 1]}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowPreview(true)} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm font-bold text-brand-blue">{t("builder.preview")}</button>
              <DialogCloseButton className="grid size-11 place-items-center rounded-xl border border-brand-coral bg-brand-coral-pale text-xl font-bold text-brand-coral hover:bg-brand-coral-pale/70" />
            </div>
          </header>

          <nav aria-label="Lesson builder steps" className="shrink-0 border-b border-line bg-card px-4 py-3 md:px-8">
            <div className="mx-auto flex max-w-[1200px] gap-2 overflow-x-auto pb-1">
              {BUILDER_STEPS.map((name, index) => {
                const number = index + 1;
                const available = !!topicId || index === 0;
                return <details key={name} className="group min-w-[145px] shrink-0" open={step === number}>
                  <summary onClick={() => { if (available) setStep(number); }} className={`flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors ${step === number ? "border-brand-blue bg-brand-primary-pale text-brand-blue" : "border-line bg-bg text-ink"} ${!available ? "pointer-events-none opacity-45" : ""}`}>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${step > number ? "bg-brand-cyan text-white" : step === number ? "bg-brand-blue text-white" : "bg-line text-muted"}`}>{step > number ? "✓" : number}</span>
                    <span className="min-w-0 truncate">{name}</span>
                  </summary>
                  <p className="px-2 pt-1.5 text-xs leading-relaxed text-muted">{STEP_BLURBS[index]}</p>
                </details>;
              })}
              <details className="min-w-[155px] shrink-0 rounded-xl border border-line bg-bg px-3 py-2">
                <summary className="cursor-pointer list-none text-sm font-bold text-ink">{t("builder.howThisWorks")}</summary>
                <p className="mb-0 mt-1.5 text-xs leading-relaxed text-muted">{t("builder.howThisWorksDesc")}</p>
              </details>
            </div>
          </nav>

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
                levelProfiles={levelProfiles}
                levelProfileId={levelProfileId}
                onLevelProfileChange={profile => { setLevelProfileId(profile?.id ?? null); if (profile) setLevel(profile.base_level); }}
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
                onRemovePdf={handleRemovePdf}
                uploadingPdf={uploadingPdf}
                sourceDocuments={loadedTopic?.source_documents ?? []}
                onUploadDocument={handleUploadDocument}
                onAddTextSource={handleAddTextSource}
                onRemoveDocument={handleRemoveDocument}
                uploadingDocument={uploadingDocument}
                documentError={documentError}
                uploadedVideoFilename={uploadedVideoFilename}
                onUploadVideo={handleUploadVideo}
                onRemoveVideo={handleRemoveVideo}
                uploadingVideo={uploadingVideo}
                videoError={videoError}
              />
            )}
            {step === 3 && (
              <Step3LearningObjectives
                objectives={learningObjectives}
                suggestions={objectiveSuggestions}
                approved={objectivesApproved}
                canSuggest={(loadedTopic?.approved_transcript?.trim().length ?? 0) >= 100}
                saving={savingObjectives}
                suggesting={suggestingObjectives}
                error={objectivesError}
                onChange={next => { setLearningObjectives(next); setObjectivesApproved(false); setObjectivesError(null); }}
                onSuggest={handleSuggestObjectives}
                onSave={handleSaveObjectives}
                onApprove={handleApproveObjectives}
                onAcceptSuggestion={index => void handleObjectiveSuggestionAction(index, "accept")}
                onRejectSuggestion={index => void handleObjectiveSuggestionAction(index, "reject")}
              />
            )}
            {step === 4 && (
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
            {step === 5 && (
              <Step4ExercisesSchedule topicId={topicId} exercises={exercises} onExercisesChange={next => { setExercisesDirty(true); setExercises(next); setExerciseSuggestions(null); }} hasVideo={!!youtubeUrl.trim()} hasVocabulary={vocabulary.some(item => !!item.term.trim())} canAiDraft={(loadedTopic?.approved_transcript?.trim().length ?? 0) >= 100} generatingIndex={generatingExerciseIndex} suggestions={exerciseSuggestions} onGenerate={handleGenerateExercises} onAcceptSuggestions={handleAcceptSuggestions} onDiscardSuggestions={() => setExerciseSuggestions(null)}
                lessonDraftJob={lessonDraftJob} draftExercises={loadedTopic?.draft_exercises ?? []} onGenerateLessonDraft={handleGenerateLessonDraft} lessonDraftStarting={lessonDraftStarting} lessonDraftError={lessonDraftError} onAcceptDraftExercise={index => handleDraftExerciseAction(index, "accept")} onRejectDraftExercise={index => handleDraftExerciseAction(index, "reject")} onRegenerateDraftExercise={index => handleDraftExerciseAction(index, "regenerate")} draftExerciseActionIndex={draftExerciseActionIndex} exercisesDirty={exercisesDirty} />
            )}
            {step === 6 && (
              <div className="mx-auto max-w-[720px]">
                <Step4Review
                  level={level}
                  title={title}
                  avatarPrompt={avatarPrompt}
                  voicePromptMode={voicePromptMode}
                  voicePrompt={voicePrompt}
                  openingLine={openingLine}
                  warmUpQuestions={warmUpQuestions}
                  vocabulary={vocabulary}
                  exercises={exercises}
                  schedule={null}
                />
              </div>
            )}
            {step === 7 && (
              <div className="mx-auto max-w-[720px]">
                <div className="mb-5 rounded-2xl border border-brand-blue/20 bg-brand-primary-pale p-4"><h3 className="text-lg font-bold text-ink">Choose where students will learn this lesson</h3><p className="mt-1 text-sm text-muted">Select a Program, its learning stage, then publish when it is ready. This is separate from writing the lesson so nothing is assigned by accident.</p></div>
                {topicId && !hideProgramAssignments ? <TopicProgramAssignments topicId={topicId} /> : <p className="rounded-2xl border border-dashed border-line bg-card p-5 text-sm text-muted">This lesson will be placed from the Batch curriculum after you finish.</p>}
              </div>
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
              <button type="button" disabled={saving} onClick={handleStep2Continue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : step === 3 ? (
              <button type="button" disabled={savingObjectives} onClick={handleObjectivesContinue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {savingObjectives ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : step === 4 ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleStep3Continue}
                className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : step === 5 ? (
              <button type="button" disabled={saving} onClick={handleStep4Continue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : step === 6 ? (
              <button type="button" disabled={saving} onClick={() => setStep(7)} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {t("builder.continueBtn")}
              </button>
            ) : (
              <button type="button" disabled={saving} onClick={() => void handleDone()} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-[#10ab91] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {saving ? t("builder.saving") : t("builder.done")}
              </button>
            )}
          </footer>
        </main>
      </div>
      {showPreview && createPortal(<Dialog onClose={() => setShowPreview(false)} dismissOnBackdropClick ariaLabel={t("builder.preview")} className="max-h-[calc(100dvh-24px)] w-[min(94vw,560px)] overflow-y-auto rounded-3xl border border-line bg-bg p-4 shadow-2xl backdrop:bg-black/50">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{t("builder.preview")}</h2><p className="text-xs text-muted">{t("builder.previewHint")}</p></div><DialogCloseButton className="grid size-11 place-items-center rounded-xl border border-line" /></div>
        <LessonStudentPreview title={title} level={level} levelName={levelProfiles.find(profile => profile.id === levelProfileId)?.name ?? loadedTopic?.level_name} exercises={exercises} vocabulary={vocabulary} />
      </Dialog>, document.body)}
    </Dialog>
  );
}
