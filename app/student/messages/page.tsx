"use client";

import { Suspense } from "react";
import { MessagingWorkspace } from "@/components/messaging/MessagingWorkspace";

export default function StudentMessagesPage() {
  return <Suspense fallback={null}>
    <MessagingWorkspace canCompose={false} canBroadcastCenter={false} />
  </Suspense>;
}
