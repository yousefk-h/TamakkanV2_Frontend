"use client";

import { ArrowLeft } from "lucide-react";
import type { Role } from "@/lib/api/types";
import { Avatar } from "./Avatar";

const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
  administrator: "Center Admin",
  root: "Center Admin",
};

/** Deliberately no call/video buttons and no online-status dot - this app
 * has no voice/video calling and no presence signal, and a fake one would
 * be exactly the "working call button that doesn't work" this feature was
 * explicitly asked not to ship. */
export function ChatHeader({ name, role, onBack }: { name: string | null; role: Role | null; onBack?: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-3 py-2.5 sm:px-4">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-bg rtl:rotate-180">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
      )}
      <Avatar name={name} role={role} />
      <div className="min-w-0">
        <p className="m-0 truncate text-sm font-extrabold text-ink">{name ?? "Unknown"}</p>
        {role && <p className="m-0 text-xs text-muted">{ROLE_LABEL[role]}</p>}
      </div>
    </div>
  );
}
