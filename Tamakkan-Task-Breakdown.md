# Tamakkan — Implementation Task Breakdown

Companion to [Tamakkan-Consolidated-Platform-Plan.md](Tamakkan-Consolidated-Platform-Plan.md). That document is *what and why*; this one is *the work, in order*.

**Sizing key:** S = up to ~1 day · M = 2–3 days · L = ~1 week · XL = more than a week / needs its own breakdown.
**Every task's definition of done includes tests** — the state machines, entitlement rules, and upload paths especially.

---

## Operating model (governs everything below)

Per plan §3.5: **the Instructor is the Administrator**, they control every aspect of each student's experience, and **students configure nothing — they only see what's assigned to them.** Two roles total. This removes FR-072/FR-073 entirely, shrinks FR-071 to bare account basics, and promotes the prototype's Student/Admin toggle from throwaway scaffolding to a real **"preview as student"** feature (read-only, audit-logged).

## Blocked before coding starts

Three answers change what gets built, not just how. Everything marked ⚠️ depends on one.

| # | Question | Blocks |
|---|---|---|
| B1 | Is **Live Classes** in launch scope? (§3.4 B) | All of Epic J |
| B2 | Which **practice modes** ship at launch? (§3.4 A) | Epic H sizing |
| B3 | **Quiz** lessons — build or drop? (§3.4 E) | E4 |

*(The former "do instructors log in" blocker is resolved — no third role.)*

Not blocking, but needed before the relevant epic: content-authoring backlog for 13 lessons (§3.4 F), class-recording retention (§3.4 J), groups-vs-levels, student creation path, notification channels, browser matrix.

---

## Epic A — Foundations

| ID | Task | Size | Depends on |
|---|---|---|---|
| A1 | FastAPI skeleton, config/settings, Mongo + Beanie wiring, health check | S | — |
| A2 | `User` model, JWT auth (login/refresh/logout), password hashing, two-role guards (Student, Administrator/Instructor) | M | A1 |
| A3 | Password reset flow (time-limited token, no account-existence leakage) — FR-005 | S | A2 |
| A4 | Remaining models from plan §5: `LiveSession`, `RecordingSubmission`, `TopicContent`, `AuditLog`, `AlertLog`, `SessionEntitlement`, `PlatformAvatarConfig`, `NotificationPreference` | M | A1 |
| A5 | Shared `transition()` state-machine helper + transition tables (plan §10.4) with exhaustive tests | S | A4 |
| A6 | Audit-log write helper, transactionally linked to the action it records — FR-054/FR-096 | S | A4 |
| A7 | Login screen, session handling, role-based routing | M | A2 |
| A8 | Minimal account screen — display name + password only; **not** a settings area (§3.5) — FR-006 | S | A7 |
| A9 | Instructor creates/invites a student (resolve invite-vs-create first) | M | A2 |
| A10 | **"Preview as student"** — instructor views a chosen student's assigned experience; read-only (no sessions/submissions/scores written against that student) and audit-logged as impersonation | M | A7, A6 |

## Epic B — Recording pipeline *(start here after A; smallest gap, ships real value fastest)*

| ID | Task | Size | Depends on |
|---|---|---|---|
| B1 | `POST /submissions` + Cloudinary `upload_large()` chunked upload via `BackgroundTasks` — FR-REC-007 | M | A4 |
| B2 | Wire the existing `Recorder` UI to the real endpoint; replace blob-only state with server round-trip | M | B1, A7 |
| B3 | Server-side replace semantics for **all** submission kinds via `replaces` — FR-REC-008 (today only the Friday video replaces correctly) | S | B1 |
| B4 | Max-duration auto-stop + pre-cutoff warning — NFR-REC-001 | S | B2 |
| B5 | Upload retry/resume; never lose a take on a network blip — NFR-REC-003 | M | B2 |
| B6 | Ownership-checked playback URLs (owner or admin only) — FR-REC-016 | S | B1, A2 |
| B7 | **New screen:** Student's own submissions grouped by topic — FR-REC-011, missing entirely today | M | B1, A7 |
| B8 | Admin all-submissions + per-student views backed by real queries; live unreviewed count; make the filter chips actually filter the submissions panel — FR-REC-012–015 | M | B1 |
| B9 | 7-day TTL cleanup job (delete Cloudinary asset, set `media_deleted`) + "expired" empty state in both student and admin views | M | B1 |
| B10 | Device-unplugged-mid-recording handling — FR-REC-010 edge case | S | B2 |

## Epic C — Content pipeline

| ID | Task | Size | Depends on |
|---|---|---|---|
| C1 | Unify the two content structures (`curriculum` catalogue + `program.topics`) into one Topic entity — §3.4 F | M | A4 |
| C2 | Topic CRUD API + admin builder wired to real persistence (today it edits in-memory state only) | M | C1 |
| C3 | Extend `TopicContent` and the builder UI for the richer `.docx` shape: warm-up questions, multi-part guided questions, phrase groups by function, themed vocabulary with examples, sentence starters, practice schedule (plan §4.1) | L | C2 |
| C4 | Transcript fetch via `youtube-transcript-api` (`BackgroundTasks`) | S | C1 |
| C5 | Gemini audio-transcription fallback: transient `yt-dlp` audio extract → transcribe → delete | M | C4 |
| C5b | **Audio chunking for long files** — split with overlap above a configurable threshold, transcribe sequentially, stitch and de-duplicate the overlap; per-chunk retry; fail the whole transcript if a chunk can't be recovered (plan §6) | M | C5 |
| C6 | Teacher review queue: `PENDING_REVIEW` → `APPROVED_FOR_AI`, with the approve endpoint — FR from original plan §5 | M | C4 |
| C7 | YouTube IFrame Player API embed with real progress tracking, replacing the click-a-PNG gate — §3.4 G | M | C1 |
| C8 | Prompt-assembly service reproducing the §3.4 K contract, extended for C3's new fields; verify against Gemini Live's context budget | M | C3 |

## Epic D — Entitlements *(small, high-value, currently a demonstrated hole)*

| ID | Task | Size | Depends on |
|---|---|---|---|
| D1 | Enforce topic/level scope: Standard = assigned group's topic set, Pro = hand-picked list. Reject out-of-scope topic access server-side — §3.4 D, §3.5 | M | A4, C1 |
| D2 | UI: a student sees **only** their assigned content — the cross-level Lessons catalogue shouldn't exist in that form for students (§3.5). Verified hole: an Intermediate student can currently open Advanced | M | D1 |
| D3 | 15-minute cap (Standard, fixed) + instructor-granted per-student `duration_override_minutes` (Pro), audited | S | A6, D1 |
| D4 | Pre-flight entitlement check before any LiveKit room is created — FR-035 | S | D1 |
| D5 | Instructor-facing plan assignment wired to real persistence (the `AssignPlanModal` flow, today in-memory only) | M | D1 |

## Epic E — Lesson experience

| ID | Task | Size | Depends on |
|---|---|---|---|
| E1 | Sequential unlock rules enforced server-side (currently client-only) | S | C1 |
| E2 | Lesson completion tracking + challenge day progression | M | E1 |
| E3 | Friday check-in state model: distinguish missed / current / locked / submitted — today all render an identical 🎥 — §3.4 J | S | B1, E2 |
| E4 | Quiz lesson type: data model, authoring UI, player UI, scoring ⚠️B3 — §3.4 E | L | C2 |
| E5 | Accessibility fixes: challenge day-cells as real buttons; keyboard reachability | S | — |

## Epic F — Maya live sessions *(the core AI feature)*

| ID | Task | Size | Depends on |
|---|---|---|---|
| F1 | **Avatar vendor spike** — SpatialReal vs ProtoFace head-to-head on latency, cost/min, state-event fidelity (both confirmed LiveKit-native) | M | — |
| F2 | LiveKit token minting endpoint, room provisioning/teardown — FR-017/018 | M | A2 |
| F3 | LiveKit Agents worker: Gemini Live plugin wired to C8's prompts | L | C8, F2 |
| F4 | `AvatarProvider` Strategy interface + the chosen vendor's implementation (plan §10.1) | M | F1, F3 |
| F5 | Frontend LiveKit client: publish mic, subscribe to Maya's synced A/V — FR-020/021 | L | F2 |
| F6 | Full 7-state session state machine + `end_reason`, persisted via LiveKit webhooks — FR-032, FR-055 | M | A5, F2 |
| F7 | Progressive connection status UI (requesting → connecting → joining → live) — FR-019 | S | F5, F6 |
| F8 | Listening/Thinking/Speaking states from real `agent_state_changed` events — FR-026–028 | M | F3, F5 |
| F9 | Barge-in interruption handling — FR-025 | M | F3, F5 |
| F10 | Mic mute + Avatar-output mute controls (**new UI**) — FR-022/023 | S | F5 |
| F11 | Pause/resume — FR-033 | M | F6 |
| F12 | Reconnection with bounded retries, `Connection Failed`, manual retry — FR-029–031, FR-034 | M | F6 |
| F13 | Idle timeout with warning; enforce the 15-min cap — FR-036, D3 | M | F6, D3 |
| F14 | **Remove** the prototype's manual "next question" control; Maya drives progression — §3.4 J | S | F3 |
| F15 | Turn-by-turn `transcript_history` persistence (text only — the call is never recorded) — FR-058 | M | F6 |
| F16 | Post-session summary with duration and end reason — FR-064 | S | F6 |
| F17 | Camera-never-activated enforced as a lint/test rule, not an accident — FR-024/NFR-008 | S | F5 |

## Epic G — AI scoring & reports

| ID | Task | Size | Depends on |
|---|---|---|---|
| G1 | Scoring pipeline: `transcript_history` → six-skill scores + summary, via `BackgroundTasks` | L | F15 |
| G2 | Settle the 4-vs-6 skill inconsistency and make it consistent everywhere — §3.4 J | S | G1 |
| G3 | Reports API + admin list/filter wired to real data | M | G1 |
| G4 | **New screen:** full report detail view — "Open full report →" is a dead button today | M | G3 |
| G5 | Replace fabricated `mockTopicSkills` scores with a genuine "no session yet" empty state — §3.4 I | S | G3 |
| G6 | Per-topic analysis + trend endpoints behind the student detail page | M | G1 |

## Epic H — Practice modes ⚠️B2 *(§3.4 A)*

| ID | Task | Size | Depends on |
|---|---|---|---|
| H1 | Add `mode` to `LiveSession`; per-mode history and last-score aggregates | S | F6 |
| H2 | Prompt-builder Strategy per mode behind one interface (plan §10.1) | M | C8, H1 |
| H3 | Free Talk — no topic context; needs its own prompt and scoring path | M | H2 |
| H4 | Vocabulary Builder, Mock Interview, Debate Practice prompt strategies | M | H2 |
| H5 | Pronunciation Drill — **feasibility spike first**: can Gemini Live deliver phoneme-level "instant feedback"? Design follows the answer | M | H2 |

## Epic I — Admin oversight, gamification, notifications

| ID | Task | Size | Depends on |
|---|---|---|---|
| I1 | Force-end a live session, recorded as `administrator_terminated` — FR-083 | S | F6, A6 |
| I2 | Avatar/platform config panel (`PlatformAvatarConfig`, incl. `max_concurrent_sessions`) — FR-085 | M | A4 |
| I3 | Error/alert log with dedup + admin view — FR-066, FR-086 | M | A4 |
| I4 | Audit log viewer — FR-096 | S | A6 |
| I5 | Real analytics endpoints replacing hardcoded metrics — FR-084 | L | G1 |
| I6 | Streak & consistency tracking | M | E2 |
| I7 | Badge award-evaluation engine (6 badges, distinct criteria) — §3.4 H | M | I6 |
| I8 | Milestones incl. the milestone→entitlement grant ("bonus 1:1 coaching session") | M | I7, D1 |
| I9 | In-app message catalog: every error maps to specific copy, no raw errors — FR-065 | M | F12 |
| I10 | Idle-timeout, reconnection, and "taking longer than usual" notices — FR-068–070 | S | F13, I9 |
| I11 | ~~Student settings screens~~ — **descoped** per §3.5. FR-072/FR-073 are out; FR-071 is covered by A8. What remains is the **instructor-facing** platform config, which is I2. | — | — |
| I12 | Wire up the inert topbar controls (global search, notification bell) or remove them; make the sidebar's `.sideBottom` reachable on mobile | S | A8 |

## Epic J — Live Classes ⚠️B1 *(§3.4 B — needs its own requirements doc before estimating)*

| ID | Task | Size |
|---|---|---|
| J0 | **Write the requirements specification** — this area has none | M |
| J1 | Class/instructor/enrolment data model | M |
| J2 | Scheduling, capacity, enrolment/booking, reschedule | L |
| J3 | Multi-party LiveKit rooms + host controls | XL |
| J4 | Attendance tracking | M |
| J5 | Class recording, storage, retention, playback | L |
| J6 | Teaching-staff roster, profiles, ratings (staff are Administrators per §3.5 — no separate role to build) | M |

## Epic K — Deploy

| ID | Task | Size | Depends on |
|---|---|---|---|
| K1 | Multi-stage Dockerfile (FastAPI) + separate Agents-worker image, with `ffmpeg` | M | — |
| K2 | Environment/secrets config, staging deploy | M | K1 |
| K3 | Production deploy; reconsider Hostinger given LiveKit Cloud removes the self-hosted-media need | M | K2 |
| K4 | Monitoring/observability on session success rate and job failures | M | K3 |

## Post-launch

| ID | Task | Trigger |
|---|---|---|
| P1 | Migrate recordings Cloudinary → Cloudflare R2 | Cost/bandwidth data |
| P2 | Rehost lesson videos to R2, replace YouTube embeds | Traffic/reliability data |
| P3 | Celery + broker + workers, replacing `BackgroundTasks` | When `BackgroundTasks` limits actually bite |
| P4 | Localization / RTL / Arabic font | Stakeholder decision (deferred) |

---

## Suggested order

1. **A** (foundations) → **B** (recordings) — real backend shipping quickly, no external unknowns.
2. **F1 avatar spike in parallel from day one** — external dependency, unknown lead time.
3. **C** (content) + **D** (entitlements) — D is small and closes a demonstrated hole.
4. **F** (Maya sessions) — the core feature, once C8 and F1 are done.
5. **G** (scoring) → **H** (modes) → **I** (admin/gamification).
6. **K** (deploy) — ideally started earlier as a thin staging path rather than left to the end.
7. **J** (Live Classes) — only once B1 is answered; likely its own project.
