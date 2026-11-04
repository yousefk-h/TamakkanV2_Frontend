"use client";

import { formatDuration } from "@/lib/format";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { RecorderMode } from "./Recorder";

export function RecorderSubmitted({
  mode,
  url,
  seconds,
  onReset,
}: {
  mode: RecorderMode;
  url: string;
  seconds: number;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 items-start gap-3 rounded-2xl border border-[#cdeee1] bg-[#f0faf6] p-3 sm:p-4.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-7.5 flex-none place-items-center rounded-full bg-[#17b99e] font-extrabold text-white">✓</span>
        <div>
          <b className="block text-xs">{mode === "video" ? t("recorderSubmitted.videoSubmitted") : t("recorderSubmitted.recordingSubmitted")}</b>
          <small className="text-[13px] text-muted">{t("recorderSubmitted.sentToAdmin", { duration: formatDuration(seconds) })}</small>
        </div>
      </div>
      {mode === "video" ? (
        <VideoPlayer src={url} className="max-w-[420px]" />
      ) : (
        <audio src={url} controls className="w-full" />
      )}
      <button type="button" onClick={onReset} className="justify-self-start text-sm font-bold text-brand-blue">
        {t("recorderSubmitted.recordAgain")}
      </button>
    </div>
  );
}
