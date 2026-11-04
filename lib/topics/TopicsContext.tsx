"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useTopics } from "../hooks/useTopics";
import { groupTopicsByLevel } from "./helpers";
import type { Level, TopicListItem } from "../api/types";

type TopicsContextValue = {
  topics: TopicListItem[] | null;
  topicsByLevel: Partial<Record<Level, TopicListItem[]>>;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

const TopicsContext = createContext<TopicsContextValue | null>(null);

/** Fetches the signed-in user's entitled topics once per section (student or
 * admin) and shares the result across every route in that section via
 * Context, instead of each page independently re-fetching `GET /topics` on
 * every navigation - mounted inside each section's layout, after the auth
 * check passes, so it never fires while unauthenticated. */
export function TopicsProvider({ children }: { children: ReactNode }) {
  const { topics, loading, error, refetch } = useTopics();
  const topicsByLevel = useMemo(() => groupTopicsByLevel(topics ?? []), [topics]);
  const value = useMemo(
    () => ({ topics, topicsByLevel, loading, error, refetch }),
    [topics, topicsByLevel, loading, error, refetch],
  );
  return <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>;
}

export function useTopicsContext(): TopicsContextValue {
  const ctx = useContext(TopicsContext);
  if (!ctx) throw new Error("useTopicsContext must be used within a TopicsProvider");
  return ctx;
}
