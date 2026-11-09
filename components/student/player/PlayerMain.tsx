"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { ApiError, sessionsApi } from "@/lib/api/client";
import type { SessionStartResponse, TopicPublic } from "@/lib/api/types";
import { extractYouTubeId } from "@/lib/format";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { CartoonSession } from "./CartoonSession";
import { MariamSession } from "./MariamSession";
import { PracticeModeSwitch, type PracticeChoice } from "./PracticeModeSwitch";
import { VoiceSession } from "./VoiceSession";
import { LessonExercises } from "./LessonExercises";

type PlayerTab = "vocabulary" | "overview" | "exercises" | "discuss";

/** The 3-tab lesson player - Vocabulary / Overview / Discuss with Mariam.
 * Vocabulary comes first so students preview the topic's key words before
 * watching the video. The Transcript tab was removed (not a section
 * students need on its own). "Record audio" was removed: the one real
 * student recording flow is the end-of-week video check-in (see
 * `EndOfWeekTaskModal`), not a per-lesson task. The video gate (poster click ->
 * real youtube-nocookie.com iframe) is unchanged; "Discuss with Mariam"
 * (Phase 4) is a real LiveKit session - see `MariamSession` - with Voice
 * Practice (`VoiceSession`, the hosted voice-only agent) as a second mode. */
export function PlayerMain({ topic, enrollmentId }: { topic: TopicPublic; enrollmentId?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<PlayerTab>("vocabulary");
  const videoId = extractYouTubeId(topic.youtube_urls[0] ?? "");
  const hasWatchableVideo = Boolean(videoId || topic.uploaded_video_url);
  // Video-less (e.g. PDF-sourced) topics have no Overview tab and thus no way
  // to ever call setWatched(true) - unlock practice sessions immediately for
  // them instead of leaving the gate permanently closed.
  const [watched, setWatched] = useState(!hasWatchableVideo);
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
  const [practice, setPractice] = useState<PracticeChoice>("avatar");
  const [voiceActive, setVoiceActive] = useState(false);
  const [avatarActive, setAvatarActive] = useState(false);
  const [cartoonActive, setCartoonActive] = useState(false);
  // Stage 3: Avatar -> Cartoon handoff. The live Avatar session's own id, reported by `MariamSession` only while it
  // is actually connected - this, and only this, is what makes "Switch to Cartoon" available while Avatar is active.
  const [avatarSessionId, setAvatarSessionId] = useState<string | null>(null);
  const [handoffPending, setHandoffPending] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  // The session `POST /sessions/{id}/handoff` already created - handed to `CartoonSession` so it joins THIS session
  // instead of cold-starting a second, unrelated one. Cleared once consumed (see `CartoonSession`'s own prop doc).
  const [cartoonHandoffStart, setCartoonHandoffStart] = useState<SessionStartResponse | null>(null);

  const questions = topic.warm_up_questions;

  // Stage 3: Avatar -> Cartoon handoff, triggered by the student clicking "Cartoon" while an Avatar session is live.
  // ONE call to the backend's generic handoff entry point (`sessionsApi.handoff`, student-click-specific logic lives
  // only here in the UI layer - the route/service itself takes just a session id, see its own docs) - never ends or
  // disconnects the Avatar session itself; that only happens once `setPractice("cartoon")` below unmounts it, and
  // only after the handoff has already succeeded. A failure leaves the student exactly where they were, on Avatar,
  // with a recoverable, visible error - never a silent no-op and never an unannounced cold Cartoon restart.
  //
  // Stage 4: this is also the EXACT call path the automatic weak-network fallback offer uses to accept (see
  // `MariamSession`'s `onWeakNetworkFallback` prop below) - no second/duplicate handoff mechanism. The only addition
  // is the optional `overrideSessionId`: by the time the 3rd qualifying failure's offer is shown, `MariamSession`'s
  // phase is no longer "live", so `avatarSessionId` here has already gone back to `null` (see its own effect - it
  // only reports a session id while `phase === "live"`, same as before this stage). `MariamSession` still has that
  // session's id internally (its own `sessionId` state is never cleared on error, only its "ready for handoff"
  // report to this component is) and passes it explicitly. The function returns whether it succeeded so the caller
  // can show its own feedback (MariamSession's offer dialog; the manual click path here ignores it, same as before).
  const handleAvatarToCartoonHandoff = useCallback(
    async (overrideSessionId?: string) => {
      const targetSessionId = overrideSessionId ?? avatarSessionId;
      if (!targetSessionId || handoffPending) return false;
      setHandoffPending(true);
      setHandoffError(null);
      try {
        const started = await sessionsApi.handoff(targetSessionId);
        setCartoonHandoffStart(started);
        setPractice("cartoon");
        return true;
      } catch (err) {
        setHandoffError(err instanceof ApiError ? err.message : t("player.cartoonHandoffError"));
        return false;
      } finally {
        setHandoffPending(false);
      }
    },
    [avatarSessionId, handoffPending, t],
  );

  const handlePracticeChange = useCallback(
    (next: PracticeChoice) => {
      if (practice === "avatar" && next === "cartoon" && avatarActive && avatarSessionId) {
        void handleAvatarToCartoonHandoff();
        return;
      }
      setHandoffError(null);
      setPractice(next);
    },
    [practice, avatarActive, avatarSessionId, handleAvatarToCartoonHandoff],
  );

  const tabs: { key: PlayerTab; label: string; shortLabel: string; icon: string }[] = [
    { key: "vocabulary", label: t("player.tabVocabulary"), shortLabel: t("player.tabWordsShort"), icon: "🔤" },
    // Video-optional lessons have nothing to watch - omit the tab entirely
    // rather than show it with no video (or a broken placeholder).
    ...(hasWatchableVideo ? [{ key: "overview" as const, label: t("player.tabOverview"), shortLabel: t("player.tabWatchShort"), icon: "🎬" }] : []),
    ...(topic.lesson_exercises?.length ? [{ key: "exercises" as const, label: t("player.tabExercises"), shortLabel: t("player.tabPracticeShort"), icon: "✍️" }] : []),
    { key: "discuss", label: t("player.tabDiscuss"), shortLabel: t("player.tabSpeakShort"), icon: "💬" },
  ];

  return (
    <div className="-mx-3 min-w-0 overflow-hidden border-y border-line bg-card sm:mx-0 sm:rounded-[22px] sm:border sm:shadow-card">
      <div className="bg-gradient-to-br from-brand-primary-pale to-card px-5 pb-4 pt-5 md:px-6 md:pt-6">
        <span className="inline-flex rounded-full bg-card px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-brand-blue shadow-sm">{topic.level_name || LEVEL_LABEL[topic.level]}</span>
        <h1 className="mb-0 mt-2 text-2xl font-extrabold leading-tight text-ink md:text-3xl">{topic.title}</h1>
      </div>

      <div className="grid auto-cols-fr grid-flow-col border-b border-line bg-card px-1 sm:flex sm:gap-1 sm:overflow-x-auto sm:px-5" role="tablist">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={e => {
              setTab(t.key);
              // The tab strip scrolls horizontally on narrow screens
              // (`overflow-x-auto` above) rather than wrapping - without
              // this, tapping a tab near the end (e.g. "Discuss with
              // Mariam") left it partially clipped at the edge of the
              // strip instead of fully in view, confirmed live on iPhone
              // widths. `inline: "nearest"` only scrolls as far as needed
              // to reveal it, not necessarily to the very start/end.
              e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
            }}
            className={`relative inline-flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-3 text-[11px] font-bold sm:flex-none sm:flex-row sm:gap-1.5 sm:whitespace-nowrap sm:rounded-t-[10px] sm:px-3 sm:text-sm ${
              tab === t.key ? "bg-brand-primary-pale text-brand-blue after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-blue" : "text-muted hover:bg-bg"
            }`}
          >
            {t.icon && <span aria-hidden="true" className="text-base sm:text-sm">{t.icon}</span>}
            <span className="truncate sm:hidden">{t.shortLabel}</span><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className={tab === "discuss" ? "p-3 sm:p-4 md:p-6" : "p-4 sm:p-5 md:p-6"}>
        {tab === "vocabulary" && (
          <div>
            {topic.vocabulary.length === 0 ? (
              <p className="text-xs text-muted">{t("player.noVocabulary")}</p>
            ) : (
              <>
                <p className="m-0 mb-2.5 text-xs text-muted">{t("player.tapWordHint")}</p>
                <div className="flex flex-wrap gap-2">
                  {topic.vocabulary.map(v => {
                    const expanded = expandedTerm === v.term;
                    return (
                      <button
                        key={v.term}
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedTerm(expanded ? null : v.term)}
                        className={`group flex max-w-full cursor-pointer items-baseline gap-1.5 rounded-full border px-3 py-2 text-start text-[13px] font-semibold transition-all ${
                          expanded
                            ? "border-brand-blue bg-brand-blue text-white shadow-[0_4px_14px_rgb(var(--brand-shadow-rgb)/.28)]"
                            : "border-brand-primary-light/60 bg-brand-primary-pale text-ink hover:-translate-y-0.5 hover:border-brand-blue hover:bg-brand-primary-light/40 hover:shadow-[0_4px_12px_rgb(var(--brand-shadow-rgb)/.16)]"
                        }`}
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">{v.term}</span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-3.5 flex-none transition-transform ${expanded ? "rotate-180 text-white/80" : "text-brand-blue/60 group-hover:text-brand-blue"}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {expandedTerm && (
              (() => {
                const item = topic.vocabulary.find(v => v.term === expandedTerm);
                if (!item) return null;
                return (
                  <div className="mt-3 rounded-2xl border border-line bg-bg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 [overflow-wrap:anywhere]">
                        <b className="text-base text-ink">{item.term}</b>
                        {item.theme && (
                          <span className="ml-2 inline-block rounded-full bg-brand-primary-pale px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                            {item.theme}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={t("common.close")}
                        onClick={() => setExpandedTerm(null)}
                        className="min-h-11 min-w-11 shrink-0 rounded-lg text-lg leading-none text-muted"
                      >
                        ×
                      </button>
                    </div>
                    {item.example_sentence && <p className="m-0 mt-2.5 text-sm leading-relaxed text-ink">{item.example_sentence}</p>}
                    {item.arabic_meaning && (
                      <p dir="rtl" className="m-0 mt-2 text-sm leading-relaxed text-muted">
                        {item.arabic_meaning}
                      </p>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {tab === "overview" && (
          <div>
            {/* Video-optional lesson source: a PDF-only (or otherwise
             * video-less) lesson has no player to show at all - rendering an
             * empty/broken-looking video box here would be worse than
             * omitting it, so this whole block is skipped rather than
             * falling back to an error placeholder. */}
            {videoId && (
              <div className="relative mb-4.5 aspect-video overflow-hidden rounded-2xl bg-brand-navy">
                {watched ? (
                  <iframe
                    className="absolute inset-0 size-full border-0"
                    src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
                    title={`${topic.title} video lesson`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <>
                    <Image
                      src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                      alt={`${topic.title} video lesson`}
                      fill
                      sizes="(max-width: 760px) 100vw, 700px"
                      className="absolute inset-0 size-full object-cover"
                    />
                    <span className="absolute bottom-2.5 right-2.5 z-10 rounded-[5px] bg-black/60 px-1.5 py-1 text-[13px] text-white">
                      YOUTUBE
                    </span>
                    <button
                      type="button"
                      aria-label={t("player.watchVideo")}
                      onClick={() => setWatched(true)}
                      className="absolute left-1/2 top-1/2 z-10 grid size-[50px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white/25 bg-white pl-1 text-brand-blue"
                    >
                      <Icon name="play" className="size-5" />
                    </button>
                  </>
                )}
              </div>
            )}
            {!videoId && topic.uploaded_video_url && (
              <video
                className="mb-4.5 aspect-video w-full rounded-2xl bg-brand-navy object-contain"
                src={topic.uploaded_video_url}
                controls
                playsInline
                preload="metadata"
                onPlay={() => setWatched(true)}
              >
                Your browser does not support video playback.
              </video>
            )}
            <b className="text-sm">{t("player.discussionQuestions")}</b>
            {questions.length === 0 ? (
              <p className="mt-2 text-xs text-muted">{t("player.noWarmUpQuestions")}</p>
            ) : (
              <ul className="mt-2.5 list-disc space-y-1.5 pl-4.5 text-sm leading-relaxed">
                {questions.map(q => <li key={q}>{q}</li>)}
              </ul>
            )}
          </div>
        )}

        {tab === "exercises" && <LessonExercises topic={topic} enrollmentId={enrollmentId} onVideo={() => setTab("overview")} onDiscuss={() => setTab("discuss")} />}

        {tab === "discuss" && (
          <div className="flex flex-col gap-3 md:gap-4">
            <PracticeModeSwitch
              value={practice}
              onChange={handlePracticeChange}
              // Voice/Cartoon stay fully locked while active (leaving ends them, as before). Avatar being active no
              // longer locks the switch once it has a live session id - that is exactly what lets the student tap
              // "Cartoon" to trigger the handoff below, instead of only being able to switch once Avatar has ended.
              locked={voiceActive || cartoonActive || (avatarActive && !avatarSessionId) || handoffPending}
            />
            {handoffError && (
              <p role="alert" className="m-0 rounded-lg bg-brand-coral/10 px-3 py-2 text-xs font-semibold text-brand-coral">
                {handoffError}
              </p>
            )}
            {/* Only one mode is ever mounted - see PracticeModeSwitch. The switch's own options are now
             * just Avatar and Cartoon; "voice" is kept here only so Voice Practice's component and
             * routes stay reachable and working for any caller that still sets this value - it is no
             * longer offered as a primary top-level choice in the switch above. */}
            {practice === "avatar" ? (
              <MariamSession
                topicId={topic.id}
                enrollmentId={enrollmentId}
                watched={watched}
                onActiveChange={setAvatarActive}
                onSessionReady={setAvatarSessionId}
                onWeakNetworkFallback={handleAvatarToCartoonHandoff}
              />
            ) : practice === "cartoon" ? (
              <CartoonSession
                topicId={topic.id}
                enrollmentId={enrollmentId}
                watched={watched}
                onActiveChange={setCartoonActive}
                handoffStart={cartoonHandoffStart}
                onHandoffConsumed={() => setCartoonHandoffStart(null)}
              />
            ) : (
              <VoiceSession topicId={topic.id} enrollmentId={enrollmentId} watched={watched} onActiveChange={setVoiceActive} />
            )}
          </div>
        )}

      </div>
    </div>
  );
}
