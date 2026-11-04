"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/AuthContext";
import { TopicsProvider } from "../../lib/topics/TopicsContext";
import { UnitsProvider } from "../../lib/units/UnitsContext";
import { CalendarTemplatesProvider } from "../../lib/calendarTemplates/CalendarTemplatesContext";
import { StudentsProvider } from "../../lib/students/StudentsContext";
import { useSubmissionsForAdmin } from "../../lib/hooks/useSubmissions";
import { Sidebar } from "../../components/layout/Sidebar";
import { Topbar } from "../../components/layout/Topbar";
import { LoadingScreen } from "../../components/auth/LoadingScreen";

// A plain student role never sees /admin - redirected straight back to
// /student, matching the old `canSwitchView = !isStudent` behavior.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { state, logout } = useAuth();
  const router = useRouter();
  // Real unreviewed count for the sidebar's "AI Reports" badge - fetched
  // here (not inside Sidebar) because this hook hits an Administrator-only
  // endpoint, and Sidebar is also rendered for the Student role. `enabled`
  // waits for the guard below to actually confirm an authenticated admin -
  // this call site runs on every render, including the loading/redirect ones.
  const { submissions } = useSubmissionsForAdmin(
    { reviewed: false },
    state.status === "authenticated" && state.user.role !== "student",
  );

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/");
    else if (state.status === "authenticated" && state.user.role === "student") router.replace("/student");
  }, [state, router]);

  if (state.status !== "authenticated" || state.user.role === "student") return <LoadingScreen />;

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        variant="admin"
        canSwitchView
        onLogout={handleLogout}
        unreviewedCount={submissions?.length ?? 0}
        showUsersNav={state.user.role === "administrator"}
        showOperationsNav={state.user.role === "root"}
      />
      <div className="app-content min-w-0 flex-1 lg:ms-[232px]">
        <Topbar canSwitchView onLogout={handleLogout} user={state.user} />
        <TopicsProvider>
          <UnitsProvider>
            <CalendarTemplatesProvider>
              <StudentsProvider>{children}</StudentsProvider>
            </CalendarTemplatesProvider>
          </UnitsProvider>
        </TopicsProvider>
      </div>
    </div>
  );
}
