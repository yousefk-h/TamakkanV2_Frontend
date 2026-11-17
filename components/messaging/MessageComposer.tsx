"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Image as ImageIcon, Mic, Send, X } from "lucide-react";
import { VoiceRecorder } from "./VoiceRecorder";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** The sticky message input: text (Enter to send, Shift+Enter for a new
 * line), an image attachment with a real preview-before-send step, and a
 * mic button that swaps the whole bar for `VoiceRecorder`. Every action here
 * is wired to a real upload - nothing here is decorative. */
export function MessageComposer({
  onSendText, onSendImage, onSendVoice, sending, disabledReason,
}: {
  onSendText: (body: string) => void;
  onSendImage: (file: File) => Promise<void> | void;
  onSendVoice: (blob: Blob, seconds: number) => Promise<void> | void;
  sending: boolean;
  /** Non-null disables the whole composer with an explanatory message
   * (e.g. "you are not part of this conversation") instead of silently
   * doing nothing. */
  disabledReason?: string | null;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitText = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSendText(trimmed);
    setText("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitText();
    }
  };

  const pickImage = (file: File) => {
    setImageError("");
    if (!file.type.startsWith("image/")) { setImageError("Choose an image file."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setImageError("Image is larger than the 8 MB limit."); return; }
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const confirmSendImage = async () => {
    if (!pendingImage) return;
    const { file, previewUrl } = pendingImage;
    setPendingImage(null);
    await onSendImage(file);
    URL.revokeObjectURL(previewUrl);
  };

  const cancelImage = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    setImageError("");
  };

  if (disabledReason) return (
    <div className="shrink-0 border-t border-line bg-card p-3 text-center text-sm text-muted">{disabledReason}</div>
  );

  return (
    <div className="shrink-0 border-t border-line bg-card p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:p-3">
      {pendingImage && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-bg p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not yet uploaded */}
          <img src={pendingImage.previewUrl} alt="" className="size-14 rounded-lg object-cover" />
          <p className="m-0 min-w-0 flex-1 truncate text-xs text-muted">{pendingImage.file.name}</p>
          <button type="button" onClick={cancelImage} aria-label="Remove image" className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-card">
            <X className="size-4" aria-hidden="true" />
          </button>
          <button type="button" disabled={sending} onClick={() => void confirmSendImage()} className="min-h-9 shrink-0 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">
            Send
          </button>
        </div>
      )}
      {imageError && <p role="alert" className="mb-2 text-xs font-bold text-brand-coral">{imageError}</p>}

      <div className="flex items-end gap-2">
        {recording ? (
          <VoiceRecorder
            sending={sending}
            onCancel={() => setRecording(false)}
            onSend={(blob, seconds) => { setRecording(false); void onSendVoice(blob, seconds); }}
          />
        ) : (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={event => { const file = event.target.files?.[0]; if (file) pickImage(file); event.target.value = ""; }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach an image" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-bg">
              <ImageIcon className="size-5" aria-hidden="true" />
            </button>
            <textarea
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              dir="auto"
              placeholder="Type a message…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-sm leading-relaxed outline-none focus:border-brand-blue"
            />
            {text.trim() ? (
              <button type="button" disabled={sending} onClick={submitText} aria-label="Send message" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-blue text-white disabled:opacity-50">
                <Send className="size-4.5" aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => setRecording(true)} aria-label="Record a voice message" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-bg">
                <Mic className="size-5" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
