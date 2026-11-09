"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, cohortsApi, messagesApi, programsApi } from "@/lib/api/client";
import type { AnnouncementScope, AnnouncementSummary, CohortPublic, ConversationSummary, MessagePublic, ProgramPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { formatDate } from "@/lib/format";

const SCOPES: AnnouncementScope[] = ["my_students", "cohort", "program"];

/** The whole Teacher Workspace Increment 3 UI: a private 1:1 inbox (every
 * role), plus - for a Teacher/Admin - starting a new conversation and
 * sending a bulk announcement with a recipient-count preview before
 * committing. One shared component for `/admin/messages` and
 * `/student/messages` so the inbox/thread behavior is identical for every
 * role; `canCompose` just hides the staff-only actions for a Student. */
export function MessagingWorkspace({ canCompose, canBroadcastCenter }: { canCompose: boolean; canBroadcastCenter: boolean }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const prefillStudentId = searchParams.get("student_id");

  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessagePublic[] | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [showNewMessage, setShowNewMessage] = useState(!!prefillStudentId);
  const [newStudentId, setNewStudentId] = useState(prefillStudentId ?? "");
  const [newBody, setNewBody] = useState("");

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [scope, setScope] = useState<AnnouncementScope>("my_students");
  const [scopeId, setScopeId] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementSummary[] | null>(null);

  const [cohorts, setCohorts] = useState<CohortPublic[]>([]);
  const [programs, setPrograms] = useState<ProgramPublic[]>([]);

  const loadConversations = useCallback(async () => {
    const page = await messagesApi.listConversations({ limit: 50 });
    setConversations(page.items);
  }, []);

  // Initial API synchronization; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => {
    if (!canCompose) return;
    void (async () => {
      const [cohortItems, programItems] = await Promise.all([cohortsApi.list(), programsApi.list()]);
      setCohorts(cohortItems);
      setPrograms(programItems);
    })();
  }, [canCompose]);

  const openConversation = useCallback(async (id: string) => {
    setSelectedId(id);
    const page = await messagesApi.getConversation(id, { limit: 100 });
    setMessages([...page.items].reverse());
    void loadConversations();
  }, [loadConversations]);

  const submitReply = async () => {
    if (!selectedId || !replyBody.trim()) return;
    setBusy(true); setError("");
    try {
      await messagesApi.reply(selectedId, replyBody.trim());
      setReplyBody("");
      await openConversation(selectedId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("messages.sendError"));
    } finally { setBusy(false); }
  };

  const submitNewMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!newStudentId.trim() || !newBody.trim()) return;
    setBusy(true); setError("");
    try {
      const message = await messagesApi.startConversation(newStudentId.trim(), newBody.trim());
      setShowNewMessage(false); setNewBody(""); setNewStudentId("");
      await loadConversations();
      await openConversation(message.conversation_id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("messages.sendError"));
    } finally { setBusy(false); }
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
    setBusy(true); setError("");
    try {
      const token = crypto.randomUUID();
      await messagesApi.sendAnnouncement(scope, announcementBody.trim(), token, scopeId || undefined);
      setAnnouncementBody(""); setShowAnnouncement(false); setRecipientCount(null);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("messages.sendError"));
    } finally { setBusy(false); }
  };

  const openHistory = async () => {
    setShowHistory(true);
    const page = await messagesApi.listAnnouncements({ limit: 50 });
    setAnnouncements(page.items);
  };

  const scopes = canBroadcastCenter ? [...SCOPES, "center" as AnnouncementScope] : SCOPES;

  return <main className="mx-auto max-w-6xl p-4 pb-28 md:p-8 lg:pb-8">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("messages.eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">{t("messages.title")}</h1>
      </div>
      {canCompose && <div className="flex gap-2">
        <button type="button" onClick={() => setShowNewMessage(s => !s)} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue">{t("messages.newMessage")}</button>
        <button type="button" onClick={() => setShowAnnouncement(s => !s)} className="min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">{t("messages.newAnnouncement")}</button>
        <button type="button" onClick={openHistory} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue">{t("messages.sentHistory")}</button>
      </div>}
    </header>

    {error && <p role="alert" className="mb-4 rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}

    {showNewMessage && canCompose && <form onSubmit={submitNewMessage} className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm font-bold">{t("messages.newMessage")}</h2>
      <input value={newStudentId} onChange={event => setNewStudentId(event.target.value)} placeholder={t("messages.studentIdPlaceholder")}
        className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm" disabled={!!prefillStudentId} />
      <textarea value={newBody} onChange={event => setNewBody(event.target.value)} rows={3} maxLength={5000}
        placeholder={t("messages.bodyPlaceholder")} className="rounded-xl border border-line bg-bg p-3 text-sm" />
      <button disabled={busy} type="submit" className="min-h-11 w-fit rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">{t("messages.send")}</button>
    </form>}

    {showAnnouncement && canCompose && <form onSubmit={submitAnnouncement} className="mb-4 grid gap-2 rounded-2xl border border-brand-blue/30 bg-brand-primary-pale/30 p-4">
      <h2 className="text-sm font-bold">{t("messages.newAnnouncement")}</h2>
      <div className="flex flex-wrap gap-2">
        <select value={scope} onChange={event => { setScope(event.target.value as AnnouncementScope); setScopeId(""); }} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm">
          {scopes.map(s => <option key={s} value={s}>{t(`messages.scope.${s}` as const)}</option>)}
        </select>
        {scope === "cohort" && <select value={scopeId} onChange={event => setScopeId(event.target.value)} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm">
          <option value="">{t("messages.chooseCohort")}</option>
          {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>}
        {scope === "program" && <select value={scopeId} onChange={event => setScopeId(event.target.value)} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm">
          <option value="">{t("messages.chooseProgram")}</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>}
      </div>
      {recipientCount !== null && <p className="text-xs text-muted">{t("messages.recipientPreview", { count: recipientCount })}</p>}
      <textarea value={announcementBody} onChange={event => setAnnouncementBody(event.target.value)} rows={3} maxLength={5000}
        placeholder={t("messages.bodyPlaceholder")} className="rounded-xl border border-line bg-card p-3 text-sm" />
      <button disabled={busy || recipientCount === 0} type="submit" className="min-h-11 w-fit rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">{t("messages.send")}</button>
    </form>}

    {showHistory && canCompose && <div className="mb-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{t("messages.sentHistory")}</h2>
        <button type="button" onClick={() => setShowHistory(false)} className="text-sm text-brand-blue">{t("common.close")}</button>
      </div>
      <div className="mt-2 grid gap-2">
        {announcements === null && <p className="text-sm text-muted">{t("common.loading")}</p>}
        {announcements?.length === 0 && <p className="text-sm text-muted">{t("messages.noAnnouncementsYet")}</p>}
        {announcements?.map(item => <div key={item.id} className="rounded-xl border border-line bg-bg p-3 text-sm">
          <p className="m-0">{item.body}</p>
          <p className="m-0 mt-1 text-xs text-muted">
            {t(`messages.scope.${item.scope}` as const)}{item.scope_name ? ` · ${item.scope_name}` : ""} · {t("messages.recipientPreview", { count: item.recipient_count })} · {formatDate(item.created_at)}
          </p>
        </div>)}
      </div>
    </div>}

    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="grid content-start gap-2">
        {conversations === null && <p className="text-sm text-muted">{t("common.loading")}</p>}
        {conversations?.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-5 text-sm text-muted">{t("messages.inboxEmpty")}</p>}
        {conversations?.map(conversation => <button key={conversation.id} type="button" onClick={() => void openConversation(conversation.id)}
          className={`rounded-xl border p-3 text-start ${selectedId === conversation.id ? "border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}>
          <div className="flex items-center justify-between gap-2">
            <b className="truncate text-sm">{conversation.other_participant_name ?? conversation.other_participant_id}</b>
            {conversation.unread_count > 0 && <span className="rounded-full bg-brand-coral px-2 py-0.5 text-xs font-bold text-white">{conversation.unread_count}</span>}
          </div>
          <p className="m-0 mt-1 truncate text-xs text-muted">{conversation.last_message_preview}</p>
          <p className="m-0 text-[11px] text-muted">{formatDate(conversation.last_message_at)}</p>
        </button>)}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        {selectedId === null ? <p className="text-sm text-muted">{t("messages.selectConversation")}</p> : <>
          <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
            {messages?.map(message => <div key={message.id} className={`max-w-[80%] rounded-xl p-3 text-sm ${message.is_mine ? "self-end bg-brand-blue text-white" : "bg-bg"}`}>
              {!message.is_mine && <b className="block text-xs opacity-80">{message.sender_name}</b>}
              <p className="m-0 whitespace-pre-wrap">{message.body}</p>
              <p className={`m-0 mt-1 text-[11px] ${message.is_mine ? "text-white/70" : "text-muted"}`}>{formatDate(message.created_at)}</p>
            </div>)}
          </div>
          <div className="mt-3 flex gap-2">
            <textarea value={replyBody} onChange={event => setReplyBody(event.target.value)} rows={2} maxLength={5000}
              placeholder={t("messages.replyPlaceholder")} className="flex-1 rounded-xl border border-line bg-bg p-3 text-sm" />
            <button disabled={busy || !replyBody.trim()} type="button" onClick={submitReply} className="min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-50">{t("messages.send")}</button>
          </div>
        </>}
      </section>
    </div>
  </main>;
}
