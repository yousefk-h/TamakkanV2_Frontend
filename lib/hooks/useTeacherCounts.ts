"use client";

import { useCallback, useEffect, useState } from "react";
import { teachersApi } from "../api/client";
import type { TeacherCounts } from "../api/types";

/** The Users dashboard's KPI cards - one small, independent request (never the full teacher list). */
export function useTeacherCounts() {
  const [counts, setCounts] = useState<TeacherCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    teachersApi
      .getTeacherCounts()
      .then(result => { if (!cancelled) setCounts(result); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken(t => t + 1), []);
  return { counts, loading, refetch };
}
