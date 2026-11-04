"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useTopic } from "@/lib/hooks/useTopics";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { PlayerMain } from "@/components/student/player/PlayerMain";
import { CourseContent } from "@/components/student/player/CourseContent";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Replaces the old `CoursePlayer` - opened by navigating to a real route
 * instead of `onOpen(topicId)` local state. Fetches the full `TopicPublic`
 * on demand via `useTopic` (never the list-only `useTopics`), and lists
 * sibling topics in the same level from the already-fetched `TopicsContext`
 * for quick switching. */
export default function LessonPlayerPage() {
  const { t } = useI18n();
  const params = useParams<{ topicId: string }>();
  const topicId = params.topicId;
  const { topic, loading, error } = useTopic(topicId);
  const { topicsByLevel } = useTopicsContext();

  const siblings = topic ? topicsByLevel[topic.level] ?? [] : [];

  return (
    <main className="mx-auto max-w-[1510px] px-3 py-4 sm:px-4 md:px-7.5 md:py-7">
      <div className="mb-2 flex items-center justify-between gap-2 md:mb-4">
        <Link href="/student/lessons" className="inline-flex min-h-11 min-w-0 items-center whitespace-nowrap text-sm font-bold text-brand-blue">
          <span aria-hidden="true" className="me-1.5 inline-block rtl:rotate-180">←</span>
          {t("lessonDetail.backToLessons")}
        </Link>
        {topic && <CourseContent part="sheet" siblings={siblings} currentId={topic.id} />}
      </div>

      {loading && <p className="text-sm text-muted">{t("lessonDetail.loading")}</p>}
      {error && error instanceof ApiError && error.status === 403 ? (
        <div className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <b className="block text-sm text-ink">{t("lessonDetail.lockedTitle")}</b>
          <p className="m-0 mt-1 text-sm text-muted">{t("lessonDetail.lockedMessage")}</p>
        </div>
      ) : (
        error && <p className="text-sm text-muted">{t("lessonDetail.loadError", { message: error.message })}</p>
      )}

      {topic && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <PlayerMain key={topic.id} topic={topic} />
          <CourseContent part="aside" siblings={siblings} currentId={topic.id} />
        </div>
      )}
    </main>
  );
}
