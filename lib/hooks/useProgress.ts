"use client";

import { useCallback, useEffect, useState } from "react";
import { meApi } from "../api/client";
import type { ChallengeCalendar, StudentProgress } from "../api/types";

/** The authenticated student's own streak/badges/challenge-day - same
 * fetch-on-mount + refetch shape as `useMySessions`. */
export function useStudentProgress(enabled = true) {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    meApi
      .getProgress()
      .then(result => { if (!cancelled) { setProgress(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load progress.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { progress, loading, error, refetch };
}

/** Which topic occupies each day of the challenge calendar, and its real
 * done/current/missed/locked state - see `useStudentProgress` for the
 * sibling streak/badges data. Kept separate since the challenge page is the
 * only consumer. */
export function useChallengeCalendar(enabled = true) {
  const [calendar, setCalendar] = useState<ChallengeCalendar | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    meApi
      .getChallengeCalendar()
      .then(result => { if (!cancelled) { setCalendar(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load the challenge calendar.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { calendar, loading, error, refetch };
}
