# Tamakkan — Kanban Board

Consolidated from [Tamakkan-Task-Breakdown.md](Tamakkan-Task-Breakdown.md) (the detailed, dependency-level version — keep it around for reference when a card needs splitting during implementation). Full rationale for every decision referenced here lives in [Tamakkan-Consolidated-Platform-Plan.md](Tamakkan-Consolidated-Platform-Plan.md).

**37 cards** on the main board, ordered top-to-bottom as a suggested Backlog priority (drop straight into your tool in this order). **3 icebox cards** for post-launch. Each card has what to build, done-when criteria, size, and dependencies — no card should need the plan doc open to start work, though it's there if a "why" is unclear.

**Size:** S = ~1 day · M = 2–3 days · L = ~1 week · XL = needs splitting when it comes up

---

## 🚫 Blocked — resolve before these enter the board

| # | Decision needed | Blocks |
|---|---|---|
| 1 | Is **Live Classes** in launch scope? | All of Lane G |
| 2 | Which of the **six practice modes** ship at launch — all, or Topic Discussion only for now? | Cards 27–29 |
| 3 | **Quiz** lessons — build the missing type, or drop it from the catalogue? | Card 15 |

Everything below assumes these are still open; cards depending on them are marked ⚠️.

---

## Lane A — Foundations

### 1. Backend skeleton, database & domain models
**Build:** FastAPI project structure, settings/config, MongoDB + Beanie wiring, a health-check endpoint. Add the core models from the plan (§5): `User`, `LiveSession`, `RecordingSubmission`, `TopicContent`, `AuditLog`, `AlertLog`, `SessionEntitlement`, `PlatformAvatarConfig`, `NotificationPreference`. Add the shared `transition()` state-machine helper (plan §10.4) and the transition tables for `LiveSession` and `RecordingSubmission`.
**Done when:** app boots against a real Mongo instance; every model round-trips (write/read) in a test; `transition()` is exhaustively tested against both spec state diagrams, including every *invalid* transition being rejected.
**Size:** M · **Depends on:** —

### 2. Authentication, roles & account basics
**Build:** JWT login/refresh/logout, password hashing, password-reset flow (time-limited token, no account-existence leakage on request). Exactly **two roles**: Student and Administrator (the Instructor *is* the Administrator — no third role, per plan §3.5). A minimal account screen: display name + password change only — this is deliberately not a settings area, since students configure nothing else (plan §3.5).
**Done when:** wrong credentials give a generic error that doesn't reveal whether the email exists; a reset link works once and then rejects reuse; role guards reject a Student calling an Administrator-only endpoint with a 403.
**Size:** M · **Depends on:** 1

### 3. Real sign-in replacing the prototype's Student/Admin toggle
**Build:** A login screen and role-based routing that replaces the sidebar's dev-only Student/Admin switch. On successful login, route to the Student dashboard or the Administrator dashboard per the account's actual role.
**Done when:** the app has no way to view the "other" role's dashboard without logging in as that role.
**Size:** S · **Depends on:** 2

### 4. Instructor creates/invites students
**Build:** An endpoint + admin UI action for an instructor to create a new student account (resolve first whether it's instructor-creates-outright or invite-then-student-completes-signup — the prototype's copy implies both and needs picking, plan §3.5). Wire the existing "＋ Invite student" button and the "Awaiting class assignment" pending queue to real data instead of in-memory state.
**Done when:** a newly created student can sign in and lands with no assigned content until an instructor assigns a plan (card 8).
**Size:** M · **Depends on:** 2

### 5. "Preview as student" mode
**Build:** Turn the prototype's Student/Admin toggle into a real instructor feature — the instructor picks one of their students and views the dashboard exactly as that student would see it. Must be **read-only**: entering preview never creates sessions, submissions, or scores against that student's actual record. Every entry into preview writes an `AuditLog` entry (it's a form of impersonation) — plan §3.5.
**Done when:** an instructor can preview any student's assigned view; nothing written during preview shows up in that student's real history afterward; each preview session has exactly one matching audit entry.
**Size:** M · **Depends on:** 3, 1

---

## Lane B — Recording pipeline *(build this first after Lane A — smallest gap, ships real value fastest)*

### 6. Recording submission backend
**Build:** `POST /submissions` accepting an audio/video blob, uploading it to Cloudinary via `upload_large()` chunked upload run inside a FastAPI `BackgroundTasks` job (not blocking the request). Write a `RecordingSubmission` with student/kind/label/duration/date/`reviewed=false`. Add: replace semantics via the `replaces` link field for **every** submission kind (today only the Friday video replaces correctly — per-task audio doesn't); a max-duration auto-stop server-side check; upload retry so a network blip never loses a take; and the 7-day TTL cleanup job that deletes the Cloudinary asset and sets `media_deleted=True` once `expires_at` passes.
**Done when:** submitting twice for the same task/week updates one record, not two; a submission older than 7 days has its media deleted but its metadata (score, reviewed status) still present; a simulated upload failure doesn't discard the local recording.
**Size:** L · **Depends on:** 1

### 7. Wire the Recorder UI to the real backend
**Build:** Point the existing (already-functional) `Recorder` component's Submit action at card 6's endpoint instead of holding an ephemeral `blob:` URL in React state. Add the pre-cutoff duration warning in the UI, and an "expired" playback state for submissions past their 7-day TTL (instead of a broken player).
**Done when:** refreshing the page after submitting still shows the submission as submitted; a recording past its TTL shows an explicit expired state, not a 404 in a player.
**Size:** M · **Depends on:** 6

### 8. Submissions views — student and admin
**Build:** **New screen:** the student's own submissions grouped by topic (this doesn't exist anywhere today — it's only on the Admin's student-detail page). Ownership-checked playback (only the owning student or an Administrator can play a given submission). Wire the Admin's all-submissions and per-student views to real queries with a live, correctly-computed unreviewed count, and make the existing filter chips actually filter the submissions panel (today they don't touch it).
**Done when:** a student can see every one of their own past recordings under the right topic; a second student's direct request for someone else's submission is rejected; the admin unreviewed count matches an independent count of `reviewed=false` records.
**Size:** M · **Depends on:** 6, 3

---

## Lane C — Content pipeline

### 9. Unified topic/content model + CRUD
**Build:** Merge the prototype's two disconnected content structures — the 16-lesson `curriculum` catalogue and the 3-topic `program.topics` rich content — into one Topic entity, and build the CRUD API behind it. Wire the admin `ProgramBuilder` wizard to real persistence (today it edits in-memory state only).
**Done when:** there is exactly one place a topic's data lives; the builder's changes survive a page reload.
**Size:** M · **Depends on:** 1

### 10. Rich content authoring
**Build:** Extend the Topic model and the `ProgramBuilder` UI to capture the actual authored-lesson shape found in the source `.docx` files (plan §4.1): warm-up questions, multi-part guided questions (e.g. "Part 1: Introduction"), useful phrases grouped by function (starting/describing/opinions/concluding), vocabulary organized by theme with a worked example sentence each, sentence-starter blocks with a worked example, and an optional suggested practice schedule.
**Done when:** all three source `.docx` lessons can be fully represented without losing structure (no flattening of parts/categories into a single free-text field).
**Size:** L · **Depends on:** 9

### 11. Transcript pipeline
**Build:** Fetch captions via `youtube-transcript-api` first. If missing/disabled, fall back to extracting audio only with `yt-dlp` (transient file, deleted after use) and transcribing with Gemini. **Chunk long audio** above a configurable threshold, with a short overlap between chunks to avoid losing boundary words, transcribing each chunk and stitching the results; retry failed chunks individually, but fail the whole transcript (leaving the topic in its pre-approval state) if a chunk can't be recovered — a silent half-transcript would poison Maya's context. Add the teacher review queue: `PENDING_REVIEW` → `APPROVED_FOR_AI`, with an approve endpoint.
**Done when:** a video with captions never touches `yt-dlp`; a video without captions produces a correct, complete transcript regardless of length; an unapproved transcript is never injected into a Maya prompt.
**Size:** L · **Depends on:** 9

### 12. YouTube embed with real progress tracking
**Build:** Replace the "watched the video" gate (currently satisfied by one click on a static play icon over a PNG) with a real YouTube IFrame Player API embed, using its `onStateChange`/`getCurrentTime` events to determine actual watch progress before unlocking "Discuss with Maya."
**Done when:** the Maya session cannot be started without the player reporting the video was actually played to a reasonable completion point.
**Size:** M · **Depends on:** 9

### 13. Prompt-assembly service
**Build:** Reproduce the exact prompt contract captured from the builder's Step 4 preview (plan §3.4 K: ADMIN INSTRUCTION / VIDEO TRANSCRIPT / TRANSCRIPT SUMMARY / TARGET LANGUAGE / DISCUSSION QUESTIONS), extended to include card 10's new fields. Verify the assembled prompt against Gemini Live's context-length budget for a full-length transcript, not just the mock's short paragraph.
**Done when:** the assembled prompt for a real topic includes every field card 10 added; a full 15–20 minute transcript's worth of content fits within budget, or the service truncates/summarizes with a documented strategy if it doesn't.
**Size:** M · **Depends on:** 10, 11

---

## Lane D — Entitlements *(small; closes a hole I reproduced in testing)*

### 14. Plan & entitlement enforcement
**Build:** Server-side enforcement of the confirmed model (plan §3.5): Standard = a group's assigned topic/video set with a fixed 15-minute session cap; Pro = an individually hand-picked topic list spanning any level, with a session-duration cap the instructor can raise per student (`duration_override_minutes`, always an explicit admin action, always audited). Reject any session-start or topic-access call outside a student's entitlement, checked *before* any LiveKit room is created (FR-035). Wire the `AssignPlanModal` flow to real persistence.
**Done when:** the exact hole I reproduced — an Intermediate/Standard student opening an Advanced lesson — is closed server-side; raising a Pro student's session limit produces one matching audit entry.
**Size:** M · **Depends on:** 9, 2

### 15. Student view scoped to assignment only
**Build:** The Lessons catalogue and any other content-browsing screen must show a student **only** what's been assigned to them — not a switchable level picker that happens to be blocked server-side. This is a UI redesign, not just an API check: per plan §3.5, students configure and browse nothing beyond their assignment.
**Done when:** a Standard student's UI has no path to even attempt viewing another level's content.
**Size:** M · **Depends on:** 14

---

## Lane E — Lesson experience

### 16. Server-side lesson progression
**Build:** Move sequential lesson unlocking and completion tracking from client-only state to the backend. Fix the Friday check-in state model so missed (past, never submitted), current, locked, and submitted are visually distinct — today all four render an identical 🎥 (plan §3.4 J).
**Done when:** reloading the page mid-course preserves real unlock/completion state; a missed Friday check-in looks different from a completed or upcoming one.
**Size:** M · **Depends on:** 9

### 17. Quiz lesson type ⚠️
**Build:** *(Only if card 3 in the Blocked list resolves to "build it".)* Data model, authoring UI in the builder, a player UI, and scoring for the "Quiz" lesson type — currently a labeled-but-unimplemented lesson type with no model anywhere.
**Done when:** a quiz lesson can be authored, taken by a student, and scored end-to-end.
**Size:** L · **Depends on:** 10

### 18. Accessibility fixes on the challenge calendar
**Build:** The 30-day challenge's day-cells are currently unstyled `<div>`s with no button role and no keyboard access. Make them real, focusable, keyboard-operable controls.
**Done when:** the full challenge calendar is navigable and operable by keyboard alone.
**Size:** S · **Depends on:** —

---

## Lane F — Maya live sessions *(the core AI feature)*

### 19. Avatar vendor spike
**Build:** Head-to-head trial of SpatialReal vs. ProtoFace (both confirmed LiveKit-native), scored on: video latency added on top of Gemini Live's own response time, cost per session-minute, and how directly each maps to Listening/Thinking/Speaking via LiveKit Agents' `agent_state_changed` events. Produces a vendor decision, not code.
**Done when:** one vendor is picked, with the scoring written down for the other epics that depend on it.
**Size:** M · **Depends on:** — *(start in parallel with Lane A/B — external dependency, unknown lead time)*

### 20. LiveKit infrastructure
**Build:** Token-minting endpoint and room provisioning/teardown (FR-017/018) on the FastAPI side. A LiveKit Agents worker process running the Gemini Live plugin, wired to card 13's assembled prompts, with the chosen avatar (card 19) integrated as an `AvatarProvider` Strategy implementation (plan §10.1 — one small interface, one class per vendor, no speculative plugin framework beyond that).
**Done when:** starting a session provisions a real LiveKit room with Maya as a participant producing synced audio+video from a real prompt.
**Size:** L · **Depends on:** 13, 19, 2

### 21. Frontend live-call experience
**Build:** The browser-side LiveKit client: publish the student's microphone track while connected and unmuted; subscribe to and render Maya's synced audio+video; mic mute/unmute and local Avatar-output mute controls (new UI — none exists today); enforce that no camera-permission request is ever issued anywhere in this flow (FR-024, as a lint/test rule, not an accident). **Remove** the prototype's manual "next question" advance control — Maya drives the conversation in the real build.
**Done when:** a real session runs with working mute controls and no camera prompt ever appears; the manual-advance button is gone.
**Size:** L · **Depends on:** 20

### 22. Listening / Thinking / Speaking + barge-in
**Build:** Drive the three interaction-state indicators from the Agents worker's real `agent_state_changed` events (not UI copy swaps, as today). Implement barge-in: student speech during Maya's Speaking state stops her output and transitions to Listening/Thinking.
**Done when:** interrupting Maya mid-sentence visibly and audibly stops her within the target latency, every time, across a handful of manual test runs.
**Size:** M · **Depends on:** 20, 21

### 23. Session lifecycle & reliability
**Build:** The full 7-state session state machine (`Not Started, Connecting, Connected, Paused, Disconnected, Ended, Connection Failed`) with an `end_reason`, persisted via LiveKit webhooks. Progressive connection-status UI (requesting → connecting → joining → live). Pause/resume against a held room. Reconnection with bounded retries and a manual retry from `Connection Failed`. Idle timeout with a warning, and enforcement of the 15-minute cap (or a granted override) from card 14.
**Done when:** walking through every state in the spec's diagram (success and every failure path) never produces a state outside it; a simulated network drop reconnects or reaches `Connection Failed` cleanly, never an indefinite hang.
**Size:** L · **Depends on:** 20, 14

### 24. Transcript logging & session summary
**Build:** Turn-by-turn `transcript_history` persistence (speaker/text/timestamp) — the live call is **never recorded** as audio/video, only this structured text log is kept, and it's what feeds AI scoring (Lane G). A post-session summary screen showing duration and end reason (FR-064), replacing today's generic "analyzed and sent to your admin" text.
**Done when:** every ended session has a complete, correctly-ordered turn log, including turns from an interrupted exchange; the summary screen shows real duration and the actual end reason.
**Size:** M · **Depends on:** 22, 23

---

## Lane G — AI scoring & reports

### 25. AI scoring pipeline
**Build:** From a session's `transcript_history`, generate the six-skill score breakdown and summary via a `BackgroundTasks` job. Resolve and fix the prototype's 4-vs-6 skill count inconsistency (reports show 4, the skill-breakdown card shows 6) — pick one and apply it everywhere.
**Done when:** a real session produces a real score set, consistently shaped across every screen that displays it.
**Size:** L · **Depends on:** 24

### 26. Reports experience
**Build:** Reports API with real list/filter behind the Admin AI Reports screen. **New screen:** a full report detail view — "Open full report →" is currently a dead button with nothing behind it. Replace the fabricated `mockTopicSkills` scores shown for un-practised topics with a genuine "no session yet" empty state (plan §3.4 I) — the mock currently shows admins invented assessment numbers for topics with zero sessions.
**Done when:** every report row opens to a real detail view; no topic ever shows a skill score without a real session behind it.
**Size:** M · **Depends on:** 25

### 27. Per-topic analysis & trend endpoints
**Build:** Backend endpoints for the student detail page's per-topic analysis and the progress-over-time trend chart, replacing the currently-hardcoded chart data.
**Done when:** the trend chart and per-topic cards reflect a specific student's real session history.
**Size:** M · **Depends on:** 25

---

## Lane H — Practice modes ⚠️ *(depends on Blocked #2)*

### 28. Practice-mode infrastructure
**Build:** Add a `mode` field to `LiveSession` with per-mode history and last-score aggregates. Build the prompt-builder Strategy interface (plan §10.1 — one implementation per mode behind one interface) starting with Topic Discussion and Free Talk. Free Talk needs its own path since it has no topic context at all, unlike every other mode.
**Done when:** Topic Discussion and Free Talk each produce mode-appropriate prompts and their own tracked history.
**Size:** M · **Depends on:** 20, 13

### 29. Remaining practice-mode prompts
**Build:** Prompt strategies for Vocabulary Builder, Mock Interview, and Debate Practice, following card 28's pattern.
**Done when:** all four modes are distinguishable in an actual conversation with Maya, not just by label.
**Size:** M · **Depends on:** 28

### 30. Pronunciation Drill feasibility spike
**Build:** Determine whether Gemini Live can actually deliver the "instant feedback" the mode's description promises (phoneme-level assessment is a different capability from conversational scoring). Produces a design, or a decision to cut the mode, not necessarily working code.
**Done when:** a clear answer exists on whether/how this mode ships.
**Size:** M · **Depends on:** —

---

## Lane I — Admin oversight, gamification & polish

### 31. Session control & platform configuration
**Build:** A force-end-session action for the Administrator (records `administrator_terminated` as the end reason, FR-083), plus an Avatar/platform config panel exposing `PlatformAvatarConfig` — including `max_concurrent_sessions` (launched at 50, adjustable with no code change).
**Done when:** force-ending a session stops the student's media within one second and shows correctly in their history; changing a config value takes effect for the next session started, not retroactively.
**Size:** M · **Depends on:** 23, 5

### 32. Error/alert log & audit viewer
**Build:** An error/alert log with deduplication (a burst of identical Avatar-startup failures produces one alert, not one per failure — FR-066), and a viewer for the `AuditLog` entries already being written by cards 5, 14, and 31.
**Done when:** a simulated burst of failures produces exactly one deduplicated alert; every audited action from those cards is visible and filterable here.
**Size:** M · **Depends on:** 5, 14, 31

### 33. Real analytics
**Build:** Replace the Admin Analytics screen's hardcoded metrics with real aggregation queries over session and account records.
**Done when:** a metric for a given date range matches an independent query over the same underlying records.
**Size:** L · **Depends on:** 25

### 34. Gamification
**Build:** Streak/consistency tracking, the six badges with their distinct earn criteria, and the three milestones — including the Day-20 milestone that **grants an entitlement** ("bonus 1:1 coaching session"), which needs a real award-evaluation engine, not hardcoded copy.
**Done when:** completing the real criteria for a badge or milestone awards it exactly once; the Day-20 grant is a real entitlement change, not just a UI badge.
**Size:** M · **Depends on:** 16, 14

### 35. Notifications & UI polish
**Build:** An in-app message catalog mapping every handled error/status to specific, non-technical copy (FR-065) — idle-timeout warning, reconnection notice, "taking longer than usual." Fix the topbar's currently-inert Search, notification bell, and Settings button (wire them up or remove them), and make the sidebar's `.sideBottom` (Settings/support) reachable on mobile, where it's currently `display:none`.
**Done when:** every error path defined in the spec has a distinct, reviewed message string, never a raw error; no dead controls remain in the topbar; mobile users can reach Settings.
**Size:** M · **Depends on:** 23

---

## Lane K — Deploy

### 36. Containerize & deploy to staging
**Build:** Multi-stage Dockerfile for the FastAPI backend (with `ffmpeg`) and a separate image for the Agents worker. Environment/secrets configuration and a staging deployment.
**Done when:** a fresh checkout builds and deploys both images to staging from a single documented command/pipeline.
**Size:** M · **Depends on:** 1

### 37. Production deploy & monitoring
**Build:** Production deployment (reconsider Hostinger given LiveKit Cloud removes the need to self-host media servers) and basic observability on session success rate and background-job failures.
**Done when:** a session-failure spike or a stuck background job would actually be noticed without a user reporting it.
**Size:** M · **Depends on:** 36

---

## ❄️ Icebox — post-launch

### P1. Storage consolidation to Cloudflare R2
Migrate existing Cloudinary recordings **and** rehost lesson videos (replacing the YouTube `<iframe>` embed) onto Cloudflare R2, as one consolidated migration. **Trigger:** real traffic/cost/reliability data, not a calendar date.

### P2. Celery + workers
Replace `BackgroundTasks` with Celery, a broker, and dedicated workers. **Trigger:** `BackgroundTasks`' limits (no retries, no persistence across a restart) actually being hit in production — not built pre-emptively.

### P3. Localization / RTL
Arabic-market support: `<html lang>`, RTL layout, an Arabic-covering font. **Trigger:** explicit stakeholder decision — deferred for now, not scheduled.

---

## Lane G′ — Live Classes ⚠️ *(depends on Blocked #1 — do not size or start until answered)*

### C1. Write the Live Classes requirements spec
This entire product area (group classes, 1:1 coaching, capacity, attendance, a four-person instructor roster, class recordings) has **no requirements document at all** — both existing specs explicitly scope it out. Write one before any estimation happens here.

### C2. Scheduling, enrolment & multi-party LiveKit rooms
The core feature once C1 exists: class/instructor/enrolment data model, scheduling and capacity, and multi-party LiveKit rooms with host controls — a materially bigger LiveKit build than the 1:1 Maya avatar.

### C3. Attendance, class recordings & instructor roster
Attendance tracking, class recording/storage/playback (retention policy currently unspecified — a third media type distinct from Maya sessions and student self-recordings), and the instructor roster/profile screens.
