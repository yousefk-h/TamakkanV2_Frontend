"use client";

import { useCallback, useEffect, useState } from "react";
import { submissionsApi } from "../api/client";
import type { ListSubmissionsForAdminParams, SubmissionPublic } from "../api/types";

/** A student's own submission history - every end-of-week video check-in
 * (and any audio task, though nothing writes those anymore), newest first.
 *
 * `enabled` defaults to true but exists because this hook is used from
 * `StudentSubmissionsProvider`, mounted in `/student`'s layout - reachable by
 * every role (that's how an Administrator/Root uses the Student/Admin
 * switch), while `GET /submissions/me` is Student-only. Without this, an
 * Administrator viewing `/student` would fire a call that 403s. */
export function useMySubmissions(enabled = true) {
  const [submissions, setSubmissions] = useState<SubmissionPublic[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    submissionsApi
      .listMine()
      .then(result => { if (!cancelled) { setSubmissions(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load submissions.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { submissions, loading, error, refetch };
}

/** The admin's filtered view over their own students' submissions - a plain
 * hook rather than a shared context, since the admin's filters (student,
 * topic, reviewed) are page-local UI state, not something worth sharing.
 *
 * `enabled` defaults to true but exists for the same reason as
 * `useMySubmissions`'s: `admin/layout.tsx` calls this before its own
 * authenticated-admin guard has necessarily resolved (the hook call itself
 * can't be conditional - React's rules require every render to call the same
 * hooks), and `GET /submissions` is Administrator-only. */
export function useSubmissionsForAdmin(params?: ListSubmissionsForAdminParams, enabled = true) {
  const [submissions, setSubmissions] = useState<SubmissionPublic[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // JSON-stringified so an inline object literal at the call site doesn't
  // retrigger the effect every render.
  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    submissionsApi
      .listForAdmin(JSON.parse(paramsKey))
      .then(result => { if (!cancelled) { setSubmissions(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load submissions.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paramsKey, enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);
  return { submissions, loading, error, refetch };
}
