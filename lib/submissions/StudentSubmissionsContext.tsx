"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { useMySubmissions } from "../hooks/useSubmissions";
import type { SubmissionPublic } from "../api/types";

type StudentSubmissionsContextValue = {
  submissions: SubmissionPublic[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

const StudentSubmissionsContext = createContext<StudentSubmissionsContextValue | null>(null);

/** Fetches the signed-in student's own submission history once and shares it
 * across the challenge page and the submissions page via Context, the same
 * pattern as `TopicsProvider` - mounted in `app/student/layout.tsx`.
 *
 * `/student` is reachable by every role (the Student/Admin switch), but
 * `GET /submissions/me` is Student-only - `enabled` keeps an Administrator
 * or Root viewing their own `/student` dashboard from firing a call that
 * would 403. */
export function StudentSubmissionsProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const enabled = state.status === "authenticated" && state.user.role === "student";
  const { submissions, loading, error, refetch } = useMySubmissions(enabled);
  const value = useMemo(() => ({ submissions, loading, error, refetch }), [submissions, loading, error, refetch]);
  return <StudentSubmissionsContext.Provider value={value}>{children}</StudentSubmissionsContext.Provider>;
}

export function useStudentSubmissionsContext(): StudentSubmissionsContextValue {
  const ctx = useContext(StudentSubmissionsContext);
  if (!ctx) throw new Error("useStudentSubmissionsContext must be used within a StudentSubmissionsProvider");
  return ctx;
}
