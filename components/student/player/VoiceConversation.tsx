"use client";

import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { CaptionView } from "@/lib/voice/captions";
import type { TranscriptSegment } from "@/lib/voice/transcript";

/** The parts of Voice Practice that show what was said. Presentation only: they render segments the session
 * already collected (`browser_transcript` material, provisional and never scored) and never write anything. */

/** The latest utterance, large, with who is speaking. This is the ONLY live-announced region for spoken text: it is
 * `aria-live="polite"` and `aria-busy` while the line is still streaming in, so a screen reader announces each
 * finished line once instead of every partial update. */
export function CurrentCaption({ current }: { current: TranscriptSegment | null }) {
  const { t } = useI18n();
  const student = current?.speaker === "student";
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-1" aria-live="polite" aria-atomic="true" aria-busy={current ? !current.final : false}>
      {current ? (
        <div key={current.id} className="caption-in flex w-full min-w-0 flex-col items-center gap-1">
          <span className={`text-[11px] font-extrabold uppercase tracking-wider ${student ? "text-brand-cyan" : "text-white/70"}`}>
            {student ? t("voiceSession.speakerYou") : t("voiceSession.tutorName")}
          </span>
          <p className={`caption-window m-0 w-full text-lg font-semibold leading-snug [overflow-wrap:anywhere] md:text-2xl ${current.final ? "text-white" : "text-white/80"}`}>
            <span>“{current.text.trim()}”</span>
          </p>
        </div>
      ) : (
        <p className="m-0 w-full text-sm text-white/60">{t("voiceSession.captionEmpty")}</p>
      )}
    </div>
  );
}

/** The two turns before the current line - small and secondary, never repeating the current line. */
export function RecentContext({ recent }: { recent: CaptionView["recent"] }) {
  const { t } = useI18n();
  if (recent.length === 0) return null;
  return (
    <ul className="m-0 flex w-full min-w-0 list-none flex-col gap-0.5 p-0 text-start text-xs text-white/60" aria-label={t("voiceSession.recentLabel")}>
      {recent.map(turn => (
        <li key={turn.id} className="truncate">
          <b className="font-bold text-white/75">{turn.speaker === "student" ? t("voiceSession.speakerYou") : t("voiceSession.tutorName")}:</b> {turn.text}
        </li>
      ))}
    </ul>
  );
}

/** The complete provisional conversation, in a NON-modal sheet: a bottom sheet on phones, an inline drawer under the
 * Conversation button from `sm` up (`.conversation-sheet` in globals.css). Non-modal on purpose - the call's mic and End controls stay visible
 * and usable while it is open. It scrolls on its own, is not a live region (old messages are never re-announced),
 * closes with Escape or its close button, and hands focus back to the button that opened it. */
export function ConversationSheet({ segments, onClose, returnFocusRef }: { segments: readonly TranscriptSegment[]; onClose: () => void; returnFocusRef: RefObject<HTMLElement | null> }) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const returnTo = returnFocusRef.current;
    closeRef.current?.focus({ preventScroll: true });
    // From 640px up the sheet is an inline drawer under the button: make sure it is on screen.
    if (window.matchMedia("(min-width: 640px)").matches) rootRef.current?.scrollIntoView({ block: "nearest" });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnTo?.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  const lastLength = segments.length ? segments[segments.length - 1].text.length : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [segments.length, lastLength]);

  return (
    <section ref={rootRef} role="dialog" aria-modal="false" aria-label={t("voiceSession.conversationTitle")} className="conversation-sheet border border-line bg-card shadow-card">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-line px-4 py-1">
        <div className="min-w-0">
          <b className="block text-sm">{t("voiceSession.conversationTitle")}</b>
          <p className="m-0 text-[11px] leading-snug text-muted">{t("voiceSession.transcriptNote")}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t("common.close")} className="inline-grid min-h-11 min-w-11 flex-none place-items-center text-muted">
          <X className="size-6" aria-hidden="true" />
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={event => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {segments.length === 0 ? (
          <p className="m-0 text-sm text-muted">{t("voiceSession.transcriptEmpty")}</p>
        ) : (
          segments.map(segment => {
            const student = segment.speaker === "student";
            return (
              <p
                key={segment.id}
                className={`m-0 w-fit max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere] ${
                  student ? "self-end rounded-ee-md bg-brand-blue text-white" : "self-start rounded-es-md bg-bg text-ink"
                } ${segment.final ? "" : "opacity-60"}`}
              >
                <span className={`mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide ${student ? "text-white/75" : "text-muted"}`}>
                  {student ? t("voiceSession.speakerYou") : t("voiceSession.speakerTutor")}
                </span>
                {segment.text}
              </p>
            );
          })
        )}
      </div>
    </section>
  );
}
