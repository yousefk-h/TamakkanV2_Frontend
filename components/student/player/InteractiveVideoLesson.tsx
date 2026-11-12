"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ExerciseAttemptPublic, InteractiveVideoCheckpoint, TopicPublic } from "@/lib/api/types";
import { LessonExercises } from "./LessonExercises";

function completed(checkpoint: InteractiveVideoCheckpoint, attempt: ExerciseAttemptPublic | undefined) {
  if (!attempt) return false;
  return checkpoint.completion_rule === "submitted" || attempt.correct === true;
}

/** Native uploaded-video player with server-backed exercise checkpoints.
 * There is deliberately no YouTube branch: its current iframe integration
 * has no reliable playback API, and pretending to pause it would be a bypass.
 */
export function InteractiveVideoLesson({ topic, enrollmentId, onDiscuss, onWatched }: { topic: TopicPublic; enrollmentId?: string; onDiscuss: () => void; onWatched: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempts, setAttempts] = useState<Record<number, ExerciseAttemptPublic>>({});
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const checkpoints = useMemo(() => [...topic.interactive_video_checkpoints].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds), [topic.interactive_video_checkpoints]);
  const active = checkpoints.find(item => item.id === activeCheckpointId) ?? null;
  const nextRequired = useCallback((at: number) => checkpoints.find(item => item.timestamp_seconds <= at + 0.15 && !completed(item, attempts[item.exercise_index])) ?? null, [attempts, checkpoints]);
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
    const blocking = checkpoints.find(item => !completed(item, attempts[item.exercise_index]));
    if (blocking && video.currentTime > blocking.timestamp_seconds + 0.15) pauseFor(blocking);
  }, [activeCheckpointId, attempts, checkpoints, pauseFor]);
  const receiveAttempts = useCallback((items: ExerciseAttemptPublic[]) => setAttempts(Object.fromEntries(items.map(item => [item.exercise_index, item]))), []);
  const receiveAttempt = useCallback((attempt: ExerciseAttemptPublic) => {
    setAttempts(current => ({ ...current, [attempt.exercise_index]: attempt }));
    if (active && active.exercise_index === attempt.exercise_index && completed(active, attempt)) {
      setActiveCheckpointId(null);
      // Let the attempt response paint before playback resumes. The next
      // `timeupdate` sees this checkpoint complete and moves forward.
      window.setTimeout(() => { void videoRef.current?.play().catch(() => undefined); }, 120);
    }
  }, [active]);

  if (!topic.uploaded_video_url) return <p role="alert" className="rounded-xl border border-brand-coral bg-brand-coral-pale p-4 text-sm text-brand-coral">This interactive lesson is unavailable because its uploaded video is missing.</p>;
  return <div className="space-y-4">
    <div className="overflow-hidden rounded-2xl bg-brand-navy shadow-card">
      <video ref={videoRef} src={topic.uploaded_video_url} controls playsInline preload="metadata" className="aspect-video w-full object-contain" onPlay={onWatched} onTimeUpdate={enforceCheckpoint} onSeeking={enforceSeek} onLoadedMetadata={enforceSeek}>Your browser does not support video playback.</video>
    </div>
    {active ? <section className="rounded-2xl border-2 border-brand-blue bg-brand-primary-pale p-3 sm:p-4"><p className="mb-3 text-sm font-extrabold text-brand-blue">Video paused · complete this activity to continue</p><LessonExercises topic={topic} enrollmentId={enrollmentId} onVideo={() => undefined} onDiscuss={onDiscuss} onlyExerciseIndices={[active.exercise_index]} onAttemptSaved={receiveAttempt} onAttemptsLoaded={receiveAttempts} /></section> : <p className="rounded-xl bg-bg p-3 text-sm text-muted">Watch the video. It will pause at your lesson activities.</p>}
  </div>;
}
