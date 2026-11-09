"use client";

import { Suspense } from "react";
import { MessagingWorkspace } from "@/components/messaging/MessagingWorkspace";
import { useAuth } from "@/lib/auth/AuthContext";

export default function AdminMessagesPage() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  const isAdmin = state.user.role === "administrator" || state.user.role === "root";
  return <Suspense fallback={null}>
    <MessagingWorkspace canCompose={true} canBroadcastCenter={isAdmin} />
  </Suspense>;
}
