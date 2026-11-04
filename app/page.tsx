"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth/AuthContext";
import { LoadingScreen } from "../components/auth/LoadingScreen";
import { LoginScreen } from "../components/auth/LoginScreen";

export default function Home() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "authenticated") {
      router.replace(state.user.role === "student" ? "/student" : "/admin");
    }
  }, [state, router]);

  if (state.status === "unauthenticated") return <LoginScreen />;
  return <LoadingScreen />;
}
