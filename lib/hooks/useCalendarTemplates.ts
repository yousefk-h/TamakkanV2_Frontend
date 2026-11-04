"use client";

import { useCallback, useEffect, useState } from "react";
import { calendarTemplatesApi } from "../api/client";
import type { CalendarTemplate, TemplateKind } from "../api/types";

export function useCalendarTemplates(kind?: TemplateKind) {
  const [templates, setTemplates] = useState<CalendarTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    calendarTemplatesApi
      .list(kind)
      .then(result => { if (!cancelled) { setTemplates(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load calendar templates.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  return { templates, loading, error, refetch };
}

export function useCalendarTemplate(templateId: string | null) {
  const [template, setTemplate] = useState<CalendarTemplate | null>(null);
  const [loading, setLoading] = useState(templateId != null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    calendarTemplatesApi
      .get(templateId)
      .then(result => { if (!cancelled) { setTemplate(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load calendar template.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [templateId, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  return { template: templateId ? template : null, loading: templateId ? loading : false, error, refetch };
}
