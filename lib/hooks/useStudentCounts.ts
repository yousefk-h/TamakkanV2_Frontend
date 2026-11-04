"use client";

import { useCallback, useEffect, useState } from "react";
import { usersApi } from "../api/client";
import type { StudentCounts } from "../api/types";

/** The Users dashboard's KPI cards - one small, independent request (never the full roster). */
export function useStudentCounts() {
  const [counts, setCounts] = useState<StudentCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    usersApi
      .getStudentCounts()
      .then(result => { if (!cancelled) setCounts(result); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken(t => t + 1), []);
  return { counts, loading, refetch };
}
