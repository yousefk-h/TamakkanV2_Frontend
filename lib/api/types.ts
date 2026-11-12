/**
 * TypeScript mirrors of the FastAPI backend's Pydantic schemas
 * (the backend's app/schema/*.py, app/models/*.py).
 *
 * Kept hand-written and verified line-by-line against the actual backend
 * source rather than generated, since the backend has no OpenAPI-to-TS
 * pipeline wired up yet. If a field is added/renamed on the backend, this
 * file needs the matching edit - there is no automatic sync.
 */

// --- Shared -----------------------------------------------------------

/** Every schema that represents a persisted document extends this
 * (app/schema/base.py:BaseSchema). */
export interface BaseSchema {
  id: string;
  created_at: string; // ISO 8601
  updated_at: string;
}

/** app/schema/common.py:MessageResponse - the shape of every plain
 * "it worked" response (logout, password reset request/confirm, ...). */
export interface MessageResponse {
  detail: string;
}

/** Every error response outside 422 validation errors uses this shape
 * (app/core/exceptions.py's AppException/DuplicateKeyError handlers). A 422
 * from Pydantic validation instead has FastAPI's own {detail: [{loc, msg,
 * type}, ...]} shape - `parseApiError` in client.ts normalizes both. */
export interface ApiErrorBody {
  detail: string;
}

export type Role = "student" | "teacher" | "administrator" | "root";
export type PlanType = "standard" | "pro";
export type Level = "beginner" | "intermediate" | "advanced";
export type LessonFlow = "standard" | "interactive_video";

/** A center-defined label mapped to one stable proficiency band. The mapping
 * keeps existing calendars and agents compatible while allowing the center
 * to add levels with their own Avatar guidance. */
export interface LevelProfilePublic extends BaseSchema {
  code: string;
  name: string;
  base_level: Level;
  avatar_guidance: string;
  order_index: number;
  is_active: boolean;
}

export interface LevelProfileCreateRequest {
  code: string;
  name: string;
  base_level: Level;
  avatar_guidance: string;
  order_index?: number;
}

export interface ProgramLevelDefinition {
  id: string;
  name: string;
  order_index: number;
  difficulty_level: Level;
  level_profile_id: string | null;
}

export interface ProgramPublic extends BaseSchema {
  code: string;
  name: string;
  language: string;
  description: string;
  base_levels: Level[];
  level_profile_ids: string[];
  levels: ProgramLevelDefinition[];
  created_by_id: string;
  is_active: boolean;
}

export interface ProgramWriteRequest {
  code: string;
  name: string;
  language: string;
  description?: string;
  base_levels: Level[];
  level_profile_ids?: string[];
  levels?: ProgramLevelDefinition[];
}
export type ProgramTopicStatus = "draft" | "published";

export interface ProgramTopicPublic extends BaseSchema {
  program_id: string;
  topic_id: string;
  topic_title: string;
  program_level_id: string | null;
  level: Level;
  level_profile_id: string | null;
  order_index: number;
  day: number | null;
  status: ProgramTopicStatus;
  assigned_by_id: string;
  published_revision: number | null;
}

export interface ProgramTopicWriteRequest {
  topic_id: string;
  program_level_id?: string | null;
  /** Legacy compatibility for Programs created before stable stage ids. */
  level?: Level;
  status?: ProgramTopicStatus;
}

export type ProgramTopicUpdateRequest = Partial<Omit<ProgramTopicWriteRequest, "topic_id">>;

// --- Cohorts and Enrollments ------------------------------------------------

export type CohortStatus = "active" | "completed" | "archived";

export interface CohortTeacherAssignment {
  teacher_id: string;
  program_level_ids: string[];
  /** Display-only denormalization resolved server-side (CohortPublic only);
   * `null`/absent means the account is gone or unavailable - never fall
   * back to rendering `teacher_id` itself as the label. */
  teacher_name?: string | null;
}

export interface CohortCreateRequest {
  name: string;
  program_id: string;
  program_level_ids: string[];
  lead_teacher_id: string;
  teacher_assignments: CohortTeacherAssignment[];
  start_date: string;
  end_date?: string | null;
}

export interface CohortUpdateRequest {
  name?: string;
  lead_teacher_id?: string;
  teacher_assignments?: CohortTeacherAssignment[];
  start_date?: string;
  end_date?: string | null;
  status?: CohortStatus;
}

export interface CohortPublic extends BaseSchema {
  name: string;
  program_id: string;
  program_level_ids: string[];
  lead_teacher_id: string;
  teacher_assignments: CohortTeacherAssignment[];
  start_date: string;
  end_date: string | null;
  status: CohortStatus;
  created_by_id: string;
  student_count: number;
  lead_teacher_name?: string | null;
  /** Stages the current caller may teach/manage in this Cohort. */
  accessible_program_level_ids?: string[];
}

export type EnrollmentStatus = "active" | "completed" | "withdrawn";
export type EnrollmentSource = "manual" | "cohort" | "legacy_backfill";
export type LateJoinMode = "current_day" | "day_one";

export interface EnrollStudentsRequest {
  student_ids: string[];
  program_level_id: string;
  late_join_mode?: LateJoinMode;
  joined_at?: string;
}

export interface EnrollmentPublic extends BaseSchema {
  student_id: string;
  program_id: string;
  program_level_id: string;
  cohort_id: string | null;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  joined_at: string;
  late_join_mode: LateJoinMode | null;
  created_by_id: string;
  program_name: string | null;
  program_level_name: string | null;
  cohort_name: string | null;
  student_name: string | null;
  student_email: string | null;
}

/** One row of GET /users/my-students - a real Student deduplicated across
 * every Cohort the caller teaches, with only the enrollments the caller is
 * actually authorized to see. */
export interface TaughtStudent extends BaseSchema {
  full_name: string;
  email: string;
  is_active: boolean;
  enrollments: EnrollmentPublic[];
}

export interface TaughtStudentPage {
  items: TaughtStudent[];
  total: number;
  page: number;
  limit: number;
}

/** The complete student activity view (Teacher Workspace Increment 2) -
 * assembled entirely from persisted records, never from an AI call. */
export interface LessonExerciseSummary {
  exercise_index: number;
  kind: LessonExercise["kind"];
  prompt: string;
  attempt_count: number;
  latest_correct: boolean | null;
  latest_score: number | null;
  latest_submitted_at: string | null;
  latest_reviewed: boolean;
  best_score: number | null;
}

export interface LessonProgressSummary {
  topic_id: string;
  topic_title: string;
  status: LessonDayState;
  exercises: LessonExerciseSummary[];
  graded_exercise_count: number;
  correct_exercise_count: number;
}

export interface EnrollmentJourney {
  enrollment: EnrollmentPublic;
  has_schedule: boolean;
  total_days: number;
  current_day: number;
  lessons: LessonProgressSummary[];
}

export interface AiSessionSummary {
  id: string;
  topic_id: string | null;
  topic_title: string | null;
  enrollment_id: string | null;
  mode: string;
  state: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  has_report: boolean;
}

export interface HomeworkSummary {
  id: string;
  title: string;
  kind: string;
  due_at: string;
  topic_id: string | null;
  /** Always false today - homework submission/completion tracking does not
   * exist in this data model yet. Shown explicitly so the UI never implies
   * a status this system has no way to know. */
  submission_tracking_available: boolean;
}

export interface StudentLearningJourney {
  student_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  enrollments: EnrollmentJourney[];
  ai_sessions: AiSessionSummary[];
  homework: HomeworkSummary[];
}

// --- Messaging (Teacher Workspace Increment 3) ------------------------------

export type AnnouncementScope = "my_students" | "cohort" | "program" | "center";

export interface MessagePublic extends BaseSchema {
  conversation_id: string;
  sender_id: string;
  sender_role: Role;
  sender_name: string | null;
  body: string;
  read_at: string | null;
  announcement_id: string | null;
  is_mine: boolean;
}

export interface ConversationSummary extends BaseSchema {
  other_participant_id: string;
  other_participant_name: string | null;
  other_participant_role: Role | null;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
}

export interface AnnouncementSummary extends BaseSchema {
  sender_id: string;
  sender_role: Role;
  scope: AnnouncementScope;
  scope_id: string | null;
  scope_name: string | null;
  body: string;
  recipient_count: number;
}

export interface ConversationPage {
  items: ConversationSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface MessagePage {
  items: MessagePublic[];
  total: number;
  page: number;
  limit: number;
}

export interface AnnouncementPage {
  items: AnnouncementSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface RecipientPreview {
  recipient_count: number;
}

export interface ExerciseAttemptHistoryItem {
  id: string;
  created_at: string;
  exercise_index: number;
  exercise_kind: LessonExercise["kind"];
  exercise_prompt: string;
  answer: number | string | number[] | string[];
  answer_display: string;
  correct: boolean | null;
  correct_option: number | null;
  score: number | null;
  reviewed: boolean;
  superseded: boolean;
  feedback: string;
}

export interface EnrollmentPage {
  items: EnrollmentPublic[];
  total: number;
  page: number;
  limit: number;
}

/** Student account offered to a Center Admin for a specific Batch.  Academic
 * placement is distinct from Standard/Pro access plans. */
export interface CohortStudentCandidate {
  id: string;
  full_name: string;
  email: string;
  academic_level_id: string | null;
  academic_level_name: string | null;
  is_unassigned: boolean;
}

export interface CohortStudentCandidatePage {
  items: CohortStudentCandidate[];
  total: number;
  page: number;
  limit: number;
}

export interface BulkEnrollmentResult {
  created: EnrollmentPublic[];
  already_enrolled_student_ids: string[];
}

export interface EnrollmentScheduleDay {
  day: number;
  topic_ids: string[];
  locked: boolean;
  topic_states: Record<string, LessonDayState>;
  topic_titles: Record<string, string>;
}

export interface EnrollmentSchedule {
  has_template: boolean;
  total_days: number;
  rest_days: number[];
  current_day: number;
  days: EnrollmentScheduleDay[];
}

export type TranscriptState = "queued" | "extracting" | "pending_review" | "approved_for_ai";

/** Which path the pipeline actually took to produce `raw_transcript` -
 * "captions" is a real YouTube caption track, "ai_generated" is Gemini
 * transcribing the video's audio (the fallback when no captions exist).
 * An AI-generated transcript can contain mishearings a real caption track
 * wouldn't, so the reviewing admin should know before approving it as-is. */
export type TranscriptSource = "captions" | "ai_generated" | "local_asr" | "extracted_text" | "mixed";
export type SourceDocumentKind = "pdf" | "docx" | "pptx" | "text";

export interface SourceDocument {
  kind: SourceDocumentKind;
  label: string;
  filename: string | null;
  url: string | null;
  public_id: string | null;
  extracted_text: string;
  added_at: string;
}
export type SubmissionKind = "audio_task" | "friday_video";
export type ClassKind = "group" | "one_to_one";
export type HomeworkKind = "lesson" | "writing" | "audio" | "link";
export type SessionState =
  | "not_started"
  | "connecting"
  | "connected"
  | "paused"
  | "disconnected"
  | "ended"
  | "connection_failed";
export type EndReason =
  | "user_ended"
  | "idle_timeout"
  | "administrator_terminated"
  | "connection_failure"
  | "max_duration_reached"
  /** Voice Practice only: the hosted voice agent left the room itself. */
  | "agent_ended";
/** Which agent a session talks to: Mariam's Avatar Practice
 * (`topic_discussion`, the default) or the voice-only agent. */
export type PracticeMode = "topic_discussion" | "voice_practice";
/** A lesson's explicit choice: one prompt for both agents, or a separate
 * Voice Practice prompt. */
export type VoicePromptMode = "shared" | "separate";

/** How often/deeply the optional Jordanian-Arabic clarification support
 * kicks in - only consulted by either agent when `arabic_support_enabled`
 * is true. Jordanian (Ammani-dialect) Arabic specifically, never Egyptian
 * dialect or heavy Modern Standard Arabic. */
export type ArabicInterventionLevel = "low" | "medium" | "high";

// --- Auth (app/schema/auth.py) -----------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface LogoutRequest {
  refresh_token: string;
}

export interface PasswordResetRequestBody {
  email: string;
}

export interface PasswordResetConfirmBody {
  token: string;
  new_password: string;
}

// --- Users / Me (app/schema/user.py) ------------------------------------

export interface UserPublic extends BaseSchema {
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  email_verification_status?: "verified" | "pending" | "not_required";
  email_verification_delivery?: "not_sent" | "sent" | "failed";
  plan: PlanType | null;
  program_id: string | null;
  program_level_id: string | null;
  assigned_level: Level | null;
  assigned_topic_ids: string[];
  /** Pro only - which calendar template this student follows. See
   * `CalendarTemplate`. */
  assigned_plan_template_id: string | null;
  max_session_duration_minutes: number;
  duration_override_minutes: number | null;
  /** Day 1 of this student's calendar - set by the assigning admin at
   * assign-plan time, not derived from their own first activity. `null`
   * means no plan has ever been assigned. */
  program_start_date: string | null; // ISO date (YYYY-MM-DD)
}

/** POST /users (admin creates a student) and POST /root/admins (root creates
 * an admin) both take this - the role is implied by which route you call. */
export interface CreateAccountRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface UpdateMeRequest {
  full_name?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ResetPasswordRequest {
  new_password: string;
}

/** PATCH /users/{id}/email - just the one field, same reasoning as
 * `ResetPasswordRequest`: the acting Administrator is already privileged and
 * already scoped to their own student, so there's nothing else to send. */
export interface UpdateStudentEmailRequest {
  email: string;
}

export type StudentStatusFilter = "active" | "inactive";

/** Server-side search/status/paging for the Users dashboard's Students tab (`GET /users`). */
export interface ListStudentsParams {
  search?: string;
  status?: StudentStatusFilter;
  page: number;
  limit: number;
}

/** `GET /users` with `page`/`limit`: one page plus the number of students that matched the filters. */
export interface UserPage {
  items: UserPublic[];
  total: number;
  page: number;
  limit: number;
}

/** `GET /users/counts` - the Users dashboard's KPI cards. */
export interface StudentCounts {
  total_students: number;
  active_students: number;
}

/** Server-side search/status/paging for the Users dashboard's Teachers tab (`GET /teachers`). Same shape as
 * `ListStudentsParams` - there's just no owner to scope a Teacher's own roster by. */
export interface ListTeachersParams {
  search?: string;
  status?: StudentStatusFilter;
  page: number;
  limit: number;
}

/** `GET /teachers/counts` - the Users dashboard's KPI cards. */
export interface TeacherCounts {
  total_teachers: number;
  active_teachers: number;
}

/** `GET /teachers/{id}` - the Teacher Details drawer: the account plus two lightweight counts. */
export interface TeacherDetail {
  teacher: UserPublic;
  student_count: number;
  topic_count: number;
}

export interface UpdateTeacherEmailRequest {
  email: string;
}

export interface SetTeacherActiveRequest {
  is_active: boolean;
}

/** plan="standard" requires assigned_level and forbids assigned_topic_ids;
 * plan="pro" requires assigned_topic_ids and forbids assigned_level - the
 * backend enforces this with a validator, not just types. */
export type AssignPlanRequest =
  | { plan: "standard"; program_id?: string; program_level_id?: string; assigned_level?: Level; start_date?: string }
  | { plan: "pro"; assigned_plan_template_id: string; start_date?: string };

export interface RaiseSessionLimitRequest {
  /** 1-180 (MAX_SESSION_DURATION_OVERRIDE_MINUTES). Pro students only. */
  duration_override_minutes: number;
}

// --- Topics (app/schema/topic.py, app/models/topic_content.py) ---------

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface UsefulPhraseGroup {
  function: string; // e.g. "Starting your speech"
  phrases: string[];
}

export interface VocabularyItem {
  term: string;
  theme: string; // e.g. "Travel"
  example_sentence: string;
  /** Arabic translation of `term` itself (not of the example sentence).
   * Optional - "" for vocabulary authored before this field existed. */
  arabic_meaning: string;
}

export interface GuidedQuestionPart {
  part_title: string; // e.g. "Part 1: Introduction"
  questions: string[];
}

export interface SentenceStarterBlock {
  stage: string;
  starters: string[];
  worked_example: string;
}

export interface PracticeScheduleBlock {
  duration_minutes: number;
  activity: string;
}

export interface DialogueTurn {
  speaker: string;
  text: string;
  is_blank: boolean;
  /** Empty for a Student (answer key) - populated only for a teacher/admin. */
  accepted_answers: string[];
}

export interface LessonExercise {
  kind: "video" | "vocab" | "image_completion" | "listening" | "grammar" | "reading" | "writing" | "speaking" | "game" | "series" | "multiple_choice" | "reflection" | "word_order" | "error_correction" | "dialogue_completion";
  prompt: string;
  options: string[];
  correct_option: number | null;
  explanation: string;
  content: string;
  arabic_note: string;
  media_url: string;
  audio_url: string;
  pairs: { left: string; right: string }[];
  /** Sentence Building / Word Ordering: the target sentence's words, in
   * their CORRECT order. The student player shuffles them for display. */
  ordering_words: string[];
  /** Error Correction: acceptable corrected versions of `content` (the
   * incorrect sentence). Empty for a Student (answer key). */
  accepted_answers: string[];
  /** Dialogue Completion: the dialogue, in order. */
  dialogue_turns: DialogueTurn[];
  min_words: number;
  allow_resubmit: boolean;
  /** ISO timestamp in UTC; null means this activity has no deadline. */
  deadline_at: string | null;
}

export interface ExerciseAttemptPublic extends BaseSchema {
  student_id: string;
  student_name: string;
  enrollment_id: string | null;
  topic_id: string;
  topic_title: string;
  exercise_index: number;
  exercise_kind: LessonExercise["kind"];
  exercise_prompt: string;
  answer: number | string | number[] | string[];
  answer_display: string;
  correct: boolean | null;
  correct_option: number | null;
  score: number | null;
  reviewed: boolean;
  feedback: string;
  reviewed_by_id: string | null;
}

export interface ExerciseAttemptCreateRequest {
  topic_id: string;
  exercise_index: number;
  topic_updated_at: string;
  answer: number | string | number[] | string[];
  /** Required only if you have more than one active enrollment. */
  enrollment_id?: string;
}

export interface ExerciseReviewRequest {
  score: number;
  feedback: string;
}

export interface DraftExercisesRequest {
  kind: LessonExercise["kind"];
  count: number;
  focus?: string;
  content?: string;
}

export interface DraftExercisesResponse {
  exercises: LessonExercise[];
  source: "approved_transcript";
  model: string;
}

export type ObjectiveSource = "manual" | "ai";

/** Teacher-only curriculum intent. It is deliberately absent from Student
 * responses, including when approved. */
export interface LearningObjective {
  text: string;
  source: ObjectiveSource;
}

export interface ObjectiveSuggestion {
  text: string;
}

/** GET /topics row shape - deliberately no transcript, see the backend's own
 * docstring on TopicListItem for why (payload size). */
export interface ActivityAnalytics {
  generated_at: string;
  timezone: "UTC";
  days: number;
  start_date: string;
  end_date: string;
  roster_students: number;
  active_students: number;
  previous_active_students: number;
  returning_students: number;
  returning_rate: number | null;
  completed_sessions: number;
  topics_practiced: number;
  session_minutes: number;
  submissions: number;
  reports_available: number;
  unscored_sessions: number;
  reports_awaiting_review: number;
  submissions_awaiting_review: number;
  daily: { date: string; active_students: number; completed_sessions: number; submissions: number; session_minutes: number }[];
  score_groups: { rubric: string; level: string | null; report_count: number; student_count: number; average_score: number }[];
}

export interface TopicListItem extends BaseSchema {
  title: string;
  author_name: string | null;
  level: Level;
  level_profile_id: string | null;
  level_name: string;
  youtube_urls: string[];
  /** A manually-uploaded cover image if one was set, otherwise a thumbnail
   * derived for free from `youtube_urls[0]` - null only when there's
   * neither. Already resolved server-side; no fallback logic needed here. */
  thumbnail_url: string | null;
  /** Best-effort, from the YouTube Data API - `null` if there's no video,
   * no API key configured, or the lookup failed. */
  video_duration_seconds: number | null;
  transcript_state: TranscriptState;
  /** This topic's resolved position on the caller's own calendar - `null`
   * for an Administrator/Root, or a Student for whom it somehow isn't on
   * their calendar at all. Always populated for a Student otherwise. */
  lesson_status: LessonDayState | null;
  /** This student's allotted Mariam-session minutes for this lesson - see
   * `ProgressService.get_topic_session_minutes`. `null` for an
   * Administrator/Root, same as `lesson_status`. */
  session_minutes: number | null;
  /** Which Administrator authored this topic - `null` for a legacy topic
   * that predates ownership (shared read-only across every Administrator).
   * Compare to the signed-in user's own id to decide whether edit/delete
   * should be offered - see `lib/topics/helpers.ts`'s `isOwnTopic`. */
  created_by_id: string | null;
  /** Topic organization by unit + order - `null` for a legacy/unassigned
   * topic (grouped under "Unassigned" in the UI). */
  unit_id: string | null;
  /** This topic's position within its unit (or within "Unassigned") - ties
   * broken by `created_at`. */
  order_index: number;
  /** Whether a PDF lesson source has been uploaded (video-optional content) -
   * the list view doesn't carry the extracted text itself (size). */
  has_pdf: boolean;
  has_video: boolean;
  has_audio: boolean;
  exercise_count: number;
  exercise_kinds: LessonExercise["kind"][];
}

/** GET/POST/PATCH /topics/{id} shape. `avatar_prompt`/`transcript_state`/
 * `raw_transcript` come back null/empty for a Student (see `include_internal`
 * server-side) - never assume they're present without checking the caller's
 * own role. `approved_transcript` is on every response instead - it's `null`
 * for everyone until a teacher approves it, so there's nothing to gate. */
export interface TopicPublic extends BaseSchema {
  title: string;
  content_revision: number;
  level: Level;
  level_profile_id: string | null;
  level_name: string;
  level_guidance: string;
  youtube_urls: string[];
  thumbnail_url: string | null;
  /** Whether `thumbnail_url` is a manual upload (true) vs. the free
   * YouTube-derived fallback (false) - drives whether the builder offers
   * "remove custom image". */
  has_custom_thumbnail: boolean;
  video_duration_seconds: number | null;
  /** A teacher-uploaded lesson video. Students receive the public playback
   * URL; the provider asset id remains backend-only. */
  uploaded_video_url: string | null;
  uploaded_video_filename: string | null;
  warm_up_questions: string[];
  guided_questions: GuidedQuestionPart[];
  useful_phrases: UsefulPhraseGroup[];
  vocabulary: VocabularyItem[];
  sentence_starters: SentenceStarterBlock[];
  suggested_practice_schedule: PracticeScheduleBlock[];
  lesson_exercises: LessonExercise[];
  opening_line: string;
  approved_transcript: string | null;
  // Administrator/Root only:
  avatar_prompt: string | null;
  voice_prompt_mode: VoicePromptMode | null;
  voice_prompt: string | null;
  /** Optional, teacher-controlled Jordanian-Arabic clarification support -
   * `null` for a legacy topic that predates this field (both agents then
   * fall back to their own prior behavior - see each agent's prompt module). */
  arabic_support_enabled: boolean | null;
  arabic_intervention_level: ArabicInterventionLevel | null;
  transcript_state: TranscriptState | null;
  raw_transcript: TranscriptSegment[];
  transcript_source_labels: string[];
  /** `null` until the first generation run completes. See `TranscriptSource`. */
  transcript_source: TranscriptSource | null;
  /** Same as `TopicListItem.created_by_id`. */
  created_by_id: string | null;
  /** Same as `TopicListItem.lesson_status` - `null` for an Administrator/
   * Root, always populated for a Student. */
  lesson_status: LessonDayState | null;
  /** Same as `TopicListItem.session_minutes`. */
  session_minutes: number | null;
  /** Same as `TopicListItem.unit_id`/`order_index`. */
  unit_id: string | null;
  order_index: number;
  // Video-optional lesson source (Administrator/Root only, same disclosure
  // rule as `raw_transcript` - authoring material, not Student-facing).
  pdf_url: string | null;
  pdf_filename: string | null;
  pdf_extracted_text: string | null;
  /** Authoring-only multi-source material.  The API never sends this to Students. */
  source_documents: SourceDocument[] | null;
  learning_objectives: LearningObjective[];
  objectives_approved: boolean;
  objective_drafts: LearningObjective[];
  /** Teacher-only flow configuration. Interactive video cannot be published
   * until its checkpoint player exists. */
  lesson_flow: LessonFlow | null;
  /** AI-suggested exercises awaiting teacher review (Slice C) - `[]` for a
   * Student, same disclosure rule as `raw_transcript`. Index into this
   * array is what `topicsApi.acceptDraftExercise`/`rejectDraftExercise`/
   * `regenerateDraftExercise` take. */
  draft_exercises: LessonDraftExerciseSuggestion[];
  /** Progress of the most recent "Generate Lesson Draft" run - `null`
   * before the first run, or for a Student. Poll `topicsApi.get` after
   * `generateLessonDraft` to watch this resolve from "running" to "done"/
   * "failed". */
  lesson_draft_job: LessonDraftJob | null;
}

export type LessonDraftStepState = "pending" | "running" | "done" | "skipped" | "failed";

export interface LessonDraftExerciseSuggestion {
  kind: LessonExercise["kind"];
  exercise: LessonExercise;
  state: LessonDraftStepState;
  error: string | null;
}

export interface LessonDraftJob {
  state: LessonDraftStepState;
  content_step: LessonDraftStepState;
  /** Exercise kind (e.g. "multiple_choice") -> its own step status. */
  exercise_steps: Record<string, LessonDraftStepState>;
  planned_calls: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

/** One row of `TopicAdminDetail.enrolled_students`. */
export interface EnrolledStudent {
  id: string;
  full_name: string;
  email: string;
}

/** GET /topics/{id}/admin-detail shape - Administrator/Root (and the
 * authoring Teacher) only. Fetched lazily for a topic's detail view, not
 * included on `TopicListItem`/`TopicPublic` (payload size). */
export interface TopicAdminDetail {
  created_by_id: string | null;
  /** `null` for a legacy/shared topic with no recorded author, or if the
   * recorded author's account has since been deleted. */
  created_by_name: string | null;
  created_by_email: string | null;
  enrolled_students: EnrolledStudent[];
}

/** Optional body for POST /topics/{id}/approve-transcript. Omitted keeps the
 * pipeline's own auto-joined text; a non-empty `approved_transcript` lets the
 * reviewing admin ship their edited wording instead. */
export interface ApproveTranscriptRequest {
  approved_transcript?: string;
}

/** Body for POST /topics/{id}/review-transcript-english. */
export interface ReviewTranscriptEnglishRequest {
  transcript: string;
}

export interface TranscriptCorrection {
  original: string;
  corrected: string;
  category: string; // e.g. "grammar", "word choice", "punctuation"
  explanation: string;
}

/** Response for POST /topics/{id}/review-transcript-english - purely
 * advisory, this doesn't touch the stored topic at all. */
export interface ReviewTranscriptEnglishResult {
  corrected_transcript: string;
  corrections: TranscriptCorrection[];
}

export interface TopicCreateRequest {
  title: string;
  level: Level;
  level_profile_id?: string | null;
  youtube_urls?: string[];
  /** Topic organization by unit + order - validated server-side against
   * the authenticated teacher's own (or legacy/shared) units and against
   * the topic's own `level`. */
  unit_id?: string | null;
  order_index?: number;
  warm_up_questions?: string[];
  guided_questions?: GuidedQuestionPart[];
  useful_phrases?: UsefulPhraseGroup[];
  vocabulary?: VocabularyItem[];
  sentence_starters?: SentenceStarterBlock[];
  suggested_practice_schedule?: PracticeScheduleBlock[];
  lesson_exercises?: LessonExercise[];
  avatar_prompt?: string;
  opening_line?: string;
  voice_prompt_mode?: VoicePromptMode;
  voice_prompt?: string;
  arabic_support_enabled?: boolean;
  arabic_intervention_level?: ArabicInterventionLevel;
  lesson_flow?: LessonFlow;
}

/** Every field optional - PATCH only touches what's provided. */
export type TopicUpdateRequest = Partial<TopicCreateRequest>;

// --- Calendar templates (app/schema/calendar_template.py) --------------

export type TemplateKind = "standard" | "custom" | "cohort";

export interface CalendarDayEntry {
  day: number; // 1-30, never an end-of-week check-in day (5/12/19/26)
  /** One day can hold more than one course, each tracked/rolled over
   * independently - see `ProgressService._build_schedule`. */
  topic_ids: string[];
  /** topic_id -> teacher-set minutes overriding the automatic even split of
   * the daily budget - see `ProgressService.get_topic_session_minutes`.
   * Missing keys mean "split whatever's left of the daily budget evenly". */
  custom_minutes: Record<string, number>;
}

/** GET/POST/PATCH /calendar-templates shape. A `standard` template is the
 * one active calendar for `(admin, level)` - every Standard student at that
 * level follows it. A `custom` template is freeform (any topic, any level)
 * and lives in the admin's own reusable library, assigned to Pro students
 * by id (`UserPublic.assigned_plan_template_id`). See
 * `app.models.calendar_template`. */
export interface CalendarTemplate extends BaseSchema {
  name: string;
  kind: TemplateKind;
  owner_admin_id: string;
  program_id: string | null;
  program_level_id: string | null;
  cohort_id: string | null;
  level: Level | null; // required for standard, null for custom
  is_active: boolean; // standard only
  duration_days: number;
  rest_days: number[];
  days: CalendarDayEntry[];
}

export interface CalendarTemplateCreateRequest {
  name: string;
  kind: TemplateKind;
  level?: Level | null;
  duration_days?: number;
  rest_days?: number[];
  days?: CalendarDayEntry[];
}

/** `days`, when provided, replaces the whole list - not a sparse patch. */
export type CalendarTemplateUpdateRequest = Partial<CalendarTemplateCreateRequest>;

// --- Student alerts (app/schema/alerts.py) ------------------------------

/** GET /users/{id}/alerts and GET /users/alerts (bulk, keyed by student id) -
 * the admin roster's warning badge and the student-detail "Alerts" section.
 * See `ProgressService.get_alerts`/`get_alerts_for_students`. */
export interface StudentAlerts {
  pending_rollover_count: number;
  missed_submission_days: number[];
  has_alerts: boolean;
}

// --- Submissions (app/schema/submission.py) -----------------------------

/** `media_url` is a freshly-signed Cloudinary URL, minted per response - it
 * is NOT stable to cache/store across requests, and is "" once the 7-day
 * retention job has deleted the underlying media (`media_deleted: true`). */
export interface SubmissionPublic extends BaseSchema {
  student_id: string;
  kind: SubmissionKind;
  topic_id: string | null; // null for an end-of-week video - it isn't topic-tied
  day: number | null; // 1-30 for an end-of-week video, null for an audio task
  label: string;
  media_url: string;
  duration_seconds: number;
  reviewed: boolean;
  media_deleted: boolean;
  submitted_at: string;
  expires_at: string;
}

export interface ListSubmissionsForAdminParams {
  student_id?: string;
  topic_id?: string;
  reviewed?: boolean;
}

/** Body for PATCH /submissions/{id}/reviewed. */
export interface MarkReviewedRequest {
  reviewed: boolean;
}

export interface ListTopicsParams {
  transcript_state?: TranscriptState;
  search?: string;
  level?: Level;
  limit?: number; // default 50, max 200 (DEFAULT_PAGE_SIZE / MAX_PAGE_SIZE)
  skip?: number;
}

// --- Units (app/schema/unit.py) - Topic organization by unit + order ----

export interface UnitPublic extends BaseSchema {
  level: Level;
  name: string;
  order_index: number;
  /** `null` for a legacy/shared unit - mirrors `TopicListItem.created_by_id`. */
  created_by_id: string | null;
}

export interface UnitCreateRequest {
  level: Level;
  name: string;
  order_index?: number;
}

export interface UnitUpdateRequest {
  name?: string;
  order_index?: number;
}

export interface ListUnitsParams {
  level?: Level;
}

// --- Classes (app/schema/live_class.py) ---------------------------------

/** GET/POST/PATCH /classes shape. A Group class is any number of the
 * admin's own Standard-plan students; a 1:1 is exactly one Pro-plan
 * student - `participant_ids` carries whichever applies. No capacity field:
 * enrollment is exactly who the admin picked when scheduling it. */
export interface LiveClassPublic extends BaseSchema {
  kind: ClassKind;
  title: string;
  scheduled_at: string; // ISO 8601
  duration_minutes: number;
  meet_link: string;
  participant_ids: string[];
}

export interface CreateLiveClassRequest {
  kind: ClassKind;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  meet_link: string;
  participant_ids: string[];
}

/** Every field optional - PATCH only touches what's provided. Participants
 * aren't editable here - cancel and recreate instead. */
export interface UpdateLiveClassRequest {
  title?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  meet_link?: string;
}

export interface HomeworkPublic extends BaseSchema {
  created_by_id: string;
  title: string;
  instructions: string;
  kind: HomeworkKind;
  due_at: string;
  participant_ids: string[];
  cohort_id: string | null;
  program_id: string | null;
  program_level_id: string | null;
  topic_id: string | null;
  topic_title: string | null;
  external_url: string;
}

export interface HomeworkCreateRequest {
  title: string;
  instructions: string;
  kind: HomeworkKind;
  due_at: string;
  /** Either a hand-picked roster... */
  participant_ids?: string[];
  /** ...or a Cohort target (optionally one of its stages) - every student
   * the caller can reach in that Cohort. See `HomeworkService.create`. */
  cohort_id?: string;
  program_level_id?: string;
  topic_id?: string;
  external_url?: string;
}

// --- Sessions (app/schema/live_session.py) - real "Discuss with Mariam" ----

export interface SessionStartResponse {
  server_url: string;
  participant_token: string;
  session_id: string;
  room_name: string;
  /** This course's actual time budget for the LiveKit agent worker - see
   * `ProgressService.get_topic_session_minutes`. The live countdown timer
   * counts down from this, not the student's flat daily cap. */
  max_duration_minutes: number;
}

/** `POST /sessions/{id}/avatar-token`: what the browser needs to draw Mariam's avatar. `session_token` is SpatialReal's
 * short-lived credential minted on the server - the SpatialReal API key never reaches the browser. The two ids are
 * public and come from the same server settings the hosted agent is configured from. */
export interface AvatarTokenResponse {
  session_token: string;
  expires_at: number;
  app_id: string;
  avatar_id: string;
}

export interface InteractionTurn {
  speaker: string; // "student" or "mariam" ("agent" in a Voice Practice browser transcript)
  text: string;
  timestamp: string;
}

/** One final `lk.transcription` segment as the student's browser saw it -
 * stored server-side as UNVERIFIED and never scored. */
export interface BrowserTranscriptTurn {
  speaker: "student" | "agent";
  text: string;
  timestamp: string;
}

/** Body for POST /sessions/{id}/end (Voice Practice only). */
export interface VoiceSessionEndRequest {
  end_reason: Exclude<EndReason, "administrator_terminated" | "idle_timeout">;
  browser_transcript: BrowserTranscriptTurn[];
}

/** An AI-generated read on one finished session's transcript (Kanban Lane
 * G) - scores the student's English only, from the text transcript alone
 * (no pronunciation score - there's no audio to judge). `null` on a session
 * until `generate_report` finishes, which only ever runs for a session that
 * ended normally (not a connection failure) with a non-empty transcript. */
export interface SpeakingReport {
  fluency_score: number | null;
  vocabulary_score: number | null;
  grammar_score: number | null;
  complexity_score: number | null;
  overall_score: number | null;
  summary: string;
  generated_at: string;
  reviewed: boolean;
  analysis?: LearningAnalysis | null;
}

export interface ReportEvidence { turn_index: number; quote: string }
export interface ReportInsight { observation: string; evidence: ReportEvidence }
export interface LearningAnalysis {
  rubric_version: "tamakkan-text-v1";
  basis: "transcript_only";
  pronunciation_status: "not_assessed_no_audio";
  target_level: string | null;
  status: "assessed" | "insufficient_evidence";
  metrics: { student_turns: number; student_words: number; unique_student_words: number; average_words_per_turn: number; session_duration_seconds: number | null };
  feedback: {
    status: "assessed" | "insufficient_evidence";
    strengths: ReportInsight[];
    improvement_areas: ReportInsight[];
    corrections: { category: "grammar" | "vocabulary" | "clarity"; evidence: ReportEvidence; corrected: string; explanation: string }[];
    recurring_patterns: { description: string; evidence: ReportEvidence[]; practice_action: string }[];
    next_steps: { focus: string; action: string; success_criterion: string; minutes: number }[];
  } | null;
  comparison: {
    previous_session_id: string; previous_session_date: string;
    overall_change: number; fluency_change: number; vocabulary_change: number;
    grammar_change: number; complexity_change: number; student_words_change: number;
  } | null;
}

/** GET /sessions/{id} shape - full transcript included. */
export interface LiveSessionPublic extends BaseSchema {
  student_id: string;
  topic_id: string | null;
  mode: PracticeMode;
  state: SessionState;
  end_reason: EndReason | null;
  started_at: string;
  ended_at: string | null;
  transcript_history: InteractionTurn[];
  /** Voice Practice only - browser-captured, UNVERIFIED, never scored. */
  browser_transcript: InteractionTurn[];
  report: SpeakingReport | null;
}

/** GET /sessions/me and GET /sessions row shape - no transcript, matching
 * the same "detail vs list" size discipline as TopicListItem/TopicPublic.
 * `report` is small enough (a handful of scores + a short summary) to carry
 * on both shapes. */
export interface LiveSessionListItem extends BaseSchema {
  student_id: string;
  topic_id: string | null;
  mode: PracticeMode;
  state: SessionState;
  end_reason: EndReason | null;
  started_at: string;
  ended_at: string | null;
  report: SpeakingReport | null;
}

/** `GET /sessions` with `page`/`limit`: one page plus the number of sessions that matched the filters. */
export interface SessionPage {
  items: LiveSessionListItem[];
  total: number;
  page: number;
  limit: number;
}

/** Persisted session state. These counts are not a LiveKit health probe or billing data. */
export interface OperationsSnapshot {
  generated_at: string;
  connected_by_mode: Record<PracticeMode, number>;
  connecting: number;
  disconnected: number;
  connection_failures_24h: number;
  ended_24h: number;
  handoffs_24h: number;
  recent_sessions: Array<Pick<LiveSessionListItem, "id" | "mode" | "state" | "started_at" | "ended_at" | "end_reason">>;
}

export type ReportStatusFilter = "any" | "scored" | "not_scored" | "needs_review" | "reviewed";

/** Server-side search/filters for the admin's AI Reports list. Dates are inclusive `YYYY-MM-DD` days. */
export interface ListReportsParams {
  search?: string;
  student_id?: string;
  topic_id?: string;
  mode?: PracticeMode;
  report_status?: ReportStatusFilter;
  /** ISO instants: sessions that started at/after `started_from` and strictly before `started_before`. */
  started_from?: string;
  started_before?: string;
  page: number;
  limit: number;
}

/** Body for PATCH /sessions/{id}/report-reviewed. */
export interface MarkSessionReportReviewedRequest {
  reviewed: boolean;
}

export type BadgeKey = "streak" | "vocab_master" | "first_class" | "top_scorer" | "fast_improver" | "level_complete";

export interface Badge {
  key: BadgeKey;
  earned: boolean;
  earned_at: string | null;
}

export interface ChallengeMilestone {
  day: number;
  reached: boolean;
}

/** GET /me/progress shape - see `app.schema.progress.StudentProgress`.
 * Recomputed server-side on every request, never cached client-side beyond
 * the hook's own fetch-on-mount. */
export interface StudentProgress {
  current_streak: number;
  longest_streak: number;
  total_active_days: number;
  challenge_day: number;
  challenge_total_days: number;
  /** The teacher-set "day 1" this student's `challenge_day` is anchored to -
   * `null` if no plan has ever been assigned. Lets the UI show "starts
   * {date}" when `challenge_day` is 0 (not started yet). */
  program_start_date: string | null; // ISO date (YYYY-MM-DD)
  /** The real Program this journey belongs to - `null` only when nothing
   * resolved at all (no plan, no Enrollment, or `has_multiple_enrollments`). */
  program_name: string | null;
  /** True when this student holds 2+ active Enrollments - every other field
   * above is then the same as "no plan" (this page is single-calendar and
   * never guesses which one to show); point the student to My Learning
   * instead of implying they have nothing assigned. */
  has_multiple_enrollments: boolean;
  last_7_days_active: boolean[];
  last_7_days_dates: string[];
  badges: Badge[];
  milestones: ChallengeMilestone[];
}

export type LessonDayState = "done" | "current" | "missed" | "locked";

export interface TopicSlot {
  topic_id: string;
  state: LessonDayState;
}

export interface LessonDaySlot {
  day: number;
  /** One day can hold any number of courses, each tracked/rolled over
   * independently - empty once nothing is scheduled for this day (or
   * before anything has ever been reached). */
  topics: TopicSlot[];
}

/** GET /me/challenge-calendar shape - see `app.schema.challenge`. A missed
 * day's topic repeats on the following lesson day rather than being dropped
 * (`ProgressService.get_lesson_schedule`); `pending_count` drives the
 * "you still owe N lessons" reminder banner. */
export interface ChallengeCalendar {
  lesson_days: LessonDaySlot[];
  total_days: number;
  rest_days: number[];
  pending_count: number;
  /** False when no calendar template is assigned yet (no active Standard
   * template for the student's level, or a Pro student with none assigned) -
   * distinct from "a template exists but has nothing scheduled." */
  has_template: boolean;
}
