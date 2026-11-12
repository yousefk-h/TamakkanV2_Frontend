"use client";

import type { LessonFlow } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function Step4LessonFlow({ flow, onChange }: { flow: LessonFlow; onChange: (flow: LessonFlow) => void }) {
  const { t } = useI18n();
  return <section className="mx-auto max-w-[760px] space-y-5">
    <div><h3 className="text-2xl font-extrabold text-ink">{t("builder.flowTitle")}</h3><p className="mt-1 text-sm text-muted">{t("builder.flowHint")}</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <button type="button" onClick={() => onChange("standard")} className={`rounded-2xl border-2 p-5 text-start transition ${flow === "standard" ? "border-brand-blue bg-brand-primary-pale shadow-card" : "border-line bg-card hover:border-brand-blue/50"}`}>
        <span className="text-2xl">◉</span><h4 className="mt-3 text-lg font-extrabold text-ink">{t("builder.flowStandard")}</h4><p className="mt-2 text-sm text-muted">{t("builder.flowStandardDescription")}</p><p className="mt-4 text-xs font-bold text-brand-blue">{t("builder.flowStandardPath")}</p>
      </button>
      <button type="button" onClick={() => onChange("interactive_video")} className={`rounded-2xl border-2 p-5 text-start transition ${flow === "interactive_video" ? "border-amber-500 bg-amber-50 shadow-card" : "border-line bg-card hover:border-amber-400"}`}>
        <span className="text-2xl">▶</span><div className="mt-3 flex items-center gap-2"><h4 className="text-lg font-extrabold text-ink">{t("builder.flowInteractive")}</h4><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{t("builder.flowUploadedOnly")}</span></div><p className="mt-2 text-sm text-muted">{t("builder.flowInteractiveDescription")}</p><p className="mt-4 text-xs font-bold text-amber-800">{t("builder.flowTimelineNext")}</p>
      </button>
    </div>
    {flow === "interactive_video" && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{t("builder.flowInteractiveNotice")}</p>}
  </section>;
}
