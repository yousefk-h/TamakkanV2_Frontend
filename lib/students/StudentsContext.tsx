"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useStudents } from "../hooks/useUsers";
import type { UserPublic } from "../api/types";

type StudentsContextValue = {
  students: UserPublic[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

const StudentsContext = createContext<StudentsContextValue | null>(null);

/** Fetches the signed-in admin's real student roster once per /admin section
 * visit and shares it across every route via Context, same pattern as
 * `TopicsContext`. Replaces the old mock `lib/mock/StudentsContext`. */
export function StudentsProvider({ children }: { children: ReactNode }) {
  const { students, loading, error, refetch } = useStudents();
  const value = useMemo(() => ({ students, loading, error, refetch }), [students, loading, error, refetch]);
  return <StudentsContext.Provider value={value}>{children}</StudentsContext.Provider>;
}

export function useStudentsContext(): StudentsContextValue {
  const ctx = useContext(StudentsContext);
  if (!ctx) throw new Error("useStudentsContext must be used within a StudentsProvider");
  return ctx;
}
