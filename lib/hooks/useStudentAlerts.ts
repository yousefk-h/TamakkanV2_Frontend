"use client";

import { useCallback, useEffect, useState } from "react";
import { usersApi } from "../api/client";
import type { StudentAlerts } from "../api/types";

/** The admin roster's warning badge - one batched fetch for the whole roster
 * rather than one call per student row. */
export function useStudentAlerts(enabled = true) {
  const [alerts, setAlerts] = useState<Record<string, StudentAlerts> | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    usersApi
      .getRosterAlerts()
      .then(result => { if (!cancelled) { setAlerts(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load student alerts.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  return { alerts, loading, error, refetch };
}

/** The student-detail page's own "Alerts" section - one student at a time. */
export function useStudentAlert(studentId: string) {
  const [alerts, setAlerts] = useState<StudentAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    usersApi
      .getAlerts(studentId)
      .then(result => { if (!cancelled) { setAlerts(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load this student's alerts.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  return { alerts, loading, error, refetch };
}
