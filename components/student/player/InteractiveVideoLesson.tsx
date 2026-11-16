"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { topicsApi } from "@/lib/api/client";
import type { ExerciseAttemptPublic, InteractiveVideoCheckpoint, TopicPublic } from "@/lib/api/types";
import { CheckpointMariamSession } from "./CheckpointMariamSession";
import { LessonExercises } from "./LessonExercises";

/** Defaults a checkpoint without a `kind` to "exercise" - same convention the backend applies server-side, kept
 * here too so older/unmigrated checkpoints (and any client code still constructing one without `kind`) keep working
 * untouched. */
function checkpointKind(checkpoint: InteractiveVideoCheckpoint) {
  return checkpoint.kind ?? "exercise";
}

/** `sessionCompleted` is this checkpoint's cached `getCheckpointSessionStatus` result - only meaningful (and only
 * ever read) for a "practice_with_mariam" checkpoint; `undefined` (not yet fetched, or the fetch failed) is treated
 * as NOT completed, the safe default that still enforces the pause. */
function completed(checkpoint: InteractiveVideoCheckpoint, attempt: ExerciseAttemptPublic | undefined, sessionCompleted: boolean | undefined) {
  if (checkpointKind(checkpoint) === "practice_with_mariam") return sessionCompleted === true;
  if (!attempt) return false;
  return checkpoint.completion_rule === "submitted" || attempt.correct === true;
}

/** Native uploaded-video player with server-backed exercise checkpoints.
 * There is deliberately no YouTube branch: its current iframe integration
 * has no reliable playback API, and pretending to pause it would be a bypass.
 */
export function InteractiveVideoLesson({ topic, enrollmentId, onDiscuss, onWatched }: { topic: TopicPublic; enrollmentId?: string; onDiscuss: () => void; onWatched: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempts, setAttempts] = useState<Record<number, ExerciseAttemptPublic>>({});
  // "practice_with_mariam" completion, keyed by checkpoint id (not exercise_index - these checkpoints have none).
  // Same spirit as `attempts` above: a local cache of server state, never the source of truth itself.
  const [sessionStatus, setSessionStatus] = useState<Record<string, boolean>>({});
  // Checkpoint id whose live Practice with Mariam session just ended without completing (e.g. a connection error) -
  // shows a retry/exit affordance in place of the session instead of silently resuming or re-trying forever.
  const [practiceIssue, setPracticeIssue] = useState<string | null>(null);
  // Bumped per checkpoint id on "Retry" to force a fresh `CheckpointMariamSession` mount (a fresh session, not a
  // reconnect into whatever the failed one left behind).
  const [retryNonce, setRetryNonce] = useState<Record<string, number>>({});
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [lessonFullscreen, setLessonFullscreen] = useState(false);
  const checkpoints = useMemo(() => [...topic.interactive_video_checkpoints].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds), [topic.interactive_video_checkpoints]);
  const active = checkpoints.find(item => item.id === activeCheckpointId) ?? null;

  // Fetches every Practice with Mariam checkpoint's completion once per checkpoint set, so an earlier-in-the-timeline
  // one already completed on a prior visit doesn't wrongly block `enforceSeek`/`enforceCheckpoint` below. A failed
  // fetch leaves that checkpoint's entry absent (treated as not-completed by `completed()` above) rather than
  // guessing - the safe default, never a false "done".
  useEffect(() => {
    const practiceCheckpoints = checkpoints.filter(item => checkpointKind(item) === "practice_with_mariam");
    if (!practiceCheckpoints.length) return;
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(practiceCheckpoints.map(async item => {
        try {
          const status = await topicsApi.getCheckpointSessionStatus(topic.id, item.id);
          return [item.id, status.completed] as const;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const resolved = results.filter((entry): entry is readonly [string, boolean] => entry !== null);
      if (resolved.length) setSessionStatus(current => ({ ...current, ...Object.fromEntries(resolved) }));
    })();
    return () => { cancelled = true; };
  }, [checkpoints, topic.id]);

  const nextRequired = useCallback((at: number) => checkpoints.find(item => item.timestamp_seconds <= at + 0.15 && !completed(item, attempts[item.exercise_index ?? -1], sessionStatus[item.id])) ?? null, [attempts, checkpoints, sessionStatus]);
  const pauseFor = useCallback((checkpoint: InteractiveVideoCheckpoint) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    // Native controls may report slightly beyond a checkpoint. Rewind to the
    // exact pause point so refresh/seek/replay is deterministic.
    if (Math.abs(video.currentTime - checkpoint.timestamp_seconds) > 0.4) video.currentTime = checkpoint.timestamp_seconds;
    setActiveCheckpointId(checkpoint.id);
  }, []);
  const enforceCheckpoint = useCallback(() => {
    if (activeCheckpointId) return;
    const next = nextRequired(videoRef.current?.currentTime ?? 0);
    if (next) pauseFor(next);
  }, [activeCheckpointId, nextRequired, pauseFor]);
  const enforceSeek = useCallback(() => {
    const video = videoRef.current;
    if (!video || activeCheckpointId) return;
    const blocking = checkpoints.find(item => !completed(item, attempts[item.exercise_index ?? -1], sessionStatus[item.id]));
    if (blocking && video.currentTime > blocking.timestamp_seconds + 0.15) pauseFor(blocking);
  }, [activeCheckpointId, attempts, checkpoints, pauseFor, sessionStatus]);
  const receiveAttempts = useCallback((items: ExerciseAttemptPublic[]) => setAttempts(Object.fromEntries(items.map(item => [item.exercise_index, item]))), []);
  const receiveAttempt = useCallback((attempt: ExerciseAttemptPublic) => {
    setAttempts(current => ({ ...current, [attempt.exercise_index]: attempt }));
    if (active && active.exercise_index === attempt.exercise_index && completed(active, attempt, undefined)) {
      setActiveCheckpointId(null);
      // Let the attempt response paint before playback resumes. The next
      // `timeupdate` sees this checkpoint complete and moves forward.
      window.setTimeout(() => { void videoRef.current?.play().catch(() => undefined); }, 120);
    }
  }, [active]);
  // Practice with Mariam: mirrors `receiveAttempt`'s resume pattern above, but completion is decided by the
  // backend's session-status endpoint (ground truth), not by optimistically trusting "the session ended" - a
  // connection failure before any real turns happened must not silently count as done. Falling back to "treat
  // ENDED as completed" only when the status check itself errors is a pragmatic fallback (there is nothing else
  // trustworthy to check at that point), not the general rule.
  const handlePracticeEnded = useCallback(async (checkpoint: InteractiveVideoCheckpoint, reason: "completed" | "error" | "user_ended") => {
    let isCompleted: boolean;
    try {
      const status = await topicsApi.getCheckpointSessionStatus(topic.id, checkpoint.id);
      isCompleted = status.completed;
    } catch {
      isCompleted = reason !== "error";
    }
    setSessionStatus(current => ({ ...current, [checkpoint.id]: isCompleted }));
    if (isCompleted) {
      setPracticeIssue(null);
      setActiveCheckpointId(null);
      window.setTimeout(() => { void videoRef.current?.play().catch(() => undefined); }, 120);
    } else {
      setPracticeIssue(checkpoint.id);
    }
  }, [topic.id]);
  const retryPractice = useCallback((checkpointId: string) => {
    setRetryNonce(current => ({ ...current, [checkpointId]: (current[checkpointId] ?? 0) + 1 }));
    setPracticeIssue(null);
  }, []);
  // Closing the floating activity popup (exercise OR practice, "Exit for now" on a failed session, or the popup's
  // own minimize control) leaves the video exactly where it is (already paused) without marking the checkpoint
  // complete - never trapping the student on a broken session, never losing their place or silently granting
  // credit, never letting a popup close count as completion. Pressing play again simply re-opens this same
  // checkpoint via `enforceCheckpoint`/`enforceSeek`, which re-evaluate completion from server-backed state only.
  const closeActivityPopup = useCallback(() => {
    setPracticeIssue(null);
    setActiveCheckpointId(null);
  }, []);
  useEffect(() => {
    const syncFullscreen = () => setLessonFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const toggleLessonFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      // Fullscreen is a convenience only; native playback and answering still work.
    }
  }, []);

  if (!topic.uploaded_video_url) return <p role="alert" className="rounded-xl border border-brand-coral bg-brand-coral-pale p-4 text-sm text-brand-coral">This interactive lesson is unavailable because its uploaded video is missing.</p>;
  // The floating popup only ever reserves horizontal room on wider screens, and only while something is actually
  // active - there is no permanently reserved exercise column either way. Below `sm` there is no room to reserve,
  // so the popup becomes a bottom sheet overlaying the video's own corner instead (see the panel's own classes).
  return <div ref={stageRef} className={lessonFullscreen ? "relative h-[100dvh] bg-black p-3 sm:p-4" : "relative"}>
    <div className={`relative overflow-hidden bg-brand-navy transition-[padding] duration-200 ${lessonFullscreen ? "h-full rounded-2xl" : "rounded-2xl shadow-card"} ${active ? "sm:pr-[380px]" : ""}`}>
      <video ref={videoRef} src={topic.uploaded_video_url} controls controlsList="nofullscreen" playsInline preload="metadata" className={lessonFullscreen ? "h-full w-full object-contain" : "aspect-video w-full object-contain"} onPlay={onWatched} onTimeUpdate={enforceCheckpoint} onSeeking={enforceSeek} onLoadedMetadata={enforceSeek}>Your browser does not support video playback.</video>
      <button type="button" onClick={() => void toggleLessonFullscreen()} className="absolute right-3 top-3 z-10 min-h-10 rounded-lg bg-brand-navy/90 px-3 text-sm font-bold text-white shadow-sm ring-1 ring-white/30">{lessonFullscreen ? "Exit full lesson screen" : "Full lesson screen"}</button>

      {/* The floating activity popup: a docked card on the right edge from `sm` up (inside the padding this box
      reserved above while active, so it never overlaps the video on a roomy screen), a bottom sheet below `sm`.
      Never a full-screen dark backdrop - closing it (or tapping outside, on mobile) only minimizes it; the video
      stays paused and the checkpoint stays incomplete until the server confirms otherwise. */}
      {active && <>
        <div onClick={closeActivityPopup} aria-hidden="true" className="fixed inset-0 z-30 bg-transparent sm:hidden" />
        <section aria-live="polite" className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-3xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgb(0,0,0,0.25)] sm:absolute sm:inset-x-auto sm:left-auto sm:top-3 sm:bottom-auto sm:right-3 sm:w-[360px] sm:max-w-[calc(100%-1.5rem)] sm:rounded-2xl sm:pb-4 sm:shadow-2xl">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className="m-0 text-sm font-extrabold text-brand-blue">{checkpointKind(active) === "practice_with_mariam" ? "Practice with Mariam to continue" : "Complete this activity to continue"}</p>
            <button type="button" onClick={closeActivityPopup} aria-label="Minimize activity" title="Minimize (your place is kept, nothing is marked complete)" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-bg hover:text-ink">✕</button>
          </div>
          {checkpointKind(active) === "practice_with_mariam" ? (
            practiceIssue === active.id ? <div className="rounded-xl border border-brand-coral bg-brand-coral-pale p-4 text-sm text-brand-coral">
              <p className="m-0 font-bold">The live session did not complete.</p>
              <p className="m-0 mt-1 text-xs">You can try again, or exit for now - your place in the video is kept either way.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => retryPractice(active.id)} className="min-h-10 rounded-lg bg-brand-blue px-3 text-sm font-bold text-white">Retry</button>
                <button type="button" onClick={closeActivityPopup} className="min-h-10 rounded-lg border border-line bg-card px-3 text-sm font-bold text-ink">Exit for now</button>
              </div>
            </div> : <CheckpointMariamSession
              key={`${active.id}-${retryNonce[active.id] ?? 0}`}
              topicId={topic.id}
              enrollmentId={enrollmentId}
              checkpointId={active.id}
              fixedDurationMinutes={active.session_duration_minutes ?? 2}
              conversationGoal={active.conversation_goal}
              learningObjective={active.learning_objective}
              onEnded={reason => void handlePracticeEnded(active, reason)}
            />
          ) : (
            // Exercise checkpoints always carry a real exercise_index - only "practice_with_mariam" (the branch
            // above) omits it; the type is optional purely to accommodate that other kind.
            <LessonExercises topic={topic} enrollmentId={enrollmentId} onVideo={() => undefined} onDiscuss={onDiscuss} onlyExerciseIndices={[active.exercise_index!]} onAttemptSaved={receiveAttempt} onAttemptsLoaded={receiveAttempts} />
          )}
        </section>
      </>}
    </div>
    {!active && !lessonFullscreen && <p className="mt-3 text-sm text-muted">Watch the video. It will pause at your lesson activities.</p>}
  </div>;
}
