import type { Role } from "@/lib/api/types";
import { initials } from "@/lib/format";

/** No profile photos exist anywhere in this codebase's User model - every
 * avatar here is an initials circle, color-keyed by role so a thread's
 * "who is this" reads at a glance in the conversation list. Never a fake
 * online/presence dot - this app has no presence signal to show. */
export function Avatar({ name, role, size = "md" }: { name: string | null; role?: Role | null; size?: "sm" | "md" | "lg" }) {
  const dimension = size === "lg" ? "size-12 text-base" : size === "sm" ? "size-8 text-[11px]" : "size-10 text-sm";
  const palette = role === "teacher" ? "bg-brand-blue text-white"
    : role === "administrator" || role === "root" ? "bg-brand-navy text-white"
    : "bg-brand-primary-pale text-brand-navy";
  return (
    <span className={`grid ${dimension} shrink-0 place-items-center rounded-full font-extrabold ${palette}`} aria-hidden="true">
      {name ? initials(name) || "?" : "?"}
    </span>
  );
}
