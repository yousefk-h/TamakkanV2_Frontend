"use client";

import { useCallback, useEffect, useState } from "react";
import { sessionsApi } from "../api/client";
import type { ListReportsParams, SessionPage } from "../api/types";

/** One server-side page of the admin's AI reports for exactly these filters. The previous page stays on screen (`data`)
 * while the next one loads, so changing a filter never blanks the list; `loading` is true until the response for the
 * CURRENT params arrives, and a stale response (the params changed again meanwhile) is dropped. */
export function useReportPage(params: ListReportsParams) {
  const paramsKey = JSON.stringify(params);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${paramsKey}#${reloadToken}`;
  const [result, setResult] = useState<{ key: string; data: SessionPage | null; error: Error | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    sessionsApi
      .listReports(JSON.parse(paramsKey))
      .then(data => { if (!cancelled) setResult({ key: requestKey, data, error: null }); })
      .catch(err => {
        if (!cancelled) setResult(prev => ({ key: requestKey, data: prev?.data ?? null, error: err instanceof Error ? err : new Error("Failed to load reports.") }));
      });
    return () => { cancelled = true; };
  }, [paramsKey, requestKey]);

  const refetch = useCallback(() => setReloadToken(token => token + 1), []);
  return { data: result?.data ?? null, loading: result?.key !== requestKey, error: result?.key === requestKey ? result.error : null, refetch };
}
