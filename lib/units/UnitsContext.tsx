"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useUnits } from "../hooks/useUnits";
import type { Level, UnitPublic } from "../api/types";

type UnitsContextValue = {
  units: UnitPublic[] | null;
  unitsByLevel: Partial<Record<Level, UnitPublic[]>>;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

const UnitsContext = createContext<UnitsContextValue | null>(null);

/** Same sharing pattern as `TopicsProvider` - fetches the signed-in teacher's
 * visible units (their own + legacy/shared ones; Root sees every unit) once
 * per admin section rather than once per page. */
export function UnitsProvider({ children }: { children: ReactNode }) {
  const { units, loading, error, refetch } = useUnits();
  const unitsByLevel = useMemo(() => {
    const grouped: Partial<Record<Level, UnitPublic[]>> = {};
    for (const unit of units ?? []) {
      (grouped[unit.level] ??= []).push(unit);
    }
    return grouped;
  }, [units]);
  const value = useMemo(
    () => ({ units, unitsByLevel, loading, error, refetch }),
    [units, unitsByLevel, loading, error, refetch],
  );
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnitsContext(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnitsContext must be used within a UnitsProvider");
  return ctx;
}
