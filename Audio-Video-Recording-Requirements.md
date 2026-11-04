# Tamakkan — Audio & Video Recording (Practice Submissions): Requirements Specification

**Document type:** Functional & Non-Functional Requirements Specification
**Status:** Draft v1.0
**Platform:** Tamakkan, the AI-driven English-speaking practice platform (Student dashboard + Admin dashboard).
**Companion document:** [LiveKit-Avatar-Platform-Requirements.md](LiveKit-Avatar-Platform-Requirements.md) — covers the live, two-way "Discuss with Maya" Avatar session. **This document is deliberately separate** because recording here is a different mechanism: it is a one-way, asynchronous, Student-initiated **self-recording** (captured and reviewed later), not a live call with an AI.

## Scope

This document covers two related recording functions already implemented in the current build and required for the production version:

1. **Per-task audio recording** — after each lesson task, the Student records themselves answering/practicing and submits the recording for that topic.
2. **Weekly video check-in** — every week (framed in-app as a "Friday task"), the Student records a short video of themselves and submits it.

Both flows share the same underlying recording mechanism (start/stop/preview/re-record/submit) and the same admin-side review mechanism, so they are specified together. Content of what the Student says, lesson/task design, and AI scoring of the recording's content are out of scope here (see [Out of Scope](#9-out-of-scope)).

## How to read this document

Same convention as the companion LiveKit document: `FR-REC-###` for functional requirements, `NFR-REC-###` for non-functional requirements, each with Description / Stakeholder / Inputs / System Behavior / Output / Error Cases / Acceptance Criteria. **(Assumption)** flags a gap not settled by the current build; all are collected in [Open Questions](#10-open-questions).

---

## 1. Overview

After completing a lesson task, a Student can record an audio answer and submit it as evidence of practice for that specific topic. Separately, once a week, the Student is prompted to record a short video of themselves speaking (the weekly check-in) and submit it. Both submissions are stored and become visible to Administrators, who can play them back and mark them reviewed. On the Student's own side, per-topic recordings later appear grouped under that topic on their progress view, alongside any AI analysis for that topic.

Unlike the Maya Avatar session (companion document), this feature:
- Is **not live** — nothing is streamed anywhere in real time; the Student records fully, previews it, and only then submits.
- **Does use the Student's camera** for the weekly video check-in specifically — this is the one part of the platform where the Student's own camera is used, because the Student is intentionally recording themselves for later review, not appearing on a live call.
- Produces a durable artifact (an audio or video file) rather than a transient conversation.

## 2. User Types, Roles, and Permissions

| Role | Permissions |
|---|---|
| **Student** | Record and submit their own audio (per task) and video (weekly check-in); preview and re-record before submitting; view their own past submissions grouped by topic; cannot view or access any other student's submissions. |
| **Administrator** | View every student's submissions (audio and video), filterable/groupable by student and by topic; play back any submission; mark a submission reviewed/unreviewed; see a count of unreviewed submissions. Cannot record on behalf of a student. |

**FR-REC-001 — Own-Data-Only Access for Students**
- **Description:** A Student may only ever see, play back, or manage their own submissions.
- **Stakeholder:** Student (privacy).
- **Inputs:** Authenticated Student identity; requested submission record.
- **System Behavior:** Every read of submission data is scoped to the requesting Student's own records.
- **Output / Result:** Student's own submissions list/grouping; no access path to another student's.
- **Error Cases / Exceptions:** A direct request for another student's submission ID is denied.
- **Acceptance Criteria:** No UI path or direct request lets a Student retrieve a submission where `studentName` does not match their own identity.

---

## 3. Core Functions

1. Start / stop a recording (audio-only or audio+video) from within the relevant task screen.
2. Preview the recording before committing to it.
3. Discard and re-record before submitting.
4. Submit the recording, attaching it to the correct topic (audio) or week (video).
5. Store the submission with metadata: student, kind, label/topic, duration, date, reviewed status.
6. Let the Student see their own past submissions grouped by topic (audio) and see their weekly check-in history (video).
7. Let the Administrator see all submissions platform-wide, per student and per topic, and mark them reviewed.
8. Surface an unreviewed-submission count/alert to Administrators.

---

## 4. User Journeys

### 4.1 Per-task audio recording (Student)
1. Student completes a lesson task inside the Course Player and opens the "Record audio" tab for that task.
2. Student grants microphone permission (first time) and selects **Start recording**.
3. Student speaks; an active recording indicator and elapsed time are visible.
4. Student selects **Stop recording**; the recording is now in a **Recorded (preview)** state — Student can play it back.
5. Student either **Submits** the recording (attached to that task's topic) or discards it and re-records from step 2.
6. On submit, the recording appears immediately in the Student's own "submitted" state for that task, and becomes visible to Administrators under that topic.

### 4.2 Weekly video check-in (Student)
1. On reaching the relevant day in the 30-Day Challenge, Student sees a Friday check-in card prompting a video recording.
2. Student selects **Record video**, which opens a modal; Student grants camera + microphone permission (first time).
3. Student selects **Start recording**, records themselves, then **Stop recording**.
4. Student previews the video; can re-record or **Submit video**.
5. Modal closes; the challenge day shows the check-in as completed/submitted. If the Student re-opens the modal for that same week having already submitted, they see their previously submitted video and may replace it before the week's cutoff **(Assumption — see Open Questions)**.

### 4.3 Administrator review
1. Administrator opens the recordings/submissions view (either the dashboard-wide "Student recordings & video submissions" panel, or a specific student's detail page, where recordings appear grouped under each topic and weekly check-ins appear in their own section).
2. Administrator plays back a submission inline.
3. Administrator selects **Mark reviewed** (or reverts to unreviewed if marked by mistake).
4. The unreviewed count decreases accordingly wherever it is shown.

---

## 5. Functional Requirements — Recording Capture

**FR-REC-002 — Start Audio Recording**
- **Description:** Student can start recording their own audio for a specific lesson task.
- **Stakeholder:** Student.
- **Inputs:** Student's "Start recording" action; microphone permission.
- **System Behavior:** Platform requests microphone access (if not already granted) and, once granted, begins capturing audio and timing elapsed duration.
- **Output / Result:** Session moves to an active **Recording** state with a visible elapsed-time indicator.
- **Error Cases / Exceptions:** Microphone permission denied, or no microphone/`getUserMedia` support on the device/browser — a specific error message is shown instead of a silent failure or crash (see FR-REC-010).
- **Acceptance Criteria:** With permission granted, selecting Start recording begins visibly counting elapsed time within 1 second; with permission denied, a specific "microphone access needed" message appears and no crash occurs.

**FR-REC-003 — Start Video Recording (Weekly Check-in)**
- **Description:** Student can start recording themselves (camera + microphone) for the weekly check-in.
- **Stakeholder:** Student.
- **Inputs:** Student's "Start recording" action inside the Friday task modal; camera + microphone permission.
- **System Behavior:** Platform requests camera and microphone access together and, once granted, begins capturing audio+video and timing elapsed duration.
- **Output / Result:** Active **Recording** state with a live self-view preview and elapsed-time indicator.
- **Error Cases / Exceptions:** Camera or microphone permission denied, or either device unavailable — specific error message; recording does not start with only one of the two streams.
- **Acceptance Criteria:** With both permissions granted, a live self-view preview renders and elapsed time counts up; if either permission is denied, recording is blocked with a specific message naming which permission is missing.

**FR-REC-004 — Stop Recording**
- **Description:** Student can stop an active audio or video recording at will.
- **Stakeholder:** Student.
- **Inputs:** Student's "Stop recording" action.
- **System Behavior:** Platform finalizes the captured media into a played-back-able file/blob and stops timing.
- **Output / Result:** Session moves from **Recording** to **Recorded (preview)**, with the final duration fixed and a playback control available.
- **Error Cases / Exceptions:** Stopping with near-zero duration (e.g., accidental tap) still produces a valid, playable (if very short) result rather than an error state. **(Assumption on a minimum-duration guard — see Open Questions.)**
- **Acceptance Criteria:** Stopping recording always yields a **Recorded (preview)** state with a working playback control and a duration matching the actual recorded length.

**FR-REC-005 — Preview Before Submitting**
- **Description:** Before submitting, the Student must be able to play back exactly what will be submitted.
- **Stakeholder:** Student.
- **Inputs:** The just-recorded audio/video file.
- **System Behavior:** Platform renders a standard playback control (audio or video) bound to the recorded file.
- **Output / Result:** Student can listen/watch the full recording prior to submission.
- **Error Cases / Exceptions:** Corrupted/empty recording (e.g., stopped instantly with no data) should be detected and the Student prompted to re-record rather than allowed to submit an unplayable file.
- **Acceptance Criteria:** Playing the preview reproduces the same audio/video the Student just recorded, matching the displayed duration.

**FR-REC-006 — Discard and Re-record**
- **Description:** From the preview state, Student can discard the current take and record again, without leaving the task/modal.
- **Stakeholder:** Student.
- **Inputs:** Student's discard/re-record action.
- **System Behavior:** Platform releases the previous recording and returns to the idle/start state (FR-REC-002/FR-REC-003) for that same task or check-in.
- **Output / Result:** A fresh recording attempt begins; the discarded take is not retained anywhere.
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** After discarding, no trace of the discarded take is submitted or stored, and the Student can immediately start a new recording in the same place.

**FR-REC-007 — Submit Recording**
- **Description:** Student commits a previewed recording as their official submission for that task (audio) or that week (video).
- **Stakeholder:** Student; Administrator (recipient).
- **Inputs:** The previewed recording; the task/topic it belongs to (audio) or the challenge day/week it belongs to (video).
- **System Behavior:** Platform stores the submission with: owning student, kind (audio/video), label (topic title, or a week/day identifier for video), duration, submission date/time, and an initial **unreviewed** status.
- **Output / Result:** Student sees an immediate "submitted" confirmation state for that task/week; the submission becomes visible to Administrators without delay.
- **Error Cases / Exceptions:** Submission attempted with no recording present (e.g., navigated away and back) is blocked with a message directing the Student to record first.
- **Acceptance Criteria:** After submitting, the submission appears (a) in the Student's own submitted state for that task/week, and (b) in the Administrator-facing views (FR-REC-011/FR-REC-012) with the correct topic/label and an unreviewed status.

**FR-REC-008 — One Submission Per Task / Per Week, with Replacement**
- **Description:** Each lesson task has at most one current audio submission; each week has at most one current video check-in submission.
- **Stakeholder:** Student.
- **Inputs:** A new submission for a task/week that already has one.
- **System Behavior:** **(Assumption)** A new submission for the same task/week replaces the prior one rather than creating a duplicate history entry, consistent with the current build's re-record flow.
- **Output / Result:** Only the latest submission for a given task/week is shown as current; whether the replaced one is retained for audit purposes is an open question (see [Open Questions](#10-open-questions)).
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** Submitting a second recording for the same task/week updates that task/week's submission rather than producing two simultaneous "current" entries for it.

**FR-REC-009 — Sequential/Weekly Availability**
- **Description:** The weekly video check-in is tied to the Student's progress through the 30-Day Challenge (framed as a "Friday" task at the appropriate day), consistent with the sequential lesson-unlock rule already governing the challenge.
- **Stakeholder:** Student.
- **Inputs:** Student's current day/progress in the 30-Day Challenge.
- **System Behavior:** The check-in prompt becomes available at the corresponding challenge day and is not required before then.
- **Output / Result:** Student cannot be prompted for (or accidentally submit) a given week's check-in before reaching that point in the challenge.
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** The check-in control for a given week only appears once the Student's progress has reached that week's day in the challenge.

---

## 6. Functional Requirements — Storage, Review, and Access

**FR-REC-010 — Device Permission Failure Handling**
- **Description:** Every permission/device failure path (no microphone, no camera, permission denied, device disconconnected mid-recording) must produce a specific, actionable message.
- **Stakeholder:** Student.
- **Inputs:** Browser/OS permission or device-availability failure.
- **System Behavior:** Platform catches the failure at the point of request and displays a message naming the missing capability (microphone vs. camera) and, where possible, how to fix it (browser permission prompt).
- **Output / Result:** Student understands exactly what to grant/fix, with a retry path.
- **Error Cases / Exceptions:** Device becomes unavailable mid-recording (e.g., unplugged) — the in-progress recording is stopped and preserved up to that point, if possible, rather than silently lost; if not recoverable, Student is told the take was lost and prompted to re-record.
- **Acceptance Criteria:** Every one of the failure conditions above produces a distinct, non-technical message; none results in a silent hang or an unhandled exception.

**FR-REC-011 — Student's Own Submissions Grouped by Topic**
- **Description:** On the Student's own progress view, their past audio submissions are grouped under the topic they belong to, alongside that topic's AI analysis (per the companion progress model).
- **Stakeholder:** Student.
- **Inputs:** Student's own submission records.
- **System Behavior:** Platform matches each audio submission's label to its topic and renders it in that topic's section.
- **Output / Result:** A Student can see, per topic, what they submitted and its status.
- **Error Cases / Exceptions:** A submission whose label no longer matches any current topic (e.g., topic renamed/removed) is still shown, unattached, rather than silently dropped. **(Assumption.)**
- **Acceptance Criteria:** Every submitted audio recording appears under exactly one topic section matching its label, with correct duration/date/status shown.

**FR-REC-012 — Administrator: All-Submissions View**
- **Description:** Administrator has a platform-wide view of all students' audio and video submissions, most-recent first, with an unreviewed count.
- **Stakeholder:** Administrator.
- **Inputs:** None (default view); optional filters by student/topic/kind/status.
- **System Behavior:** Platform lists every submission across all students with student name, kind, label, duration, date, and reviewed status.
- **Output / Result:** A single place to triage new submissions across the whole platform.
- **Error Cases / Exceptions:** No submissions yet → explicit empty state.
- **Acceptance Criteria:** The unreviewed count shown matches an independent count of submissions with `reviewed = false`; every submission from every student appears exactly once.

**FR-REC-013 — Administrator: Per-Student, Per-Topic Submissions View**
- **Description:** On an individual student's detail page, that student's audio submissions appear grouped under each of their assigned topics (next to that topic's AI analysis), and their weekly video check-ins appear in a separate section.
- **Stakeholder:** Administrator.
- **Inputs:** Selected student.
- **System Behavior:** Platform filters that student's submissions by kind and matches audio submissions to the corresponding topic card.
- **Output / Result:** Full per-student, per-topic recording history visible in context, not just as a flat list.
- **Error Cases / Exceptions:** A topic with no submission yet shows an explicit "No recording submitted yet" state rather than an empty gap.
- **Acceptance Criteria:** For a given student, the topic cards on their detail page show exactly that student's own submissions for each topic, and only their video check-ins appear in the weekly section.

**FR-REC-014 — Mark Submission Reviewed / Unreviewed**
- **Description:** Administrator can toggle a submission's reviewed status.
- **Stakeholder:** Administrator.
- **Inputs:** Target submission; Administrator's toggle action.
- **System Behavior:** Platform flips the `reviewed` flag on that submission only.
- **Output / Result:** Status badge updates immediately everywhere that submission is shown (all-submissions view and the student's detail page).
- **Error Cases / Exceptions:** N/A.
- **Acceptance Criteria:** Toggling reviewed status on one submission does not affect any other submission's status, and is reflected consistently across both admin views without a page reload.

**FR-REC-015 — Unreviewed Count / Alert**
- **Description:** Administrators see a visible count of unreviewed submissions.
- **Stakeholder:** Administrator.
- **Inputs:** Current set of submissions with `reviewed = false`.
- **System Behavior:** Platform computes and displays this count on the relevant dashboard panel(s).
- **Output / Result:** A prominent badge/number reflecting outstanding review work.
- **Error Cases / Exceptions:** Count is zero → badge is hidden or shows zero explicitly, not a stale prior number.
- **Acceptance Criteria:** The displayed count always equals the live number of submissions with `reviewed = false` at the time of viewing.

**FR-REC-016 — Playback Access Control**
- **Description:** Only the owning Student and any Administrator may play back a given submission.
- **Stakeholder:** Student; Administrator.
- **Inputs:** Playback request; submission's owner.
- **System Behavior:** Platform serves the media file only to requests from the owning Student's authenticated session or an Administrator session.
- **Output / Result:** Unauthorized playback requests are denied.
- **Error Cases / Exceptions:** N/A beyond FR-REC-001/FR-001 (companion document) enforcement.
- **Acceptance Criteria:** A submission's media URL/endpoint rejects requests from any authenticated Student other than its owner.

---

## 7. Session/Recording States

Each recording attempt (audio or video) moves through the same state model:

```
Idle -> Requesting Permission -> Recording -> Recorded (Preview) -> Submitted
Requesting Permission -> Permission Denied / Unavailable  (back to Idle with an error shown)
Recorded (Preview) -> Idle           (discard / re-record, FR-REC-006)
```

**FR-REC-017 — Defined Recording State Machine**
- **Description:** The recording UI must reflect one of the states above at all times, matching the pattern already established for Avatar-session states in the companion document.
- **Stakeholder:** Student.
- **Inputs:** Recording lifecycle events.
- **System Behavior:** UI transitions strictly along the diagram above; no state is skipped (e.g., **Idle** cannot jump directly to **Submitted**).
- **Output / Result:** Predictable, consistent recording UI across both the audio-task flow and the video-check-in flow.
- **Error Cases / Exceptions:** Any unexpected transition is rejected/logged rather than silently applied.
- **Acceptance Criteria:** Walking through a full recording attempt (success path and each failure path) never produces a UI state outside this diagram.

---

## 8. Non-Functional Requirements

**NFR-REC-001 — Recording Duration Limit**
- **Description:** Both audio and video recordings should have a sensible maximum duration to bound file size and review burden. **(Assumption: exact limits unconfirmed — see Open Questions.)**
- **Acceptance Criteria:** Recording auto-stops (or blocks continuing) at the configured maximum, with the Student notified before the cutoff.

**NFR-REC-002 — File Size / Format**
- **Description:** Recordings must be stored in a broadly compatible format and within a bounded file size for reliable upload/playback.
- **Acceptance Criteria:** All submitted recordings play back correctly in the platform's supported browser matrix (per the companion document's NFR-009) without requiring a plugin.

**NFR-REC-003 — Upload Reliability**
- **Description:** Submission of a completed recording must be resilient to transient network issues.
- **Acceptance Criteria:** A submission attempt that fails due to a network blip is retried or clearly reported as failed (with the recording preserved locally so the Student doesn't have to re-record) rather than silently lost.

**NFR-REC-004 — Storage Security & Privacy**
- **Description:** Recordings (especially video, which contains the Student's likeness) must be stored access-controlled and encrypted at rest, consistent with the companion document's NFR-006.
- **Acceptance Criteria:** Direct storage inspection confirms encryption; access outside FR-REC-001/FR-REC-016's rules is rejected and logged.

**NFR-REC-005 — Device/Browser Compatibility**
- **Description:** Recording must work on the platform's supported desktop and mobile browsers (per companion NFR-009), including handling mobile-specific permission prompts.
- **Acceptance Criteria:** The full record → preview → submit flow completes without defect on the supported browser matrix, on both desktop and mobile.

**NFR-REC-006 — Responsive Layout**
- **Description:** Recording controls (including the live camera self-view for video) must remain usable at mobile viewport widths.
- **Acceptance Criteria:** No overlapping controls or cut-off self-view preview at common mobile widths (e.g., 375px).

---

## 9. Out of Scope

- AI evaluation/scoring of a recording's spoken content (covered by the platform's existing AI Reports/analysis functions, not by this document).
- Live, two-way audio/video interaction — that is the Maya Avatar session, covered entirely by the companion LiveKit document.
- Editing a recording (trimming, filters) beyond re-recording from scratch.
- Sharing a recording outside the platform (e.g., export/download by the Student) unless later requested.

---

## 10. Open Questions

1. **Duration limits:** What is the maximum allowed length for a per-task audio recording, and for a weekly video check-in?
2. **Replacement history:** When a Student re-submits for a task/week that already has a submission (FR-REC-008), is the prior submission discarded, or retained as history for audit/progress-tracking purposes?
3. **Minimum duration guard:** Should an accidental near-zero-length recording be blocked from submission, or is any non-empty recording acceptable?
4. **Check-in cutoff:** Is there a deadline after which a given week's video check-in can no longer be submitted or replaced, or does it remain open indefinitely?
5. **Retention:** How long are audio/video submissions retained, and does a Student's account deletion (companion document, FR-007) also delete their submissions?
6. **Notifications:** Should an Administrator receive an active notification/alert (per the companion document's Section 10) when a new submission arrives, beyond the passive unreviewed count?
7. **Storage backend:** Where are recordings persisted in production (object storage, CDN, etc.) — not specified here as it is an implementation detail, but confirm before implementation.
