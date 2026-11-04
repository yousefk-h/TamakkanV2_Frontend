# Tamakkan — Consolidated Platform Plan (v2)

**Purpose of this document:** `AI_Speaking_Platform_Project_Plan.md` (the original 7‑day FastAPI/Gemini plan), `LiveKit-Avatar-Platform-Requirements.md`, and `Audio-Video-Recording-Requirements.md` were written somewhat independently and disagree with each other and with what's actually in this repository. This document reconciles all three against the real, running frontend (`app/page.tsx`) and against the three source-of-truth lesson documents (`Daily Routine 1.docx`, `Talking about Music.docx`, `Is Travelling...docx`), then gives one buildable plan.

**Method:** ran the app locally (`npm run dev` via Vite), walked the Student and Admin dashboards end‑to‑end, read every line of `app/page.tsx` (962 lines, single-file React prototype), read both requirement specs in full, and converted the three `.docx` lesson files to inspect the actual authored content shape.

---

## 1. The headline finding: this is a frontend prototype, not the platform described in the plan

`AI_Speaking_Platform_Project_Plan.md` marks Days 1–6 with "✓" as if a FastAPI + MongoDB + Gemini Live backend already exists. **It does not.** What exists is:

- A single Next.js/React client component (`app/page.tsx`) with **zero backend, zero database, zero auth, zero real AI, zero LiveKit**.
- All "data" — students, submissions, reports, classes, activity feed — is hardcoded JS arrays (`initialStudents`, `reports`, `practiceSessions`, …) or `useState`, reset on every page reload.
- "Discuss with Maya" is a static photo (`/maya-avatar.png`) with a 3-state `idle | live | ended` toggle — no microphone capture, no WebSocket, no LiveKit room, no Gemini call.
- Audio/video **recording** (`Recorder` component) is genuinely real — it uses `getUserMedia` + `MediaRecorder` — but the result is an ephemeral in-browser `Blob` URL that is never uploaded anywhere and vanishes on refresh.
- The Student/Admin toggle in the sidebar is a UI switch, not authentication. `CURRENT_STUDENT_NAME` is a hardcoded constant.

This isn't a criticism of the prototype — it's an excellent, high-fidelity UX spec that both requirement docs correctly treat as "the current build" baseline. But it means **the 7‑day roadmap in the original plan describes a rebuild-from-zero, not a continuation**, and every FR/NFR in the two requirement specs is a gap to close, not a regression to check.

---

## 2. Reconciling a real architectural conflict between the two backend-facing documents

`AI_Speaking_Platform_Project_Plan.md` §1 and §4.2 specify the real-time voice layer as a **direct FastAPI↔Gemini Live WebSocket bridge** — the browser talks to FastAPI, FastAPI relays audio to `google-genai`'s `BidiGenerateContent`.

`LiveKit-Avatar-Platform-Requirements.md` §13 requires **LiveKit** as the real-time media transport, with Maya delivered as **a LiveKit room participant** producing *synchronized audio + video* (FR-021), with distinct Listening/Thinking/Speaking visual states (FR-026–028), reconnection semantics LiveKit itself exposes (FR-029), and mute/output controls (FR-022/023).

**These are incompatible as written.** A raw Gemini Live WebSocket gives you bidirectional *audio only* — there is no video track, no LiveKit room, no participant model, and none of the connection-state machinery FR-029–031 assumes. You cannot satisfy the Avatar spec by building the original plan's §4.2 code as-is.

### 2.1 Resolution (recommended)

Keep Gemini as the conversational brain, but stop hand-rolling the transport. Insert a **LiveKit Agents** worker between the browser and Gemini:

```
Browser (LiveKit Web SDK)
   │  WebRTC (audio in, audio+video out, data channel for text/state)
   ▼
LiveKit Cloud / self-hosted LiveKit server  ──────────────┐
   │  room dispatch                                        │
   ▼                                                        │
LiveKit Agents worker (Python)                              │
   ├─ STT/LLM/TTS pipeline: livekit-plugins-google           │
   │  (Gemini Live / "Realtime" plugin — reuses the exact    │
   │   Gemini Live API the original plan already commits to) │
   ├─ Avatar bridge: SpatialReal or ProtoFace (piloting both)│
   │  renders Maya's synced video from the agent's audio     │
   └─ emits agent_state_changed (listening/thinking/speaking) │
        → maps directly to FR-026, FR-027, FR-028             │
                                                               │
FastAPI backend (unchanged role) ─────────────────────────────┘
   ├─ issues LiveKit room access tokens per authenticated user
   ├─ owns REST: auth, submissions, admin, reports, topics
   ├─ never holds the Gemini socket itself
   └─ persists LiveSession records from LiveKit webhooks
      (room_started, participant_joined, track_published, room_finished)
```

This is a small change to the original plan, not a rewrite: FastAPI keeps every responsibility from §2–§7 of the original plan except "hold the Gemini WebSocket," which moves into a LiveKit Agents worker process (deployed as its own container alongside the existing Dockerfile). The `livekit-agents` skill already available in this session covers exactly this pattern, including testing.

**Vendor decision (confirmed):** the avatar is settled to a pilot between **SpatialReal** and **ProtoFace** — both to be trialed before committing, and both are confirmed to have native LiveKit support. That resolves the integration-risk caveat this document originally raised: the diagram above (avatar bridge as a LiveKit Agents plugin, no custom track-bridge) stands as designed, for either vendor. The only remaining work in Phase 4 is a straight head-to-head trial, scored on: video latency stacked on top of Gemini's own ~2s NFR-002 budget, cost per session-minute, and how directly each maps to Listening/Thinking/Speaking (FR-026–028) through LiveKit Agents' own `agent_state_changed` events.

---

## 3. Backend features required to bring the existing UX to life

The frontend is understood to be a UX/interaction design pass only — every item below is scoped as **"what backend capability does the already-designed screen need behind it,"** not as a defect in the prototype. Where the UX doesn't yet have a screen for something the spec requires (a handful of cases), that's called out separately in §3.3.

### 3.1 "Discuss with Maya" — backend features required

| UX already shows | Backend feature to build |
|---|---|
| Start/End session button, connecting → live → ended flow | Real LiveKit room provisioning + Agents worker dispatch on start; clean room teardown + media stop on end (FR-017/018) |
| A single "Ready to call" status line | Drive that same status element from real sub-events (requesting access → connecting → Avatar joining → media live), not richer UI — just a real event source (FR-019) |
| — (no mic capture exists on this tab yet) | Open the mic and publish the track into the LiveKit room while connected+unmuted (FR-020) |
| Static Maya photo | Subscribe to and render the avatar vendor's synced audio+video track (FR-021) |
| — (no mute controls in the UX yet) | Mic mute/unmute and local Avatar-output mute, both as thin publish/subscribe toggles (FR-022/023) |
| N/A (no camera anywhere in this flow) | Keep it that way — enforce it as a lint/test rule, not just an accident of an unfinished build (FR-024, NFR-008) |
| Question index just cycles on a button click | Real interruption handling: detect user speech while Maya's track is playing and stop/transition per the barge-in policy (FR-025) |
| Two caption strings ("Maya is asking" / static text) | Three real, distinct states driven by the Agents worker's `agent_state_changed` events, not UI copy (FR-026–028) |
| — (nothing to reconnect, there's no network) | Reconnect logic against real LiveKit disconnect events, bounded retries, `Connection Failed` after exhausting them (FR-029–031) |
| 3 ad-hoc states (`idle/live/ended`) | The full 7-state machine (§10 below covers whether that needs a library) plus an `end_reason` field (FR-032) |
| — | Pause/Resume against a held LiveKit room rather than a new session (FR-033) |
| — | Retry action re-running session start cleanly from `Connection Failed` (FR-034) |
| Standard/Pro plan + hand-picked Pro topics exist in `AssignPlanModal` today, but nothing downstream enforces them | An entitlement check (`SessionEntitlement`, §5) that runs *before* any room is created: reject a topic outside a Standard student's assigned level, or outside a Pro student's hand-picked list, and apply the 15-minute cap (or a granted `duration_override_minutes`) (FR-035) |
| — | Server-side idle timer with a warning, ending/pausing the room on expiry (FR-036) |
| — (nothing is saved when a session ends today) | `LiveSession` document written at start, updated on every transition, so a crash mid-session still leaves a record (FR-055–058) |
| — | A message catalog mapping every handled failure to specific copy, no raw errors surfaced (FR-063–070) |
| No session controls in Admin at all | Force-end endpoint + button, writing `Administrator-terminated` as the end reason (FR-083) |
| Admin has general (mocked) academy analytics, nothing session-specific | Avatar/session config panel, error/alert log with dedup, audit log (FR-084–086, FR-096) |

### 3.2 Audio/Video recording — backend features required

The capture *interaction* is already real (`getUserMedia` + `MediaRecorder`, working preview/discard/re-record) — this is the smallest lift in the whole plan. What's missing is entirely server-side:

| UX already shows | Backend feature to build |
|---|---|
| Submit button on a previewed recording | `POST` endpoint that accepts the blob, uploads it to Cloudinary (§6), and writes a `RecordingSubmission` with student/kind/label/duration/date/`reviewed=false` (FR-REC-007) |
| Re-recording replaces the prior take, for the Friday video only | Same replace semantics need to live server-side for **every** submission kind, via the `replaces` link field (§5), not rely on which React component happens to hold state (FR-REC-008) |
| Admin's per-student page groups recordings by topic | The **same grouped-by-topic view needs a Student-facing endpoint too** — there's no such screen for the Student today anywhere in the nav, this is a genuine missing screen, not just a missing API (FR-REC-011) |
| Admin all-submissions + per-student views | Real query endpoints behind both (currently rendering hardcoded arrays); reviewed-count must be a live query, not client math (FR-REC-012–015) |
| Anyone can currently "see" any submission because there's no auth | Ownership check on every playback URL: requester must be the submission's owner or an Administrator (FR-REC-016) |
| Recorder runs until manually stopped | Max-duration auto-stop with a pre-cutoff warning (NFR-REC-001) |
| Submit assumes the network always works | Retry/resume on upload failure, keeping the local recording so the student never has to redo the take (NFR-REC-003) |

### 3.3 Second-pass findings — things neither requirement doc nor my first pass called out

A closer look at `app/layout.tsx`, `app/globals.css`, and the exact wiring of every header control surfaced a few real items:

- **The product signals an Arabic-speaking audience with zero i18n infrastructure to back it up.** The sidebar brand mark renders "Tamakkan" next to "**تمكّن**", and roughly half of the mock student/instructor names are Arabic (Lina Haddad, Omar Saleh, Yazan Ali, Rima Barakat, Karim Zaid, Ms. Farah Odeh, Mr. Karim Aziz…). But `<html lang="en">` is hardcoded in `layout.tsx`, there's no `dir="rtl"` anywhere, and the only font loaded (`Geist`, `subsets: ["latin"]`) doesn't even cover Arabic glyphs — that Arabic text is silently falling back to whatever the OS provides. If Arabic-market support is real, it needs a locale strategy (routing, RTL layout flip, an Arabic-covering font) added as its own backend+frontend workstream, not assumed to fall out of the current build.
- **The global top bar's Search, notification bell, and Settings button are all inert** — no `onClick`, no bound `value`, literally dead markup (`app/page.tsx:239, 250`). This is distinct from the page-level searches (Lessons catalog, Student management table), which *are* real, working, client-side filters. Worth being precise about which is which when scoping FR-071 (account/profile settings) and any notification-center feature — neither has so much as a placeholder screen today, only a dead button.
- **There is no profile view/edit screen anywhere.** The topbar shows a hardcoded name/role/initials per view (`"Alex Morgan" / Intermediate` for Student, `"Sarah Khalil" / Administrator` for Admin) with no way to open or edit them. FR-006 needs an actual screen, not just an API.
- **Standard vs. Pro plan is a data label only**, set in `AssignPlanModal`, with nothing downstream reading it except the topic list shown to the student — confirms the FR-035 entitlement gap above is real end-to-end, not just missing on the session side.

### 3.4 Pre-implementation verification walkthrough — scope discovered

A second, click-by-click pass through every screen in the running app (not the code) surfaced scope that **neither requirement document covers and that earlier drafts of this plan under-weighted**. These are ordered by how much they change the plan.

**A. There are six AI Practice modes, not one.** The AI Practice screen offers *Topic Discussion, Free Talk, Pronunciation Drill, Vocabulary Builder, Mock Interview, Debate Practice* — each with its own description, its own "sessions completed" count, and its own "Last score". Verified by clicking: **every one of the six "Start" buttons opens the same Course Player on a lesson.** Free Talk — described as "open conversation on any subject you choose" — landed me in "Talking About Your Daily Routine."

This matters a lot: the LiveKit requirements doc only ever specifies *one* session type ("Discuss with Maya", bound to a topic). But the product promises six behaviourally distinct AI conversations. Pronunciation Drill ("instant feedback") in particular implies phoneme-level assessment, which is a different capability from conversational scoring. Consequences: `LiveSession` needs a `mode` field; the agent needs one system-prompt strategy per mode; and Free Talk has **no topic context at all**, which breaks the "inject the approved transcript" assumption the whole content pipeline is built around.

**B. Live Classes is an entire uncovered product area — and a second, larger LiveKit use case.** Both the Student and Admin dashboards carry a full human-instructor programme: group classes with capacity ("12/15 seats"), 1:1 coaching, a **Join** button, Reschedule, attendance tracking (88% avg), a four-person instructor roster with ratings and class counts, an admin "Live now" metric, "＋ Schedule class", and a Past tab whose classes offer **"Watch recording"**.

Neither requirement doc mentions any of this — the LiveKit doc explicitly scopes itself to the Maya avatar, and the recording doc to async self-recordings. Multi-participant human classes are a *bigger* LiveKit build than the 1:1 avatar (multi-party rooms, moderation/host controls, scheduling, enrolment and capacity, calendar, class recording + storage). It should be its own phase and its own requirements document; it must not be smuggled into the Maya workstream.

**C. Instructors are not a third role — resolved.** The Instructor *is* the Administrator; there are exactly two roles, as both requirement docs originally stated. See §3.5, which this walkthrough finding turned out to be a symptom of rather than a separate issue. (The four named teaching staff on the Classes screen remain a Live Classes concern — Epic J — not an auth-model one.)

**D. The entitlement hole is real, and I reproduced it.** Signed in as Alex Morgan (Intermediate, Standard), I switched the Lessons catalogue to **Advanced** and successfully opened "Presenting ideas with confidence" — a startable lesson with a live Course Player. That directly violates the rule just confirmed for Standard plans ("lessons from a certain level"). The fix is both backend enforcement *and* a UI change (hide or lock other levels for Standard students).

**E. Three lesson types exist; one is implemented.** Lessons are typed *Video + Discussion*, *Speaking drill*, or *Quiz*. The Course Player renders the same five tabs regardless. **There is no quiz UI and no quiz data model anywhere** — not in `TopicConfig`, not in the original plan's schema. Either build it or drop the type.

**F. Content lives in two disconnected structures.** The lesson catalogue (`curriculum`, 16 lessons across three levels) and the rich authored content (`program.topics`, **3** topics — exactly the three `.docx` files) are separate arrays joined only by *matching title strings*. The admin builder can edit only the three. The other 13 lessons silently fall back to generated placeholder text ("A short video introducing …", `youtube.com/watch?v=example`) — I confirmed this on the Advanced lesson above, and the Topics screen itself admits it: *"3 published topics"*. The backend must unify these into one Topic entity, and there's a **content-authoring backlog of 13 lessons** that is a project dependency, not a coding task.

**G. "Watched the video" is one click on a static image.** The Maya session is correctly gated (`Start session` is genuinely `disabled` until watched — verified), but the gate is satisfied by clicking a play icon on a PNG; nothing is actually played or tracked. Combined with the confirmed *direct YouTube embed* decision, real progress tracking requires the **YouTube IFrame Player API** (`onStateChange`, `getCurrentTime`) rather than a bare `<iframe>`. That's a concrete architectural refinement to §6.

**H. There is a whole gamification subsystem with no backend.** Six badges with distinct earn criteria (12-day streak, 150+ phrases, first live class, 90+ score, +20% growth, level completion), three milestones, streak/consistency tracking — and crucially the Day-20 milestone **"Unlocks a bonus 1:1 coaching session"**, i.e. an achievement that grants an *entitlement* against the Live Classes system. Needs an award-evaluation engine and creates a real cross-system dependency.

**I. Un-practised topics display fabricated scores.** On a student's detail page, topics labelled "No session yet" still render a full six-skill breakdown with numbers — these come from a hash function (`mockTopicSkills`). In the real build this must be an explicit empty state; shipping it as-is would show admins invented assessment data.

**J. Smaller but real:**
- **"Open full report →" is a dead button** — no report detail view exists anywhere.
- **The live-session controls are inverted for production.** The only in-call controls are "next question" (a *manual* advance) and "end". In the real build the manual advance should **disappear** (Maya drives the conversation), while mute, pause and retry must be **added**. This is a UI subtraction as well as an addition.
- **Post-session state shows no duration, score, or end reason**, which FR-064 requires.
- **Reports carry 4 skills; the skill breakdown shows 6.** Pick one and make it consistent.
- **The 30 challenge day-cells are clickable `<div>`s** — no button role, no keyboard access, absent from the accessibility tree entirely.
- **Friday cells don't distinguish state**: day 5 (past, never submitted), day 12 (current) and days 19/26 (locked) all render an identical 🎥. A missed check-in is invisible.
- **On mobile (375px) the sidebar becomes a bottom bar and `.sideBottom` is `display:none`** — Settings and support are completely unreachable. No horizontal overflow though, and no console errors anywhere in the walkthrough.
- **Class recordings are a third media type** with no stated retention — distinct from Maya sessions (never recorded) and student self-recordings (7-day TTL).

**K. The Gemini prompt contract, captured verbatim.** The builder's Step 4 preview is the authoritative template the backend must reproduce:

```
ADMIN INSTRUCTION
{avatarPrompt}

VIDEO TRANSCRIPT
{transcript}

TRANSCRIPT SUMMARY
{videoSummary}

TARGET LANGUAGE
{vocabulary, comma-separated}

DISCUSSION QUESTIONS
1. … 2. … 3. …
```

Two notes: the mock "transcript" is a single summary-length paragraph, whereas a real 15–20 minute video transcript runs to thousands of words — worth checking against the Gemini Live session's context budget. And none of the richer `.docx` structures (warm-up questions, phrase groups, themed vocabulary, sentence starters) have a slot in this template, so the template itself must grow alongside §4.1's schema.

### 3.5 Confirmed operating model — instructor-driven, student-passive

This is the single most clarifying decision in the project so far, and it **removes** more work than it adds. Stated plainly:

> **The Instructor is the Administrator.** They create students, set each student's plan, choose their topics and levels, set their session limits, and control every aspect of the learning experience. **The student cannot configure anything** — they only see what the instructor has assigned them.

Consequences, in order of impact:

**1. Two roles, not three.** Instructor = Administrator. This confirms both requirement docs and closes §3.4 C.

**2. Large parts of the "student settings" scope disappear.** Since students configure nothing, these shrink to near-zero or vanish outright:
- FR-072 (session-level settings) and FR-073 (avatar/persona selection) — **out of scope**; the instructor owns these.
- FR-071 (account/profile settings) — reduces to the minimum a person needs for their own account (display name, password, and notification preferences if out-of-app channels are ever added). Not a settings *area*.
- The Lessons catalogue must not let a student browse other levels at all — §3.4 D's entitlement hole isn't just an enforcement bug, it's a screen that shouldn't exist in that form for students.

**3. The prototype's Student/Admin toggle is a real feature, not scaffolding.** I previously wrote it off as a UI switch to be replaced by real auth. It is in fact the instructor's **"preview as student"** mode — verifying that what they've assigned looks right from the learner's side. That needs building deliberately, with two decisions attached: preview should be **read-only** (viewing a student's assigned experience without generating sessions, submissions, or scores against their record), and every entry into preview should be **audit-logged** (FR-096), since it is a form of impersonation.

**4. Student creation is instructor-initiated.** Students are created/invited by the instructor rather than self-registering. One wrinkle to reconcile: the prototype's pending queue labels new students *"Signed up — no class assigned yet"* while the modal is titled *"Invite a new student"* — implying invite-then-complete-signup. Worth confirming which, but either way FR-002's open self-service sign-up is not the model.

**5. Standard vs. Pro, restated precisely** (refines §5's `SessionEntitlement` and supersedes the looser "one level vs. any level" phrasing used earlier in this document):

| | **Standard** | **Pro / custom** |
|---|---|---|
| Audience | A **group** of students sharing one assigned set of topics and videos | An individual student, personalised |
| Content | A fixed topic/video set (today: one level's curriculum) | Hand-picked topics, spanning **any** level |
| Session limit | **Fixed** (15 minutes) | Instructor may **raise** it per student |
| Set by | Instructor | Instructor |

One modelling question this raises, flagged rather than assumed: today a "group" is exactly a level — `assignedClass` holds `"Intermediate"`, and the assign modal says *"Assign the whole level curriculum"*. If instructors will eventually want **named cohorts** ("Tuesday evening B2 class") with their own topic sets independent of level, that's a `StudentGroup` entity rather than a level string. **Recommendation: model it as level-for-now** (§10's YAGNI rule — one implementation, no speculative generality) and revisit only if named cohorts are actually requested. Noted in §8.2.

**Architecture decisions re-checked against all of the above:** every decision from §2, §5, §6 and §10 still holds. Two are *strengthened* — multi-party Live Classes make LiveKit the clearly correct transport (a raw Gemini socket could never serve it), and the six practice modes are a textbook fit for §10.1's Strategy pattern (one prompt-builder per mode behind one interface, no new architecture). Two need refinement, both noted above: YouTube embedding needs the IFrame Player API (G), and the prompt template must expand (K).

---

## 4. Content model gap — what the `.docx` files reveal

The three lesson `.docx` files ("Daily Routine 1", "Talking about Music", "Is Travelling the Best Way to Learn About Cultures?") are the actual source-of-truth authoring format teachers already use. They are **far richer** than the `TopicConfig` type `ProgramBuilder` currently edits.

**What a real lesson document contains:**
1. One or more YouTube links (the "Is Travelling" doc has *two*).
2. A **warm-up discussion** section (open, low-stakes questions before the main content) — currently has no home in `TopicConfig`.
3. **Multi-part guided speaking questions** ("Part 1: Introduction", "Part 2: Cultural Experiences", "Part 3: Personal Opinion") — currently flattened into one `questions: string[]`, losing the part structure.
4. **Useful phrases/expressions, categorized by rhetorical function** (Starting your speech / Describing / Giving opinions / Concluding) — currently there is no phrases field at all; only a flat `vocabulary` string exists.
5. **Vocabulary organized by theme, each with a worked example sentence** (e.g. "Culture shock: *She experienced culture shock when she moved from a small town to a big city.*") — currently `vocabulary` is a bare comma-separated string with no theming or examples.
6. **Sentence starters + fully worked example answers** for building a structured speech (Introduction → Describe → Opinion) — not modeled at all today.
7. (Daily Routine only) A **suggested Pomodoro practice schedule** (25-min listening → break → shadowing → break → vocab notes → break → record) — not modeled at all.

**Why this matters for the plan:** `CourseVideoContext` in the original plan's §3.3 schema, and the `TopicConfig` the frontend already uses, both need to carry this structure through to the Gemini/LiveKit agent's system prompt — the richer the structured context, the better Maya's questions and follow-ups will be, and the more the "Discuss with Maya" experience will match what the `avatarPrompt` preview at the bottom of `ProgramBuilder`'s Step 4 already promises admins ("Full transcript + summary + target phrases are automatically added behind this instruction").

### 4.1 Proposed richer content schema

```python
class UsefulPhraseGroup(BaseModel):
    function: str        # "Starting your speech", "Giving opinions", "Concluding", ...
    phrases: list[str]

class VocabularyItem(BaseModel):
    term: str
    theme: str            # "Travel", "Culture", "Describing Experiences", ...
    example_sentence: str

class GuidedQuestionPart(BaseModel):
    part_title: str        # "Part 1: Introduction", ...
    questions: list[str]

class SentenceStarterBlock(BaseModel):
    stage: str             # "Introduction", "Describe your favorite artist", ...
    starters: list[str]
    worked_example: str

class PracticeScheduleBlock(BaseModel):
    duration_minutes: int
    activity: str          # "Listening practice", "Shadowing", "Vocabulary notes", "Record yourself"

class TopicContent(Document):          # extends/replaces CourseVideoContext's content fields
    youtube_urls: list[str]            # embedded directly at launch — see §6, no re-hosting yet
    warm_up_questions: list[str] = []
    guided_questions: list[GuidedQuestionPart] = []
    useful_phrases: list[UsefulPhraseGroup] = []
    vocabulary: list[VocabularyItem] = []
    sentence_starters: list[SentenceStarterBlock] = []
    suggested_practice_schedule: list[PracticeScheduleBlock] = []
    transcript_state: TranscriptState = TranscriptState.QUEUED
    raw_transcript: list[TranscriptSegment] = []
    approved_transcript: Optional[str] = None
    # no media_state / cloudinary_url on the video itself at launch — it's never downloaded or
    # re-hosted until the post-launch Cloudflare R2 migration (§6, §7 Phase 9)
```

`ProgramBuilder`'s Step 2/3 UI would grow a few more structured sub-editors (warm-up, guided parts, phrase groups, themed vocab), which is a UI-effort increase but not an architectural one — the wizard shape (Level → Topics → Content → Avatar Prompt → Review) already fits.

---

## 5. Updated data model (extends the original plan's §3, does not replace it)

Keep `User`, `RecordingSubmission`, `CourseVideoContext` (renamed/extended per §4.1 above), and `LiveSession` from the original plan. Add:

```python
# app/models/live_session.py — SessionState needs all 7 states + an end reason
class SessionState(str, Enum):
    NOT_STARTED = "not_started"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    PAUSED = "paused"
    DISCONNECTED = "disconnected"
    ENDED = "ended"
    CONNECTION_FAILED = "connection_failed"

class EndReason(str, Enum):
    USER_ENDED = "user_ended"
    IDLE_TIMEOUT = "idle_timeout"
    ADMIN_TERMINATED = "administrator_terminated"
    CONNECTION_FAILURE = "connection_failure"
    MAX_DURATION = "max_duration_reached"

class LiveSession(Document):
    student: Link[User]
    video_context: Optional[Link[TopicContent]] = None
    livekit_room_name: str
    state: SessionState = SessionState.NOT_STARTED
    end_reason: Optional[EndReason] = None
    transcript_history: List[InteractionTurn] = []   # structured turn log ONLY — see note below
    avatar_vendor: str                      # which avatar plugin rendered this session
    started_at: datetime
    ended_at: Optional[datetime] = None
```

**Confirmed: the live "Discuss with Maya" call itself is never recorded.** No audio/video artifact of the session is captured or stored, and there's no playback for a past live session. `transcript_history` is still populated — it's a lightweight, structured (speaker/text/timestamp) turn-by-turn log, not a recording — because it's what feeds the AI scoring/report pipeline (the Admin's "AI Reports" screen) and satisfies FR-058. This cleanly separates "did we log what was said" (yes, always) from "did we record the call" (no, never) — the two were easy to conflate in the original spec's phrasing.

```python
# app/models/audit_log.py  — FR-054, FR-096
class AuditLog(Document):
    actor: Link[User]
    action: str                 # "role_change", "force_end_session", "config_change", ...
    target_type: str
    target_id: str
    before: Optional[dict] = None
    after: Optional[dict] = None
    at: datetime = Field(default_factory=datetime.utcnow)
```

```python
# app/models/alert_log.py — FR-066, FR-086
class AlertSeverity(str, Enum):
    INFO = "info"; WARNING = "warning"; CRITICAL = "critical"

class AlertLog(Document):
    kind: str                   # "avatar_startup_failure_burst", "service_outage", ...
    severity: AlertSeverity
    occurrences: int = 1        # dedup counter, per FR-066
    first_seen: datetime
    last_seen: datetime
    details: dict = {}
    acknowledged: bool = False
```

```python
# app/models/settings.py — FR-071–074, FR-085
class NotificationPreference(Document):
    user: Link[User]
    idle_timeout_warning: bool = True
    reconnection_notice: bool = True
    marketing_email: bool = False   # non-suppressible security notices are never modeled here — always sent

class SessionEntitlement(Document):     # resolves LiveKit-doc Open Question 7 — confirmed
    plan: Literal["Standard", "Pro"]
    max_session_duration_minutes: int = 15   # default for both plans
    duration_override_minutes: Optional[int] = None   # Pro only: an Admin can raise this per
                                                        # student, on request — never self-service,
                                                        # and every change is an AuditLog entry (FR-096)
    # No sessions-per-day quota exists — the Standard/Pro difference is content scope (below),
    # not a daily session count.

```

**Confirmed: the Standard/Pro distinction is content scope + session-limit flexibility, not a session-count quota.** See §3.5's table for the precise definition. Standard = a group of students sharing one assigned topic/video set (today: one level's curriculum) with a fixed 15-minute limit; Pro = an individual, personalised topic selection spanning any level, with a limit the instructor can raise. This is already what the prototype's `AssignPlanModal` does (verified in the walkthrough — it reads *"Standard class: assign the whole level curriculum"* / *"Pro custom plan: hand-pick topics from any level"*). The backend work is enforcement plus the override path, not new UI or a new plan-tier concept.

```python
class PlatformAvatarConfig(Document):   # singleton-ish document, FR-085
    default_idle_timeout_seconds: int = 90
    default_avatar_vendor: str
    max_concurrent_sessions: int = 50        # confirmed: a configurable platform setting, not a
                                              # hardcoded constant — 50 is the launch/"starter" value,
                                              # raised later via the Admin config panel, no code change
    reconnect_max_attempts: int = 3
    reconnect_backoff_seconds: list[int] = [1, 2, 4]
    recording_enabled_by_default: bool = False   # always False — the live session is never recorded
```

`RecordingSubmission` gains fields the current mock UI's gap analysis calls for:

```python
class RecordingSubmission(Document):
    student: Link[User]
    kind: SubmissionKind
    label: str
    state: RecordingState = RecordingState.SUBMITTED
    media_url: str                       # real Cloudinary URL at launch (see §6) — never a blob: URL
    duration_seconds: float
    reviewed: bool = False
    replaces: Optional[Link["RecordingSubmission"]] = None   # FR-REC-008 replacement history
    submitted_at: datetime
    expires_at: datetime                 # confirmed: submitted_at + 7 days
    media_deleted: bool = False          # set True once the cleanup job removes the Cloudinary asset
```

**Confirmed retention: 7 days for recordings.** A background job (§6) deletes the Cloudinary media object once `expires_at` passes and sets `media_deleted = True`. The submission *record* itself (label, duration, score linkage, reviewed status) is not deleted — only the playable media goes away after a week. This is worth being explicit about in the UI later: the Student's/Admin's "submissions by topic" view will keep showing the entry with its metadata, but playback will 404 or show an "expired" state past 7 days. Flagging this now so it's designed in from the start rather than discovered as a bug.

---

## 6. Updated system architecture

```
                         ┌───────────────────────────┐
                         │   Next.js Frontend (SSR)   │  ← already exists (this repo)
                         │  Student + Admin dashboard │
                         └──────────────┬─────────────┘
                                        │ REST + WebSocket (auth, submissions, admin)
                                        ▼
                         ┌───────────────────────────┐
                         │   FastAPI Backend (Docker) │
                         │  Auth · Submissions ·      │
                         │  Admin/Analytics · Topic   │
                         │  CMS · LiveKit token mint  │
                         └───┬──────────┬─────────┬───┘
                             │          │         │
              mints room JWT │          │         │ webhooks (room/participant events)
                             ▼          │         ▼
                 ┌──────────────────┐   │   ┌─────────────────────┐
                 │  LiveKit server   │◄──┘   │  MongoDB (Beanie)    │
                 │ (Cloud/self-host) │       │  Users/Sessions/     │
                 └─────────┬──────────┘       │  Submissions/Audit  │
                           │ dispatches        └─────────────────────┘
                           ▼
                 ┌────────────────────────────┐
                 │ LiveKit Agents worker (Py) │
                 │ Gemini Live plugin (STT+   │
                 │ LLM+TTS) + Avatar plugin   │
                 │ (SpatialReal/ProtoFace) +  │
                 │ state events               │
                 └────────────────────────────┘

                 ┌────────────────────────────┐
                 │ Background worker (light)   │
                 │ youtube-transcript-api →    │
                 │ Gemini audio-transcription  │
                 │ fallback (only when captions│
                 │ are missing/disabled) →     │
                 │ Teacher review queue        │
                 └────────────────────────────┘

Browser  ─── renders YouTube's own <iframe> player directly ───►  youtube.com
             (no video bytes ever pass through our backend at launch)
```

**Video hosting decision (updated):** lesson videos are **embedded directly from YouTube at launch** — no `yt-dlp` download, no re-hosting, no Cloudinary at all. This removes an entire piece of infrastructure from the launch scope. The only thing the backend still needs from the video is its *transcript*, for Maya's context:

1. Try `youtube-transcript-api` first (captions only — no video/audio download).
2. If captions are missing/disabled, fall back to extracting *audio only* with `yt-dlp` (a small, transient file), sending it to Gemini for transcription, then **deleting it** — this is a short-lived processing step, not a hosting decision, so it doesn't need Cloudinary or any persistent object storage.

**Confirmed: chunk long audio before transcribing.** Rather than sending an arbitrarily long file to Gemini and risking a per-request limit, the fallback splits audio that exceeds a configured threshold and transcribes the pieces sequentially, then stitches the results. Design notes, kept deliberately simple per §10:

- **Only chunk when needed.** Below the threshold, send one request — no splitting, no stitching, no extra failure modes. A typical 15–20 minute lesson video will usually fall under it.
- **Split on duration, with a small overlap** (a few seconds) between consecutive chunks, so a word spoken across a boundary isn't lost. Trim the duplicated overlap when stitching.
- **Threshold is configuration, not a constant** — Gemini's audio limits change over time, so the chunk length should be a settable value checked against current Gemini documentation at implementation time rather than hardcoded from memory.
- **Fail the whole transcript if any chunk fails**, leaving the topic in its existing pre-approval state; a half-transcript silently marked ready would poison Maya's context for that topic. Retry is per-chunk, so a transient failure doesn't restart the whole job.
- Chunking runs inside the same `BackgroundTasks` job as the rest of the fallback (§6.1); it's sequential work, not a reason to reach for Celery early.

**Recordings (student-generated audio/video) — confirmed storage decision:** launch on **Cloudinary**, using the original plan's `upload_large()` chunked-upload approach (still the right call for large weekly video check-ins under container memory limits). This is a deliberate reversal of this document's earlier "go straight to R2" recommendation — the stakeholder call is to accept Cloudinary's short-term cost/bandwidth tradeoff in exchange for not building a pre-signed-upload flow twice, since a migration is already planned. Each `RecordingSubmission` carries a 7-day TTL (`expires_at`, confirmed above) — a cleanup job deletes the Cloudinary asset after a week regardless of which storage backend is live at the time.

**Post-launch (Phase 9, §7) — confirmed as one consolidated migration, not two:** move recordings *and* rehosted lesson videos together onto **Cloudflare R2** (Tigris is no longer under consideration — R2 is the settled target for both). This directly validates the original plan's own §8 "Cloudinary → Cloudflare R2" migration section — that section was right all along; this document's earlier "R2 vs. Tigris, evaluate in parallel" framing is superseded by that decision.

### 6.1 Background/heavy-workload strategy — confirmed

**Launch: FastAPI's built-in `BackgroundTasks`.** No new infrastructure, no broker, no worker process. This runs in-process, fire-and-forget, right after the request that triggered it returns. It's the correct launch-scope tool for every heavy-ish job this platform has at MVP volumes:
- Cloudinary chunked upload after a recording submission (§3.2, FR-REC-007).
- Transcript fetch (`youtube-transcript-api`) and, when needed, the transient Gemini audio-fallback transcription (§6, Phase 3).
- AI scoring/report generation once a session or submission is ready to be analyzed (feeds the Admin "AI Reports" screen).
- The 7-day recording-expiry cleanup job (§5) — for launch scale, a periodic FastAPI background task (or a simple cron hitting an internal endpoint) is enough; it does not need a scheduler framework yet.

**Post-launch: Celery + dedicated workers**, once real traffic makes `BackgroundTasks`' limits actually bite (no retries, no persistence across a restart, no independent scaling from the API process). This is the concrete instance of §10's anti-over-engineering rule in action: the *decision* to eventually need Celery is made now, but the *infrastructure* (broker, worker pool, task routing) is deliberately not built until the FastAPI-native version actually falls over — building it today would be solving a load problem that doesn't exist yet.

---

## 7. Realistic phased roadmap (replaces the original "7 days, already ✓" framing)

The original 7-day plan is a reasonable **backend-only** slice, but it pre-dates the LiveKit requirement and doesn't account for auth, the recording persistence gap, or the richer content model. Reframed as phases (not literal days, since LiveKit + Avatar vendor integration is inherently uncertain in duration until the vendor spike lands):

1. **Foundations** — FastAPI skeleton, Beanie/MongoDB, JWT auth (resolves LiveKit doc Open Q5 in favor of native email/password, matching the original plan's `python-jose`/`passlib` choice), role guards, the extended data model in §5.
2. **Recording pipeline (lowest risk, ships value fastest)** — wire the already-working `Recorder` UI to real `POST /submissions` + Cloudinary chunked upload (`upload_large()`) via a FastAPI `BackgroundTasks` job; add the missing Student-side "my submissions by topic" view (§3.2 gap); add duration limits (NFR-REC-001), replace-history (`replaces` field), and the 7-day expiry cleanup job (§5).
3. **Content pipeline** — direct YouTube embed (no download/re-hosting); `youtube-transcript-api` + Gemini audio-fallback for transcripts only; extend `ProgramBuilder` to author the richer `TopicContent` shape from §4.1; teacher review queue (`PENDING_REVIEW` → `APPROVED_FOR_AI`).
4. **Avatar vendor spike (1 day, blocking)** — evaluate 2–3 LiveKit avatar plugins against NFR-002/NFR-003 latency and sync budgets; pick one; unblocks Phase 5.
5. **LiveKit Agents integration** — real room dispatch, Gemini Live plugin wired to `TopicContent`-derived system prompts, avatar plugin from Phase 4, full 7-state session state machine + end reasons persisted via LiveKit webhooks, mute/output controls, barge-in, idle timeout, reconnection.
6. **Practice modes (new — §3.4 A)** — extend the Agents worker with one prompt-building Strategy per mode (Topic Discussion, Free Talk, Vocabulary Builder, Mock Interview, Debate Practice, and Pronunciation Drill if its feedback requirement is achievable); add `mode` to `LiveSession`; handle Free Talk's absence of topic context.
7. **Admin oversight surfaces** — force-end session, Avatar/platform config panel, error/alert log with dedup, audit log, entitlement enforcement (level/topic scope per §5, plus the Pro duration override).
8. **Gamification (new — §3.4 H)** — streak tracking, badge award-evaluation engine, milestones, and the milestone→entitlement grant ("bonus 1:1 coaching session").
9. **Notifications & settings** — in-app status/error message catalog (FR-065), idle-timeout/reconnection notices, account/profile & session settings screens (absent from the UI today, and unreachable at all on mobile).
10. **Dockerization & deployment** — multi-stage Dockerfile (FastAPI) + separate Agents-worker image, environment config, Hostinger (or reconsider given LiveKit's own Cloud offering removes the need to self-host media servers).
11. **Live Classes (new — §3.4 B; scope and specify before estimating)** — multi-party LiveKit rooms, scheduling, enrolment/capacity, host controls, attendance, class recordings, instructor roster. **This needs its own requirements document first**; it is a peer of the Maya workstream, not a sub-task of it, and may well belong after launch depending on business priority.
12. **(Post-launch) Consolidated storage & background-worker upgrade** — two independent triggers, don't block one on the other: (a) once traffic/cost/reliability data justifies it, add the `yt-dlp` download + upload job, switch the player from a YouTube `<iframe>` to a self-hosted stream, and migrate existing Cloudinary recordings — both onto Cloudflare R2 (§6.1); (b) once `BackgroundTasks`' limits actually bite, introduce Celery + a broker + dedicated workers (§6.1) — not before. Both explicitly out of launch scope.

---

## 8. Consolidated open questions

Merged from both requirement docs' own Open Questions sections, deduplicated. Most are now resolved — kept here with their answers so the decision and its source stay traceable; the rest remain genuinely open.

### 8.1 Resolved

1. **Avatar vendor** (LiveKit doc Q2) — SpatialReal and ProtoFace, both piloted; both confirmed to have native LiveKit support (§2.1).
2. **Text input alongside voice** (Q1) — **No.** Audio-only input for now; no typed-text modality.
3. **Interruption/barge-in policy** (Q3) — **Yes, barge-in.** Student speech stops Maya's output and transitions the session to Listening/Thinking (FR-025).
4. **Live session recording/transcript** (Q4) — **The live call is never recorded.** A structured turn-by-turn text log is still kept (feeds AI scoring); no audio/video artifact or replay exists for a past live session (§5).
5. **Session limits/entitlement** (Q7) — **Confirmed, and it's a content-scope distinction, not a session-count quota.** Standard = full curriculum of one assigned level; Pro = hand-picked topics across any level (already how `AssignPlanModal` works today — see §3.3, §5's `SessionEntitlement`). There is no per-day session-count difference between the two plans.
6. **Session duration limit** (Q8) — **15 minutes by default for both plans.** Pro students can get that raised via an Admin-granted, per-student `duration_override_minutes` — always an explicit admin action, never self-service, and audited (FR-096).
7. **Concurrency target** (Q9) — **A configurable platform setting, not a fixed number** — `max_concurrent_sessions` in `PlatformAvatarConfig` (§5), launched at **50** and adjustable later via the Admin config panel with no code change.
8. **Retention** (Q10, REC-Q5) — **7-day TTL, uniform.** Applies to the per-task audio and Friday video submissions (§5's `expires_at`) *and* to what a full account-deletion/export request must honor — no separate, longer retention window for deletion requests. No minors-specific regulatory regime is layered on top of this.
9. **Storage backend** (REC-Q7) — **Cloudinary at launch, Cloudflare R2 post-launch**, consolidated with the lesson-video rehost into one migration (§6). Tigris is no longer a candidate.
10. **Background-job infrastructure** (new, raised by this analysis) — **FastAPI `BackgroundTasks` at launch, Celery + workers post-launch**, triggered by actual load rather than a fixed date (§6.1).
11. **Instructor role** (§3.4 C) — **Not a third role.** The Instructor *is* the Administrator; two roles total (§3.5).
12. **Operating model** (§3.5) — **Instructor-driven, student-passive.** Students configure nothing; the instructor owns plans, topics, levels and session limits. Removes FR-072/FR-073 from scope and shrinks FR-071.
13. **Admin "preview as student"** (§3.5) — **Confirmed as a real feature**, not prototype scaffolding. To be built read-only and audit-logged.
14. **Long-audio transcription** (§6) — **Chunk with overlap above a configurable threshold**, stitch, and fail-whole-on-chunk-failure.

### 8.2 Still open

**Raised by the verification walkthrough (§3.4) — these are now the highest-priority ones, because they change scope rather than detail:**

1. **Live Classes scope** — is the human-instructor class programme in launch scope at all? It's an entire uncovered product area (§3.4 B) needing its own requirements doc. Answer determines whether the roadmap has 10 phases or 11.
2. **Practice modes** — are all six real, or is Topic Discussion the launch scope with the rest deferred? (§3.4 A) Pronunciation Drill's "instant feedback" needs its own feasibility check against what Gemini Live can actually assess.
3. **Quiz lessons** — build the missing quiz type and data model, or drop the type from the catalogue? (§3.4 E)
4. **Content authoring backlog** — 13 of 16 lessons have no authored content (§3.4 F). Who writes them, and does launch need all 16 or just a trimmed catalogue?
5. **Class-recording retention** — the 7-day TTL covers student self-recordings; class recordings are a separate media type with no stated policy (§3.4 J).
6. **Groups vs. levels** (new, §3.5) — is a Standard "group" always exactly a level, or will instructors want named cohorts with their own topic sets? Recommendation is level-for-now; only worth answering if named cohorts are actually wanted.
7. **Student creation path** (new, §3.5) — instructor invites and the student completes sign-up, or the instructor creates the account outright? The prototype's copy implies both.

**Carried over:**

8. **Notification channels beyond in-app** (Q11).
9. **Browser/device support matrix** (Q12).
10. **Recording specifics**: minimum-duration guard, Friday check-in cutoff date, and whether a *replaced* (overwritten) submission's old media is retained for audit or discarded immediately (REC-Q2–Q4) — the 7-day TTL answers "how long does the *current* submission live," not these three.
11. **Localization/RTL** (§3.3) — **explicitly deferred** by the stakeholder ("decide it later"). Not in launch scope; revisit before any launch-scope freeze, since it affects `<html lang>`, RTL layout, and font choice if picked up late.

---

## 9. Recommended skills

Already available in this session and directly applicable — no install needed:
- **`livekit-agents`** — covers the exact Gemini-Live-plugin + Agents-worker pattern in §2.1; also mandates tests, which the recording/session state machines badly need.
- **`gemini-live-api-dev`** — for the STT/LLM/TTS side of the Agents worker.

Worth installing for this build (not yet present):
- **`fastapi/fastapi@fastapi`** (7.1K installs, official) — official FastAPI patterns for the Phase 1 skeleton, including `BackgroundTasks` usage for §6.1's launch-scope jobs.
- **`cloudinary-devs/skills@cloudinary-docs`** (689 installs, official) — needed again now that recordings launch on Cloudinary (§6).
- **`jezweb/claude-skills@cloudflare-r2`** (473 installs) — earmarked for the post-launch Phase 9 consolidated migration, not needed before then.
- Tigris skills dropped — no longer a candidate (§6, §8.1).
- Nothing strong for SpatialReal/ProtoFace turned up in this pass (likely too new/niche to have a listed skill yet) — worth a fresh search once implementation starts.
- **Celery:** no official/high-install skill exists yet; `martinholovsky/claude-skills-generator@celery-expert` (415 installs, unofficial) is the closest match if/when Phase 9's Celery migration actually starts — not needed at launch either way (§6.1).

Say the word and I'll install any of these with `npx skills add <owner/repo@skill> -g -y`.

---

## 10. Engineering standards for the rebuild

**Governing rule, stated up front: do not over-engineer this.** Every recommendation below exists to *reduce* incidental complexity, not add ceremony. Where a pattern, abstraction, or library isn't earning its keep for the two vendors/two state machines/one backend this project actually has, the simpler option wins even if it's "less proper." If a future need shows up, add the abstraction *then* — that's YAGNI, not laziness.

### 10.1 Design patterns — use exactly the ones this codebase has a real reason for

Don't reach for a pattern catalog. This system has **two concrete places** where a pattern earns its keep, both because we already know, today, that there will be more than one implementation:

- **Strategy** for the avatar bridge — `AvatarProvider` as a small `Protocol` (`connect()`, `disconnect()`, `on_state_change()`), with a `SpatialRealAvatarProvider` and `ProtoFaceAvatarProvider` implementing it. The Agents worker depends on the Protocol, not on either SDK. This is the direct payoff of piloting two vendors — swapping or A/B-testing them becomes a one-line change, not a rewrite.
- **Adapter** for the transcript source — `youtube_transcript_api` and the Gemini-fallback path both produce the same `TranscriptResult` shape behind one function signature, so the caller (the content pipeline) never branches on which path ran.

Everything else — Beanie Documents, FastAPI route handlers, the recording upload flow — is plain, direct code with no pattern wrapped around it, because there's only one implementation of each and no known reason to expect a second. Do **not** add a Repository pattern on top of Beanie (Beanie's `Document` already *is* the repository abstraction — a second layer would just rename the same calls), a Factory for creating sessions (there's one session type), or a generic plugin/registry system for "future avatar vendors" beyond the two named ones (that's speculative generality — YAGNI).

### 10.2 SOLID — applied pragmatically, not as a checklist

- **Single Responsibility:** one module per concern (`auth.py`, `submissions.py`, `sessions.py`, `content.py`, `notifications.py`) — not one class per concern. A module of related functions satisfies SRP just as well as a class does, with less boilerplate.
- **Open/Closed:** the two Strategy/Adapter points in §10.1 are the *only* places this matters — adding SpatialReal-vs-ProtoFace or captions-vs-Gemini-fallback doesn't touch the Agents worker's core loop. Don't chase Open/Closed anywhere else; most of this backend (auth, submissions, admin CRUD) has no legitimate "future variant" to stay open for.
- **Liskov:** both `AvatarProvider` implementations must be truly interchangeable — same method signatures, same event shapes back to the caller. If SpatialReal or ProtoFace can't fit the same three-method Protocol without leaking vendor-specific quirks, that's a signal to keep the Protocol *smaller*, not to add vendor-specific escape hatches that break substitutability.
- **Interface Segregation:** keep `AvatarProvider` to the handful of methods the Agents worker actually calls. Resist the urge to design a "complete" avatar-vendor interface up front — add a method when a second real need for it shows up.
- **Dependency Inversion:** FastAPI's `Depends()` already gives this for free (route handlers depend on injected services, not concrete clients) — no extra DI framework or container is needed for a backend this size.

### 10.3 KISS, DRY, YAGNI — specific calls for this project

- **KISS:** the session and recording state machines are both under 8 states with fully enumerated transitions already written out in the requirement docs (§6 of the LiveKit doc, §7 of the recording doc) — implement exactly those tables, don't generalize them into a configurable rules engine.
- **DRY:** the *shape* of a state machine (state, valid-next-states, a `transition()` that validates and logs) is genuinely shared between `LiveSession` and `RecordingSubmission` — factor that one small piece out (§10.4) rather than duplicating the validation logic twice. Don't extend DRY further than that; the actual states/business meaning of the two machines are unrelated and shouldn't be forced into one shared enum or one shared model.
- **YAGNI, concretely, for decisions already on the table in this project:**
  - Don't build a multi-channel notification framework (email/push/SMS abstraction) until §8 Q11 (notification channels) is actually answered — in-app only, today.
  - Don't build a generic CMS/plugin system for future non-YouTube video sources — there is exactly one source (YouTube) and one hosting decision (embed now, R2 later per §6); add abstraction if and when a second video source actually appears.
  - Don't pre-build the Phase 9 storage/rehost migration now "since we'll need it eventually" — it depends on real usage data that doesn't exist pre-launch.
  - Don't stand up Celery, a broker, and worker processes at launch "because we'll need it eventually" (§6.1) — `BackgroundTasks` covers every launch-scope job (Cloudinary uploads, transcript fetch, AI scoring, TTL cleanup); add the queue infrastructure when it's actually load-bearing, not on a calendar date.

### 10.4 State machines — yes, but hand-rolled, not a library

Two state machines exist in this system: `LiveSession` (7 states, FR-032) and `RecordingSubmission` (5 states, FR-REC-017). Both are small, both have every transition already fully enumerated by the spec docs, and neither needs hierarchical, parallel, or dynamically-defined states.

**Recommendation: no third-party state-machine library** (e.g. `python-statemachine`, `transitions`). The cost/benefit doesn't clear the bar for two machines this small:

```python
# app/core/state_machine.py — the entire abstraction, shared by both models
class InvalidTransition(Exception): ...

def transition(current: Enum, target: Enum, allowed: dict[Enum, set[Enum]]) -> Enum:
    if target not in allowed.get(current, set()):
        raise InvalidTransition(f"{current} -> {target} is not a valid transition")
    return target
```

```python
# usage — the actual transition tables live right next to the model that owns them
SESSION_TRANSITIONS: dict[SessionState, set[SessionState]] = {
    SessionState.NOT_STARTED: {SessionState.CONNECTING},
    SessionState.CONNECTING: {SessionState.CONNECTED, SessionState.CONNECTION_FAILED},
    SessionState.CONNECTED: {SessionState.PAUSED, SessionState.DISCONNECTED, SessionState.ENDED},
    SessionState.PAUSED: {SessionState.CONNECTED, SessionState.ENDED},
    SessionState.DISCONNECTED: {SessionState.CONNECTING, SessionState.CONNECTION_FAILED},
    SessionState.CONNECTION_FAILED: {SessionState.NOT_STARTED},
    SessionState.ENDED: {SessionState.NOT_STARTED},
}
```

This is ~10 lines, has zero new dependencies, is trivially unit-testable (assert every table entry against the spec's own diagram), and any engineer can read the whole thing in one pass. On the frontend, mirror it with a plain `useReducer` and the same transition table shape — don't reach for XState here either, for the same reason. If a third state machine shows up later and it's genuinely more complex (parallel states, timers-as-states, nested regions), that's the point to revisit a library — not before.

### 10.5 OOP — where it earns its place, where it doesn't

Beanie's `Document` classes are already the right amount of OOP for this project — they model real entities (`User`, `LiveSession`, `RecordingSubmission`, `TopicContent`) with real identity and persistence. Extend that instinct to the two Strategy classes in §10.1, and stop there.

Everywhere else, prefer plain functions over classes: request validation, formatting, the transcript-fallback logic, the entitlement check — none of these have state or identity worth encapsulating, so wrapping them in a class (a `SubmissionValidator` class with one method, a `NotificationFormatter` class with one method) would be pure ceremony. A Python module of top-level functions is a perfectly good unit of organization and doesn't need a class around it to be "proper." Composition over inheritance throughout: the Agents worker takes an `AvatarProvider` as a constructor argument, it does not subclass per vendor.

## 11. What to do next

The highest-leverage next step is **Phase 2 (recording pipeline)** — it's the smallest gap (UI already works), ships a real backend fastest, and de-risks nothing about the LiveKit/Avatar uncertainty. Phase 4's vendor spike should start in parallel since it's a hard external dependency with unknown lead time.
