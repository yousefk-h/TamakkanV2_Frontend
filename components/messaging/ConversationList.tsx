"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import type { ConversationSummary } from "@/lib/api/types";
import { formatDaySeparator } from "@/lib/format";
import { Avatar } from "./Avatar";

export function ConversationList({
  conversations, loading, selectedId, query, onQueryChange, onSelect, headerActions,
}: {
  conversations: ConversationSummary[] | null;
  loading: boolean;
  selectedId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (conversation: ConversationSummary) => void;
  /** Teacher/Admin compose + announcement actions - absent for a Student. */
  headerActions?: ReactNode;
}) {
  const filtered = (conversations ?? []).filter(c => !query.trim() || (c.other_participant_name ?? "").toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-line bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 text-xl font-extrabold text-ink">Messages</h1>
          {headerActions}
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="min-h-10 w-full rounded-xl border border-line bg-bg ps-9 pe-3 text-sm outline-none focus:border-brand-blue"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-1 p-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="size-10 shrink-0 animate-pulse rounded-full bg-line/60" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-2/5 animate-pulse rounded bg-line/60" />
                  <div className="h-2.5 w-3/5 animate-pulse rounded bg-line/40" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center">
            <p className="m-0 text-sm text-muted">
              {conversations?.length === 0 ? "No conversations yet." : "No conversations match your search."}
            </p>
          </div>
        )}

        {!loading && filtered.map(conversation => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation)}
            aria-current={selectedId === conversation.id}
            className={`flex w-full items-center gap-3 border-b border-line/60 p-3 text-start transition-colors sm:p-3.5 ${
              selectedId === conversation.id ? "bg-brand-primary-pale" : "hover:bg-bg"
            }`}
          >
            <Avatar name={conversation.other_participant_name} role={conversation.other_participant_role} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <b className="truncate text-sm text-ink">{conversation.other_participant_name ?? "Unknown"}</b>
                <span className="shrink-0 text-[11px] text-muted">{formatDaySeparator(conversation.last_message_at)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="m-0 min-w-0 flex-1 truncate text-xs text-muted">{conversation.last_message_preview || "—"}</p>
                {conversation.unread_count > 0 && (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-blue text-[10px] font-bold text-white">
                    {conversation.unread_count > 9 ? "9+" : conversation.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
