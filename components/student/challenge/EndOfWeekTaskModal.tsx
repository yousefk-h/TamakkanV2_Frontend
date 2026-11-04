"use client";

import { useState } from "react";
import { Dialog, DialogCloseButton, useDialogClose } from "@/components/ui/Dialog";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { ApiError, submissionsApi } from "@/lib/api/client";
import { Recorder } from "@/components/student/player/Recorder";
import { RecorderSubmitted } from "@/components/student/player/RecorderSubmitted";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const MAX_SECONDS = 120;

/** Split out so `useDialogClose()` can reach the same `<dialog>` instance
 * `Dialog` renders, without threading a ref down manually. */
function EndOfWeekTaskBody({
  day,
  existingSubmission,
  onSubmitted,
}: {
  day: number;
  existingSubmission?: { url: string; seconds: number };
  onSubmitted: () => void;
}) {
  // The original closed the whole modal from "Record again" rather than
  // resetting in place - preserved exactly via the shared dialog-close path.
  const { t } = useI18n();
  const requestClose = useDialogClose();
  const [confirmed, setConfirmed] = useState(existingSubmission ?? null);
  // Kept across a failed upload so "Retry" re-sends the same recording
  // instead of forcing the student to record it again.
  const [pending, setPending] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attemptUpload = async (recording: { blob: Blob; url: string; seconds: number }) => {
    setUploading(true);
    setUploadError(null);
    try {
      await submissionsApi.submitEndOfWeekVideo(day, recording.blob);
      setConfirmed({ url: recording.url, seconds: recording.seconds });
      setPending(null);
      onSubmitted();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : t("endOfWeekModal.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <DialogCloseButton />
      <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("endOfWeekModal.dayLabel", { day })}</span>
      <h2 className="my-2 pe-10 text-xl">{t("endOfWeekModal.title")}</h2>
      <p className="m-0 mb-4 text-sm leading-relaxed text-muted">{t("endOfWeekModal.desc")}</p>
      {confirmed ? (
        <RecorderSubmitted mode="video" url={confirmed.url} seconds={confirmed.seconds} onReset={requestClose} />
      ) : uploading ? (
        <div className="grid min-w-0 justify-items-center gap-3 rounded-2xl border border-dashed border-line bg-card p-3 text-center sm:p-6">
          <span className="text-4xl" aria-hidden="true">⏳</span>
          <p className="m-0 text-sm text-muted">{t("endOfWeekModal.uploading")}</p>
        </div>
      ) : pending ? (
        <div className="grid min-w-0 justify-items-center gap-3.5 rounded-2xl border border-dashed border-line bg-card p-3 text-center sm:p-6">
          <VideoPlayer src={pending.url} className="max-w-[420px]" />
          {uploadError && (
            <p role="alert" className="m-0 max-w-[360px] text-xs text-brand-coral">
              {uploadError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="text-sm font-bold text-brand-blue"
            >
              {t("endOfWeekModal.reRecord")}
            </button>
            <button
              type="button"
              onClick={() => attemptUpload(pending)}
              className="rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
            >
              {t("endOfWeekModal.retryUpload")}
            </button>
          </div>
        </div>
      ) : (
        <Recorder
          mode="video"
          maxSeconds={MAX_SECONDS}
          onSubmit={(blob, url, seconds) => {
            const recording = { blob, url, seconds };
            setPending(recording);
            attemptUpload(recording);
          }}
        />
      )}
    </>
  );
}

export function EndOfWeekTaskModal({
  day,
  existingSubmission,
  onClose,
  onSubmitted,
}: {
  day: number;
  existingSubmission?: { url: string; seconds: number };
  onClose: () => void;
  /** Called once the upload actually succeeds - the caller refetches its
   * submissions context so the challenge calendar reflects the real state. */
  onSubmitted: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={t("endOfWeekModal.ariaLabel")}
      className="w-[min(560px,92vw)] rounded-2xl border border-line bg-card p-4 shadow-card backdrop:bg-black/45 sm:p-6"
    >
      <EndOfWeekTaskBody day={day} existingSubmission={existingSubmission} onSubmitted={onSubmitted} />
    </Dialog>
  );
}
