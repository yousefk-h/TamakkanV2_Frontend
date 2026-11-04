"use client";

import { useCallback, useEffect, useState } from "react";
import { analyticsApi } from "../api/client";
import type { ActivityAnalytics } from "../api/types";

export function useAnalytics(scope: "admin" | "student", days: 7 | 30, enabled = true) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: ActivityAnalytics | null; error: boolean } | null>(null);
  const key = `${scope}:${days}:${revision}`;
  const refetch = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    analyticsApi.get(scope, days)
      .then(data => { if (!cancelled) setResult({ key, data, error: false }); })
      .catch(() => { if (!cancelled) setResult({ key, data: null, error: true }); });
    return () => { cancelled = true; };
  }, [scope, days, key, enabled]);
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("focus", refetch);
    return () => window.removeEventListener("focus", refetch);
  }, [enabled, refetch]);
  const current = enabled && result?.key === key ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? false, loading: enabled && !current, refetch };
}
