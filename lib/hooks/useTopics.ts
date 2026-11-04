"use client";

import { useCallback, useEffect, useState } from "react";
import { topicsApi } from "../api/client";
import type { ListTopicsParams, TopicListItem, TopicPublic } from "../api/types";

export function useTopics(params?: ListTopicsParams) {
  const [topics, setTopics] = useState<TopicListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // JSON-stringified so an inline object literal at the call site doesn't
  // retrigger the effect every render.
  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    let cancelled = false;
    topicsApi
      .list(JSON.parse(paramsKey))
      .then(result => { if (!cancelled) { setTopics(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load topics.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paramsKey, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  return { topics, loading, error, refetch };
}

/** Fetched on demand, never up front - `TopicListItem` deliberately excludes
 * content fields for payload size, so a full `TopicPublic` is only worth
 * fetching once a specific topic is actually opened. */
export function useTopic(topicId: string | null) {
  const [topic, setTopic] = useState<TopicPublic | null>(null);
  const [loading, setLoading] = useState(topicId != null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    topicsApi
      .get(topicId)
      .then(result => { if (!cancelled) { setTopic(result); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load topic.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  // Masked rather than reset via effect when `topicId` goes null - a topic
  // never truly "unloads" itself, the caller just stops asking for one.
  return { topic: topicId ? topic : null, loading: topicId ? loading : false, error, refetch };
}
