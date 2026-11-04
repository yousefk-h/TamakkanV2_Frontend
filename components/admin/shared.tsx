"use client";

import type { ReactNode } from "react";
import { initials } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { statusTone, type StatusTone } from "./statusTone";

const AVATAR_TONES = [
  "bg-gradient-to-br from-brand-blue to-brand-cyan",
  "bg-gradient-to-br from-[#ff7d57] to-[#ffaf6d]",
  "bg-gradient-to-br from-accent-indigo to-accent-pink",
];

/** Initials chip reused across every admin student list/table/detail view -
 * `tone` cycles the same 3 gradients the old CSS keyed off `.av0/.av1/.av2`
 * (tone 0 doubles as the plain `.initial` default, since the old stylesheet
 * never defined a distinct `.av0` rule). */
export function Avatar({ name, tone = 0, size = "md" }: { name: string; tone?: number; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "size-14 rounded-2xl text-lg" : "size-9 rounded-[10px] text-xs";
  return (
    <span className={`grid flex-none place-items-center font-extrabold text-white ${sizeClass} ${AVATAR_TONES[tone % AVATAR_TONES.length]}`}>
      {initials(name)}
    </span>
  );
}

const STATUS_TONE_STYLES: Record<StatusTone, string> = {
  risk: "bg-brand-coral-pale text-brand-coral",
  excellent: "bg-brand-primary-pale text-brand-primary",
  default: "bg-[#ecf9f5] text-[#079b75]",
};

export function StatusPill({ status, tone }: { status: string; tone?: StatusTone }) {
  const resolvedTone = tone ?? statusTone(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE_STYLES[resolvedTone]}`}>
      <i className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function PlanBadge({ plan }: { plan: "pro" | "standard" }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold tracking-wide ${
        plan === "pro" ? "bg-gradient-to-r from-[#ffb547] to-[#ff8b37] text-white" : "bg-bg text-muted"
      }`}
    >
      {plan === "pro" ? t("shared.planPro") : t("shared.planStandard")}
    </span>
  );
}

export function LevelTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-brand-primary-pale px-2.5 py-1 text-xs font-bold text-brand-blue">{children}</span>;
}
