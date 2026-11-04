"use client";

import { useCallback, useEffect, useState } from "react";
import { usersApi } from "../api/client";
import type { UserPublic } from "../api/types";

/** The signed-in Administrator/Root's own students - mirrors `useTopics`'s
 * shape exactly. `GET /users` already scopes to "students you created" -
 * nothing further to filter client-side except by `plan` for the
 * awaiting-assignment queue. */
export function useStudents() {
  const [students, setStudents] = useState<UserPublic[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // Email verification often finishes in another tab. Refresh the roster
    // when the teacher returns so its account statuses stay current.
    const refresh = () => setReloadToken(value => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    usersApi
      .listMyStudents()
      .then(result => {
        if (!cancelled) {
          setStudents(result);
          setError(null);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err : new Error("Failed to load students."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => {
    setLoading(true);
    setReloadToken(t => t + 1);
  }, []);

  return { students, loading, error, refetch };
}
