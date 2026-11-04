# Tamakkan — LiveKit Avatar Integration: Requirements Specification

**Document type:** Functional & Non-Functional Requirements Specification
**Status:** Draft v1.0
**Platform:** Tamakkan, the AI-driven English-speaking practice platform (Student dashboard + Admin dashboard).
**Scope:** This document covers the platform's functional behavior and its integration with a LiveKit-based Avatar — the real-time, AI-driven speaking partner Students interact with (referred to in-app as **"Maya"**, e.g. the "Discuss with Maya" session type). It governs the Avatar/session mechanics themselves: connecting, speaking, listening, recovering from failure, and how Admins oversee that. It intentionally does **not** cover lesson content, curriculum design, or how Maya's dialogue/topics are authored — those are addressed elsewhere in the product (the existing 30-Day Challenge, Lessons/Course Player, and Topics areas) and are only referenced here where needed to scope a requirement.

## How to read this document

- Functional requirements are identified `FR-###`; non-functional requirements are identified `NFR-###`. IDs are stable and must not be renumbered once referenced elsewhere (tasks, tickets, tests).
- Every requirement carries: **Description**, **Stakeholder**, **Inputs**, **System Behavior**, **Output / Result**, **Error Cases / Exceptions**, and **Acceptance Criteria**. This satisfies item 15 of the brief (acceptance criteria) inline, per requirement, rather than as a separate section.
- Statements marked **(Assumption)** fill a gap not yet settled for the real-LiveKit build (the current build uses a mocked, photo-based stand-in for Maya). They are collected in [Open Questions](#18-open-questions) and must be confirmed before implementation.
- "Avatar" and "Maya" are used interchangeably: the LiveKit-delivered, AI-driven audio/visual agent the Student interacts with in real time — a live, one-way visual presence with two-way audio (and optionally text) — not a user-controlled video call, and never involving the Student's own camera.

---

## 1. Overview

Tamakkan is an English-speaking practice platform with two sides: a **Student dashboard** (30-Day Challenge, Lessons/Course Player, AI Practice, Live Classes, My Progress) and an **Admin dashboard** (Overview, Students, AI Reports, Topics, Classes, Analytics). Within that platform, "Discuss with Maya" is the real-time conversational-practice session type: the Student has a live, call-like exchange with an AI Avatar (Maya) delivered through LiveKit, in order to practice spoken English and receive AI-driven feedback.

A Maya session behaves like a live call: Maya is seen and heard by the Student; the Student is heard (and optionally provides typed input) by Maya, but the Student's own camera is never activated or exposed to Maya or to anyone else — the interaction is one-directional on video (Maya → Student) and two-directional on audio/text (Student ⇄ Maya).

This document's purpose is to specify how a Maya session is started, conducted, recovered from failure, and ended; how that session is tracked as part of the Student's progress history (alongside the recorded-audio and Friday video-check-in submissions the platform already collects); and how Admins get visibility and control over Students, sessions, and Maya-related configuration. It intentionally treats lesson/topic content generically — content structure, curriculum, and topic authoring are already covered by the existing Lessons/Topics areas of the product and are not re-specified here.

**(Assumption)** Tamakkan is a web application accessed via a modern browser on desktop and mobile, with no native mobile app in scope, consistent with the current build. See [Open Questions](#18-open-questions).

---

## 2. User Types, Roles, and Permissions

| Role | Description | Permissions |
|---|---|---|
| **Guest (unauthenticated)** | A visitor who has not signed in. **(Assumption — the current build has no real sign-in flow; see [Open Questions](#18-open-questions))** | May view marketing/sign-in pages only. Cannot start a Maya session, cannot view any account or session data. |
| **Student** | An authenticated learner account (matches the existing Student dashboard). | Manage own account and profile; configure own session/Avatar settings; start, participate in, pause, resume, and end own Maya sessions; view own progress and session history, including per-topic AI analysis and their own submitted audio/video recordings; manage own notification preferences. Cannot view other students' data. Cannot access the Admin dashboard. |
| **Administrator** | Platform staff account (matches the existing Admin dashboard: Overview, Students, AI Reports, Topics, Classes, Analytics). | Everything a Student can do for platform-verification purposes, plus: view and manage all student accounts, including assigning a class or building a custom Pro plan; view every student's session history, AI analysis, and submitted recordings; force-end a live Maya session; configure platform-wide and Maya-related settings; view platform-wide analytics; manage role assignments; view and act on system alerts/error logs. See [Section 12](#12-administration-dashboard) for the full function list. |

**FR-001 — Role-Based Access Enforcement**
- **Description:** The platform must restrict every function and every data record to the roles authorized to use/view it.
- **Stakeholder:** All roles; primarily Administrator (data protection), Student (privacy).
- **Inputs:** Authenticated session token/identity; role claim; requested resource or action.
- **System Behavior:** On every request to a protected function or resource, the platform verifies the caller's role against the resource's required role before executing the action.
- **Output / Result:** Action proceeds normally for authorized roles; a 403-equivalent "not permitted" response for unauthorized roles.
- **Error Cases / Exceptions:** Expired/invalid session → treated as Guest, redirected to sign-in. Role missing/corrupted claim → deny by default (fail closed).
- **Acceptance Criteria:** An Student account cannot retrieve, via any UI path or direct request, another Student's session history, recordings, or account data. An Administrator action attempted by an Student account is rejected and logged.

---

## 3. Core Platform Functions

Within Tamakkan, the functions this document specifies, each elaborated with full requirements in later sections, are:

1. Account creation, authentication, and recovery (Section 7).
2. Starting, conducting, and ending real-time "Discuss with Maya" sessions (Section 5).
3. Session lifecycle/state management for those sessions (Section 6).
4. Persisting and retrieving a Student's Maya session history and interaction records, alongside their existing recorded-audio and Friday video submissions (Section 9).
5. Delivering notifications, status indicators, and error messages to the Student in real time during a session (Section 10).
6. Letting Students configure account, session, and Maya-related settings (Section 11).
7. Giving Administrators, via the existing Admin dashboard, oversight and configuration control across students, sessions, and the Maya service (Section 12).
8. Enforcing permission boundaries between roles (Student/Administrator) and between individual students' data (Section 8).

---

## 4. User Journey and Main User Flows

### 4.1 New Student — first session
1. User lands on the platform unauthenticated (Guest) and selects **Sign up**.
2. User completes registration (FR-002) and, if email verification is required (Assumption, see Section 7), verifies their address.
3. User signs in (FR-003) and is routed to their home/dashboard view.
4. User selects **Start session** (or equivalent primary call-to-action).
5. Platform initializes the Avatar (FR-017–FR-019); user sees a connecting indicator, then a connected Avatar with a live idle/listening state.
6. User interacts by voice (and/or text, if enabled) with the Avatar; the Avatar responds with synchronized audio and visual output, alternating listening → thinking → speaking states as the exchange progresses (FR-026–FR-028).
7. User ends the session (FR-018) or the session ends automatically (timeout/idle, FR-042).
8. Platform persists the session record; user is returned to their dashboard and may see a summary/confirmation (FR-055, FR-064).

### 4.2 Returning Student — resuming/reviewing
1. User signs in.
2. User views session history (FR-056) and, if permitted, plays back a past session's recording or transcript.
3. User starts a new session, optionally adjusting Avatar/session settings first (Section 11).

### 4.3 Session interruption and recovery
1. Mid-session, the user's network degrades or drops.
2. Platform detects the interruption, shows a "reconnecting" status (FR-031), and attempts automatic reconnection.
3. On success, the session resumes in its prior state; on failure past a retry limit, the session is marked **Connection Failed** (Section 6) and the user is shown a clear error with a manual retry option (FR-032, FR-034).

### 4.4 Administrator — monitoring and support
1. Administrator signs in and lands on the Administration Dashboard (Section 12).
2. Administrator reviews platform-wide session/usage analytics and any active error/alert conditions.
3. Administrator opens a specific user's record to review their session history when investigating a support request.
4. Administrator adjusts a platform-wide or Avatar configuration setting if needed and the change takes effect for subsequent sessions.

---

## 5. LiveKit Avatar Functionality

**FR-017 — Start Avatar Session**
- **Description:** The user can explicitly start a new real-time session with the Avatar.
- **Stakeholder:** Student.
- **Inputs:** User's "Start session" action; authenticated user identity; active permission to use the Avatar function (FR-051).
- **System Behavior:** Platform requests/establishes a LiveKit room and connection for the user, provisions the Avatar participant into that room, and transitions session state from **Not Started** to **Connecting** (Section 6).
- **Output / Result:** On success, session state becomes **Connected**, and the Avatar's live audio/video output begins streaming to the user.
- **Error Cases / Exceptions:** Avatar service unavailable, LiveKit room creation failure, user has no remaining session allowance (if such a limit exists) — see FR-035/FR-036.
- **Acceptance Criteria:** Selecting "Start session" from an eligible, idle state results in a visible **Connecting** indicator within 1 second and a **Connected** state (or a handled failure per FR-035) with no unhandled exception.

**FR-018 — End Avatar Session**
- **Description:** The user (or the system, per policy) can terminate an active session.
- **Stakeholder:** Student; System (auto-end).
- **Inputs:** User's "End session" action, or an automatic trigger (idle timeout FR-042, max duration NFR, or Administrator-forced end FR-088).
- **System Behavior:** Platform disconnects the user and the Avatar from the LiveKit room, stops all media streams, and transitions session state to **Ended**.
- **Output / Result:** Media stops immediately; the session is finalized and queued for persistence (FR-055).
- **Error Cases / Exceptions:** Disconnect call fails/times out on the service side — platform must still mark the session **Ended** locally and reconcile with the service asynchronously, never leaving the user stuck in a live-looking state with no working controls.
- **Acceptance Criteria:** Ending a session stops Avatar audio/video within 1 second on the user's client and the session appears in history as **Ended** with a captured end timestamp.

**FR-019 — Initialize Avatar and Display Connection Status**
- **Description:** While a session moves from **Not Started** to **Connected**, the platform must visibly communicate progress to the user.
- **Stakeholder:** Student.
- **Inputs:** Session start request; underlying LiveKit connection/track-subscription events.
- **System Behavior:** Platform surfaces discrete, user-visible status at each step: requesting access → connecting to room → Avatar joining → media tracks live.
- **Output / Result:** A status indicator (e.g., "Connecting…", "Avatar joining…", "Connected") visible at all times during initialization; the indicator clears once the Avatar's video/audio is actually rendering.
- **Error Cases / Exceptions:** Any step failing surfaces a specific status rather than a silent hang (see FR-035).
- **Acceptance Criteria:** No period longer than 5 seconds during initialization has zero status feedback on screen; final "Connected" status is shown only once Avatar media is actually playing, not merely once the network connection opens.

**FR-020 — Receive User Input**
- **Description:** The platform must capture the user's spoken audio (and, if enabled, typed text) and deliver it to the Avatar as conversational input.
- **Stakeholder:** Student.
- **Inputs:** Microphone audio stream; **(Assumption)** optional text input if a text-chat affordance exists alongside voice.
- **System Behavior:** While the session is **Connected** and the microphone is not muted, the platform publishes the user's audio track into the LiveKit room for Avatar consumption; typed text (if supported) is sent as a data message on the same session.
- **Output / Result:** The Avatar receives and can act on the input; the user sees local confirmation that their input was captured (e.g., a live mic-level indicator or a "sent" state for text).
- **Error Cases / Exceptions:** Microphone permission denied or unavailable (FR-024); no input received within an expected window is not itself an error, only silence.
- **Acceptance Criteria:** With microphone permission granted and unmuted, user speech visibly registers on an input-level indicator and results in an Avatar response; muting stops input transmission immediately and is reflected in the UI.

**FR-021 — Synchronized Audio and Visual/Video Output**
- **Description:** The Avatar's spoken response must be delivered as synchronized audio and matching visual/video output.
- **Stakeholder:** Student.
- **Inputs:** Avatar-generated response (audio + visual track from the Avatar service via LiveKit).
- **System Behavior:** Platform subscribes to and renders the Avatar's audio and video tracks together, keeping them in sync (mouth movement / visual state aligned with the spoken audio).
- **Output / Result:** User perceives one continuous, synced audio-visual response, not separately timed audio and video.
- **Error Cases / Exceptions:** Video track drops but audio continues (or vice versa) — platform must detect and reflect a degraded-but-communicated state (FR-033) rather than presenting frozen/desynced output silently.
- **Acceptance Criteria:** In a normal-network test session, audio and visual output for a given Avatar utterance start and end within a small perceptible tolerance of each other **(Assumption: ≤300ms drift target — see Open Questions)**, and any track loss triggers a visible degraded/error indicator within 3 seconds.

**FR-022 — Microphone Control**
- **Description:** The user must be able to mute and unmute their own microphone at any point during a session.
- **Stakeholder:** Student.
- **Inputs:** User's mute/unmute control action.
- **System Behavior:** Toggling mute stops/resumes publishing the user's audio track without ending the session.
- **Output / Result:** Immediate visual confirmation of mute state; the Avatar receives no audio input while muted.
- **Error Cases / Exceptions:** Microphone hardware becomes unavailable mid-session (device unplugged, OS permission revoked) — treated as an automatic mute with a visible alert, not a silent failure.
- **Acceptance Criteria:** Toggling mute changes the published-audio state within 500ms and is reflected in the mic icon/state at all times.

**FR-023 — Avatar Audio Output Control**
- **Description:** The user must be able to control (mute/adjust) the Avatar's outgoing audio on their own client.
- **Stakeholder:** Student.
- **Inputs:** User's audio-output mute/volume control.
- **System Behavior:** Muting Avatar audio silences local playback of the Avatar's audio track without affecting the underlying session state (the Avatar keeps "speaking" logically; only local output is muted).
- **Output / Result:** Local silence; a persistent indicator that output audio is muted.
- **Error Cases / Exceptions:** None beyond standard browser audio-permission constraints.
- **Acceptance Criteria:** Muting output silences the Avatar's voice locally within 500ms without disconnecting or pausing the session.

**FR-024 — Camera Is Never Activated for the User**
- **Description:** The platform must never request, activate, or transmit the user's camera at any point in an Avatar session, since the interaction is a one-way visual presence (Avatar → user only).
- **Stakeholder:** Student (privacy).
- **Inputs:** N/A — this is a constraint on system behavior, not a triggered function.
- **System Behavior:** No camera permission is ever requested by the platform; no UI control to enable a user camera exists anywhere in the Avatar session experience.
- **Output / Result:** The user is only ever seen by the system as an audio (and optional text) source; no user video track is ever created, published, or stored.
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** No code path in the session UI issues a camera-permission (`getUserMedia({video:true})`-equivalent) request; automated and manual testing confirm no camera-enable control is reachable from any session screen, on desktop or mobile.

**FR-025 — Handling User Interruptions While the Avatar Is Speaking**
- **Description:** If the user speaks (or sends input) while the Avatar is mid-response, the platform must handle the interruption in a defined way rather than ignoring it or corrupting the output.
- **Stakeholder:** Student.
- **Inputs:** User audio/text input detected during the Avatar's **Speaking** state.
- **System Behavior:** Platform detects the overlapping input and either (a) pauses/stops the Avatar's current output and transitions to processing the new input, or (b) queues the input until the Avatar finishes, per configured interruption policy. **(Assumption: barge-in, option (a), is the intended default — see Open Questions.)**
- **Output / Result:** Session state visibly reflects the transition (e.g., Speaking → Listening) with no leftover audio/video artifacts from the interrupted response.
- **Error Cases / Exceptions:** Rapid repeated interruptions must not desynchronize state or leave the Avatar stuck in **Speaking** with no audio.
- **Acceptance Criteria:** Speaking into the microphone while the Avatar is actively speaking causes the Avatar's audio/video to stop within a short, bounded time **(Assumption: ≤500ms)** and the session state to move to **Listening** or **Thinking**.

**FR-026 — Display Listening State**
- **Description:** The platform must show a distinct, unambiguous indicator when the Avatar is actively listening for user input.
- **Stakeholder:** Student.
- **Inputs:** Session state = Listening.
- **System Behavior:** UI renders a listening-specific visual state (e.g., animated indicator distinct from thinking/speaking).
- **Output / Result:** User can tell, without ambiguity, that the Avatar is currently receptive to input.
- **Error Cases / Exceptions:** State must not be shown simultaneously with Speaking or Thinking.
- **Acceptance Criteria:** Exactly one of Listening/Thinking/Speaking/idle indicators is visible at any moment; Listening is shown whenever the session is capturing user input and awaiting completion.

**FR-027 — Display Thinking State**
- **Description:** The platform must show a distinct indicator when the Avatar has received input and is processing a response, before output begins.
- **Stakeholder:** Student.
- **Inputs:** Session state = Thinking (input received, response generation in progress, no output yet).
- **System Behavior:** UI renders a thinking-specific visual state.
- **Output / Result:** User understands a response is coming and the system has not stalled.
- **Error Cases / Exceptions:** If Thinking exceeds a defined maximum duration, the platform must escalate to a "taking longer than usual" notice (FR-069) rather than leaving the indicator spinning indefinitely.
- **Acceptance Criteria:** Thinking state appears within 1 second of input completion and transitions to Speaking (or to an error/timeout state) without a silent gap.

**FR-028 — Display Speaking State**
- **Description:** The platform must show a distinct indicator whenever the Avatar's audio/video response is actively playing.
- **Stakeholder:** Student.
- **Inputs:** Session state = Speaking (Avatar audio/video actively streaming).
- **System Behavior:** UI renders a speaking-specific visual state synchronized with actual output playback.
- **Output / Result:** User can visually confirm the Avatar is currently responding.
- **Error Cases / Exceptions:** State must clear immediately when output ends or is interrupted (FR-025).
- **Acceptance Criteria:** Speaking indicator is active for the full duration of audio/video playback and clears within 300ms of playback ending or being interrupted.

**FR-029 — Session Reconnection After Interruption**
- **Description:** If the live connection drops mid-session, the platform must attempt automatic reconnection before treating the session as failed.
- **Stakeholder:** Student.
- **Inputs:** Detected network/connection loss on an active session.
- **System Behavior:** Platform transitions session state to **Connecting** (reconnect variant) and retries connection establishment per a bounded retry policy **(Assumption: 3 attempts, exponential backoff — see Open Questions)**.
- **Output / Result:** On success, session resumes at **Connected** with prior context intact; on exhausting retries, session transitions to **Connection Failed** (Section 6).
- **Error Cases / Exceptions:** Reconnection succeeds at the transport level but the Avatar participant fails to rejoin — treated as a continued failure, not a false "Connected."
- **Acceptance Criteria:** A simulated network drop during an active session triggers a visible reconnecting indicator within 2 seconds and either restores **Connected** state or reaches **Connection Failed** with a clear message — never an indefinite silent hang.

**FR-030 — Avatar Startup Failure Handling**
- **Description:** If the Avatar fails to initialize (service error, room creation failure, Avatar participant fails to join), the platform must fail clearly and give the user a path forward.
- **Stakeholder:** Student.
- **Inputs:** Failure response/timeout from the Avatar/LiveKit service during session start.
- **System Behavior:** Platform aborts the start attempt, releases any partially-created resources (e.g., an empty room), and transitions to **Connection Failed**.
- **Output / Result:** User sees a specific, non-technical error message and a **Retry** action; no partial/broken session is left active.
- **Error Cases / Exceptions:** Repeated failures within a short window should be flagged for Administrator visibility (FR-093) rather than only shown to the user.
- **Acceptance Criteria:** A forced startup failure results in a visible error state within the service's response/timeout window and offers a working Retry control; retrying re-attempts FR-017 from a clean state.

**FR-031 — Service Connection Failure Handling (Mid-Session)**
- **Description:** If the underlying LiveKit/Avatar service becomes unreachable during an active session (not just at startup), the platform must detect and handle it distinctly from a normal network blip.
- **Stakeholder:** Student.
- **Inputs:** Sustained failure to reach the session service beyond the reconnection policy (FR-029).
- **System Behavior:** Platform ends the local session cleanly, marks it **Connection Failed**, and persists whatever partial session data exists.
- **Output / Result:** User sees a clear "session ended due to a connection problem" message distinct from a normal end-of-session summary.
- **Error Cases / Exceptions:** Data partially captured before failure must not be lost or corrupted; it is saved as an incomplete session record.
- **Acceptance Criteria:** A sustained simulated outage results in the session being marked **Connection Failed** in history (not silently dropped, and not mislabeled **Ended**), with any content generated up to the failure point retained.

---

## 6. Session Management and Session States

**FR-032 — Defined Session State Machine**
- **Description:** Every Avatar session must at all times be in exactly one of the following defined states: **Not Started, Connecting, Connected, Paused, Disconnected, Ended, Connection Failed.**
- **Stakeholder:** Student; Administrator (monitoring); System.
- **Inputs:** Session lifecycle events (start, connect success/failure, network events, pause/resume actions, end action, timeout).
- **System Behavior:** State transitions follow a fixed, documented state diagram (below); invalid transitions are rejected/logged rather than silently applied.
- **Output / Result:** Current state is always retrievable and always reflected in the UI (Section 5 display requirements) and in session records (FR-055).
- **Error Cases / Exceptions:** Concurrent/conflicting transition events (e.g., "end" and "reconnect" arriving together) must resolve deterministically — end takes precedence.
- **Acceptance Criteria:** For every reachable state, the platform can enumerate valid next states and rejects/logs any attempted transition not on that list.

State diagram (valid transitions):
```
Not Started -> Connecting
Connecting -> Connected
Connecting -> Connection Failed
Connected -> Paused
Connected -> Disconnected      (unexpected network loss)
Connected -> Ended             (user/system ends session)
Paused -> Connected            (resume)
Paused -> Ended
Disconnected -> Connecting     (auto-reconnect attempt)
Disconnected -> Connection Failed  (retries exhausted)
Connection Failed -> Not Started   (user retries → new session)
Ended -> Not Started           (new session)
```

**FR-033 — Pause and Resume a Session**
- **Description:** The user can pause an active session (suspending Avatar interaction without fully ending it) and later resume it, where the platform's session model supports it.
- **Stakeholder:** Student.
- **Inputs:** User's Pause / Resume control.
- **System Behavior:** Pause stops active media exchange and holds session context; Resume re-establishes media exchange from the held context without creating a new session record.
- **Output / Result:** State transitions Connected ⇄ Paused; UI reflects a clear "paused" indicator distinct from any other state.
- **Error Cases / Exceptions:** If a paused session is inactive beyond the idle timeout (FR-042), it auto-transitions to **Ended** rather than remaining paused indefinitely.
- **Acceptance Criteria:** Pausing stops Avatar media within 1 second; resuming within the idle window restores the same session (same session ID) rather than starting a new one.

**FR-034 — Manual Retry After Failure**
- **Description:** From **Connection Failed**, the user must have an explicit, single-action way to retry.
- **Stakeholder:** Student.
- **Inputs:** User's Retry action.
- **System Behavior:** Platform discards the failed attempt's state and re-runs session start (FR-017) as a new attempt.
- **Output / Result:** Either a successful new **Connected** session or another **Connection Failed** with the same clear messaging.
- **Error Cases / Exceptions:** Repeated rapid retries should be rate-limited to avoid hammering the Avatar service; user is informed if rate-limited.
- **Acceptance Criteria:** Retry is visible and enabled immediately on entering **Connection Failed**; selecting it re-attempts connection without requiring page reload or re-navigation.

**FR-035 — Session Start Denied (No Allowance / Not Permitted)**
- **Description:** If a user is not entitled to start a session (e.g., no remaining quota, feature disabled for their account, role restriction), the platform must block the start attempt with a clear reason rather than attempting and failing.
- **Stakeholder:** Student; Administrator (defines entitlement).
- **Inputs:** Start-session request; user's entitlement/quota/role data.
- **System Behavior:** Platform checks entitlement before attempting any LiveKit/Avatar resource allocation.
- **Output / Result:** A specific "not permitted" / "no sessions remaining" message; no state machine entry is created.
- **Error Cases / Exceptions:** **(Assumption)** Whether quotas exist at all is unconfirmed — see Open Questions.
- **Acceptance Criteria:** An entitlement check runs and can block session start prior to any connection attempt being made.

**FR-036 — Idle Timeout**
- **Description:** A session with no user input for a defined period must be automatically ended (or paused, per FR-033) rather than left connected indefinitely.
- **Stakeholder:** Student; System (resource management).
- **Inputs:** Elapsed time since last user input in an active session.
- **System Behavior:** Platform warns the user before the timeout elapses, then auto-transitions the session per policy.
- **Output / Result:** User sees a countdown/warning notice (FR-070) before the automatic transition; the transition itself is logged with "idle timeout" as the reason.
- **Error Cases / Exceptions:** A warning shown but then interrupted by real user input cancels the pending timeout.
- **Acceptance Criteria:** A session left idle for the configured duration transitions automatically and is recorded with an "idle timeout" end reason, distinct from a manual end.

---

## 7. Account Management

**FR-002 — Sign Up**
- **Description:** A Guest can create a new Student account.
- **Stakeholder:** Guest → Student.
- **Inputs:** Required registration fields **(Assumption: name, email, password — see Open Questions for whether SSO is required)**.
- **System Behavior:** Platform validates input (format, uniqueness of email), creates the account, and **(Assumption)** sends a verification message if email verification is required.
- **Output / Result:** New account created in an unverified or active state per policy; user is signed in or prompted to verify, per policy.
- **Error Cases / Exceptions:** Duplicate email, weak password, malformed input — each surfaces a specific, field-level error.
- **Acceptance Criteria:** Submitting valid, unique registration data creates exactly one account and either signs the user in or clearly directs them to a verification step; submitting a duplicate email is rejected with a specific message, not a generic failure.

**FR-003 — Sign In**
- **Description:** An existing account holder can authenticate and start a session with the platform.
- **Stakeholder:** Student; Administrator.
- **Inputs:** Credentials (email/password or configured auth method).
- **System Behavior:** Platform validates credentials and, on success, establishes an authenticated session (distinct from an Avatar session) and routes the user to the role-appropriate landing view.
- **Output / Result:** Authenticated session token/cookie issued; user lands on their dashboard (Student) or Administration Dashboard (Administrator).
- **Error Cases / Exceptions:** Invalid credentials, unverified account (if verification required), too many failed attempts (lockout/backoff, NFR-security) — each produces a distinct message.
- **Acceptance Criteria:** Correct credentials authenticate and route by role; incorrect credentials are rejected without revealing whether the email or the password was wrong.

**FR-004 — Sign Out**
- **Description:** An authenticated user can end their authenticated platform session at will.
- **Stakeholder:** Student; Administrator.
- **Inputs:** User's Sign out action.
- **System Behavior:** Platform invalidates the authenticated session/token and, if an Avatar session is active, ends it first (FR-018) rather than leaving it orphaned.
- **Output / Result:** User is returned to an unauthenticated (Guest) view.
- **Error Cases / Exceptions:** Sign-out requested while an Avatar session is live must not leave that Avatar session running server-side after the user leaves.
- **Acceptance Criteria:** After sign-out, the prior authenticated session's token/cookie is no longer valid for any protected request, and any Avatar session that was active is fully ended.

**FR-005 — Account Recovery (Password Reset)**
- **Description:** A user who cannot sign in due to a forgotten credential can regain access.
- **Stakeholder:** Student; Administrator.
- **Inputs:** Account-identifying information (e.g., email).
- **System Behavior:** Platform issues a time-limited recovery mechanism (e.g., reset link/code) to the account's verified contact method, and allows credential reset only via that mechanism.
- **Output / Result:** User sets a new credential and can sign in with it; the recovery mechanism is invalidated after use or expiry.
- **Error Cases / Exceptions:** Recovery requested for a non-existent account must not reveal whether the account exists; expired/used recovery tokens are rejected.
- **Acceptance Criteria:** A valid, unexpired recovery flow results in a successful credential change and sign-in; a reused or expired recovery link/code is rejected.

**FR-006 — View and Edit Own Profile**
- **Description:** An Student can view and edit their own basic account details.
- **Stakeholder:** Student.
- **Inputs:** Updated profile fields.
- **System Behavior:** Platform validates and persists changes to the user's own record only.
- **Output / Result:** Updated profile reflected immediately in the UI and in any Administrator-facing user record.
- **Error Cases / Exceptions:** Attempt to edit another user's profile via manipulated requests is rejected (FR-001).
- **Acceptance Criteria:** A valid profile edit persists and is visible after a page reload; an invalid edit (e.g., malformed email) is rejected with a specific message.

**FR-007 — Account Deactivation / Deletion**
- **Description:** An Student can request deactivation or deletion of their own account. **(Assumption: exact retention behavior — see Open Questions.)**
- **Stakeholder:** Student.
- **Inputs:** User's deactivation/deletion request, with confirmation step.
- **System Behavior:** Platform requires explicit confirmation, then deactivates/deletes the account per data-retention policy, and ends any active Avatar session first.
- **Output / Result:** Account no longer usable for sign-in; associated session history is retained, anonymized, or deleted per policy.
- **Error Cases / Exceptions:** Accidental single-click deletion is prevented by a confirmation step.
- **Acceptance Criteria:** Deactivation/deletion requires a distinct confirmation action and, once completed, the account can no longer sign in.

---

## 8. Permission Management and Access Control

**FR-051 — Feature-Level Access Control**
- **Description:** Individual platform functions (starting a session, viewing history, accessing settings, accessing the Administration Dashboard) must each be gated by an explicit permission check tied to role.
- **Stakeholder:** All roles.
- **Inputs:** Role/permission claims; requested function.
- **System Behavior:** Each function checks the caller's permission before executing; UI hides or disables controls the current role cannot use.
- **Output / Result:** Consistent enforcement between what's shown and what's actually allowed — no control is visible but non-functional, and no hidden control is reachable by direct request.
- **Error Cases / Exceptions:** Permission check failure always denies by default.
- **Acceptance Criteria:** For each role, a documented list of allowed functions matches exactly what the UI exposes and what the backend accepts.

**FR-052 — Data-Level Access Control (Own Data Only)**
- **Description:** An Student's access to session history, recordings, and settings must be scoped to their own account only.
- **Stakeholder:** Student (privacy).
- **Inputs:** Authenticated user identity; requested record's owner.
- **System Behavior:** Every data read/write for session/user-scoped records checks record ownership against the caller, independent of role-level checks (FR-001).
- **Output / Result:** Requests for another user's scoped data are denied even if the requester is a valid, authenticated Student.
- **Error Cases / Exceptions:** Administrator role is the only role permitted cross-user data access (FR-092), and such access must be logged (FR-096).
- **Acceptance Criteria:** An Student cannot retrieve another Student's session record by ID substitution or similar direct-reference manipulation.

**FR-053 — Role Assignment**
- **Description:** An Administrator can grant or change a user's role.
- **Stakeholder:** Administrator.
- **Inputs:** Target user; new role.
- **System Behavior:** Platform validates the requesting Administrator's own permission to assign roles, then updates the target user's role and invalidates any cached permission state.
- **Output / Result:** Target user's access reflects the new role on their next request.
- **Error Cases / Exceptions:** An Administrator cannot remove their own last-remaining Administrator privilege in a way that leaves the platform with zero Administrators. **(Assumption.)**
- **Acceptance Criteria:** Changing a user's role takes effect without requiring that user to sign out/in, and the platform always retains at least one active Administrator account.

**FR-054 — Permission Change Audit Trail**
- **Description:** Every role/permission change must be recorded for accountability.
- **Stakeholder:** Administrator.
- **Inputs:** Role-change event (who changed whom, from what, to what, when).
- **System Behavior:** Platform writes an immutable audit record on every such change.
- **Output / Result:** Audit trail is viewable by Administrators (FR-096).
- **Error Cases / Exceptions:** Audit write failure must not silently allow the permission change to proceed unlogged — the two must be transactionally linked. **(Assumption.)**
- **Acceptance Criteria:** Every role change produces exactly one corresponding audit entry, viewable with actor, target, old value, new value, and timestamp.

---

## 9. Session Data and Interaction History

**FR-055 — Persist Session Records**
- **Description:** Every Avatar session (including partial/failed ones) must be saved as a session record.
- **Stakeholder:** Student; Administrator.
- **Inputs:** Session lifecycle data — start time, end time, final state, end reason.
- **System Behavior:** Platform writes a session record at session start and finalizes/updates it at every state transition, guaranteeing a record exists even if the session fails before ending normally.
- **Output / Result:** A queryable session record for every attempted session.
- **Error Cases / Exceptions:** A crash mid-session must not result in a missing record — the record is created at start, not only at end.
- **Acceptance Criteria:** After any session — successful, ended early, or failed — exactly one corresponding record exists with a valid state and timestamps.

**FR-056 — Retrieve Own Session History**
- **Description:** An Student can view a list of their own past sessions.
- **Stakeholder:** Student.
- **Inputs:** Authenticated identity; optional filters (date range, status).
- **System Behavior:** Platform returns the user's own session records, ordered by recency by default.
- **Output / Result:** A browsable/filterable list showing at minimum: date/time, duration, end state/reason.
- **Error Cases / Exceptions:** No sessions yet → an explicit empty state, not an error.
- **Acceptance Criteria:** History list matches exactly the sessions started by that user, in the correct order, with correct status per session.

**FR-057 — Retrieve Session Recording / Transcript**
- **Description:** Where recording or transcription of sessions is enabled, the Student can retrieve their own session's recorded audio/video or transcript. **(Assumption: whether recording/transcription is in scope at all — see Open Questions.)**
- **Stakeholder:** Student.
- **Inputs:** Selected session record.
- **System Behavior:** Platform retrieves the stored artifact tied to that session ID and owner.
- **Output / Result:** Playable recording and/or readable transcript associated with the correct session.
- **Error Cases / Exceptions:** Artifact not available (recording disabled at the time, storage failure) → explicit "not available" state, not a broken player.
- **Acceptance Criteria:** Opening a past session with a known recording plays back audio/video matching that specific session, not another one.

**FR-058 — Interaction History Within a Session**
- **Description:** Within an active or completed session, the platform must maintain an ordered record of the interaction turns (user input events and Avatar response events).
- **Stakeholder:** Student; Administrator.
- **Inputs:** Each input/output event during the session.
- **System Behavior:** Platform appends each turn to the session's interaction log in chronological order.
- **Output / Result:** A viewable, ordered turn-by-turn log for the session.
- **Error Cases / Exceptions:** Overlapping turns (interruptions, FR-025) must be recorded in actual chronological order, not logical/expected order.
- **Acceptance Criteria:** The turn log for a session, when replayed in order, matches the actual sequence of events that occurred, including any interruption.

**FR-059 — Delete/Export Own Data**
- **Description:** An Student can request export and/or deletion of their own session history and recordings. **(Assumption: driven by generic data-privacy expectation; confirm if a specific regulatory regime applies — see Open Questions.)**
- **Stakeholder:** Student.
- **Inputs:** User's export/delete request.
- **System Behavior:** Export packages the user's own records into a retrievable file; deletion removes/anonymizes the user's own records per retention policy.
- **Output / Result:** Downloadable export file; confirmation of deletion completion.
- **Error Cases / Exceptions:** Deletion of a record currently required for an open dispute/investigation (Administrator context) may be deferred — flagged as a policy decision, not hard-coded here.
- **Acceptance Criteria:** An export request produces a file containing exactly that user's own session records; a deletion request results in those records no longer being retrievable by that user or by ordinary Administrator queries, per the confirmed retention policy.

---

## 10. Notifications, Alerts, and Status/Error Messages

**FR-063 — In-Session Status Messages**
- **Description:** All Section 5/6 states (Connecting, Connected, Paused, Disconnected, Ended, Connection Failed, Listening/Thinking/Speaking) must have a corresponding, always-visible status message or indicator.
- **Stakeholder:** Student.
- **Inputs:** Current session/interaction state.
- **System Behavior:** UI renders exactly one primary status indicator reflecting current state at all times during a session.
- **Output / Result:** User never has to guess the current state.
- **Error Cases / Exceptions:** Conflicting/simultaneous state signals must resolve to one displayed state, prioritizing the most severe (e.g., Connection Failed overrides Thinking).
- **Acceptance Criteria:** For every defined state, a distinct, correctly-worded indicator is shown, verified by walking through the full state machine (FR-032).

**FR-064 — Post-Session Confirmation**
- **Description:** On normal session end, the user sees a confirmation/summary.
- **Stakeholder:** Student.
- **Inputs:** Finalized session record.
- **System Behavior:** Platform displays a summary screen/notice (duration, end reason) after a normal end.
- **Output / Result:** Clear closure of the session experience.
- **Error Cases / Exceptions:** Abnormal ends (failure) use the distinct messaging from FR-030/FR-031 instead of a success-style summary.
- **Acceptance Criteria:** A normally-ended session always shows a summary notice before returning to the dashboard.

**FR-065 — Error Message Standards**
- **Description:** Every error condition defined in this document must produce a specific, user-appropriate message — never a generic failure or a raw technical error.
- **Stakeholder:** Student.
- **Inputs:** Any handled error condition.
- **System Behavior:** Platform maps each known error condition to a predefined, plain-language message; unrecognized/unexpected errors fall back to one generic, still non-technical message plus an incident reference.
- **Output / Result:** User always receives an actionable, understandable message.
- **Error Cases / Exceptions:** N/A (this requirement governs error presentation itself).
- **Acceptance Criteria:** Every error path enumerated in this document (FR-030, FR-031, FR-035, etc.) has a distinct, reviewed message string; no user-facing error displays a raw stack trace, error code alone, or the word "undefined"/"null."

**FR-066 — Administrator Alerting**
- **Description:** System-level failure conditions (repeated Avatar startup failures, service outages, elevated error rates) must alert Administrators, not just the affected Student.
- **Stakeholder:** Administrator.
- **Inputs:** Aggregated error/failure events crossing a defined threshold.
- **System Behavior:** Platform surfaces an alert in the Administration Dashboard (and, if configured, via an external channel — Section 13) when thresholds are crossed.
- **Output / Result:** Administrator becomes aware of systemic issues without needing individual user reports.
- **Error Cases / Exceptions:** Alert flooding (many identical alerts) should be deduplicated/rate-limited. **(Assumption.)**
- **Acceptance Criteria:** Simulating a burst of Avatar startup failures across multiple users produces one visible, de-duplicated Administrator alert, not one per failure.

**FR-067 — Notification Preferences**
- **Description:** Students can configure which non-critical notifications they receive and through which channel (in-app, email, etc.), where such channels exist. **(Assumption: only in-app is confirmed in scope — see Open Questions.)**
- **Stakeholder:** Student.
- **Inputs:** User's notification preference selections.
- **System Behavior:** Platform respects preferences for all non-essential notifications; safety/security notices (e.g., password changed) are never suppressible.
- **Output / Result:** Notifications delivered only through enabled channels/types.
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** Disabling a notification type stops that type from appearing while other types continue; mandatory security notices still appear regardless of preference.

**FR-068 through FR-070 — Specific Alert Triggers**
- **FR-068 Idle-timeout warning:** User is warned before an idle session auto-ends (see FR-036). Acceptance: warning appears with enough lead time for the user to act before the timeout fires.
- **FR-069 "Taking longer than usual" notice:** Shown if Thinking state exceeds a defined threshold (see FR-027). Acceptance: notice appears exactly once per prolonged wait, not repeatedly.
- **FR-070 Reconnection notice:** Shown while an interrupted session attempts to reconnect (see FR-029). Acceptance: notice is visible for the full duration of the reconnect attempt and clears on success or final failure.

---

## 11. User, Session, and Avatar Settings

**FR-071 — Account/Profile Settings**
- **Description:** Student can manage account-level preferences (e.g., display name, language of the interface **(Assumption)**, notification preferences per FR-067).
- **Stakeholder:** Student.
- **Inputs:** Setting changes.
- **System Behavior:** Persist per-account; apply on next relevant action without requiring re-authentication.
- **Output / Result:** Settings reflected across sessions on any device where the user signs in.
- **Error Cases / Exceptions:** Invalid values rejected with field-level feedback.
- **Acceptance Criteria:** A saved setting persists across sign-out/sign-in and across devices.

**FR-072 — Session-Level Settings**
- **Description:** Student can configure options that apply to how a session behaves (e.g., default microphone device, input mode if text-input is supported, auto-reconnect preference).
- **Stakeholder:** Student.
- **Inputs:** Setting changes, applied at or before session start.
- **System Behavior:** Applies to sessions started after the change; does not retroactively alter an in-progress session unless the setting is explicitly designed to be live-adjustable (e.g., microphone device swap).
- **Output / Result:** Subsequent sessions start with the chosen configuration.
- **Error Cases / Exceptions:** Selected device becomes unavailable at session start → fallback to system default with a notice, not a hard failure.
- **Acceptance Criteria:** Changing a session-level setting and starting a new session reflects that setting; an in-progress session's behavior is unaffected unless the setting is documented as live.

**FR-073 — Avatar-Related Settings**
- **Description:** Where more than one Avatar persona/voice/visual option exists, the Student can select their preferred option. **(Assumption: single-Avatar platform is equally plausible — see Open Questions.)**
- **Stakeholder:** Student.
- **Inputs:** Avatar option selection.
- **System Behavior:** Persist selection; apply to the next session start.
- **Output / Result:** Chosen Avatar option is used in subsequent sessions.
- **Error Cases / Exceptions:** Selected option becomes unavailable (deprecated/disabled by Administrator) → fallback to a defined default with a notice.
- **Acceptance Criteria:** Selecting an Avatar option and starting a session results in that option being used, verifiable via session metadata.

**FR-074 — Administrator-Controlled Platform Defaults**
- **Description:** Administrators can set platform-wide defaults for session and Avatar settings (e.g., default idle timeout duration, default Avatar option, whether recording is on by default).
- **Stakeholder:** Administrator.
- **Inputs:** Configuration changes via the Administration Dashboard.
- **System Behavior:** New defaults apply to accounts/sessions that haven't set an explicit override; existing explicit user overrides are not silently changed.
- **Output / Result:** Platform-wide behavior shifts for un-overridden accounts going forward.
- **Error Cases / Exceptions:** Invalid configuration values (e.g., negative timeout) rejected at input.
- **Acceptance Criteria:** Changing a platform default affects new sessions for users without a personal override, and does not alter the setting for users who have one.

---

## 12. Administration Dashboard

These requirements extend the Admin dashboard's existing sections (Overview, Students, AI Reports, Topics, Classes, Analytics) with the Maya/session-specific functions needed to support Section 5's live sessions.

**FR-081 — Student Account Management**
- **Description:** Administrator can view, search, and manage all Student accounts.
- **Stakeholder:** Administrator.
- **Inputs:** Search/filter criteria; management actions (suspend, reactivate, edit, delete).
- **System Behavior:** Platform returns matching accounts and applies management actions with the same validation as Student self-service equivalents, plus an audit entry (FR-096).
- **Output / Result:** Up-to-date account list and successful application of management actions.
- **Error Cases / Exceptions:** Suspending/deleting an account with an active session must end that session (FR-018) as part of the action.
- **Acceptance Criteria:** Suspending an account immediately prevents that user's subsequent sign-in and ends any of their active sessions.

**FR-082 — Cross-User Session Visibility**
- **Description:** Administrator can view any user's session history and metadata (subject to any privacy carve-outs — see Open Questions on recording access).
- **Stakeholder:** Administrator.
- **Inputs:** Target user identifier.
- **System Behavior:** Platform retrieves the target's session records; access is logged (FR-096).
- **Output / Result:** Session list/detail equivalent to what the Student themself sees.
- **Error Cases / Exceptions:** N/A beyond standard not-found handling.
- **Acceptance Criteria:** Every such access produces exactly one audit entry, and the returned data matches what FR-056 would return for that user.

**FR-083 — Force-End a Live Session**
- **Description:** Administrator can terminate any user's active session (e.g., abuse, support escalation, maintenance).
- **Stakeholder:** Administrator.
- **Inputs:** Target session identifier; Administrator's end action.
- **System Behavior:** Platform ends the session as in FR-018 and records "Administrator-terminated" as the end reason, notifying the affected user.
- **Output / Result:** Session ends immediately for the user, who sees a specific notice, not a generic disconnect.
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** Force-ending a session stops the Student's Avatar media within 1 second and the resulting record shows "Administrator-terminated" as the end reason.

**FR-084 — Platform-Wide Analytics**
- **Description:** Administrator can view aggregate usage metrics: active/total users, session volume over time, average session duration, failure/error rates, state-transition breakdowns (e.g., % of sessions ending in Connection Failed).
- **Stakeholder:** Administrator.
- **Inputs:** Date range and optional filters.
- **System Behavior:** Platform aggregates session and account records into the selected metrics/time range.
- **Output / Result:** Dashboard visualizations/tables matching the underlying data.
- **Error Cases / Exceptions:** No data in range → explicit empty state.
- **Acceptance Criteria:** A metric shown for a given date range matches an independent count/query over the underlying session records for that same range.

**FR-085 — Avatar/Service Configuration**
- **Description:** Administrator can configure Avatar-service-level settings (available Avatar options, idle timeout defaults, reconnection retry policy, recording on/off).
- **Stakeholder:** Administrator.
- **Inputs:** Configuration form submissions.
- **System Behavior:** Validated changes are persisted and take effect for subsequently started sessions.
- **Output / Result:** Confirmed configuration state visible in the dashboard.
- **Error Cases / Exceptions:** Invalid values rejected with specific field errors; changes never retroactively alter already-completed session records.
- **Acceptance Criteria:** A saved configuration change is reflected in the next session started after the save, and in the dashboard's own display of current config.

**FR-086 — Error/Alert Log Review**
- **Description:** Administrator can view a log of platform errors and Section 10 alerts, filterable by type/severity/date.
- **Stakeholder:** Administrator.
- **Inputs:** Filter criteria.
- **System Behavior:** Platform returns matching log entries with enough detail to triage (timestamp, affected user if applicable, error type, session ID if applicable).
- **Output / Result:** A reviewable, filterable error/alert list.
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** Every FR-030/FR-031/FR-066 event produces a corresponding, correctly-detailed log entry retrievable through this view.

**FR-096 — Audit Log for Administrator Actions**
- **Description:** Every Administrator action with user-facing or data impact (role change, account suspension, force-end session, config change, cross-user data view) is recorded in an audit log.
- **Stakeholder:** Administrator; compliance stakeholder.
- **Inputs:** The action event itself.
- **System Behavior:** Platform writes an immutable audit entry (actor, action, target, timestamp, before/after values where applicable) synchronously with the action.
- **Output / Result:** A complete, queryable audit trail.
- **Error Cases / Exceptions:** If the audit write fails, the triggering action must not be allowed to silently complete unlogged. **(Assumption — see FR-054.)**
- **Acceptance Criteria:** Every action listed above produces exactly one matching audit entry, viewable and filterable by Administrators.

---

## 13. Required External Integrations

| Integration | Purpose | Interaction Point with the Platform |
|---|---|---|
| **LiveKit (real-time media infrastructure)** | Hosts the room/session, transports audio/video/data between the Student and Maya. Replaces the current build's mocked, photo-based stand-in for Maya. | Session start/end (FR-017/FR-018), track publish/subscribe (FR-020/FR-021), connection-state events driving Section 6's state machine. |
| **Maya avatar generation/service provider** (the AI/voice/rendering engine behind Maya, delivered as a LiveKit participant) **(Assumption: specific vendor not yet selected — see Open Questions)** | Produces Maya's spoken/visual responses in real time. | Receives Student input (FR-020), emits synchronized audio/video (FR-021), emits state signals (Listening/Thinking/Speaking, FR-026–FR-028). |
| **Authentication provider** **(Assumption: platform-native email/password vs. third-party SSO; the current build has no real sign-in — see Open Questions)** | Verifies student/admin identity for sign-in/sign-up. | Section 7 (Account Management). |
| **Notification delivery channel(s)** (email and/or push) **(Assumption — see Open Questions)** | Delivers out-of-app notifications where enabled. | Section 10 (Notifications), gated by FR-067 preferences. |
| **Storage for recordings/transcripts** | Persists Maya session artifacts (FR-057) alongside the platform's existing recorded-audio and Friday video submission storage. | Written at session end; read on history/playback requests, and surfaced on the Student's detail page in the Admin dashboard. |

---

## 14. Error Cases and Exceptional Scenarios (Consolidated)

The scenario-specific requirements above each define their own error handling; this table consolidates them for traceability.

| Scenario | Governing Requirement(s) | Expected Behavior |
|---|---|---|
| Avatar fails to start | FR-030 | Clear error + Retry; no orphaned resources. |
| Mid-session connection loss | FR-029, FR-031 | Auto-reconnect attempts, then Connection Failed if exhausted. |
| Microphone permission denied/revoked | FR-022 | Session continues with input disabled and a persistent, specific alert; not a full session failure. |
| User interrupts Avatar speech | FR-025 | Defined barge-in/queue behavior; no desync. |
| Session left idle | FR-036, FR-068 | Warning, then automatic Ended/Paused with a specific end reason. |
| Session start attempted without entitlement | FR-035 | Blocked before any resource allocation, with a specific message. |
| Administrator force-ends a session | FR-083 | Immediate end, specific end reason, user notified. |
| Sign-in with invalid credentials | FR-003 | Generic invalid-credentials message (no account-existence leakage). |
| Account recovery for non-existent account | FR-005 | Same response as for an existing account (no leakage). |
| Audit write fails during a logged action | FR-054, FR-096 | Action and its audit record are transactionally linked — no unlogged privileged action. |
| Repeated startup failures across users | FR-066 | De-duplicated Administrator alert. |

---

## 15. Non-Functional Requirements

**NFR-001 — Session Start Latency**
- **Description:** Time from the user's "Start session" action to a fully connected, media-flowing state must be bounded.
- **Acceptance Criteria:** Under normal network conditions **(Assumption: broadband/4G-equivalent)**, session reaches **Connected** with live Avatar media within 5 seconds in at least 95% of attempts.

**NFR-002 — Avatar Response Latency**
- **Description:** Time from end of user input to the start of the Avatar's audible/visual response (i.e., duration of the Thinking state) must be bounded.
- **Acceptance Criteria:** Median Thinking duration ≤ 2 seconds; any instance exceeding 8 seconds triggers the FR-069 notice.

**NFR-003 — Audio/Video Synchronization**
- **Description:** Avatar audio and video must remain perceptibly synchronized.
- **Acceptance Criteria:** Measured drift between audio and corresponding video does not exceed 300ms during normal playback. **(Assumption threshold.)**

**NFR-004 — Reconnection Time**
- **Description:** Automatic reconnection (FR-029) must complete quickly enough to feel like a recoverable blip, not a new session.
- **Acceptance Criteria:** Reconnection either succeeds or reaches Connection Failed within 15 seconds of the initial disconnect being detected.

**NFR-005 — Data in Transit Security**
- **Description:** All audio/video/data traffic between the user, the platform, and LiveKit must be encrypted in transit.
- **Acceptance Criteria:** No session establishes over an unencrypted transport; verified via network-level inspection.

**NFR-006 — Data at Rest Security**
- **Description:** Stored account data, session records, and any recordings/transcripts must be encrypted at rest and access-controlled per Section 8.
- **Acceptance Criteria:** Direct storage inspection confirms encryption; access attempts outside the defined permission model are rejected and logged.

**NFR-007 — Credential Security**
- **Description:** Passwords/credentials must never be stored or logged in plain text.
- **Acceptance Criteria:** A review of storage and logs confirms no plain-text credential is ever persisted.

**NFR-008 — Privacy — No Unauthorized Camera Access**
- **Description:** Reinforces FR-024 as a non-functional guarantee: no code path anywhere on the platform requests user camera access during an Avatar session.
- **Acceptance Criteria:** Static/dynamic analysis and manual testing find zero camera-permission requests across the full session experience.

**NFR-009 — Device and Browser Compatibility**
- **Description:** The platform's core session experience must work on current major desktop and mobile browsers.
- **Acceptance Criteria:** Full session flow (start → interact → end) completes without functional defect on the two most recent major versions of at least Chrome, Safari, and Edge, on both desktop and a common mobile OS. **(Assumption on exact browser matrix — see Open Questions.)**

**NFR-010 — Responsive Layout**
- **Description:** All screens, including the live session view and Administration Dashboard, must be usable on both desktop and mobile viewport sizes.
- **Acceptance Criteria:** No horizontal overflow, no overlapping controls, and all text remains readable at common mobile widths (e.g., 375px) and desktop widths.

**NFR-011 — Availability**
- **Description:** The platform's core session-start and account functions must be highly available.
- **Acceptance Criteria:** **(Assumption target)** ≥99.5% monthly uptime for sign-in and session-start functions, excluding scheduled maintenance windows communicated in advance.

**NFR-012 — Stability Under Interruption**
- **Description:** Network interruptions or Avatar-service hiccups must degrade gracefully (per Section 5/6) rather than crash the client or corrupt session state.
- **Acceptance Criteria:** Repeated simulated interruptions across many sessions never leave the client in an unresponsive state requiring a hard reload, and never produce a session record in an undefined/invalid state.

**NFR-013 — Usability of Status Communication**
- **Description:** A first-time user must be able to understand the current session state without external explanation.
- **Acceptance Criteria:** Each of the seven session states (Section 6) and three interaction states (Listening/Thinking/Speaking) has a visually and textually distinct representation, confirmed via usability review against a checklist (not vague "should be intuitive" language).

**NFR-014 — Auditability**
- **Description:** All privileged actions must be traceable after the fact.
- **Acceptance Criteria:** Every action enumerated in FR-096's scope produces a retrievable audit record for at least a defined retention period. **(Assumption on retention length — see Open Questions.)**

**NFR-015 — Scalability of Concurrent Sessions**
- **Description:** The platform must support a defined number of concurrent live Avatar sessions without degrading NFR-001/NFR-002 targets. **(Assumption: exact target concurrency unconfirmed — see Open Questions.)**
- **Acceptance Criteria:** Load testing at the confirmed target concurrency shows NFR-001 and NFR-002 targets still met at the 95th percentile.

---

## 16. Constraints, Assumptions, and Dependencies

**Constraints**
- The Maya interaction is one-way on video (Maya → Student only); the platform must never enable a Student-facing camera in this context (FR-024, NFR-008) — consistent with the existing "no camera access" rule already enforced in the Course Player's Discuss-with-Maya tab.
- Real-time media transport depends on LiveKit's session/room model; any session-state requirement (Section 6) must map onto states LiveKit itself can expose or that the platform can derive from LiveKit's connection/track events.
- Maya sessions must integrate with the existing progress model — per-topic AI analysis, the Day/Week/30-Days trend view, and the sequential lesson-unlock rule — rather than existing as a disconnected feature.

**Assumptions** (consolidated; each also called out inline above and repeated in Section 18)
- Web-based, browser-only access (no native app) in scope for this version, consistent with the current build.
- Single "Student" role and single "Administrator" role; no finer-grained sub-roles (e.g., teaching assistant) unless specified.
- Text input alongside voice is an optional, not confirmed, feature for Maya sessions.
- Barge-in (Student interrupting Maya's speech stops Maya's output) is the intended interruption policy.
- Session recording is confirmed in scope in principle — the platform already records/stores Student audio (per-topic) and weekly video check-ins — but whether a live Maya session is itself recorded/transcribed (FR-057) is not yet confirmed.
- Numeric thresholds (timeouts, retry counts, latency targets, uptime targets, retention periods) are placeholder assumptions pending confirmation.

**Dependencies**
- LiveKit service availability and its SDK's exposed events for connection/track/participant state.
- The Maya service provider's ability to emit distinct Listening/Thinking/Speaking signals compatible with FR-026–FR-028.
- Replacing the current mocked, photo-based Maya stand-in with a real LiveKit Avatar integration.
- An authentication mechanism (native or third-party) per Section 7.

---

## 17. Out of Scope

- Lesson/topic content design, curriculum authoring, or how Maya's conversational dialogue is produced — covered by the existing Lessons/Topics/Course Player areas, not by this document.
- Avatar rendering technology choice, specific AI/model selection, and internal system architecture (services, databases, hosting) beyond what is needed to state a requirement.
- Billing, payments, and subscription/plan management (the existing Standard/Pro plan assignment is an Admin function already covered elsewhere in the product, not re-specified here) unless later added as an explicit requirement.
- Native mobile applications (iOS/Android app store builds).
- Multi-tenant/white-label platform operation.
- Marketing site content and SEO.
- Third-party integrations not listed in Section 13 (e.g., CRM, calendar) unless later requested.

---

## 18. Open Questions

The following materially affect scope and are not yet settled for the real-LiveKit build. An initial requirement set has been drafted above under a stated assumption for each; each should be confirmed or corrected before implementation planning. (Platform purpose/domain, roles, and the one-way-video/no-camera rule are already settled by the existing Tamakkan product and are not repeated here.)

1. **Text input:** Does a Maya session support typed text input alongside voice, or is voice the only input modality?
2. **Avatar options:** Is Maya the platform's single fixed Avatar persona, or will there be multiple selectable Avatars/voices (FR-073)?
3. **Interruption policy:** Should Student speech during Maya's output immediately stop/override her response (barge-in), or queue until she finishes?
4. **Session recording/transcript:** Is the live Maya session itself recorded/transcribed (distinct from the existing per-topic audio and Friday video submissions)? If yes, is it always-on, Student-controlled, or Administrator-controlled, and who besides the session's own Student may access it?
5. **Authentication method:** The current build has no real sign-in flow (a single hardcoded student). Is native email/password sufficient for launch, or is SSO required?
6. **Account verification:** Is email/phone verification required at sign-up, or is immediate access acceptable?
7. **Session limits/entitlement:** Do Standard-plan Students have a Maya session quota (sessions per day/month), while Pro Students get more/unlimited — mirroring the existing Standard/Pro plan split (affects FR-035)?
8. **Session duration limits:** Is there a maximum single Maya-session duration, independent of idle timeout?
9. **Concurrency target:** What is the expected number of concurrent live Maya sessions the platform must support (NFR-015)?
10. **Data retention & deletion:** What retention period applies to Maya session records/recordings, and does any regulatory regime (e.g., GDPR-equivalent, given minors may use an English-learning platform) govern deletion/export requests (FR-059)?
11. **Notification channels:** Are out-of-app notifications (email/push) in scope, or is in-app-only sufficient (FR-067)?
12. **Browser/device support matrix:** Which specific browsers/OS versions must be officially supported (NFR-009)?
13. **Uptime/availability target:** Is there a contractual or internal SLA target beyond the placeholder used in NFR-011?
14. **Administrator sub-roles:** Is a single "Administrator" role sufficient, or are there finer distinctions (e.g., read-only support staff vs. full configuration control)?
15. **Numeric thresholds throughout this document** (reconnect retry count/backoff, idle timeout duration, "taking longer than usual" threshold, audio/video sync tolerance, audit retention length) are all placeholder assumptions and should be confirmed by the platform owner or Maya-service technical constraints.
