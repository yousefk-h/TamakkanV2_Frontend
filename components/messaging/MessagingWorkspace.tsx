"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { PenSquare } from "lucide-react";
import { ApiError, cohortsApi, messagesApi, programsApi, usersApi } from "@/lib/api/client";
import type { AnnouncementScope, AnnouncementSummary, CohortPublic, ConversationSummary, MessagePublic, ProgramPublic, TaughtStudent } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthContext";
import { ChatHeader } from "./ChatHeader";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { ConversationList } from "./ConversationList";
import type { ChatMessage } from "./MessageBubble";

const SCOPES: AnnouncementScope[] = ["my_students", "cohort", "program"];
const INBOX_POLL_MS = 8000;
const THREAD_POLL_MS = 4000;
const PAGE_SIZE = 40;

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/** The WhatsApp-style Messages workspace: a conversation list + an active
 * thread, real text/image/voice sending with optimistic pending/failed
 * states, scroll-preserving pagination, and polling (this app's smallest
 * reliable stand-in for a push/real-time channel - none exists elsewhere in
 * this codebase to reuse). One shared component for `/admin/messages` and
 * `/student/messages`; `canCompose` hides the staff-only new-message/
 * announcement actions for a Student. */
export function MessagingWorkspace({ canCompose, canBroadcastCenter }: { canCompose: boolean; canBroadcastCenter: boolean }) {
  const searchParams = useSearchParams();
  const prefillStudentId = searchParams.get("student_id");
  const { state: authState } = useAuth();
  const me = authState.status === "authenticated" ? authState.user : null;

  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [threadPage, setThreadPage] = useState(1);
  const [threadTotal, setThreadTotal] = useState(0);
  const [sendError, setSendError] = useState("");

  const [showComposeMenu, setShowComposeMenu] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(!!prefillStudentId);
  const [newStudentId, setNewStudentId] = useState(prefillStudentId ?? "");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentMatches, setStudentMatches] = useState<TaughtStudent[]>([]);
  const [newBody, setNewBody] = useState("");
  const [composeBusy, setComposeBusy] = useState(false);

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [scope, setScope] = useState<AnnouncementScope>("my_students");
  const [scopeId, setScopeId] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementSummary[] | null>(null);

  const [cohorts, setCohorts] = useState<CohortPublic[]>([]);
  const [programs, setPrograms] = useState<ProgramPublic[]>([]);

  const retryHandlers = useRef(new Map<string, () => void>());
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected]);

  const loadConversations = useCallback(async () => {
    const page = await messagesApi.listConversations({ limit: 50 });
    setConversations(page.items);
  }, []);

  // Initial API synchronization; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // Inbox polling - this app's smallest reliable real-time stand-in (no
  // WebSocket/SSE exists anywhere else to reuse). Paused while the tab is
  // hidden, so a backgrounded tab doesn't keep polling for nothing.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadConversations();
    }, INBOX_POLL_MS);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (!canCompose) return;
    void (async () => {
      const [cohortItems, programItems] = await Promise.all([cohortsApi.list(), programsApi.list()]);
      setCohorts(cohortItems);
      setPrograms(programItems);
    })();
    if (prefillStudentId) {
      usersApi.getStudent(prefillStudentId).then(student => setStudentQuery(`${student.full_name} (${student.email})`)).catch(() => {});
    }
  }, [canCompose, prefillStudentId]);

  useEffect(() => {
    if (!canCompose || newStudentId || studentQuery.trim().length < 2) return;
    let cancelled = false;
    usersApi.myStudents({ search: studentQuery.trim(), limit: 8 })
      .then(page => { if (!cancelled) setStudentMatches(page.items); })
      .catch(() => { if (!cancelled) setStudentMatches([]); });
    return () => { cancelled = true; };
  }, [canCompose, newStudentId, studentQuery]);

  const fetchThread = useCallback(async (conversationId: string, page: number) => {
    const result = await messagesApi.getConversation(conversationId, { page, limit: PAGE_SIZE });
    const ascending = [...result.items].reverse();
    setThreadTotal(result.total);
    return ascending;
  }, []);

  const openConversation = useCallback(async (conversation: ConversationSummary) => {
    setSelected(conversation);
    setMessages([]);
    setPending([]);
    setSendError("");
    setThreadPage(1);
    setThreadLoading(true);
    try {
      const ascending = await fetchThread(conversation.id, 1);
      setMessages(ascending);
    } finally {
      setThreadLoading(false);
    }
    void loadConversations();
  }, [fetchThread, loadConversations]);

  const loadOlderMessages = useCallback(async () => {
    if (!selected || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const nextPage = threadPage + 1;
      const older = await fetchThread(selected.id, nextPage);
      setMessages(current => {
        const knownIds = new Set(current.map(m => m.id));
        return [...older.filter(m => !knownIds.has(m.id)), ...current];
      });
      setThreadPage(nextPage);
    } finally {
      setLoadingOlder(false);
    }
  }, [selected, threadPage, loadingOlder, fetchThread]);

  // Thread polling for the open conversation only - merges by id so an
  // already-loaded older page (from manual pagination) is never clobbered,
  // and a currently-sending optimistic entry is left alone in `pending`.
  useEffect(() => {
    if (!selected) return;
    const conversationId = selected.id;
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible" || selectedIdRef.current !== conversationId) return;
      void (async () => {
        try {
          const latest = await messagesApi.getConversation(conversationId, { page: 1, limit: PAGE_SIZE });
          const ascending = [...latest.items].reverse();
          setMessages(current => {
            const byId = new Map(current.map(m => [m.id, m]));
            for (const message of ascending) byId.set(message.id, message);
            return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
          setThreadTotal(latest.total);
          void loadConversations();
        } catch {
          // A transient poll failure is never surfaced as an error banner -
          // the next tick tries again.
        }
      })();
    }, THREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [selected, loadConversations]);

  const settlePending = (localId: string, result: MessagePublic | null) => {
    setPending(current => current.filter(m => m._localId !== localId));
    if (result) setMessages(current => [...current, result].sort((a, b) => a.created_at.localeCompare(b.created_at)));
  };

  const failPending = (localId: string, message: string) => {
    setPending(current => current.map(m => (m._localId === localId ? { ...m, _pending: false, _failed: true } : m)));
    setSendError(message);
  };

  const sendText = (body: string) => {
    if (!selected) return;
    const localId = uid();
    const optimistic: ChatMessage = {
      id: localId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      conversation_id: selected.id, sender_id: me?.id ?? "", sender_role: me?.role ?? "student", sender_name: null,
      kind: "text", body, media_url: null, media_duration_seconds: null, read_at: null, announcement_id: null,
      is_mine: true, _pending: true, _localId: localId,
    };
    const attempt = () => {
      setPending(current => [...current.filter(m => m._localId !== localId), { ...optimistic, _pending: true, _failed: false }]);
      setSendError("");
      messagesApi.reply(selected.id, body)
        .then(result => settlePending(localId, result))
        .catch(cause => failPending(localId, cause instanceof ApiError ? cause.message : "Could not send - check your connection and retry."));
    };
    retryHandlers.current.set(localId, attempt);
    attempt();
  };

  const sendImage = async (file: File) => {
    if (!selected) return;
    const localId = uid();
    const previewUrl = URL.createObjectURL(file);
    const optimistic: ChatMessage = {
      id: localId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      conversation_id: selected.id, sender_id: me?.id ?? "", sender_role: me?.role ?? "student", sender_name: null,
      kind: "image", body: "", media_url: null, media_duration_seconds: null, read_at: null, announcement_id: null,
      is_mine: true, _pending: true, _localId: localId, _localMediaUrl: previewUrl,
    };
    const attempt = () => {
      setPending(current => [...current.filter(m => m._localId !== localId), { ...optimistic, _pending: true, _failed: false }]);
      setSendError("");
      messagesApi.sendImage(selected.id, file)
        .then(result => settlePending(localId, result))
        .catch(cause => failPending(localId, cause instanceof ApiError ? cause.message : "Could not send the image - check your connection and retry."));
    };
    retryHandlers.current.set(localId, attempt);
    attempt();
  };

  const sendVoice = async (blob: Blob, seconds: number) => {
    if (!selected) return;
    const localId = uid();
    const previewUrl = URL.createObjectURL(blob);
    const optimistic: ChatMessage = {
      id: localId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      conversation_id: selected.id, sender_id: me?.id ?? "", sender_role: me?.role ?? "student", sender_name: null,
      kind: "audio", body: "", media_url: null, media_duration_seconds: seconds, read_at: null, announcement_id: null,
      is_mine: true, _pending: true, _localId: localId, _localMediaUrl: previewUrl,
    };
    const attempt = () => {
      setPending(current => [...current.filter(m => m._localId !== localId), { ...optimistic, _pending: true, _failed: false }]);
      setSendError("");
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("aac") ? "aac" : "webm";
      messagesApi.sendVoice(selected.id, blob, `voice-message.${extension}`)
        .then(result => settlePending(localId, result))
        .catch(cause => failPending(localId, cause instanceof ApiError ? cause.message : "Could not send the voice message - check your connection and retry."));
    };
    retryHandlers.current.set(localId, attempt);
    attempt();
  };

  const retryMessage = (message: ChatMessage) => {
    if (!message._localId) return;
    const handler = retryHandlers.current.get(message._localId);
    handler?.();
  };

  const submitNewMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!newStudentId.trim() || !newBody.trim()) return;
    setComposeBusy(true); setSendError("");
    try {
      const message = await messagesApi.startConversation(newStudentId.trim(), newBody.trim());
      setShowNewMessage(false); setShowComposeMenu(false); setNewBody(""); setNewStudentId(""); setStudentQuery(""); setStudentMatches([]);
      await loadConversations();
      const page = await messagesApi.listConversations({ limit: 50 });
      const match = page.items.find(c => c.id === message.conversation_id);
      if (match) await openConversation(match);
    } catch (cause) {
      setSendError(cause instanceof ApiError ? cause.message : "Could not send - check your connection and retry.");
    } finally { setComposeBusy(false); }
  };

  useEffect(() => {
    if (!showAnnouncement) return;
    let cancelled = false;
    messagesApi.previewRecipients(scope, scopeId || undefined)
      .then(result => { if (!cancelled) setRecipientCount(result.recipient_count); })
      .catch(() => { if (!cancelled) setRecipientCount(null); });
    return () => { cancelled = true; };
  }, [showAnnouncement, scope, scopeId]);

  const submitAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    if (!announcementBody.trim()) return;
    setComposeBusy(true); setSendError("");
    try {
      const token = crypto.randomUUID();
      await messagesApi.sendAnnouncement(scope, announcementBody.trim(), token, scopeId || undefined);
      setAnnouncementBody(""); setShowAnnouncement(false); setShowComposeMenu(false); setRecipientCount(null);
      await loadConversations();
    } catch (cause) {
      setSendError(cause instanceof ApiError ? cause.message : "Could not send - check your connection and retry.");
    } finally { setComposeBusy(false); }
  };

  const openHistory = async () => {
    setShowHistory(true);
    setShowComposeMenu(false);
    const page = await messagesApi.listAnnouncements({ limit: 50 });
    setAnnouncements(page.items);
  };

  const scopes = canBroadcastCenter ? [...SCOPES, "center" as AnnouncementScope] : SCOPES;
  const combinedMessages = [...messages, ...pending];
  const hasMoreOlder = messages.length < threadTotal;

  return (
    // Fills the viewport below the shared sticky `Topbar` exactly - its own
    // `min-h` is 72px up to `lg`, 86px from `lg` up (see
    // `components/layout/Topbar.tsx`); `sm:p-4` below adds 2rem of vertical
    // breathing room once there's room for it, subtracted here too so the
    // card's own height still matches its real available space.
    <div className="mx-auto flex h-[calc(100dvh-72px)] max-w-[1400px] flex-col sm:h-[calc(100dvh-72px-2rem)] sm:p-4 lg:h-[calc(100dvh-86px-2rem)]">
      <div className="relative flex h-full min-h-0 overflow-hidden border-line bg-card sm:rounded-2xl sm:border sm:shadow-card">
        <div className={`h-full min-h-0 w-full flex-col sm:flex sm:w-[340px] sm:shrink-0 sm:border-e sm:border-line ${selected ? "hidden sm:flex" : "flex"}`}>
          <ConversationList
            conversations={conversations}
            loading={conversations === null}
            selectedId={selected?.id ?? null}
            query={query}
            onQueryChange={setQuery}
            onSelect={conversation => void openConversation(conversation)}
            headerActions={canCompose ? (
              <div className="relative">
                <button type="button" onClick={() => setShowComposeMenu(v => !v)} aria-label="Compose" aria-expanded={showComposeMenu} className="grid size-10 place-items-center rounded-full bg-brand-blue text-white">
                  <PenSquare className="size-4.5" aria-hidden="true" />
                </button>
                {showComposeMenu && (
                  <div className="absolute end-0 top-12 z-20 w-56 overflow-hidden rounded-xl border border-line bg-card shadow-card">
                    <button type="button" onClick={() => { setShowNewMessage(true); setShowAnnouncement(false); setShowComposeMenu(false); }} className="block w-full px-4 py-2.5 text-start text-sm hover:bg-bg">New message</button>
                    <button type="button" onClick={() => { setShowAnnouncement(true); setShowNewMessage(false); setShowComposeMenu(false); }} className="block w-full px-4 py-2.5 text-start text-sm hover:bg-bg">New announcement</button>
                    <button type="button" onClick={() => void openHistory()} className="block w-full px-4 py-2.5 text-start text-sm hover:bg-bg">Sent history</button>
                  </div>
                )}
              </div>
            ) : undefined}
          />
        </div>

        <div className={`h-full min-h-0 w-full flex-col sm:flex sm:flex-1 ${selected ? "flex" : "hidden sm:flex"}`}>
          {selected === null ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <p className="m-0 max-w-xs text-sm text-muted">Select a conversation to start chatting.</p>
            </div>
          ) : (
            <>
              <ChatHeader name={selected.other_participant_name} role={selected.other_participant_role} onBack={() => setSelected(null)} />
              {sendError && (
                <p role="alert" className="m-2 shrink-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-xs text-brand-coral">{sendError}</p>
              )}
              <MessageList
                key={selected.id}
                messages={combinedMessages}
                loading={threadLoading}
                loadingOlder={loadingOlder}
                hasMore={hasMoreOlder}
                onLoadMore={() => void loadOlderMessages()}
                onRetry={retryMessage}
                otherName={selected.other_participant_name}
              />
              <MessageComposer onSendText={sendText} onSendImage={sendImage} onSendVoice={sendVoice} sending={pending.some(m => m._pending)} />
            </>
          )}
        </div>

        {showNewMessage && canCompose && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewMessage(false)}>
            <form onSubmit={event => void submitNewMessage(event)} onClick={event => event.stopPropagation()} className="grid w-full max-w-md gap-2 rounded-2xl border border-line bg-card p-4 shadow-2xl">
              <h2 className="m-0 text-sm font-bold">New message</h2>
              <div className="relative">
                <input value={studentQuery} onChange={event => { const value = event.target.value; setStudentQuery(value); setNewStudentId(""); if (value.trim().length < 2) setStudentMatches([]); }}
                  placeholder="Search for a student…" autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm" disabled={!!prefillStudentId} />
                {studentMatches.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-xl border border-line bg-card shadow-card">
                  {studentMatches.map(match => <li key={match.id}>
                    <button type="button" onClick={() => { setNewStudentId(match.id); setStudentQuery(`${match.full_name} (${match.email})`); setStudentMatches([]); }}
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-bg">{match.full_name} <span className="text-xs text-muted">{match.email}</span></button>
                  </li>)}
                </ul>}
              </div>
              <textarea value={newBody} onChange={event => setNewBody(event.target.value)} rows={3} maxLength={5000}
                placeholder="Type a message…" className="rounded-xl border border-line bg-bg p-3 text-sm" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNewMessage(false)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold">Cancel</button>
                <button disabled={composeBusy || !newStudentId} type="submit" className="min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">Send</button>
              </div>
            </form>
          </div>
        )}

        {showAnnouncement && canCompose && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAnnouncement(false)}>
            <form onSubmit={event => void submitAnnouncement(event)} onClick={event => event.stopPropagation()} className="grid w-full max-w-md gap-2 rounded-2xl border border-brand-blue/30 bg-card p-4 shadow-2xl">
              <h2 className="m-0 text-sm font-bold">New announcement</h2>
              <div className="flex flex-wrap gap-2">
                <select value={scope} onChange={event => { setScope(event.target.value as AnnouncementScope); setScopeId(""); }} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm">
                  {scopes.map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
                </select>
                {scope === "cohort" && <select value={scopeId} onChange={event => setScopeId(event.target.value)} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm">
                  <option value="">Choose a cohort…</option>
                  {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>}
                {scope === "program" && <select value={scopeId} onChange={event => setScopeId(event.target.value)} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm">
                  <option value="">Choose a program…</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>}
              </div>
              {recipientCount !== null && <p className="m-0 text-xs text-muted">Reaches {recipientCount} student{recipientCount === 1 ? "" : "s"}.</p>}
              <textarea value={announcementBody} onChange={event => setAnnouncementBody(event.target.value)} rows={3} maxLength={5000}
                placeholder="Type a message…" className="rounded-xl border border-line bg-bg p-3 text-sm" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAnnouncement(false)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold">Cancel</button>
                <button disabled={composeBusy || recipientCount === 0} type="submit" className="min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">Send</button>
              </div>
            </form>
          </div>
        )}

        {showHistory && canCompose && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowHistory(false)}>
            <div onClick={event => event.stopPropagation()} className="grid max-h-[80vh] w-full max-w-md gap-2 overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-sm font-bold">Sent announcements</h2>
                <button type="button" onClick={() => setShowHistory(false)} className="text-sm text-brand-blue">Close</button>
              </div>
              <div className="min-h-0 overflow-y-auto">
                {announcements === null && <p className="text-sm text-muted">Loading…</p>}
                {announcements?.length === 0 && <p className="text-sm text-muted">No announcements sent yet.</p>}
                {announcements?.map(item => <div key={item.id} className="mb-2 rounded-xl border border-line bg-bg p-3 text-sm">
                  <p className="m-0">{item.body}</p>
                  <p className="m-0 mt-1 text-xs text-muted">
                    {item.scope.replaceAll("_", " ")}{item.scope_name ? ` · ${item.scope_name}` : ""} · {item.recipient_count} recipient{item.recipient_count === 1 ? "" : "s"} · {formatDate(item.created_at)}
                  </p>
                </div>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
