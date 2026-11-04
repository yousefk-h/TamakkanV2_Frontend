"use client";

import { useCallback, useEffect, useState } from "react";
import { usersApi } from "../api/client";
import type { ListStudentsParams, UserPage } from "../api/types";

/** One server-side page of the admin's own students for exactly these params - mirrors `useReportPage`. The
 * previous page stays on screen (`data`) while the next one loads, so changing a filter never blanks the table;
 * `loading` is true until the response for the CURRENT params arrives, and a stale response (the params changed
 * again meanwhile) is dropped. */
export function useStudentsPage(params: ListStudentsParams) {
  const paramsKey = JSON.stringify(params);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${paramsKey}#${reloadToken}`;
  const [result, setResult] = useState<{ key: string; data: UserPage | null; error: Error | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    usersApi
      .listStudentsPage(JSON.parse(paramsKey))
      .then(data => { if (!cancelled) setResult({ key: requestKey, data, error: null }); })
      .catch(err => {
        if (!cancelled) setResult(prev => ({ key: requestKey, data: prev?.data ?? null, error: err instanceof Error ? err : new Error("Failed to load students.") }));
      });
    return () => { cancelled = true; };
  }, [paramsKey, requestKey]);

  const refetch = useCallback(() => setReloadToken(token => token + 1), []);
  return { data: result?.data ?? null, loading: result?.key !== requestKey, error: result?.key === requestKey ? result.error : null, refetch };
}
