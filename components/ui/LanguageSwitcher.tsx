"use client";

import { useI18n } from "@/lib/i18n/LocaleProvider";

/** A two-way toggle, not a dropdown - there are exactly two locales, and a
 * dropdown for a binary choice is one extra click for no benefit. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "ar" : "en")}
      aria-label={t("topbar.language")}
      className={`rounded-[9px] border border-line bg-card px-2.5 py-2 text-sm font-bold text-ink ${className}`}
    >
      {locale === "en" ? "العربية" : "English"}
    </button>
  );
}
