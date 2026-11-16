"use client";

import { useEffect, useState } from "react";
import { messagesApi } from "../api/client";

const POLL_MS = 20000;

/** Total unread messages across every conversation this caller is a participant in - the sidebar's global
 * "Messages" badge, kept live on Home/My Learning/anywhere else the sidebar renders, not just inside the Messages
 * page itself. Reuses the existing inbox endpoint's own per-conversation `unread_count` (already computed
 * server-side as `sender_id != caller` and `read_at == null`, so this can never count the caller's own messages or
 * reach into a conversation they aren't a participant of) - no new backend endpoint, no new messaging system.
 * Polling (not a new push mechanism) matches the same "smallest reliable real-time stand-in" this app already
 * uses for the Messages page itself. */
export function useUnreadMessages(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Synchronizing with an external toggle (auth status) - legitimate "subscribe to external change", not
    // state derivable from props/state alone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled) { setUnreadCount(0); return; }
    let cancelled = false;
    const load = () => {
      messagesApi.listConversations({ limit: 50 })
        .then(page => { if (!cancelled) setUnreadCount(page.items.reduce((sum, item) => sum + item.unread_count, 0)); })
        .catch(() => { /* a transient poll failure keeps the last known count, same as the Messages page's own thread polling */ });
    };
    load();
    const interval = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled]);

  return unreadCount;
}
