"use client";

import type { UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { ResendVerificationForm } from "@/components/auth/ResendVerificationForm";

export function EmailVerificationStatus({ user, allowResend = false }: { user: UserPublic; allowResend?: boolean }) {
  const { t } = useI18n();
  if (!user.email_verification_status) return null; // Compatibility with an older API.
  const pending = user.email_verification_status === "pending";
  return <div className="mt-2 min-w-0 text-xs">
    <span className={`inline-flex rounded-lg px-2 py-1 font-semibold ${pending ? "bg-amber-50 text-amber-900" : "bg-brand-primary-pale text-ink"}`}>
      {t(user.email_verification_status === "verified" ? "verification.verified" : pending ? "verification.pending" : "verification.notRequired")}
    </span>
    {pending && user.email_verification_delivery === "failed" && <p className="mt-2 text-brand-coral">{t("verification.deliveryFailed")}</p>}
    {pending && allowResend && <details className="mt-3 max-w-sm">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-brand-blue">{t("verification.resend")}</summary>
      <ResendVerificationForm key={user.email} initialEmail={user.email} />
    </details>}
  </div>;
}
