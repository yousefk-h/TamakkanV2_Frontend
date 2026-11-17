import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const studio = fs.readFileSync(new URL("../components/admin/topics/builder/InteractiveVideoTimelineEditor.tsx", import.meta.url), "utf8");
const builder = fs.readFileSync(new URL("../components/admin/topics/builder/ProgramBuilder.tsx", import.meta.url), "utf8");

test("interactive flow plans questions before opening Video Studio for editing", () => {
  assert.match(builder, /"Video Studio"/);
  assert.match(builder, /id: "studio"/);
  assert.match(builder, /id: "timeline"/);
  assert.match(builder, /currentStep === "studio"/);
  assert.match(builder, /currentStep === "review" && lessonFlow === "interactive_video"/);
  assert.match(builder, /handleVideoStudioContinue/);
  assert.ok(builder.indexOf('id: "timeline"') < builder.indexOf('id: "studio"'));
});

test("Video Studio uses the uploaded video, saved checkpoints, and reviewed transcript only", () => {
  assert.match(studio, /<video key=\{videoRetryKey\} ref=/);
  assert.match(studio, /updateInteractiveVideoTimeline/);
  assert.match(studio, /transcriptSegments\s*\n?\s*\.map/);
  assert.match(studio, /Add checkpoint at/);
  assert.match(studio, /Transcript &amp; timestamps/);
  assert.doesNotMatch(studio, /suggestInteractiveVideo|Gemini|draftInteractive/i);
  assert.doesNotMatch(studio, /onOpenExercises/);
  assert.match(studio, /Create a compatible exercise above first/);
  assert.match(studio, /Number\.isFinite\(duration\)/);
  assert.match(studio, /Transcript timing:/);
  assert.match(studio, /max-w-full object-contain/);
});

test("Video Studio is authoring-only and never records learner activity", () => {
  assert.doesNotMatch(studio, /topicsApi\.(?:record|submit|grade|progress)/i);
  assert.doesNotMatch(studio, /Complete preview activity & resume/);
  assert.doesNotMatch(studio, /previewCheckpointId/);
});

test("the marker panel can switch a checkpoint's kind, and hides/shows the right fields", () => {
  assert.match(studio, /role="tablist" aria-label="Checkpoint activity"/);
  assert.match(studio, /change\(selected\.id, \{ kind: "exercise"/);
  assert.match(studio, /change\(selected\.id, \{ kind: "practice_with_mariam"/);
  assert.match(studio, /isPractice \? <>/);
  assert.match(studio, /Conversation goal/);
  assert.match(studio, /Opening line/);
  assert.match(studio, /Session length \(minutes\)/);
  assert.match(studio, /Required activity/);
});

test("Save is disabled, with an inline error, when a Practice with Mariam marker is missing its goal/opening line, or a checkpoint is at/after the video end", () => {
  assert.match(studio, /function practiceInvalid/);
  assert.match(studio, /invalidPractice = items\.some\(practiceInvalid\)/);
  assert.match(studio, /hasInvalidTimestamp = items\.some\(timestampInvalid\)/);
  assert.match(studio, /disabled=\{saving \|\| !items\.length \|\| saved \|\| invalidPractice \|\| hasInvalidTimestamp\}/);
});

test("a checkpoint's kind has exactly one selector - the Question/Practice with Mariam tabs - with no separate, redundant 'Convert' control", () => {
  assert.match(studio, /role="tablist" aria-label="Checkpoint activity"/);
  assert.doesNotMatch(studio, /Convert to Practice with Mariam/);
  assert.doesNotMatch(studio, /convertCheckpointToPractice/);
  assert.doesNotMatch(studio, /convertingId|convertDraft/);
});

test("the AI-suggested-draft review panel renders a distinct Practice with Mariam suggestion", () => {
  assert.match(builder, /checkpoint_kind === "practice_with_mariam"/);
  assert.match(builder, /Practice with Mariam<\/span>/);
  assert.match(builder, /suggestion\.conversation_goal/);
  assert.match(builder, /suggestion\.opening_line/);
  assert.match(builder, /suggestion\.session_duration_minutes/);
});

test("Video Studio is a single two-column authoring workspace: video+timeline on one side, a focused checkpoint list/editor on the other", () => {
  assert.match(studio, /lg:grid-cols-\[minmax\(0,1fr\)_400px\]/);
  // Selecting a checkpoint swaps the list for a focused editor panel (not a
  // giant form appended below the page), with a way back to the list.
  assert.match(studio, /Back to checkpoints/);
  assert.match(studio, /selected \? editorPanel : listPanel/);
  // The same panel becomes a bottom drawer/overlay below the `lg` breakpoint,
  // not a second page layout.
  assert.match(studio, /max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0/);
});

test("the checkpoint list clearly distinguishes placed checkpoints from questions not yet placed on the timeline", () => {
  assert.match(studio, /unplacedExercises/);
  assert.match(studio, /Questions not yet on the timeline/);
  assert.match(studio, /const placeExercise = \(index: number\)/);
  assert.match(studio, /onClick=\{\(\) => placeExercise\(index\)\}/);
});

test("Video Studio reuses the existing question add/edit form instead of duplicating it", () => {
  assert.match(studio, /import \{ Step4ExercisesSchedule \} from "\.\/Step4ExercisesSchedule"/);
  assert.match(studio, /<Step4ExercisesSchedule/);
  assert.match(studio, /hideOwnList/);
  assert.match(studio, /openRequest=\{questionEditorRequest\}/);
  // The old Video Studio step rendered its own separate compact question
  // list above the editor; that list now lives inside this one component.
  assert.doesNotMatch(builder, /interactiveVideo compact/);
});

test("the transcript is an on-demand, searchable drawer, not a wall of text under the editor", () => {
  assert.match(studio, /transcriptOpen/);
  assert.match(studio, /type="search" value=\{transcriptQuery\}/);
  assert.match(studio, /filteredTranscript/);
});

test("a dedicated, non-publishing Student Preview action exists for Video Studio", () => {
  assert.match(studio, /Preview as student/);
  assert.match(studio, /previewOpen/);
  assert.match(studio, /ExercisePreviewCard/);
  assert.doesNotMatch(studio, /topicsApi\.(?:create|update)\(/);
});

test("a checkpoint at or after the video's real duration is rejected, not silently accepted", () => {
  assert.match(studio, /const timestampInvalid = \(item: InteractiveVideoCheckpoint\) => hasMediaDuration && item\.timestamp_seconds >= duration/);
  assert.match(studio, /const changeTimestamp = /);
});

test("unsaved Video Studio changes warn before the teacher navigates away", () => {
  assert.match(builder, /beforeunload/);
  assert.match(builder, /handleCloseAttempt/);
  assert.match(builder, /videoStudioDirty \|\| exercisesDirty/);
});
