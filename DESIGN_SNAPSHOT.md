# Tamakkan frontend — pre-rewrite design snapshot

Captured 2026-08-17, immediately before restructuring `app/page.tsx` (a
1,296-line single-file monolith) into proper native-React components. This is
the feature/skeleton contract the rewrite must preserve. The exact prior
source is also recoverable from git history (commit "Checkpoint before full
frontend rewrite").

## Roles & auth

Three backend roles: `student`, `administrator`, `root`. The frontend only
ever renders two dashboard shapes — Student and Admin — `root` gets the Admin
shape. Auth is real (`lib/auth/AuthContext.tsx`, `lib/api/client.ts`
`authApi`/`meApi`): httpOnly-cookie session via a same-origin BFF
(`app/api/auth/*`, `app/api/backend/[...path]/route.ts`), never a token in
browser JS. `AuthGate` renders `LoadingScreen` → `LoginScreen` →
`AppShell(user)` based on `AuthContext`'s state machine. **This auth
layer, the BFF proxy routes, and `lib/api/*` are staying as-is — not part of
the rewrite** (see "What's in scope" below).

## App shell

- `AppShell` holds top-level state: `view` ("student"|"admin", switchable by
  administrator/root only — a student is locked to "student"), per-dashboard
  sub-navigation (`studentView`, `adminView`), the open lesson player's
  `playerTopicId`, and two pieces of mock client state (`students`,
  `submissions` — see "Mock vs real data" below). None of this lives in the
  URL today — switching tabs does not change the browser URL or survive a
  refresh.
- `Sidebar` — fixed left rail (232px desktop, becomes a bottom tab bar
  ≤760px). Brand mark, a Student/Admin toggle (hidden for students), the
  nav list for whichever `view` is active, and a bottom block (Settings,
  Log out, a static "Need help?" support card).
- `Topbar` — sticky header: greeting + subtitle, a search box (decorative,
  no real search), a notification bell (decorative), a mobile-only
  view-switch button, and the user's initials/name/role badge.
- Every screen below the topbar renders inside `<main className="content …">`.

## Student dashboard (`StudentView`: home | lessons | classes | progress | challenge | practice | player)

- **Home** (`StudentHome`) — 30-day challenge hero card (mock progress ring,
  static "Day 12 of 30"), a "continue learning" card built from
  `topicsByLevel[firstEntitledLevel][0]` (real topic data — no completion
  tracking exists server-side, so "current" just means "first entitled
  topic", not "first incomplete"), a static skills-breakdown card, a
  "recommended" row of the remaining real topics in that level, a static
  4-step "how this works" explainer (Watch → Understand → Discuss →
  Analyze), and two static bottom cards (upcoming classes preview, this-week
  stats).
- **Lessons** (`StudentLessons`) — level pills built from
  `Object.keys(topicsByLevel)` (only the levels this student is actually
  entitled to — a Standard-plan student with one level sees no pills at all;
  this is the real fix for the old "can browse levels outside your plan"
  bug), a search box filtering by title, and a `CourseCard` grid of real
  topics. Empty state if zero entitled topics.
- **Player** (`CoursePlayer` → `PlayerMain`) — opened via `onOpen(topicId)`,
  fetches the full `TopicPublic` on demand (`useTopic`). Has a sidebar
  listing sibling topics in the same level for quick switching. Main player
  has 5 tabs:
  - *Overview*: static poster image gate → on click, swaps to a real
    `youtube-nocookie.com` iframe embed of `topic.youtube_urls[0]`; lists
    `topic.warm_up_questions` as discussion prompts.
  - *Discuss with Maya*: a mocked AI-avatar call UI (static avatar image,
    idle/live/ended states, a "Start session"/hangup control, and a caption
    line that cycles through `warm_up_questions` client-side) — no real
    LiveKit/avatar session wired up.
  - *Record audio*: `Recorder` (real `getUserMedia`+`MediaRecorder`, produces
    a local blob URL) → `RecorderSubmitted`. Feeds `onSubmitRecording` up to
    `AppShell`'s mock `submissions` array (Task #44 will wire this to
    `submissionsApi.submitAudio` for real).
  - *Transcript*: shows `topic.approved_transcript` (real, student-visible
    once an admin approves it) or a "not yet approved" message.
  - *Vocabulary*: renders `topic.vocabulary[].term` as chips.
- **Classes** (`StudentClasses`) — fully static/mock: upcoming vs past class
  lists, metric cards, no backend entity for classes exists at all.
- **Progress** (`StudentProgress`) — fully static/mock: a 30-day trend chart
  (hand-drawn SVG path, not real data), a skills breakdown, streak stats,
  earned badges, and a session-history table.
- **Challenge** (`StudentChallenge`) — the "30-Day Zero to Hero" calendar.
  Cycles through the student's real entitled topics (`topics[i % topics.length]`)
  to fill 30 day-cells; day state (done/current/locked) is a static
  `currentDay = 12` constant, not tracked per-student server-side. Every
  4th-ish day (`fridayDays = [5,12,19,26]`) is a **Friday video check-in**
  cell instead of a lesson, with 4 distinct visual states — `submitted`
  (video recorded), `current` (today, not yet recorded), `locked` (future),
  `missed` (past and never recorded, shown with a ⚠ badge) — opened via
  `FridayTaskModal` → `Recorder` in video mode. This missed/current/locked/
  submitted distinction is a deliberate, named fix (previously these read as
  visually identical) and must survive the rewrite.
- **Practice** (`StudentPractice`) — static list of 6 "practice modes"
  (Topic Discussion, Free Talk, Pronunciation Drill, etc.) with mock
  scores/session counts; "Start" opens the real player on the first entitled
  topic; a static session-history table below.

## Admin dashboard (`AdminView`: home | people | report | program | classes | progress)

- **Overview** (`AdminHome`) — date-range toggle (Today/7D/30D) driving mock
  metric cards + sparklines, a static "30-day challenge" trend chart, an
  "action needed" panel (mock students filtered by status), a static live
  activity feed, and a challenge-progress table (mock students).
- **Students** (`AdminStudents` → `StudentDetailPage`) — mock `Student[]`
  list (name/level/day/score/plan/assignedClass/topics — **not** the real
  `UserPublic`; Task #45 will wire this to `usersApi`). A "pending
  assignment" queue for students with no `assignedClass`, search + level
  filter, and a table where clicking a row opens `StudentDetailPage`: a full
  profile with a real trend chart, per-real-topic AI-analysis cards (mock
  `Report` data joined by topic title), and Friday-video submissions. "＋
  Invite student" / "Edit plan" open `AssignPlanModal`.
- **AssignPlanModal** — Standard (whole-level curriculum, picked from real
  `topicsByLevel`) vs Pro (hand-picked topic checkboxes across all real
  levels) plan builder. Known, flagged mismatch: it stores chosen topics as
  **titles**, not the real `assigned_topic_ids` the backend API wants — left
  for Task #45.
- **AI Reports** (`AdminReports`) — a real-submissions review strip (mock
  `submissions` array today, will be `submissionsApi.listForAdmin` after
  Task #44) with a "mark reviewed" toggle, plus a grid of fully mock
  per-session `Report` cards (skills breakdown + AI summary in a
  `<details>`).
- **Topics** (`AdminProgram` → `ProgramBuilder`) — **fully real**, the one
  admin surface already wired end-to-end. Three level columns
  (`LEVEL_ORDER`), each listing its real topics with a `transcript_state`
  badge and Edit/Delete. `ProgramBuilder` is a 4-step dialog operating on one
  real topic (`topicsApi.create/update/delete`):
  1. *Basics* — title + level (level locked after creation).
  2. *Video & transcript* — YouTube URL → `generateTranscript` (202, polls
     `GET /topics/:id` every 4s up to 20 attempts) → shows the real
     `raw_transcript` in an **editable** textarea → "Approve transcript"
     (`approveTranscript` with the edited text, terminal/irreversible,
     confirmed via `window.confirm`).
  3. *Avatar prompt* — `avatar_prompt`, `opening_line`, an editable
     warm-up-questions list, and a comma-separated vocabulary field (a
     placeholder mapping to `VocabularyItem[]`, explicitly not the real
     per-item editor — that's the separately-scoped Epic C3).
  4. *Review* — read-only summary + the exact prompt block that will be sent
     to the AI avatar (`ADMIN INSTRUCTION` / `OPENING LINE` /
     `WARM-UP QUESTIONS` / `TARGET LANGUAGE`), "Done" (nothing left to
     publish — every step already persisted on the way here).
- **Classes** (`AdminClasses`) — fully static/mock: class schedule +
  instructor roster, no backend entity.
- **Analytics** (`AdminAnalytics`) — fully static/mock: engagement/retention
  charts, score-by-level breakdown.

## Mock vs real data (must stay accurate through the rewrite)

| Data | Status |
|---|---|
| Auth / current user | Real (`authApi`, `meApi`) |
| Topics (list, detail, CRUD, transcript pipeline) | Real (`topicsApi`) |
| Students / user management | Mock (`initialStudents`, local state) — Task #45 |
| Submissions (audio + Friday video) | Mock (local `submissions` state, blob URLs only) — Task #44 |
| AI Reports | Fully mock (`reports` const), no backend entity yet |
| Classes / instructors | Fully mock, no backend entity |
| Analytics (engagement/retention/score-by-level) | Fully mock |
| Badges / milestones / practice-mode history | Fully mock |

Do not silently invent backend fields that don't exist (rating, duration,
completion/lock state, a "summary" field on Topic) — the current code
deliberately omits or honestly labels these gaps rather than fabricating
data; see inline comments throughout `page.tsx` (recoverable from the
checkpoint commit) for the specific reasoning per field.

## Shared building blocks

`Icon` (emoji glyph map), `Sparkline`/`TrendChart` (hand-rolled inline SVG,
no charting library), `MetricCard`, `CourseCard`, `FilterChips`,
`PageHead`, `Recorder`/`RecorderSubmitted` (real MediaRecorder), the native
`<dialog>` modal pattern (`useDialogAutoOpen` — real focus trap + Escape
handling + backdrop-click-to-dismiss, deliberately chosen over a hand-rolled
`<div className="modal">` overlay).

## Visual design system (current, in `app/globals.css`)

CSS variables: `--navy:#071c43 --blue:#315af3 --cyan:#18c7bc --coral:#ff644f
--ink:#14223b --muted:#6e7b91 --line:#e6eaf1 --bg:#f5f7fb --card:#fff
--shadow:0 8px 28px rgba(22,41,81,.07)`. Font: Geist (via `next/font/google`)
+ system sans fallback stack, base 14px scale (bumped up ~3px from an even
smaller original pass this session). Cards: white, 16px radius, soft shadow,
1px hairline border. Sidebar: dark navy, gradient active-state pills.
Breakpoints: 1100px (grid collapses), 900px (builder dialog goes
single-column), 760px (sidebar becomes a bottom tab bar, most decorative
chrome hides), 600px (further compaction). Tailwind v4 is installed
(`@import "tailwindcss"` at the top of `globals.css`) but **unused** — every
actual style below it is hand-written global CSS keyed by ad-hoc class names,
not Tailwind utilities.

## What's in scope for the rewrite vs. what stays

- **In scope**: `app/page.tsx` (the entire UI/presentation layer — every
  component listed above) and `app/globals.css` (the styling system).
- **Not in scope** (already hook-based, already verified against the real
  backend, no UI/UX concern): `lib/api/client.ts`, `lib/api/types.ts`,
  `lib/api/server/backend.ts`, `lib/auth/AuthContext.tsx`,
  `lib/hooks/useTopics.ts`, `lib/topics/helpers.ts`, `app/api/**/route.ts`.
  These get reused/imported by the new component tree as-is, reorganized at
  most (e.g. moved under a `features/` folder), never functionally rewritten.
