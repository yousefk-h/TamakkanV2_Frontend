"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authApi } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function ResendVerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<"sent" | "error" | null>(null);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending || seconds > 0) return;
    setSending(true);
    setResult(null);
    try {
      await authApi.requestEmailVerification(email.trim());
      setResult("sent");
      setSeconds(60);
    } catch {
      setResult("error");
    } finally {
      setSending(false);
    }
  }

  return <form onSubmit={submit} className="grid min-w-0 gap-4">
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {t("auth.login.email")}
      <input type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false}
        dir="ltr" value={email} onChange={event => setEmail(event.target.value)}
        className="min-h-12 min-w-0 w-full rounded-xl border border-line bg-card px-3 text-base outline-brand-blue" />
    </label>
    {result && <p role={result === "error" ? "alert" : "status"} className={`text-sm leading-relaxed ${result === "error" ? "text-brand-coral" : "text-ink"}`}>
      {t(result === "sent" ? "verification.requested" : "verification.networkError")}
    </p>}
    <button type="submit" disabled={sending || seconds > 0}
      className="min-h-12 w-full rounded-xl border border-brand-blue px-4 py-3 text-sm font-bold text-brand-blue disabled:opacity-60">
      {sending ? t("verification.sending") : seconds > 0 ? t("verification.wait", { seconds }) : t("verification.resend")}
    </button>
    <p className="text-xs leading-relaxed text-muted">{t("verification.resendHelp")}</p>
  </form>;
}
