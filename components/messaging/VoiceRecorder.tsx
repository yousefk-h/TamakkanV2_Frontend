"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/format";

// Matches the backend's own cap (`MAX_VOICE_MESSAGE_SECONDS` in
// `messaging_service.py`) - the server re-validates regardless, this just
// gives the student/teacher a visible warning and auto-stop before that.
const MAX_SECONDS = 60;
const WARNING_WINDOW_SECONDS = 10;

// Tried in priority order via `MediaRecorder.isTypeSupported` - Chrome/
// Firefox/Android Chrome accept `audio/webm`; iOS Safari (14.3+) does not
// support webm at all but does support `audio/mp4`. `undefined` (the
// browser's own default container) is the last resort for anything else.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type));
}

/** A real `getUserMedia`+`MediaRecorder` flow, inline in the chat composer -
 * idle (mic button) -> recording (timer + stop) -> preview (play/discard/
 * send) -> error (permission denied / unsupported browser). Never a
 * simulated recording or a fake waveform. */
export function VoiceRecorder({ onSend, onCancel, sending }: { onSend: (blob: Blob, seconds: number) => void; onCancel: () => void; sending: boolean }) {
  const [status, setStatus] = useState<"recording" | "preview" | "error">("recording");
  const [seconds, setSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      // A real capability check against the actual browser, not a derived
      // value - genuinely synchronizing local state with an external fact
      // discovered only once this effect runs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrorMessage("Voice messages are not supported in this browser.");
      setStatus("error");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setStatus(current => (current === "error" ? current : "preview"));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          const next = s + 1;
          if (next >= MAX_SECONDS) stop();
          return next;
        });
      }, 1000);
    }).catch(() => {
      if (!cancelled) {
        setErrorMessage("Microphone access was denied. Allow microphone access to send a voice message.");
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    // Starts recording exactly once per mount - the parent mounts a fresh
    // instance of this component per recording attempt.
  }, []);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const nearingCap = seconds >= MAX_SECONDS - WARNING_WINDOW_SECONDS;

  if (status === "error") return (
    <div className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-xl border border-brand-coral bg-brand-coral-pale px-3 text-sm text-brand-coral">
      <span className="min-w-0">{errorMessage}</span>
      <button type="button" onClick={onCancel} className="shrink-0 font-bold underline">Dismiss</button>
    </div>
  );

  if (status === "recording") return (
    <div className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-xl border border-line bg-bg px-3">
      <div className={`flex items-center gap-2 font-mono text-sm font-bold ${nearingCap ? "text-brand-coral" : "text-ink"}`}>
        <i className="size-2.5 animate-pulse rounded-full bg-brand-coral" aria-hidden="true" />
        {formatDuration(seconds)}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} aria-label="Cancel recording" className="grid size-9 place-items-center rounded-full text-muted hover:bg-card">
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={stop} aria-label="Stop recording" className="grid size-9 place-items-center rounded-full bg-brand-coral text-white">
          <span className="size-3 rounded-sm bg-white" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  // preview
  return (
    <div className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5">
      <button type="button" onClick={onCancel} aria-label="Discard recording" className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-card">
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
      {previewUrl && <audio src={previewUrl} controls className="h-9 min-w-0 flex-1" />}
      <span className="shrink-0 font-mono text-xs text-muted">{formatDuration(seconds)}</span>
      <button
        type="button"
        disabled={sending}
        onClick={() => { if (blobRef.current) onSend(blobRef.current, seconds); }}
        aria-label="Send voice message"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-blue text-white disabled:opacity-50"
      >
        <Send className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
