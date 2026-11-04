"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { ApiError, authApi } from "@/lib/api/client";
import { Logo, Wordmark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { ResendVerificationForm } from "./ResendVerificationForm";

export function VerifyEmailScreen() {
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [stage, setStage] = useState<"loading" | "confirm" | "request" | "invalid" | "success">("loading");
  const [busy, setBusy] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const opened = useRef(false);
  const activeToken = useRef("");
  useEffect(() => {
    const openLink = () => {
      if (!window.location.hash && opened.current) return;
      opened.current = true;
      // Scrub the secret from the address/history after reading it. A newly
      // resent link may open in this same tab without remounting the page.
      const raw = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
      activeToken.current = raw ?? "";
      setToken(raw ?? "");
      setBusy(false);
      setNetworkError(false);
      setStage(raw ? (/^[A-Za-z0-9_-]{43}$/.test(raw) ? "confirm" : "invalid") : "request");
    };
    openLink();
    window.addEventListener("hashchange", openLink);
    return () => window.removeEventListener("hashchange", openLink);
  }, []);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setNetworkError(false);
    try {
      await authApi.confirmEmailVerification(token);
      if (activeToken.current !== token) return;
      setToken("");
      setStage("success");
    } catch (error) {
      if (activeToken.current !== token) return;
      if (error instanceof ApiError && error.status === 422) setStage("invalid");
      else setNetworkError(true);
    } finally {
      if (activeToken.current === token) setBusy(false);
    }
  }

  return <main className="grid min-h-svh place-items-center bg-bg px-4 py-8">
    <div className="w-full min-w-0 max-w-md">
      <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
      <section className="rounded-3xl border border-line bg-card p-6 shadow-card sm:p-8" aria-busy={busy}>
        <div className="mb-8 flex items-center gap-3"><Logo className="size-12" /><Wordmark /></div>
        <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-primary-pale text-brand-blue">
          {stage === "success" ? <CheckCircle2 aria-hidden="true" /> : <Mail aria-hidden="true" />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t(stage === "success" ? "verification.successTitle" : "verification.title")}</h1>
        {stage === "loading" && <p role="status" className="mt-4 text-muted">{t("verification.loading")}</p>}
        {stage === "success" ? <p role="status" className="mt-4 text-sm leading-relaxed text-muted">{t("verification.successBody")}</p>
          : stage !== "loading" && <>
            <p role={stage === "invalid" ? "alert" : undefined} className="my-5 text-sm leading-relaxed text-muted">
              {t(stage === "invalid" ? "verification.invalid" : stage === "confirm" ? "verification.confirmHelp" : "verification.requestHelp")}
            </p>
            {stage === "confirm" ? <>
              {networkError && <p role="alert" className="mb-4 text-sm text-brand-coral">{t("verification.networkError")}</p>}
              <button type="button" onClick={confirm} disabled={busy} className="min-h-12 w-full rounded-xl bg-brand-blue px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                {t(busy ? "verification.confirming" : "verification.confirm")}
              </button>
            </> : <ResendVerificationForm />}
          </>}
        {/* A full navigation reloads authentication after verification in another tab. */}
        <button type="button" onClick={() => window.location.assign("/")} className="mt-6 flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-brand-blue">{t("verification.backToLogin")}</button>
      </section>
    </div>
  </main>;
}
