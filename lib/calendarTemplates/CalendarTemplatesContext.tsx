"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCalendarTemplates } from "../hooks/useCalendarTemplates";
import type { CalendarTemplate } from "../api/types";

type CalendarTemplatesContextValue = {
  templates: CalendarTemplate[] | null;
  standardTemplates: CalendarTemplate[];
  customTemplates: CalendarTemplate[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

const CalendarTemplatesContext = createContext<CalendarTemplatesContextValue | null>(null);

/** Fetches the admin's own calendar templates once and shares them across
 * every admin route via Context - same "fetch once per section" pattern as
 * `TopicsProvider`. */
export function CalendarTemplatesProvider({ children }: { children: ReactNode }) {
  const { templates, loading, error, refetch } = useCalendarTemplates();
  const standardTemplates = useMemo(() => (templates ?? []).filter(t => t.kind === "standard"), [templates]);
  const customTemplates = useMemo(() => (templates ?? []).filter(t => t.kind === "custom"), [templates]);
  const value = useMemo(
    () => ({ templates, standardTemplates, customTemplates, loading, error, refetch }),
    [templates, standardTemplates, customTemplates, loading, error, refetch],
  );
  return <CalendarTemplatesContext.Provider value={value}>{children}</CalendarTemplatesContext.Provider>;
}

export function useCalendarTemplatesContext(): CalendarTemplatesContextValue {
  const ctx = useContext(CalendarTemplatesContext);
  if (!ctx) throw new Error("useCalendarTemplatesContext must be used within a CalendarTemplatesProvider");
  return ctx;
}
