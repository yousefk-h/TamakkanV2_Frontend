"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDaySeparator } from "@/lib/format";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

/** The scrollable message pane: date separators, smooth auto-scroll to a
 * genuinely new message (only when the viewer is already near the bottom -
 * never yanked down while reading older history), scroll-position-preserving
 * pagination when scrolling to the top, and real loading/empty states. */
export function MessageList({
  messages, loading, loadingOlder, hasMore, onLoadMore, onRetry, otherName,
}: {
  messages: ChatMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: (message: ChatMessage) => void;
  otherName: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const prevMessageCountRef = useRef(0);
  const [stickToBottom, setStickToBottom] = useState(true);

  // Pagination trigger: load older messages once scrolled near the top -
  // capture the current scroll height first so the height-delta adjustment
  // below has something to compare against.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (el.scrollTop < 120 && hasMore && !loadingOlder) {
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadMore();
    }
  };

  // After older messages are prepended, restore the exact same visual
  // position instead of the browser's default (which would otherwise jump
  // the viewer to a different spot in the now-taller scroll area).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevMessageCountRef.current;
    if (grew && prevScrollHeightRef.current > 0 && !stickToBottom) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    } else if (stickToBottom) {
      el.scrollTop = el.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, stickToBottom]);

  // First real load of a conversation - land at the bottom (the most
  // recent message), not wherever the browser happens to leave it.
  useEffect(() => {
    if (!loading && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    // Only once messages actually arrive for THIS conversation - re-keyed by
    // the parent via `key={conversationId}` on this whole component.
  }, [loading]);

  if (loading) return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-busy="true">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
          <div className="h-12 w-2/5 animate-pulse rounded-2xl bg-line/60" />
        </div>
      ))}
    </div>
  );

  if (messages.length === 0) return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <p className="m-0 max-w-xs text-sm text-muted">
        {otherName ? `Say hello to ${otherName} - your conversation will appear here.` : "Your conversation will appear here."}
      </p>
    </div>
  );

  // Computed as a plain pass over the array (no mutation during render) -
  // each entry is paired with whether it starts a new day separator.
  const withSeparators = messages.map((message, index) => {
    const separator = formatDaySeparator(message.created_at);
    const previousSeparator = index > 0 ? formatDaySeparator(messages[index - 1].created_at) : null;
    return { message, separator, showSeparator: separator !== previousSeparator };
  });

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
      {loadingOlder && <p className="m-0 text-center text-xs text-muted">Loading earlier messages…</p>}
      {withSeparators.map(({ message, separator, showSeparator }) => {
        return (
          <div key={message._localId ?? message.id} className="space-y-3">
            {showSeparator && (
              <div className="flex items-center justify-center">
                <span className="rounded-full bg-card px-3 py-1 text-[11px] font-bold text-muted shadow-sm">{separator}</span>
              </div>
            )}
            <MessageBubble message={message} onRetry={onRetry} />
          </div>
        );
      })}
    </div>
  );
}
