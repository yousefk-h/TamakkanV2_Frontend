"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export type RecorderMode = "audio" | "video";

// The last stretch of a capped recording turns the timer coral, so a student
// racing the clock (the end-of-week check-in's 120s cap) gets a visible
// warning before the auto-stop cuts them off rather than being surprised by it.
const WARNING_WINDOW_SECONDS = 15;

/** Real `getUserMedia` + `MediaRecorder` flow - idle -> recording -> recorded
 * (or error). `onSubmit` hands the caller (PlayerMain, EndOfWeekTaskModal)
 * both the local blob URL (for immediate preview) and the raw `Blob` itself -
 * the end-of-week check-in uploads that Blob to the backend, which a blob:
 * URL alone can't provide. Ported behavior-for-behavior from the
 * pre-rewrite `Recorder` in the old `app/page.tsx`, plus `maxSeconds` (added
 * for the end-of-week video check-in's duration cap - unset for the removed
 * per-lesson audio flow's old unlimited behavior, so nothing else
 * regresses). */
export function Recorder({
  mode,
  maxSeconds,
  onSubmit,
}: {
  mode: RecorderMode;
  /** Auto-stops recording once reached; the last `WARNING_WINDOW_SECONDS`
   * before that turn the timer coral. Omit for no cap. */
  maxSeconds?: number;
  onSubmit: (blob: Blob, url: string, seconds: number) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "recording" | "recorded" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mediaBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  // Once `onSubmit` hands a URL to the parent, ownership transfers with it -
  // it's rendered elsewhere (RecorderSubmitted, admin/report views) long
  // after this component unmounts, so the cleanup below must not revoke it.
  const submittedRef = useRef(false);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // Revokes the *previous* mediaUrl whenever it's replaced (a new take) or
  // this component unmounts - unless that URL was just handed off via
  // `onSubmit`. Tied to `mediaUrl` itself via effect cleanup, rather than a
  // ref threaded through every call site, so creation and revocation stay
  // next to each other.
  useEffect(() => {
    if (!mediaUrl) return;
    return () => { if (!submittedRef.current) URL.revokeObjectURL(mediaUrl); };
  }, [mediaUrl]);

  // Attaches the live stream to the preview `<video>` once it's actually in
  // the DOM. Doing this inline inside `start()` instead (right after
  // `getUserMedia` resolves) looked like it should work, but at that point
  // the component is still rendering its "idle" branch - the "recording"
  // branch that contains this ref hasn't mounted yet, so `liveVideoRef.current`
  // was always null and the feed silently never appeared.
  useEffect(() => {
    if (status === "recording" && mode === "video" && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      liveVideoRef.current.play().catch(() => {});
    }
  }, [status, mode]);

  const start = async () => {
    setErrorMsg("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg(t("recorder.unsupported"));
      setStatus("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(mode === "video" ? { video: true, audio: true } : { audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      // A capped bitrate for video keeps a full 120s check-in well under the
      // backend's upload ceiling and uploads faster - an unconstrained
      // `MediaRecorder` on a modern webcam can otherwise pick multiple Mbps,
      // turning a short check-in into tens of megabytes for no visible
      // quality gain in a talking-head recording.
      const recorder = new MediaRecorder(stream, mode === "video" ? { videoBitsPerSecond: 1_500_000 } : undefined);
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        // Preserve the browser's actual container (including MP4 recordings)
        // when previewing and uploading; relabelling every recording WebM can
        // make an otherwise valid recording unplayable.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || chunksRef.current[0]?.type || "" });
        submittedRef.current = false;
        mediaBlobRef.current = blob;
        setMediaUrl(URL.createObjectURL(blob));
        setStatus("recorded");
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setStatus("recording");
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          const next = s + 1;
          // Auto-stop at the cap rather than trusting the student to notice
          // the warning color and stop themselves - the backend re-validates
          // duration regardless, but a client that silently keeps recording
          // past its own advertised limit is a confusing experience, not a
          // real safeguard.
          if (maxSeconds !== undefined && next >= maxSeconds) stop();
          return next;
        });
      }, 1000);
    } catch {
      setErrorMsg(mode === "video" ? t("recorder.permissionErrorVideo") : t("recorder.permissionErrorAudio"));
      setStatus("error");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const reRecord = () => {
    setMediaUrl(null);
    mediaBlobRef.current = null;
    setSeconds(0);
    setStatus("idle");
  };

  const nearingCap = maxSeconds !== undefined && seconds >= maxSeconds - WARNING_WINDOW_SECONDS;

  return (
    <div className="min-w-0 rounded-2xl border border-dashed border-line bg-card p-3 text-center sm:p-6">
      {status === "idle" && (
        <div className="grid justify-items-center gap-3">
          <span className="text-4xl" aria-hidden="true">{mode === "video" ? "🎥" : "🎙️"}</span>
          <p className="m-0 max-w-[360px] text-xs text-muted">
            {mode === "video" ? t("recorder.promptVideo") : t("recorder.promptAudio")}
          </p>
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
          >
            <Icon name="mic" className="size-4" /> {t("recorder.start")}
          </button>
        </div>
      )}

      {status === "recording" && (
        <div className="grid justify-items-center gap-3.5">
          {mode === "video" && (
            <video ref={liveVideoRef} muted playsInline className="aspect-[16/10] w-full max-w-[420px] rounded-xl bg-[#0c1424] object-cover" />
          )}
          <div className={`flex items-center gap-2 font-mono text-[15px] font-extrabold ${nearingCap ? "text-brand-coral" : ""}`}>
            <i className="size-2.5 animate-pulse rounded-full bg-brand-coral" aria-hidden="true" />
            {formatDuration(seconds)}
            {maxSeconds !== undefined && <span className="font-normal text-muted">/ {formatDuration(maxSeconds)}</span>}
          </div>
          <button type="button" onClick={stop} className="rounded-full bg-brand-coral px-5 py-2.5 text-sm font-bold text-white">
            {t("recorder.stop")}
          </button>
        </div>
      )}

      {status === "recorded" && mediaUrl && (
        <div className="grid justify-items-center gap-3.5">
          {mode === "video" ? (
            <VideoPlayer src={mediaUrl} className="max-w-[420px]" />
          ) : (
            <audio src={mediaUrl} controls className="w-full max-w-[420px]" />
          )}
          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={reRecord} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-brand-blue">
              {t("recorder.reRecord")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!mediaBlobRef.current) return;
                submittedRef.current = true;
                onSubmit(mediaBlobRef.current, mediaUrl, seconds);
              }}
              className="rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
            >
              {mode === "video" ? t("recorder.submitVideo") : t("recorder.submitAudio")}
            </button>
          </div>
        </div>
      )}

      {status === "error" && (
        <div>
          <p className="mx-auto mb-3.5 max-w-[360px] text-xs text-brand-coral">{errorMsg}</p>
          <button type="button" onClick={start} className="rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white">
            {t("recorder.tryAgain")}
          </button>
        </div>
      )}
    </div>
  );
}
