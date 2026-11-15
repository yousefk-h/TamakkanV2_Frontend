"use client";

import { MariamSession } from "./MariamSession";

/** Thin, prop-driven wrapper around `MariamSession` for an Interactive Video "Practice with Mariam" checkpoint - the
 * LiveKit/avatar connection lifecycle lives in exactly one place (`MariamSession`/`useSpatialRealAvatar`); this file
 * only fixes the props a checkpoint always wants, so `InteractiveVideoLesson` has one small, readable call site.
 * Reached the video's checkpoint by definition already watched/playing, so `watched` is always true here - there is
 * no separate "watch first" gate for a mid-video checkpoint the way there is for the top-level Discuss tab. */
export function CheckpointMariamSession({
  topicId,
  enrollmentId,
  checkpointId,
  fixedDurationMinutes,
  onEnded,
}: {
  topicId: string;
  enrollmentId?: string;
  checkpointId: string;
  fixedDurationMinutes?: number;
  onEnded: (reason: "completed" | "error" | "user_ended") => void;
}) {
  return (
    <MariamSession
      topicId={topicId}
      enrollmentId={enrollmentId}
      watched
      checkpointId={checkpointId}
      fixedDurationMinutes={fixedDurationMinutes}
      compact
      onEnded={onEnded}
    />
  );
}
