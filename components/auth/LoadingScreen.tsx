"use client";

import { useI18n } from "@/lib/i18n/LocaleProvider";
import { Logo, Wordmark } from "@/components/ui/Logo";

export function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen place-items-center bg-bg">
      <div role="status" className="grid justify-items-center gap-5">
        <div className="flex items-center gap-3 text-ink"><Logo className="size-12" /><Wordmark /></div>
        <p className="text-muted">{t("common.loading")}</p>
      </div>
    </div>
  );
}
