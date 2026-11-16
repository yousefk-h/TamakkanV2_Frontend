"use client";

import { useState } from "react";
import { ImageOff, RotateCw } from "lucide-react";
import type { MessagePublic } from "@/lib/api/types";
import { formatMessageTime } from "@/lib/format";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

/** An in-flight/optimistic message carries these on top of the real
 * `MessagePublic` shape (see `MessagingWorkspace`'s own send queue) - never
 * persisted, never sent to the backend, purely local UI state. */
export type ChatMessage = MessagePublic & {
  _pending?: boolean;
  _failed?: boolean;
  _localId?: string;
  /** A local `blob:`/object URL shown immediately for an image/voice
   * attachment while the real upload is still in flight - replaced by the
   * server's own signed `media_url` once the response comes back. */
  _localMediaUrl?: string;
};

export function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: (message: ChatMessage) => void }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const mine = message.is_mine;
  const mediaUrl = message.media_url ?? message._localMediaUrl ?? null;

  const bubbleColor = mine ? "bg-brand-blue text-white" : "bg-card text-ink";
  const timeColor = mine ? "text-white/70" : "text-muted";

  return (
    <div className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[78%] flex-col gap-1 sm:max-w-[65%] ${message._failed ? "opacity-90" : message._pending ? "opacity-70" : ""}`}>
        <div className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${bubbleColor} ${mine ? "rounded-tr-sm" : "rounded-tl-sm"}`}>
          {message.kind === "text" && (
            <p dir="auto" className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
          )}
          {message.kind === "image" && mediaUrl && (
            imageFailed ? (
              <div className="flex h-36 w-full max-w-[280px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-current/30 bg-black/5 text-xs">
                <ImageOff className="size-5" aria-hidden="true" />
                <span>Photo unavailable</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated Cloudinary delivery URL, freshly signed per response
              <img
                src={mediaUrl}
                alt="Sent photo"
                onClick={() => setLightboxOpen(true)}
                onError={() => setImageFailed(true)}
                className="h-36 w-full max-w-[280px] cursor-zoom-in rounded-xl border border-black/5 bg-black/5 object-cover"
              />
            )
          )}
          {message.kind === "audio" && mediaUrl && (
            <VoiceMessagePlayer src={mediaUrl} durationSeconds={message.media_duration_seconds} mine={mine} />
          )}
          <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${timeColor}`}>
            {message._pending && <span>Sending…</span>}
            {message._failed && <span className="font-bold text-amber-200">Not sent</span>}
            {!message._pending && !message._failed && <span>{formatMessageTime(message.created_at)}</span>}
          </div>
        </div>
        {message._failed && onRetry && (
          <button type="button" onClick={() => onRetry(message)} className="flex min-h-7 items-center gap-1 self-end text-xs font-bold text-brand-coral">
            <RotateCw className="size-3" aria-hidden="true" /> Retry
          </button>
        )}
      </div>

      {lightboxOpen && mediaUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- same signed delivery URL, shown full-size */}
          <img src={mediaUrl} alt="Sent photo, full size" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
          <button type="button" onClick={() => setLightboxOpen(false)} aria-label="Close" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/15 text-2xl text-white">×</button>
        </div>
      )}
    </div>
  );
}
