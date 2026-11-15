"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, levelProfilesApi, topicsApi } from "@/lib/api/client";
import type { ArabicInterventionLevel, InteractiveVideoCheckpoint, InteractiveVideoTimelineSuggestion, LearningObjective, LessonExercise, LessonFlow, Level, LevelProfilePublic, ObjectiveSuggestion, ReviewTranscriptEnglishResult, TranscriptSegment, TranscriptSource, TranscriptState, VocabularyItem, VoicePromptMode } from "@/lib/api/types";
import { useTopic } from "@/lib/hooks/useTopics";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { Step1Basics } from "./Step1Basics";
import { Step2VideoTranscript } from "./Step2VideoTranscript";
import { Step3AvatarPrompt } from "./Step3AvatarPrompt";
import { Step3LearningObjectives } from "./Step3LearningObjectives";
import { Step4LessonFlow } from "./Step4LessonFlow";
import { Step4Review } from "./Step4Review";
import { Step4ExercisesSchedule } from "./Step4ExercisesSchedule";
import { InteractiveVideoTimelineEditor } from "./InteractiveVideoTimelineEditor";
import { assignClientKeys, remapCheckpointsForExercises, stripClientKey, type TrackedExercise } from "@/lib/lessonBuilder/checkpointRemap";
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

function formatVideoTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

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
  const [exercises, setExercises] = useState<TrackedExercise[]>([]);
  const [exercisesDirty, setExercisesDirty] = useState(false);
  // Fix 3: whenever the exercises array is restructured locally (delete,
  // reorder, insert - via onExercisesChange or an AI-suggestion accept),
  // checkpoints that still pointed at the old exercise_index are remapped or,
  // if their exercise was removed, dropped with a visible, non-silent
  // warning here.
  const [checkpointRemapNotice, setCheckpointRemapNotice] = useState<string | null>(null);
  const [generatingExerciseIndex, setGeneratingExerciseIndex] = useState<number | null>(null);
  const [exerciseSuggestions, setExerciseSuggestions] = useState<{ index: number; exercises: LessonExercise[] } | null>(null);
  const [transcriptState, setTranscriptState] = useState<TranscriptState | null>(null);
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
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
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [learningObjectives, setLearningObjectives] = useState<LearningObjective[]>([]);
  const [objectivesApproved, setObjectivesApproved] = useState(false);
  const [objectiveSuggestions, setObjectiveSuggestions] = useState<ObjectiveSuggestion[]>([]);
  const [savingObjectives, setSavingObjectives] = useState(false);
  const [suggestingObjectives, setSuggestingObjectives] = useState(false);
  const [objectivesError, setObjectivesError] = useState<string | null>(null);
  const [lessonFlow, setLessonFlow] = useState<LessonFlow>("standard");
  const [persistedLessonFlow, setPersistedLessonFlow] = useState<LessonFlow>("standard");
  const [interactiveCheckpoints, setInteractiveCheckpoints] = useState<InteractiveVideoCheckpoint[]>([]);
  const [videoStudioDirty, setVideoStudioDirty] = useState(false);
  const [suggestingTimeline, setSuggestingTimeline] = useState(false);
  const [timelineSuggestionError, setTimelineSuggestionError] = useState<string | null>(null);
  const [timelineSuggestionAction, setTimelineSuggestionAction] = useState<number | null>(null);
  const [acceptingAllSuggestions, setAcceptingAllSuggestions] = useState(false);
  const [acceptAllSummary, setAcceptAllSummary] = useState<string | null>(null);
  // The first four decisions are shared. From the flow choice onward these
  // are deliberately different journeys: Standard owns Avatar + exercises.
  // Interactive asks AI (or the teacher) for a video plan first, then opens
  // Video Studio only to review, edit and place those approved activities.
  // Do not "insert" a Studio into the Standard sequence again.
  const BUILDER_STEPS = lessonFlow === "interactive_video"
    ? [
      { id: "basics", name: t("builder.stepName1"), blurb: t("builder.stepBlurb1") },
      { id: "source", name: t("builder.stepName2"), blurb: t("builder.stepBlurb2") },
      { id: "objectives", name: t("builder.stepName3"), blurb: t("builder.stepBlurb3") },
      { id: "flow", name: t("builder.stepName4"), blurb: t("builder.stepBlurb4") },
      { id: "timeline", name: "AI video plan", blurb: "AI suggests pause moments and editable question drafts from the approved transcript." },
      { id: "studio", name: "Video Studio", blurb: "Edit approved activities and place their checkpoints on the uploaded video." },
      { id: "review", name: "Teacher review & edit", blurb: "Review the uploaded video, activities and saved checkpoints before publishing." },
      { id: "publish", name: "Publish", blurb: t("builder.stepBlurb8") },
    ]
    : [
      { id: "basics", name: t("builder.stepName1"), blurb: t("builder.stepBlurb1") },
      { id: "source", name: t("builder.stepName2"), blurb: t("builder.stepBlurb2") },
      { id: "objectives", name: t("builder.stepName3"), blurb: t("builder.stepBlurb3") },
      { id: "flow", name: t("builder.stepName4"), blurb: t("builder.stepBlurb4") },
      { id: "avatar", name: t("builder.stepName5"), blurb: t("builder.stepBlurb5") },
      { id: "exercises", name: t("builder.stepName6"), blurb: t("builder.stepBlurb6") },
      { id: "review", name: t("builder.stepName7"), blurb: t("builder.stepBlurb7") },
      { id: "publish", name: t("builder.stepName8"), blurb: t("builder.stepBlurb8") },
    ];
  const currentStep = BUILDER_STEPS[step - 1]?.id;

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
    // Freshly loaded from the server together with `interactive_video_checkpoints`
    // below - both are already mutually consistent, so this only needs to stamp
    // client-tracking keys, never diff/remap against the checkpoints it is about
    // to replace (see `applyExercisesChange` for the real remap logic).
    if (!exercisesDirty) setExercises(assignClientKeys(loadedTopic.lesson_exercises ?? []));
    setTranscriptState(loadedTopic.transcript_state);
    setTranscriptSource(loadedTopic.transcript_source);
    setTranscriptSegments(loadedTopic.raw_transcript);
    setTranscriptError(loadedTopic.transcript_error);
    setEditedTranscript(formatSourceTranscript(loadedTopic.raw_transcript, loadedTopic.transcript_source_labels));
    setPdfFilename(loadedTopic.pdf_filename ?? null);
    setUploadedVideoFilename(loadedTopic.uploaded_video_filename ?? null);
    setLearningObjectives(loadedTopic.learning_objectives ?? []);
    setObjectivesApproved(loadedTopic.objectives_approved ?? false);
    setObjectiveSuggestions(loadedTopic.objective_drafts ?? []);
    setLessonFlow(loadedTopic.lesson_flow ?? "standard");
    setPersistedLessonFlow(loadedTopic.lesson_flow ?? "standard");
    setInteractiveCheckpoints(loadedTopic.interactive_video_checkpoints ?? []);
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
          setTranscriptSegments(t.raw_transcript);
          setTranscriptError(t.transcript_error);
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

  const handleSaveTranscriptSegments = async (segments: TranscriptSegment[]) => {
    if (!topicId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await topicsApi.saveTranscriptSegments(topicId, segments);
      setTranscriptSegments(updated.raw_transcript);
      setEditedTranscript(formatSourceTranscript(updated.raw_transcript, updated.transcript_source_labels));
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
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
    setVideoUploadProgress(0);
    setVideoError(null);
    try {
      const updated = await topicsApi.uploadSourceVideo(topicId, file, setVideoUploadProgress);
      setUploadedVideoFilename(updated.uploaded_video_filename);
      // Same reset-to-`queued` behavior as the PDF upload above - start
      // extraction right away instead of waiting on a separate manual click.
      setTranscriptState(updated.transcript_state);
      setTranscriptSource(updated.transcript_source);
      await refetchTopic();
      await startTranscriptGeneration();
      onSaved();
    } catch (err) {
      setVideoError(err instanceof ApiError ? err.message : "The video could not be uploaded.");
    } finally {
      setUploadingVideo(false);
      setVideoUploadProgress(null);
    }
  };

  const handleRemoveVideo = async () => {
    if (!topicId) return;
    setUploadingVideo(true);
    setVideoError(null);
    try {
      await topicsApi.removeSourceVideo(topicId);
      setUploadedVideoFilename(null);
      await refetchTopic();
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

  const handleLessonFlowContinue = async () => {
    if (!topicId) return;
    setSaving(true); setSaveError(null);
    try {
      const updated = await topicsApi.update(topicId, { lesson_flow: lessonFlow });
      setPersistedLessonFlow(updated.lesson_flow ?? lessonFlow);
      setInteractiveCheckpoints(updated.interactive_video_checkpoints ?? []);
      onSaved();
      setStep(5);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally { setSaving(false); }
  };

  const handleStandardAvatarContinue = async () => {
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
      setStep(6);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const saveExercisesAndContinue = async (nextStep: number) => {
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
      await topicsApi.update(topicId, { lesson_exercises: exercises.map(exercise => stripClientKey({ ...exercise, prompt: exercise.prompt.trim(), options: exercise.options.map(option => option.trim()) })) });
      // Mirrors the success path in handleInteractiveSuggestionAction below -
      // a successful persist here is the ONLY other place exercises are
      // genuinely saved, so this flag must clear here too. Previously this
      // was missing: once set true by any exercise edit, it stayed stuck
      // true for the rest of the session, which permanently disabled the AI
      // suggestion Accept/Reject buttons (see that handler's own guard).
      setExercisesDirty(false);
      onSaved();
      setStep(nextStep);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("builderErrors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleReviewContinue = () => {
    if (lessonFlow === "interactive_video" && !interactiveCheckpoints.length) {
      setSaveError("Add at least one Interactive Video checkpoint before choosing a Program.");
      return;
    }
    setSaveError(null);
    setStep(8);
  };

  const handleVideoStudioContinue = () => {
    if (videoStudioDirty) {
      setSaveError("Save your timeline changes before continuing to review.");
      return;
    }
    if (!loadedTopic?.uploaded_video_url) {
      setSaveError("Upload a teacher-owned video in Source & transcript before continuing with Interactive Video.");
      return;
    }
    if (!interactiveCheckpoints.length) {
      setSaveError("Add and save at least one Interactive Video checkpoint before continuing.");
      return;
    }
    // Exercises are authored inside Studio for this flow. Saving them here
    // keeps their validation separate from the Standard Exercises step.
    void saveExercisesAndContinue(7);
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

  const handleSuggestInteractiveTimeline = async (refresh = false) => {
    if (!topicId) return;
    setSuggestingTimeline(true);
    setTimelineSuggestionError(null);
    try {
      await topicsApi.suggestInteractiveVideoTimeline(topicId, refresh);
      await refetchTopic();
    } catch (err) {
      setTimelineSuggestionError(err instanceof ApiError ? err.message : "AI could not suggest video questions. You can still add them manually.");
    } finally {
      setSuggestingTimeline(false);
    }
  };

  const handleInteractiveSuggestionAction = async (index: number, action: "accept" | "reject") => {
    if (!topicId || exercisesDirty) return;
    setTimelineSuggestionAction(index);
    setTimelineSuggestionError(null);
    try {
      const updated = action === "accept"
        ? await topicsApi.acceptInteractiveVideoSuggestion(topicId, index)
        : await topicsApi.rejectInteractiveVideoSuggestion(topicId, index);
      // Freshly persisted together from the server - both already consistent,
      // same reasoning as the seeding effect above.
      setExercises(assignClientKeys(updated.lesson_exercises));
      setExercisesDirty(false);
      setInteractiveCheckpoints(updated.interactive_video_checkpoints);
      await refetchTopic();
      if (action === "accept") setStep(6);
    } catch (err) {
      setTimelineSuggestionError(err instanceof ApiError ? err.message : "This suggestion could not be updated. Please try again.");
    } finally {
      setTimelineSuggestionAction(null);
    }
  };

  // Fix 6: bulk-accept every pending AI video-plan suggestion in one call.
  // Same `exercisesDirty` guard as the per-suggestion accept/reject above -
  // never silently overwrite an in-progress unsaved Studio edit. A partial
  // failure is always shown, never hidden.
  const handleAcceptAllSuggestions = async () => {
    if (!topicId || exercisesDirty) return;
    setAcceptingAllSuggestions(true);
    setTimelineSuggestionError(null);
    setAcceptAllSummary(null);
    try {
      const result = await topicsApi.acceptAllInteractiveVideoDrafts(topicId);
      await refetchTopic();
      setAcceptAllSummary(result.failed.length
        ? `Accepted ${result.accepted_count}, ${result.failed.length} could not be accepted: ${result.failed.map(failure => `${formatVideoTime(failure.timestamp_seconds)} (${failure.reason})`).join("; ")}`
        : `Accepted ${result.accepted_count} suggestions.`);
      if (result.accepted_count > 0) setStep(6);
    } catch (err) {
      setTimelineSuggestionError(err instanceof ApiError ? err.message : "These suggestions could not be accepted. Please try again.");
    } finally {
      setAcceptingAllSuggestions(false);
    }
  };

  // Fix 3: the single point every local (unsaved) exercises-array restructure
  // goes through - whichever UI triggered it (the "exercises" step, the
  // embedded Studio copy of Step4ExercisesSchedule, or this AI-suggestion
  // accept). Diffs the old array against `next` by each exercise's stable
  // `_clientKey` (assigned on first sight, carried forward through every
  // existing in-place edit's object-spread), then remaps or drops each
  // checkpoint's `exercise_index` accordingly. A dropped checkpoint (its
  // exercise was removed) is never silent - it's surfaced via
  // `checkpointRemapNotice`. Kept entirely client-side: the corrected
  // `exercise_index` values are saved normally through the existing full-array
  // PUT the next time the teacher saves.
  const applyExercisesChange = (next: LessonExercise[]) => {
    const keyedNext = assignClientKeys(next);
    const { checkpoints: remapped, changed, droppedTimestamps } = remapCheckpointsForExercises(exercises, keyedNext, interactiveCheckpoints);

    setExercises(keyedNext);
    setExercisesDirty(true);
    setExerciseSuggestions(null);
    if (changed) {
      setInteractiveCheckpoints(remapped);
      setCheckpointRemapNotice(droppedTimestamps.length
        ? `Removed ${droppedTimestamps.length} checkpoint${droppedTimestamps.length > 1 ? "s" : ""} whose activity was deleted (at ${droppedTimestamps.map(formatVideoTime).join(", ")}). Re-add a checkpoint there if it's still needed, then save the timeline.`
        : "A checkpoint's activity moved, so its pause point was updated to match. Save the timeline to keep this.");
    }
  };

  const handleAcceptSuggestions = () => {
    if (!exerciseSuggestions) return;
    const { index, exercises: drafts } = exerciseSuggestions;
    const current = exercises[index];
    const replacePlaceholder = current && !current.prompt.trim();
    const next = replacePlaceholder
      ? [...exercises.slice(0, index), ...drafts, ...exercises.slice(index + 1)]
      : [...exercises.slice(0, index + 1), ...drafts, ...exercises.slice(index + 1)];
    applyExercisesChange(next);
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
              <h2 className="mt-0.5 text-lg md:text-xl">{BUILDER_STEPS[step - 1]?.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowPreview(true)} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm font-bold text-brand-blue">{t("builder.preview")}</button>
              <DialogCloseButton className="grid size-11 place-items-center rounded-xl border border-brand-coral bg-brand-coral-pale text-xl font-bold text-brand-coral hover:bg-brand-coral-pale/70" />
            </div>
          </header>

          <nav aria-label="Lesson builder steps" className="shrink-0 border-b border-line bg-card px-4 py-3 md:px-8">
            <div className="mx-auto flex w-full max-w-none gap-2 overflow-x-auto pb-1">
              {BUILDER_STEPS.map((builderStep, index) => {
                const number = index + 1;
                const available = !!topicId || index === 0;
                return <button key={builderStep.id} type="button" title={builderStep.blurb} disabled={!available} onClick={() => setStep(number)} className={`flex min-h-12 min-w-[132px] shrink-0 items-center gap-2 rounded-xl border px-3 text-start text-sm font-bold transition-colors ${step === number ? "border-brand-blue bg-brand-primary-pale text-brand-blue" : "border-line bg-bg text-ink"} disabled:cursor-not-allowed disabled:opacity-45`}>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${step > number ? "bg-brand-cyan text-white" : step === number ? "bg-brand-blue text-white" : "bg-line text-muted"}`}>{step > number ? "✓" : number}</span>
                    <span className="min-w-0 truncate">{builderStep.name}</span>
                </button>;
              })}
              <span title={t("builder.howThisWorksDesc")} className="flex min-h-12 min-w-[155px] shrink-0 items-center rounded-xl border border-line bg-bg px-3 text-sm font-bold text-ink">{t("builder.howThisWorks")}</span>
            </div>
          </nav>

          {saveError && (
            <p role="alert" className="mx-4 mt-4 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral md:mx-8">
              {saveError}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            {currentStep === "basics" && (
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
            {currentStep === "source" && (
              <Step2VideoTranscript
                youtubeUrl={youtubeUrl}
                onYoutubeUrlChange={setYoutubeUrl}
                onGenerateTranscript={handleGenerateTranscript}
                saving={saving}
                pollStatus={pollStatus}
                transcriptState={transcriptState}
                transcriptSource={transcriptSource}
                transcriptSegments={transcriptSegments}
                transcriptError={transcriptError}
                onSaveTranscriptSegments={handleSaveTranscriptSegments}
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
                videoUploadProgress={videoUploadProgress}
                videoError={videoError}
              />
            )}
            {currentStep === "objectives" && (
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
            {currentStep === "flow" && (
              <Step4LessonFlow flow={lessonFlow} onChange={setLessonFlow} />
            )}
            {currentStep === "avatar" && (
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
            {currentStep === "exercises" && (
              <Step4ExercisesSchedule topicId={topicId} exercises={exercises} onExercisesChange={applyExercisesChange} hasVideo={!!youtubeUrl.trim()} hasVocabulary={vocabulary.some(item => !!item.term.trim())} canAiDraft={(loadedTopic?.approved_transcript?.trim().length ?? 0) >= 100} generatingIndex={generatingExerciseIndex} suggestions={exerciseSuggestions} onGenerate={handleGenerateExercises} onAcceptSuggestions={handleAcceptSuggestions} onDiscardSuggestions={() => setExerciseSuggestions(null)}
                lessonDraftJob={lessonDraftJob} draftExercises={loadedTopic?.draft_exercises ?? []} onGenerateLessonDraft={handleGenerateLessonDraft} lessonDraftStarting={lessonDraftStarting} lessonDraftError={lessonDraftError} onAcceptDraftExercise={index => handleDraftExerciseAction(index, "accept")} onRejectDraftExercise={index => handleDraftExerciseAction(index, "reject")} onRegenerateDraftExercise={index => handleDraftExerciseAction(index, "regenerate")} draftExerciseActionIndex={draftExerciseActionIndex} exercisesDirty={exercisesDirty} />
            )}
            {currentStep === "studio" && topicId && (
              <section className="mx-auto max-w-[1240px] space-y-6">
                <div className="rounded-2xl border border-brand-blue/30 bg-brand-primary-pale p-5">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-blue">Interactive Video Studio</p>
                  <h3 className="mt-1 text-xl font-extrabold text-ink">Review questions, then place their pauses</h3>
                  <p className="mt-1 max-w-3xl text-sm text-muted">Start with the AI questions you accepted. Edit only what you want, then confirm where each one pauses the video.</p>
                </div>
                {checkpointRemapNotice && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><div className="flex items-start justify-between gap-3"><p className="min-w-0">{checkpointRemapNotice}</p><button type="button" onClick={() => setCheckpointRemapNotice(null)} className="shrink-0 text-xs font-bold text-amber-900 underline">Dismiss</button></div></div>}
                <Step4ExercisesSchedule topicId={topicId} exercises={exercises} onExercisesChange={applyExercisesChange} hasVideo={!!loadedTopic?.uploaded_video_url} hasVocabulary={false} canAiDraft={(loadedTopic?.approved_transcript?.trim().length ?? 0) >= 100} generatingIndex={generatingExerciseIndex} suggestions={exerciseSuggestions} onGenerate={handleGenerateExercises} onAcceptSuggestions={handleAcceptSuggestions} onDiscardSuggestions={() => setExerciseSuggestions(null)}
                  lessonDraftJob={null} draftExercises={[]} onGenerateLessonDraft={() => undefined} lessonDraftStarting={false} lessonDraftError={null} onAcceptDraftExercise={() => undefined} onRejectDraftExercise={() => undefined} onRegenerateDraftExercise={() => undefined} draftExerciseActionIndex={null} exercisesDirty={exercisesDirty} interactiveVideo compact />
                <InteractiveVideoTimelineEditor
                  topicId={topicId}
                  uploadedVideoUrl={loadedTopic?.uploaded_video_url ?? null}
                  exercises={exercises}
                  checkpoints={interactiveCheckpoints}
                  transcriptSegments={transcriptSegments}
                  transcriptState={transcriptState}
                  enabled={persistedLessonFlow === "interactive_video"}
                  onSaved={setInteractiveCheckpoints}
                  onDirtyChange={setVideoStudioDirty}
                />
              </section>
            )}
            {currentStep === "timeline" && (
              <section className="mx-auto max-w-[920px] space-y-5">
                <header className="rounded-2xl border border-brand-blue/30 bg-brand-primary-pale p-5">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-blue">AI video plan</p>
                  <h3 className="mt-1 text-2xl font-extrabold text-ink">Find the best moments to pause and ask</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">AI reads the approved transcript with its real video timestamps, then suggests a question type and a draft activity for each useful learning moment. Nothing is added for students until you accept it; after acceptance, edit it freely in Video Studio.</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" disabled={suggestingTimeline || transcriptState !== "approved_for_ai"} onClick={() => void handleSuggestInteractiveTimeline()} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{suggestingTimeline ? "Analyzing video…" : "Suggest questions from this video"}</button>
                    <button type="button" disabled={suggestingTimeline} onClick={() => setStep(6)} className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-bold text-ink">Add questions manually</button>
                  </div>
                  {transcriptState !== "approved_for_ai" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Approve the timestamped transcript in Source & transcript first. This keeps every AI suggestion tied to real spoken moments in the uploaded video.</p>}
                  {timelineSuggestionError && <p role="alert" className="mt-3 rounded-lg bg-brand-coral-pale p-3 text-sm text-brand-coral">{timelineSuggestionError}</p>}
                </header>
                {(loadedTopic?.interactive_video_drafts ?? []).length > 0 && <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-3"><div><h4 className="text-lg font-extrabold text-ink">Review AI suggestions</h4><p className="mt-1 text-sm text-muted">Accept one to add it to Video Studio and edit the question before publishing.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={exercisesDirty || acceptingAllSuggestions || timelineSuggestionAction !== null} onClick={() => void handleAcceptAllSuggestions()} className="min-h-10 rounded-lg bg-brand-blue px-3 text-sm font-bold text-white disabled:opacity-40">{acceptingAllSuggestions ? "Accepting all…" : "Accept all"}</button><button type="button" disabled={suggestingTimeline} onClick={() => void handleSuggestInteractiveTimeline(true)} className="min-h-10 rounded-lg border border-line bg-card px-3 text-sm font-bold text-ink">Get new suggestions</button></div></div>
                  {acceptAllSummary && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{acceptAllSummary}</p>}
                  {(loadedTopic?.interactive_video_drafts ?? []).map((suggestion: InteractiveVideoTimelineSuggestion, index: number) => { const learningAction = suggestion.learning_action ?? "apply"; const isPracticeSuggestion = suggestion.checkpoint_kind === "practice_with_mariam"; return <article key={suggestion.id} className="rounded-2xl border border-line bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 max-w-3xl"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-extrabold text-brand-blue">Pause at {formatVideoTime(suggestion.timestamp_seconds)}</span>{isPracticeSuggestion ? <span className="rounded-full bg-brand-cyan/15 px-3 py-1 text-xs font-bold text-brand-navy">🗣️ Practice with Mariam</span> : <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-emerald-800">{learningAction.replaceAll("_", " ")}</span>}</div>{isPracticeSuggestion ? <>
                    <h5 className="mt-3 text-base font-extrabold text-ink">{suggestion.opening_line || "Live conversation checkpoint"}</h5>
                    {suggestion.conversation_goal && <p className="mt-2 text-sm text-ink"><b>Conversation goal:</b> {suggestion.conversation_goal}</p>}
                    {typeof suggestion.session_duration_minutes === "number" && <p className="mt-1 text-xs text-muted">~{suggestion.session_duration_minutes} min live session</p>}
                  </> : <h5 className="mt-3 text-base font-extrabold text-ink">{suggestion.exercise?.prompt ?? `Use activity #${(suggestion.exercise_index ?? 0) + 1}`}</h5>}{suggestion.learning_goal && <p className="mt-2 text-sm text-ink"><b>Learning goal:</b> {suggestion.learning_goal}</p>}<p className="mt-2 text-sm text-muted"><b>Why this helps:</b> {suggestion.rationale}</p>{suggestion.source_evidence && <p className="mt-1 text-xs text-muted">Grounded in: {suggestion.source_evidence}</p>}</div><div className="flex gap-2"><button type="button" disabled={exercisesDirty || timelineSuggestionAction !== null} onClick={() => void handleInteractiveSuggestionAction(index, "accept")} className="min-h-11 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{timelineSuggestionAction === index ? "Adding…" : "Accept & edit"}</button><button type="button" disabled={exercisesDirty || timelineSuggestionAction !== null} onClick={() => void handleInteractiveSuggestionAction(index, "reject")} className="min-h-11 rounded-lg border border-line px-4 text-sm font-bold text-brand-coral disabled:opacity-40">Reject</button></div></div>{exercisesDirty && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">Save your current Video Studio activity changes first, then accept or reject this suggestion.</p>}</article>; })}
                </div>}
                {!(loadedTopic?.interactive_video_drafts ?? []).length && !suggestingTimeline && <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center"><h4 className="font-extrabold text-ink">No suggestions yet</h4><p className="mx-auto mt-2 max-w-lg text-sm text-muted">Start with one click. You will review every pause, question type and draft before it becomes part of the lesson.</p></div>}
              </section>
            )}
            {currentStep === "review" && lessonFlow === "standard" && (
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
            {currentStep === "review" && lessonFlow === "interactive_video" && (
              <section className="mx-auto max-w-[720px] space-y-4">
                <div className="rounded-2xl border border-brand-blue/30 bg-brand-primary-pale p-5"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-blue">Interactive Video review</p><h3 className="mt-1 text-xl font-extrabold text-ink">Review the teacher-authored video lesson</h3><p className="mt-1 text-sm text-muted">This flow has no Avatar prompt or Standard exercise stage. Students will see only the uploaded video and its saved checkpoints.</p></div>
                <dl className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line bg-card p-4"><dt className="text-xs font-bold uppercase text-muted">Video</dt><dd className="mt-1 font-bold text-ink">{loadedTopic?.uploaded_video_url ? "Ready" : "Missing"}</dd></div><div className="rounded-xl border border-line bg-card p-4"><dt className="text-xs font-bold uppercase text-muted">Activities</dt><dd className="mt-1 font-bold text-ink">{exercises.length}</dd></div><div className="rounded-xl border border-line bg-card p-4"><dt className="text-xs font-bold uppercase text-muted">Saved checkpoints</dt><dd className="mt-1 font-bold text-ink">{interactiveCheckpoints.length}</dd></div></dl>
                <button type="button" onClick={() => setStep(6)} className="min-h-11 rounded-lg border border-brand-blue px-4 text-sm font-bold text-brand-blue">Edit in Video Studio</button>
              </section>
            )}
            {currentStep === "publish" && (
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
            {currentStep === "basics" ? (
              <button
                type="button"
                disabled={saving || !title.trim()}
                onClick={handleStep1Continue}
                className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : currentStep === "source" ? (
              <button type="button" disabled={saving} onClick={handleStep2Continue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : currentStep === "objectives" ? (
              <button type="button" disabled={savingObjectives} onClick={handleObjectivesContinue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {savingObjectives ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : currentStep === "flow" ? (
              <button type="button" disabled={saving} onClick={handleLessonFlowContinue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : currentStep === "avatar" ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleStandardAvatarContinue}
                className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : currentStep === "exercises" ? (
              <button type="button" disabled={saving} onClick={() => void saveExercisesAndContinue(7)} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {saving ? t("builder.saving") : t("builder.continueBtn")}
              </button>
            ) : currentStep === "studio" ? (
              <button type="button" disabled={saving} onClick={handleVideoStudioContinue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {t("builder.continueBtn")}
              </button>
            ) : currentStep === "timeline" ? (
              <button type="button" disabled={saving} onClick={() => setStep(6)} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {t("builder.continueBtn")}
              </button>
            ) : currentStep === "review" ? (
              <button type="button" disabled={saving} onClick={handleReviewContinue} className="min-h-11 min-w-0 sm:min-w-[125px] rounded-[9px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
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
