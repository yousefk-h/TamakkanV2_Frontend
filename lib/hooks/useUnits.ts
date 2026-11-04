"use client";

import { useCallback, useEffect, useState } from "react";
import { unitsApi } from "../api/client";
import type { ListUnitsParams, UnitPublic } from "../api/types";

export function useUnits(params?: ListUnitsParams) {
  const [units, setUnits] = useState<UnitPublic[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    let cancelled = false;
    unitsApi
      .list(JSON.parse(paramsKey))
      .then(result => { if (!cancelled) { setUnits(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load units.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paramsKey, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  return { units, loading, error, refetch };
}
