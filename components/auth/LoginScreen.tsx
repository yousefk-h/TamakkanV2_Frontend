"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BookOpen, MessagesSquare, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/client";
import { Logo, Wordmark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { ResendVerificationForm } from "./ResendVerificationForm";

export function LoginScreen() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const pending = err instanceof ApiError && err.code === "email_verification_required";
      setNeedsVerification(pending);
      setError(pending ? t("verification.loginRequired") : err instanceof ApiError ? err.message : t("auth.login.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-svh place-items-center bg-bg px-4 py-6 tamakkan-login">
      <div className="tamakkan-login-shell">
        <aside className="tamakkan-login-story" aria-label={t("branding.learningSpace")}>
          <div className="flex items-center gap-3"><Logo className="size-14" /><Wordmark /></div>
          <div className="my-auto py-12">
            <p className="mb-4 text-xs font-bold uppercase tracking-[.18em] text-sky-200">{t("branding.learningSpace")}</p>
            <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight xl:text-5xl">{t("branding.heroTitle")}</h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-white/85">{t("branding.heroDescription")}</p>
            <div className="mt-9 grid gap-5">
              {([
                [BookOpen, "branding.learn", "branding.learnDescription"],
                [MessagesSquare, "branding.practice", "branding.practiceDescription"],
                [TrendingUp, "branding.grow", "branding.growDescription"],
              ] as const).map(([StepIcon, title, description]) => <div key={title} className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10"><StepIcon className="size-5" aria-hidden="true" /></span>
                <div><h3 className="text-sm font-semibold">{t(title)}</h3><p className="mt-1 text-sm leading-relaxed text-white/75">{t(description)}</p></div>
              </div>)}
            </div>
          </div>
          <p className="text-sm text-white/80">{t("branding.tagline")}</p>
        </aside>
        <div className="tamakkan-login-form-area">
        <div className="mb-3 flex justify-end">
          <LanguageSwitcher />
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-card p-8 shadow-card tamakkan-login-form">
          <div className="mb-8 flex items-center gap-3 text-ink"><Logo className="size-14" /><Wordmark /></div>
          <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-ink">{t("branding.welcome")}</h1>
          <p className="mb-6 text-sm text-muted">{t("auth.login.subtitle")}</p>
          <label className="mb-4 grid gap-1.5 text-sm font-semibold text-ink">
            {t("auth.login.email")}
            <input
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="rounded-[9px] border border-line px-3 py-2.5 text-sm text-ink outline-brand-blue"
            />
          </label>
          <label className="mb-4 grid gap-1.5 text-sm font-semibold text-ink">
            {t("auth.login.password")}
            <input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="rounded-[9px] border border-line px-3 py-2.5 text-sm text-ink outline-brand-blue"
            />
          </label>
          {error && (
            <p role="alert" className="mb-4 text-sm text-brand-coral">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-12 w-full rounded-[10px] bg-brand-blue py-3 text-sm font-bold text-white shadow-(--shadow-brand-button) transition-colors hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
          {!needsVerification && <Link href="/verify-email" className="mt-4 flex min-h-11 items-center justify-center text-center text-sm font-semibold text-brand-blue">{t("verification.resend")}</Link>}
        </form>
        {needsVerification && <section className="mt-5 rounded-2xl border border-line bg-card p-5" aria-label={t("verification.resend")}>
          <ResendVerificationForm initialEmail={email} />
        </section>}
        <p className="mt-6 text-center text-xs leading-relaxed text-muted">{t("branding.tagline")}</p>
        </div>
      </div>
    </div>
  );
}
