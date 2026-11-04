"use client";

import { useCallback, useEffect, useState } from "react";
import { classesApi } from "../api/client";
import type { LiveClassPublic } from "../api/types";

/** A student's own classes - every Group/1:1 session they're enrolled in.
 *
 * `enabled` defaults to true but exists for the same reason as
 * `useMySubmissions`'s: this hook is used from `StudentClassesProvider`,
 * mounted in `/student`'s layout - reachable by every role (that's how an
 * Administrator/Root uses the Student/Admin switch), while `GET /classes/me`
 * is Student-only. Without this, an Administrator viewing `/student` would
 * fire a call that 403s. */
export function useMyClasses(enabled = true) {
  const [classes, setClasses] = useState<LiveClassPublic[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    classesApi
      .listMine()
      .then(result => { if (!cancelled) { setClasses(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load classes.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { classes, loading, error, refetch };
}

/** The admin's own scheduled classes - a plain hook, not a shared context,
 * since only the Classes page reads it (matches why `useSubmissionsForAdmin`
 * is a plain hook too). */
export function useClassesForAdmin(enabled = true) {
  const [classes, setClasses] = useState<LiveClassPublic[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    classesApi
      .listForAdmin()
      .then(result => { if (!cancelled) { setClasses(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load classes.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { classes, loading, error, refetch };
}
