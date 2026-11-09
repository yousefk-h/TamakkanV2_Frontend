"use client";

import Link from "next/link";
import { LEVEL_EMOJI, LEVEL_LABEL } from "@/lib/topics/helpers";
import type { TopicListItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** mm:ss for a video length, m:ss-less "Nm" for a speaking-session minute
 * count - distinct formats since one is exact seconds and the other is
 * already a whole-minute allotment (see `ProgressService.get_topic_session_minutes`). */
function formatVideoLength(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const THUMB_STYLES = [
  "bg-gradient-to-br from-brand-blue/15 to-brand-blue/5",
  "bg-gradient-to-br from-brand-cyan/20 to-brand-cyan/5",
  "bg-gradient-to-br from-brand-primary-light/15 to-brand-primary-light/5",
  "bg-gradient-to-br from-brand-coral/15 to-brand-coral/5",
  "bg-gradient-to-br from-[#ff8b37]/15 to-[#ff8b37]/5",
  "bg-gradient-to-br from-accent-gold/15 to-accent-gold/5",
];

/** No rating/duration field on the backend at all, so those never render
 * here. Lock/done/rolled-over state, on the other hand, comes straight off
 * `topic.lesson_status` - the backend already resolved this student's
 * position on their own calendar (`resolve_topic_statuses`), so this just
 * renders whatever it says rather than cross-referencing the calendar
 * itself. `lesson_status` is `null` for an Administrator/Root view, which
 * never happens here since this card is student-only. */
export function CourseCard({ topic, index, lessonHref }: { topic: TopicListItem; index: number; lessonHref?: string }) {
  const { t } = useI18n();
  const locked = topic.lesson_status === "locked";
  return (
    <article className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card ${locked ? "opacity-60" : ""}`}>
      <div
        className={`relative flex h-32 items-start justify-between p-4 text-3xl ${
          topic.thumbnail_url ? "" : THUMB_STYLES[index % THUMB_STYLES.length]
        }`}
      >
        {topic.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote origin (YouTube or Cloudinary), not worth next/image's remote-pattern config for a catalogue thumbnail
          <img src={topic.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {!topic.thumbnail_url && (
          <span aria-hidden="true">{LEVEL_EMOJI[topic.level]}</span>
        )}
        <span className="relative z-10 ml-auto rounded-full bg-card/80 px-2 py-1 text-xs font-bold text-ink">{LEVEL_LABEL[topic.level]}</span>
        {topic.lesson_status === "done" && (
          <span className="absolute left-3 top-3 grid size-6 place-items-center rounded-full bg-[#15a87c] text-xs font-bold text-white" title={t("lessons.statusDone")}>
            ✓
          </span>
        )}
        {topic.lesson_status === "missed" && (
          <span className="absolute left-3 top-3 rounded-full bg-brand-coral px-2 py-1 text-[10px] font-bold text-white" title={t("lessons.statusMissed")}>
            {t("lessons.rolledOverBadge")}
          </span>
        )}
        {locked && (
          <span className="absolute inset-0 grid place-items-center bg-ink/25 text-2xl" aria-hidden="true">
            🔒
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <b className="text-[15px] leading-snug text-ink">{topic.title}</b>
        <span className="text-xs text-muted">
          {locked ? t("lessons.lockedHint") : t("lessonDetail.videoAndDiscussion")}
        </span>
        {(topic.session_minutes !== null || topic.video_duration_seconds !== null) && (
          <div className="flex items-center gap-2.5 text-[11px] text-muted">
            {topic.session_minutes !== null && (
              <span className="inline-flex items-center gap-1">🎙 {t("lessons.speakingMinutes", { minutes: topic.session_minutes })}</span>
            )}
            {topic.video_duration_seconds !== null && (
              <span className="inline-flex items-center gap-1">▶ {formatVideoLength(topic.video_duration_seconds)}</span>
            )}
          </div>
        )}
        <div className="mt-3">
          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-bg px-4 py-2 text-xs font-bold text-muted">
              🔒 {t("lessons.locked")}
            </span>
          ) : (
            <Link
              href={lessonHref ?? `/student/lessons/${topic.id}`}
              className="inline-block rounded-[10px] bg-brand-blue px-4 py-2 text-xs font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.22)]"
            >
              {t("common.open")}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
