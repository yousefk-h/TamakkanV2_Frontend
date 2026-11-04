"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, meApi } from "../api/client";
import type { UserPublic } from "../api/types";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: UserPublic };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // The session lives in httpOnly cookies the browser can't read directly -
  // this is how the app finds out whether one already exists (e.g. after a
  // page refresh). A failure here just means "not logged in", not an error.
  useEffect(() => {
    let cancelled = false;
    meApi
      .get()
      .then(user => { if (!cancelled) setState({ status: "authenticated", user }); })
      .catch(() => { if (!cancelled) setState({ status: "unauthenticated" }); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await authApi.login({ email, password });
    setState({ status: "authenticated", user });
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setState({ status: "unauthenticated" });
  }, []);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
