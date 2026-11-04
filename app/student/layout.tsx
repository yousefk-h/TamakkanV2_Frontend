"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/AuthContext";
import { TopicsProvider } from "../../lib/topics/TopicsContext";
import { StudentSubmissionsProvider } from "../../lib/submissions/StudentSubmissionsContext";
import { Sidebar } from "../../components/layout/Sidebar";
import { Topbar } from "../../components/layout/Topbar";
import { LoadingScreen } from "../../components/auth/LoadingScreen";

// Every role can reach /student - this is how an administrator/root uses the
// sidebar's Student/Admin switch. Only /admin is role-gated (see its layout).
export default function StudentLayout({ children }: { children: ReactNode }) {
  const { state, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/");
  }, [state, router]);

  if (state.status !== "authenticated") return <LoadingScreen />;

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar variant="student" canSwitchView={state.user.role !== "student"} onLogout={handleLogout} />
      <div className="app-content min-w-0 flex-1 lg:ms-[232px]">
        <Topbar canSwitchView={state.user.role !== "student"} onLogout={handleLogout} user={state.user} />
        <TopicsProvider>
          <StudentSubmissionsProvider>{children}</StudentSubmissionsProvider>
        </TopicsProvider>
      </div>
    </div>
  );
}
