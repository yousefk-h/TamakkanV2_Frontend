"use client";

import { useCallback, useEffect, useState } from "react";
import { teachersApi } from "../api/client";
import type { ListTeachersParams, UserPage } from "../api/types";

/** One server-side page of every Teacher in the center for exactly these params - mirrors `useStudentsPage`. */
export function useTeachersPage(params: ListTeachersParams) {
  const paramsKey = JSON.stringify(params);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${paramsKey}#${reloadToken}`;
  const [result, setResult] = useState<{ key: string; data: UserPage | null; error: Error | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    teachersApi
      .listTeachersPage(JSON.parse(paramsKey))
      .then(data => { if (!cancelled) setResult({ key: requestKey, data, error: null }); })
      .catch(err => {
        if (!cancelled) setResult(prev => ({ key: requestKey, data: prev?.data ?? null, error: err instanceof Error ? err : new Error("Failed to load teachers.") }));
      });
    return () => { cancelled = true; };
  }, [paramsKey, requestKey]);

  const refetch = useCallback(() => setReloadToken(token => token + 1), []);
  return { data: result?.data ?? null, loading: result?.key !== requestKey, error: result?.key === requestKey ? result.error : null, refetch };
}
