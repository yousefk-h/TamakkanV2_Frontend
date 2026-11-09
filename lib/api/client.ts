/**
 * Typed client for the Tamakkan backend.
 *
 * Calls go through this app's own same-origin BFF routes
 * (app/api/auth/login, app/api/auth/logout, app/api/backend/[...path]),
 * never directly to the FastAPI service. The BFF holds both JWTs in
 * httpOnly cookies and does the refresh-on-401 dance server-side - browser
 * JS here never sees a token, so an XSS bug can't turn into session theft
 * the way it could with a token in localStorage. See
 * lib/api/server/backend.ts for the cookie/refresh logic.
 *
 * Every function here was written against the actual route handlers in
 * the backend's app/api/v1/*.py, not from memory - verify against that
 * source (not this comment) if the two ever disagree.
 */

import type {
  ActivityAnalytics,
  OperationsSnapshot,
  ApproveTranscriptRequest,
  AssignPlanRequest,
  CalendarTemplate,
  CalendarTemplateCreateRequest,
  CalendarTemplateUpdateRequest,
  ChangePasswordRequest,
  CreateAccountRequest,
  CreateLiveClassRequest,
  DraftExercisesRequest,
  DraftExercisesResponse,
  ExerciseAttemptCreateRequest,
  ExerciseAttemptPublic,
  ExerciseReviewRequest,
  ListStudentsParams,
  ListSubmissionsForAdminParams,
  ListTeachersParams,
  ListTopicsParams,
  ListUnitsParams,
  LiveClassPublic,
  LevelProfileCreateRequest,
  LevelProfilePublic,
  HomeworkCreateRequest,
  HomeworkPublic,
  ListReportsParams,
  LiveSessionListItem,
  LiveSessionPublic,
  LoginRequest,
  MarkReviewedRequest,
  MarkSessionReportReviewedRequest,
  MessageResponse,
  PasswordResetConfirmBody,
  PasswordResetRequestBody,
  PracticeMode,
  ProgramPublic,
  ProgramTopicPublic,
  ProgramTopicUpdateRequest,
  ProgramTopicWriteRequest,
  ProgramWriteRequest,
  CohortCreateRequest,
  CohortPublic,
  CohortUpdateRequest,
  EnrollmentPublic,
  EnrollmentPage,
  CohortStudentCandidatePage,
  BulkEnrollmentResult,
  EnrollmentSchedule,
  EnrollStudentsRequest,
  RaiseSessionLimitRequest,
  ResetPasswordRequest,
  ReviewTranscriptEnglishRequest,
  ReviewTranscriptEnglishResult,
  ChallengeCalendar,
  AvatarTokenResponse,
  SessionPage,
  SessionStartResponse,
  SetTeacherActiveRequest,
  StudentAlerts,
  StudentCounts,
  StudentProgress,
  SubmissionPublic,
  TeacherCounts,
  TeacherDetail,
  TemplateKind,
  TopicAdminDetail,
  TopicCreateRequest,
  TopicListItem,
  TopicPublic,
  VoiceSessionEndRequest,
  TopicUpdateRequest,
  UpdateLiveClassRequest,
  UpdateMeRequest,
  UpdateStudentEmailRequest,
  UpdateTeacherEmailRequest,
  UnitCreateRequest,
  UnitPublic,
  UnitUpdateRequest,
  UserPage,
  UserPublic,
} from "./types";

const BACKEND_PREFIX = "/api/backend";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  cache?: RequestCache;
  method?: string;
  json?: unknown;
  form?: FormData;
  /** Lets the request outlive the page (`pagehide`) - body must stay < 64 KB. */
  keepalive?: boolean;
  // Plain `object`, not `Record<string, ...>`: interfaces without an index
  // signature (ListTopicsParams, ListSubmissionsForAdminParams) aren't
  // assignable to an indexed type in TS even when every property matches, so
  // an indexed type here would reject every real caller. Read via
  // `Object.entries` in `buildUrl`, which only needs the shape at runtime.
  params?: object;
};

function buildUrl(path: string, params?: object): string {
  // A relative base is enough here - every call is same-origin - but URL()
  // still needs some absolute base to parse against.
  const url = new URL(path, "http://internal.invalid");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { detail: unknown; code?: string };
    // A 422 from Pydantic's own validation has `detail` as an array of
    // {loc, msg, type} objects, not a string - every other error path in
    // this backend (AppException, DuplicateKeyError) returns a plain string.
    if (Array.isArray(body.detail)) {
      return new ApiError(response.status, body.detail.flatMap((e: { msg?: string }) => (e.msg ? [e.msg] : [])).join("; ") || "Validation error.");
    }
    return new ApiError(response.status, typeof body.detail === "string" ? body.detail : "Something went wrong.", body.code);
  } catch {
    return new ApiError(response.status, `Request failed with status ${response.status}.`);
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", json, form, params } = options;

  const headers: Record<string, string> = {};
  if (json !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(buildUrl(path, params), {
    cache: options.cache,
    keepalive: options.keepalive,
    method,
    headers,
    body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- Auth -------------------------------------------------------------------

export const authApi = {
  /** Logs in via the BFF, which sets the session cookies and returns the
   * signed-in user - never a token, there is none to hand back. */
  async login(body: LoginRequest): Promise<UserPublic> {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await parseApiError(response);
    const { user } = (await response.json()) as { user: UserPublic };
    return user;
  },
  /** Revokes the refresh token server-side and clears both session cookies.
   * Best-effort by design - always resolves, never throws, so a caller can
   * unconditionally clear local UI state (redirect to login) right after. */
  async logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  },
  requestPasswordReset: (body: PasswordResetRequestBody) =>
    request<MessageResponse>(`${BACKEND_PREFIX}/auth/password-reset/request`, { method: "POST", json: body }),
  requestEmailVerification: (email: string) =>
    request<MessageResponse>("/api/auth/email-verification/request", { method: "POST", json: { email }, cache: "no-store" }),
  confirmEmailVerification: (token: string) =>
    request<MessageResponse>("/api/auth/email-verification/confirm", { method: "POST", json: { token }, cache: "no-store" }),
  confirmPasswordReset: (body: PasswordResetConfirmBody) =>
    request<MessageResponse>(`${BACKEND_PREFIX}/auth/password-reset/confirm`, { method: "POST", json: body }),
};

// --- Me -------------------------------------------------------------------

export const analyticsApi = {
  get: (scope: "admin" | "student", days: 7 | 30) => request<ActivityAnalytics>(
    `${BACKEND_PREFIX}/${scope === "student" ? "me/analytics" : "analytics"}`, { params: { days }, cache: "no-store" },
  ),
};

export const operationsApi = {
  sessions: () => request<OperationsSnapshot>(`${BACKEND_PREFIX}/operations/sessions`, { cache: "no-store" }),
};

export const meApi = {
  get: () => request<UserPublic>(`${BACKEND_PREFIX}/me`),
  update: (body: UpdateMeRequest) => request<UserPublic>(`${BACKEND_PREFIX}/me`, { method: "PATCH", json: body }),
  changePassword: (body: ChangePasswordRequest) =>
    request<MessageResponse>(`${BACKEND_PREFIX}/me/change-password`, { method: "POST", json: body }),
  /** Student only - notifies their instructor; see usersApi.resetStudentPassword. */
  requestPasswordReset: () => request<MessageResponse>(`${BACKEND_PREFIX}/me/request-password-reset`, { method: "POST" }),
  /** Student only. Real streak/badges/challenge-day, recomputed every call. */
  getProgress: () => request<StudentProgress>(`${BACKEND_PREFIX}/me/progress`),
  /** Student only. Which topic occupies each challenge day, with real
   * done/current/missed/locked state - see `app.services.progress_service`. */
  getChallengeCalendar: () => request<ChallengeCalendar>(`${BACKEND_PREFIX}/me/challenge-calendar`),
};

// --- Users (Teacher or Administrator) ----------------------------------------

export const usersApi = {
  /** Creates a Student. Root creating an Administrator is rootApi.createAdministrator instead. */
  createStudent: (body: CreateAccountRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/users`, { method: "POST", json: body }),
  /** A Teacher's own students only, never another Teacher's; the Administrator (Center Admin) gets every
   * student in the center instead - same request either way, the backend decides by role. Filter client-side
   * by `plan === null` for the "awaiting class assignment" queue. */
  listMyStudents: () => request<UserPublic[]>(`${BACKEND_PREFIX}/users`),
  resetStudentPassword: (studentId: string, body: ResetPasswordRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/users/${studentId}/reset-password`, { method: "POST", json: body }),
  /** Just the email - a duplicate (anyone else's) is a 409. */
  updateStudentEmail: (studentId: string, body: UpdateStudentEmailRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/users/${studentId}/email`, { method: "PATCH", json: body }),
  /** Soft delete - the account disappears from the roster and can no longer
   * sign in; its past sessions/reports/submissions are untouched. */
  deleteStudent: (studentId: string) => request<void>(`${BACKEND_PREFIX}/users/${studentId}`, { method: "DELETE" }),
  assignPlan: (studentId: string, body: AssignPlanRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/users/${studentId}/assign-plan`, { method: "POST", json: body }),
  raiseSessionLimit: (studentId: string, body: RaiseSessionLimitRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/users/${studentId}/raise-session-limit`, { method: "POST", json: body }),
  /** Rollover/missed-submission alerts for one student - the student-detail
   * "Alerts" section. */
  getAlerts: (studentId: string) => request<StudentAlerts>(`${BACKEND_PREFIX}/users/${studentId}/alerts`),
  /** Same, batched for the caller's whole roster, keyed by student id - the
   * roster's warning badge. */
  getRosterAlerts: () => request<Record<string, StudentAlerts>>(`${BACKEND_PREFIX}/users/alerts`),
  /** Server-side search/status/paging over the same roster as `listMyStudents` -
   * the Users dashboard's Students tab. */
  listStudentsPage: (params: ListStudentsParams) => request<UserPage>(`${BACKEND_PREFIX}/users`, { params }),
  /** Total/active counts for the caller's own students - the Users
   * dashboard's KPI cards. */
  getStudentCounts: () => request<StudentCounts>(`${BACKEND_PREFIX}/users/counts`),
};

// --- Teachers (Administrator-only) -------------------------------------------

export const teachersApi = {
  /** Creates a Teacher account. A Teacher cannot call this - 403. */
  createTeacher: (body: CreateAccountRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/teachers`, { method: "POST", json: body }),
  /** Every Teacher in the center, server-paginated/searched/filtered - the Users dashboard's Teachers tab. */
  listTeachersPage: (params: ListTeachersParams) => request<UserPage>(`${BACKEND_PREFIX}/teachers`, { params }),
  getTeacherCounts: () => request<TeacherCounts>(`${BACKEND_PREFIX}/teachers/counts`),
  getTeacher: (teacherId: string) => request<TeacherDetail>(`${BACKEND_PREFIX}/teachers/${teacherId}`),
  updateTeacherEmail: (teacherId: string, body: UpdateTeacherEmailRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/teachers/${teacherId}/email`, { method: "PATCH", json: body }),
  resetTeacherPassword: (teacherId: string, body: ResetPasswordRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/teachers/${teacherId}/reset-password`, { method: "POST", json: body }),
  setTeacherActive: (teacherId: string, body: SetTeacherActiveRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/teachers/${teacherId}/active`, { method: "PATCH", json: body }),
  /** Soft delete - the account disappears from the Teachers tab and can no longer sign in; their
   * students/topics keep their `created_by_id` and stay intact, manageable only by the Center Admin from then
   * on. */
  deleteTeacher: (teacherId: string) => request<void>(`${BACKEND_PREFIX}/teachers/${teacherId}`, { method: "DELETE" }),
};

// --- Root (Root-only) -------------------------------------------------------

export const rootApi = {
  createAdministrator: (body: CreateAccountRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/root/admins`, { method: "POST", json: body }),
  resetAdministratorPassword: (adminId: string, body: ResetPasswordRequest) =>
    request<UserPublic>(`${BACKEND_PREFIX}/root/admins/${adminId}/reset-password`, { method: "POST", json: body }),
};

// --- Topics -----------------------------------------------------------------

export const topicsApi = {
  /** Every role gets a response, but the content differs: Administrator/Root
   * see everything, a Student sees only what their plan entitles them to
   * (empty array if no plan is assigned yet - not an error). */
  list: (params?: ListTopicsParams) => request<TopicListItem[]>(`${BACKEND_PREFIX}/topics`, { params }),
  /** For a Student, 403s if the topic is outside their assigned plan/enrollment.
   * `enrollmentId` is required only if the student has more than one active enrollment. */
  get: (topicId: string, enrollmentId?: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}`, { params: { enrollment_id: enrollmentId } }),
  /** Administrator only. */
  create: (body: TopicCreateRequest) => request<TopicPublic>(`${BACKEND_PREFIX}/topics`, { method: "POST", json: body }),
  /** Administrator only. Partial update - omitted fields are left as-is. */
  update: (topicId: string, body: TopicUpdateRequest) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}`, { method: "PATCH", json: body }),
  /** Teacher-reviewed suggestions only; nothing is saved until PATCH /topics/{id}. */
  draftExercises: (topicId: string, body: DraftExercisesRequest) =>
    request<DraftExercisesResponse>(`${BACKEND_PREFIX}/topics/${topicId}/draft-exercises`, { method: "POST", json: body }),
  /** Administrator only. Soft delete. */
  delete: (topicId: string) => request<void>(`${BACKEND_PREFIX}/topics/${topicId}`, { method: "DELETE" }),
  /** Administrator only. 202 - kicks off a background job; poll `get()` for
   * `transcript_state` to reach "pending_review" (ready) or "queued" (failed,
   * check server logs and retry). */
  generateTranscript: (topicId: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/generate-transcript`, { method: "POST" }),
  /** Administrator only. Terminal - once approved there is no route back.
   * `body.approved_transcript`, if given, ships the admin's edited wording
   * instead of the pipeline's auto-joined segments. */
  approveTranscript: (topicId: string, body?: ApproveTranscriptRequest) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/approve-transcript`, { method: "POST", json: body ?? {} }),
  /** Administrator only. Purely advisory - proofreads the given text for
   * English mistakes before approval; doesn't touch the stored topic. */
  /** Administrator only. Manually re-runs the same "fill only what's still
   * empty" content drafting that runs automatically after approval -
   * useful when a field was missed the first time (or was cleared) and the
   * admin wants another attempt without re-approving anything. 202 - poll
   * `get()` the same way `generateTranscript`'s caller does. */
  draftContent: (topicId: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/draft-content`, { method: "POST" }),
  /** Administrator only. Replaces the avatar prompt/opening line/warm-up
   * questions/vocabulary outright with a fresh draft - unlike
   * `draftContent`, this overwrites fields that already have a value. For
   * when an existing draft is wrong, not just incomplete (e.g. it predates
   * a grounding fix). 202 - poll `get()` the same way. */
  regenerateContent: (topicId: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/regenerate-content`, { method: "POST" }),
  /** Administrator only. The unified "Generate Lesson Draft" action (Slice
   * C): fills whatever content fields are still empty and drafts a small,
   * bounded default set of exercise suggestions into `draft_exercises` -
   * never directly into `lesson_exercises`. 202 - poll `get()` for
   * `lesson_draft_job` progress and `draft_exercises` for suggestions to
   * review. 409 if a draft is already running; 422 if there's nothing left
   * to draft or the topic's remaining daily AI budget can't cover it. */
  generateLessonDraft: (topicId: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/generate-lesson-draft`, { method: "POST" }),
  /** Moves one pending AI-suggested exercise into the real, published
   * `lesson_exercises` list. */
  acceptDraftExercise: (topicId: string, index: number) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/draft-exercises/${index}/accept`, { method: "POST" }),
  /** Discards one pending AI-suggested exercise - it was never saved
   * anywhere a student could reach it. */
  rejectDraftExercise: (topicId: string, index: number) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/draft-exercises/${index}/reject`, { method: "POST" }),
  /** Replaces one pending suggestion with a fresh draft of the same
   * exercise kind - same cost controls as the initial draft. */
  regenerateDraftExercise: (topicId: string, index: number) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/draft-exercises/${index}/regenerate`, { method: "POST" }),
  reviewTranscriptEnglish: (topicId: string, transcript: string) =>
    request<ReviewTranscriptEnglishResult>(`${BACKEND_PREFIX}/topics/${topicId}/review-transcript-english`, {
      method: "POST",
      json: { transcript } satisfies ReviewTranscriptEnglishRequest,
    }),
  /** Administrator only. Uploads (or replaces) a custom cover image; without
   * one, `thumbnail_url` on every response falls back to a thumbnail derived
   * for free from the topic's first YouTube URL. */
  uploadThumbnail: (topicId: string, file: File | Blob) => {
    const form = new FormData();
    form.append("file", file);
    return request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/thumbnail`, { method: "POST", form });
  },
  /** Administrator only. Reverts to the YouTube-derived thumbnail (or null,
   * if the topic has no youtube_urls). */
  removeThumbnail: (topicId: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/thumbnail`, { method: "DELETE" }),
  uploadSourceVideo: (topicId: string, file: File | Blob) => {
    const form = new FormData();
    form.append("file", file);
    return request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/source-video`, { method: "POST", form });
  },
  removeSourceVideo: (topicId: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/source-video`, { method: "DELETE" }),
  /** Administrator only. Video-optional lesson source: uploads (or replaces)
   * a PDF and extracts its text immediately - a scanned/image-only PDF with
   * no readable text is rejected (422), not silently stored. */
  uploadPdf: (topicId: string, file: File | Blob) => {
    const form = new FormData();
    form.append("file", file);
    return request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/pdf`, { method: "POST", form });
  },
  uploadExerciseMedia: (topicId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string; kind: "image" | "audio" }>(`${BACKEND_PREFIX}/topics/${topicId}/exercise-media`, { method: "POST", form });
  },
  /** Administrator only. Removes the PDF source and its extracted text. */
  removePdf: (topicId: string) =>
    request<TopicPublic>(`${BACKEND_PREFIX}/topics/${topicId}/pdf`, { method: "DELETE" }),
  /** Administrator/Root (and the authoring Teacher) only. Who created this
   * topic and which students currently have it in their plan - fetched on
   * demand for a detail view, not included in `list()`'s rows. */
  getAdminDetail: (topicId: string) =>
    request<TopicAdminDetail>(`${BACKEND_PREFIX}/topics/${topicId}/admin-detail`),
};

// --- Center-defined curriculum levels --------------------------------------

export const levelProfilesApi = {
  list: () => request<LevelProfilePublic[]>(`${BACKEND_PREFIX}/level-profiles`),
  create: (body: LevelProfileCreateRequest) =>
    request<LevelProfilePublic>(`${BACKEND_PREFIX}/level-profiles`, { method: "POST", json: body }),
  archive: (profileId: string) =>
    request<void>(`${BACKEND_PREFIX}/level-profiles/${profileId}`, { method: "DELETE" }),
};

export const programsApi = {
  list: () => request<ProgramPublic[]>(`${BACKEND_PREFIX}/programs`),
  create: (body: ProgramWriteRequest) => request<ProgramPublic>(`${BACKEND_PREFIX}/programs`, { method: "POST", json: body }),
  update: (programId: string, body: ProgramWriteRequest) => request<ProgramPublic>(`${BACKEND_PREFIX}/programs/${programId}`, { method: "PUT", json: body }),
  archive: (programId: string) => request<void>(`${BACKEND_PREFIX}/programs/${programId}`, { method: "DELETE" }),
  listTopics: (programId: string) => request<ProgramTopicPublic[]>(`${BACKEND_PREFIX}/programs/${programId}/topics`),
  assignTopic: (programId: string, body: ProgramTopicWriteRequest) =>
    request<ProgramTopicPublic>(`${BACKEND_PREFIX}/programs/${programId}/topics`, { method: "POST", json: body }),
  updateTopic: (programId: string, topicId: string, body: ProgramTopicUpdateRequest) =>
    request<ProgramTopicPublic>(`${BACKEND_PREFIX}/programs/${programId}/topics/${topicId}`, { method: "PATCH", json: body }),
  removeTopic: (programId: string, topicId: string) =>
    request<void>(`${BACKEND_PREFIX}/programs/${programId}/topics/${topicId}`, { method: "DELETE" }),
  assignmentsForTopic: (topicId: string) =>
    request<ProgramTopicPublic[]>(`${BACKEND_PREFIX}/topics/${topicId}/program-assignments`),
};

export const cohortsApi = {
  /** Center Admin sees every Cohort; a Teacher sees only the ones they lead or are assigned to. */
  list: () => request<CohortPublic[]>(`${BACKEND_PREFIX}/cohorts`),
  get: (cohortId: string) => request<CohortPublic>(`${BACKEND_PREFIX}/cohorts/${cohortId}`),
  create: (body: CohortCreateRequest) => request<CohortPublic>(`${BACKEND_PREFIX}/cohorts`, { method: "POST", json: body }),
  update: (cohortId: string, body: CohortUpdateRequest) =>
    request<CohortPublic>(`${BACKEND_PREFIX}/cohorts/${cohortId}`, { method: "PATCH", json: body }),
  archive: (cohortId: string) => request<void>(`${BACKEND_PREFIX}/cohorts/${cohortId}`, { method: "DELETE" }),
  roster: (cohortId: string) => request<EnrollmentPublic[]>(`${BACKEND_PREFIX}/cohorts/${cohortId}/roster`),
  rosterPage: (cohortId: string, params: { search?: string; page: number; limit: number }) => {
    const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
    if (params.search) query.set("search", params.search);
    return request<EnrollmentPage>(`${BACKEND_PREFIX}/cohorts/${cohortId}/roster/page?${query}`);
  },
  candidates: (cohortId: string, params: { search?: string; academic_level_id?: string; unassigned_only?: boolean; page: number; limit: number }) => {
    const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
    if (params.search) query.set("search", params.search);
    if (params.academic_level_id) query.set("academic_level_id", params.academic_level_id);
    if (params.unassigned_only) query.set("unassigned_only", "true");
    return request<CohortStudentCandidatePage>(`${BACKEND_PREFIX}/cohorts/${cohortId}/student-candidates?${query}`);
  },
  enrollStudents: (cohortId: string, body: EnrollStudentsRequest) =>
    request<EnrollmentPublic[]>(`${BACKEND_PREFIX}/cohorts/${cohortId}/students`, { method: "POST", json: body }),
  enrollStudentsBulk: (cohortId: string, body: EnrollStudentsRequest) =>
    request<BulkEnrollmentResult>(`${BACKEND_PREFIX}/cohorts/${cohortId}/students/bulk`, { method: "POST", json: body }),
  removeStudent: (cohortId: string, studentId: string) =>
    request<void>(`${BACKEND_PREFIX}/cohorts/${cohortId}/students/${studentId}`, { method: "DELETE" }),
  topics: (cohortId: string) => request<ProgramTopicPublic[]>(`${BACKEND_PREFIX}/cohorts/${cohortId}/topics`),
  assignTopic: (cohortId: string, body: ProgramTopicWriteRequest) =>
    request<ProgramTopicPublic>(`${BACKEND_PREFIX}/cohorts/${cohortId}/topics`, { method: "POST", json: body }),
};

export const enrollmentsApi = {
  /** Student only - every active Enrollment this student holds, legacy single-Program assignment included. */
  listMine: () => request<EnrollmentPublic[]>(`${BACKEND_PREFIX}/enrollments/me`),
  schedule: (enrollmentId: string) => request<EnrollmentSchedule>(`${BACKEND_PREFIX}/enrollments/${enrollmentId}/schedule`),
};

// --- Units (Topic organization by unit + order) -----------------------------

export const unitsApi = {
  /** Root sees every unit; an Administrator sees their own plus
   * legacy/shared ones (teacher isolation, same as `topicsApi.list`). */
  list: (params?: ListUnitsParams) => request<UnitPublic[]>(`${BACKEND_PREFIX}/units`, { params }),
  /** Administrator only. Owned by the authenticated Administrator. */
  create: (body: UnitCreateRequest) => request<UnitPublic>(`${BACKEND_PREFIX}/units`, { method: "POST", json: body }),
  /** Administrator only, and only a unit you authored. */
  update: (unitId: string, body: UnitUpdateRequest) =>
    request<UnitPublic>(`${BACKEND_PREFIX}/units/${unitId}`, { method: "PATCH", json: body }),
  /** Administrator only, and only a unit you authored. Soft delete - any
   * topic still pointing at it is grouped under "Unassigned" rather than
   * hidden. */
  delete: (unitId: string) => request<void>(`${BACKEND_PREFIX}/units/${unitId}`, { method: "DELETE" }),
};

// --- Calendar templates (Administrator only) --------------------------------

export const calendarTemplatesApi = {
  /** Own templates plus assigned Cohort-stage calendars for Teachers. */
  list: (kind?: TemplateKind) => request<CalendarTemplate[]>(`${BACKEND_PREFIX}/calendar-templates`, { params: kind ? { kind } : undefined }),
  get: (templateId: string) => request<CalendarTemplate>(`${BACKEND_PREFIX}/calendar-templates/${templateId}`),
  create: (body: CalendarTemplateCreateRequest) =>
    request<CalendarTemplate>(`${BACKEND_PREFIX}/calendar-templates`, { method: "POST", json: body }),
  /** Partial update - `days`, if provided, replaces the whole list. */
  update: (templateId: string, body: CalendarTemplateUpdateRequest) =>
    request<CalendarTemplate>(`${BACKEND_PREFIX}/calendar-templates/${templateId}`, { method: "PATCH", json: body }),
  /** Standard only. Deactivates every other template for the same level. */
  activate: (templateId: string) =>
    request<CalendarTemplate>(`${BACKEND_PREFIX}/calendar-templates/${templateId}/activate`, { method: "POST" }),
  delete: (templateId: string) => request<void>(`${BACKEND_PREFIX}/calendar-templates/${templateId}`, { method: "DELETE" }),
};

// --- Lesson exercise answers -------------------------------------------------

export const exerciseAttemptsApi = {
  submit: (body: ExerciseAttemptCreateRequest) =>
    request<ExerciseAttemptPublic>(`${BACKEND_PREFIX}/exercise-attempts`, { method: "POST", json: body }),
  mine: (topicId: string, enrollmentId?: string) =>
    request<ExerciseAttemptPublic[]>(`${BACKEND_PREFIX}/exercise-attempts/me`, { params: { topic_id: topicId, enrollment_id: enrollmentId } }),
  reviewQueue: (params?: { pending_only?: boolean; limit?: number; skip?: number }) =>
    request<ExerciseAttemptPublic[]>(`${BACKEND_PREFIX}/exercise-attempts/review`, { params }),
  review: (attemptId: string, body: ExerciseReviewRequest) =>
    request<ExerciseAttemptPublic>(`${BACKEND_PREFIX}/exercise-attempts/${attemptId}/review`, { method: "PATCH", json: body }),
};

// --- Submissions -------------------------------------------------------------

export const submissionsApi = {
  /** Student only. Kept working but unused by anything today - the one real
   * recording flow is the end-of-week video check-in below; per-lesson
   * audio was removed from the player. `file` should be capped
   * client-side at 2 minutes / MAX_UPLOAD_BYTES (25MB) before this is
   * called - the backend re-validates both, but a client-side check saves
   * the round trip on an obviously bad file. */
  submitAudio: (topicId: string, file: File | Blob) => {
    const form = new FormData();
    form.append("topic_id", topicId);
    form.append("file", file);
    return request<SubmissionPublic>(`${BACKEND_PREFIX}/submissions`, { method: "POST", form });
  },
  /** Student only. Not topic-tied and not entitlement-gated - every student
   * does the 30-day challenge. `file` should be capped client-side at 2
   * minutes before this is called, same reasoning as `submitAudio`. */
  submitEndOfWeekVideo: (day: number, file: File | Blob) => {
    const form = new FormData();
    form.append("day", String(day));
    form.append("file", file);
    return request<SubmissionPublic>(`${BACKEND_PREFIX}/submissions/end-of-week-video`, { method: "POST", form });
  },
  /** Student only. Full history across every topic/day - group by `topic_id`
   * or `day` client-side to display per-topic or chronologically. */
  listMine: () => request<SubmissionPublic[]>(`${BACKEND_PREFIX}/submissions/me`),
  /** Administrator only. Your own students' submissions only. */
  listForAdmin: (params?: ListSubmissionsForAdminParams) =>
    request<SubmissionPublic[]>(`${BACKEND_PREFIX}/submissions`, { params }),
  /** The owning Student, or that Student's owning Administrator, may fetch one. */
  get: (submissionId: string) => request<SubmissionPublic>(`${BACKEND_PREFIX}/submissions/${submissionId}`),
  /** Administrator only. Marks (or unmarks) one of your own students'
   * submissions as reviewed - same ownership rule as `get`. */
  markReviewed: (submissionId: string, reviewed: boolean) =>
    request<SubmissionPublic>(`${BACKEND_PREFIX}/submissions/${submissionId}/reviewed`, {
      method: "PATCH",
      json: { reviewed } satisfies MarkReviewedRequest,
    }),
};

// --- Classes -----------------------------------------------------------------

export const classesApi = {
  /** Administrator only. `participant_ids` must be the admin's own students,
   * all on the plan `kind` requires (Standard for Group, Pro for 1:1 -
   * exactly one for 1:1). */
  create: (body: CreateLiveClassRequest) => request<LiveClassPublic>(`${BACKEND_PREFIX}/classes`, { method: "POST", json: body }),
  /** Administrator only. Your own scheduled classes, chronological -
   * including past ones; split into upcoming/past client-side. */
  listForAdmin: () => request<LiveClassPublic[]>(`${BACKEND_PREFIX}/classes`),
  /** Student only. Every class you're enrolled in, chronological. */
  listMine: () => request<LiveClassPublic[]>(`${BACKEND_PREFIX}/classes/me`),
  /** Administrator only, and only your own class. Reschedule/retitle/re-link. */
  update: (classId: string, body: UpdateLiveClassRequest) =>
    request<LiveClassPublic>(`${BACKEND_PREFIX}/classes/${classId}`, { method: "PATCH", json: body }),
  /** Administrator only, and only your own class. */
  cancel: (classId: string) => request<void>(`${BACKEND_PREFIX}/classes/${classId}`, { method: "DELETE" }),
};

export const homeworkApi = {
  create: (body: HomeworkCreateRequest) => request<HomeworkPublic>(`${BACKEND_PREFIX}/homework`, { method: "POST", json: body }),
  listForStaff: () => request<HomeworkPublic[]>(`${BACKEND_PREFIX}/homework`),
  listMine: () => request<HomeworkPublic[]>(`${BACKEND_PREFIX}/homework/me`),
  cancel: (homeworkId: string) => request<void>(`${BACKEND_PREFIX}/homework/${homeworkId}`, { method: "DELETE" }),
};

// --- Sessions (real "Discuss with Mariam") ------------------------------------

export const sessionsApi = {
  /** Student only. Mints a LiveKit room + token for a Mariam session tied to
   * this topic - 403s if the topic is outside their assigned plan. */
  start: (topicId: string, mode: PracticeMode = "topic_discussion", enrollmentId?: string) =>
    request<SessionStartResponse>(`${BACKEND_PREFIX}/sessions/start`, {
      method: "POST",
      // Avatar Practice sends exactly the body it always did.
      json: { ...(mode === "voice_practice" ? { topic_id: topicId, mode } : { topic_id: topicId }), ...(enrollmentId ? { enrollment_id: enrollmentId } : {}) },
    }),
  /** Student only, own Avatar Practice session. Starts (or, on retry, re-mints a token for) a Cartoon/Voice Practice
   * session on the same topic that continues this conversation - see `LiveSessionService.initiate_handoff`. Never
   * ends or otherwise touches the source Avatar session; the caller decides when to stop showing it. */
  handoff: (sourceSessionId: string) =>
    request<SessionStartResponse>(`${BACKEND_PREFIX}/sessions/${sourceSessionId}/handoff`, { method: "POST" }),
  /** Student only, own OPEN Avatar Practice session. A short-lived SpatialReal session token (never the API key) plus the
   * public App ID / Avatar ID, so the browser draws the same avatar the hosted agent drives. */
  avatarToken: (sessionId: string) =>
    request<AvatarTokenResponse>(`${BACKEND_PREFIX}/sessions/${sessionId}/avatar-token`, { method: "POST" }),
  /** Student only, own Voice Practice session. 409 until LiveKit itself
   * lists the voice agent in the session's room. */
  confirmVoiceConnected: (sessionId: string) =>
    request<LiveSessionPublic>(`${BACKEND_PREFIX}/sessions/${sessionId}/connected`, { method: "POST" }),
  /** Student only, own Voice Practice session. Idempotent; releases the room.
   * The browser transcript is stored as unverified and never scored. */
  endVoice: (sessionId: string, body: VoiceSessionEndRequest, options: { keepalive?: boolean } = {}) =>
    request<LiveSessionPublic>(`${BACKEND_PREFIX}/sessions/${sessionId}/end`, { method: "POST", json: body, keepalive: options.keepalive }),
  /** Student only. Your own session history, newest first, no transcript. */
  listMine: () => request<LiveSessionListItem[]>(`${BACKEND_PREFIX}/sessions/me`),
  /** Administrator only. Your own students' sessions only. */
  listForAdmin: () => request<LiveSessionListItem[]>(`${BACKEND_PREFIX}/sessions`),
  /** The AI Reports page: filtered, searched and paged on the server, with the matching total. */
  listReports: (params: ListReportsParams) => request<SessionPage>(`${BACKEND_PREFIX}/sessions`, { params }),
  /** The owning Student, or that Student's owning Administrator, may fetch
   * one - includes the full transcript. */
  get: (sessionId: string) => request<LiveSessionPublic>(`${BACKEND_PREFIX}/sessions/${sessionId}`),
  /** Administrator only, and only your own student's session. */
  forceEnd: (sessionId: string) =>
    request<LiveSessionPublic>(`${BACKEND_PREFIX}/sessions/${sessionId}/force-end`, { method: "POST" }),
  /** Administrator only, and only your own student's session. 422 if the
   * session has no AI report yet to review. */
  markReportReviewed: (sessionId: string, reviewed: boolean) =>
    request<LiveSessionPublic>(`${BACKEND_PREFIX}/sessions/${sessionId}/report-reviewed`, {
      method: "PATCH",
      json: { reviewed } satisfies MarkSessionReportReviewedRequest,
    }),
};
