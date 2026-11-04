"use client";

import { useCallback, useEffect, useState } from "react";
import { sessionsApi } from "../api/client";
import type { LiveSessionListItem } from "../api/types";

/** A student's own "Discuss with Mariam" session history, newest first - the
 * AI report (if any) lands on each row directly, see `LiveSessionListItem`.
 * Same "list vs detail" shape as `useMySubmissions`. */
export function useMySessions(enabled = true) {
  const [sessions, setSessions] = useState<LiveSessionListItem[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    sessionsApi
      .listMine()
      .then(result => { if (!cancelled) { setSessions(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load sessions.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { sessions, loading, error, refetch };
}

/** The admin's own students' session history - same "your own roster only"
 * scoping the backend already enforces, same reasoning as
 * `useSubmissionsForAdmin` for the `enabled` flag. */
export function useSessionsForAdmin(enabled = true) {
  const [sessions, setSessions] = useState<LiveSessionListItem[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    sessionsApi
      .listForAdmin()
      .then(result => { if (!cancelled) { setSessions(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load sessions.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { sessions, loading, error, refetch };
}
