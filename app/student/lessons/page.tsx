"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { CourseCard } from "@/components/topics/CourseCard";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import { GRID_PAGE_SIZES } from "@/lib/pagination";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { LEVEL_ORDER, LEVEL_LABEL } from "@/lib/topics/helpers";
import type { Level } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Replaces the old `StudentLessons`. Level pills come from what this
 * student is actually entitled to (`Object.keys(topicsByLevel)`, via
 * `LEVEL_ORDER.filter`) - never a hardcoded three-level list - so a
 * Standard-plan student with one level sees no pills at all. This is the
 * real fix for the old "can browse levels outside your plan" bug. */
export default function StudentLessonsPage() {
  const { t } = useI18n();
  const { topicsByLevel, loading } = useTopicsContext();
  const entitledLevels = LEVEL_ORDER.filter(l => (topicsByLevel[l]?.length ?? 0) > 0);
  const [selectedLevel, setSelectedLevel] = useState<Level | undefined>(undefined);
  const [query, setQuery] = useState("");

  // Recomputed every render (rather than trusting the initial useState value)
  // so it stays correct once `topicsByLevel` finishes its async fetch after
  // this component's first mount.
  const activeLevel = selectedLevel && entitledLevels.includes(selectedLevel) ? selectedLevel : entitledLevels[0];
  const items = activeLevel ? topicsByLevel[activeLevel] ?? [] : [];
  const visible = items.filter(t => t.title.toLowerCase().includes(query.toLowerCase()));
  const [lessonPage, lessonAnchor] = usePagination(visible, { resetKey: `${activeLevel ?? ""}|${query}`, pageSizes: GRID_PAGE_SIZES });

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("lessons.curriculum")}</span>
          <h2 className="my-1 text-2xl tracking-tight text-ink">{t("lessons.title")}</h2>
          <p className="m-0 text-muted">{t("lessons.subtitle")}</p>
        </div>
        {entitledLevels.length > 1 && (
          <div className="flex w-full gap-1 rounded-[11px] border border-line bg-card p-1 md:w-auto">
            {entitledLevels.map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setSelectedLevel(l)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium md:flex-none ${
                  activeLevel === l ? "bg-brand-primary-pale font-bold text-brand-blue" : "text-muted hover:bg-bg"
                }`}
              >
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeLevel ? (
        <>
          <label className="mb-5 mt-6 flex items-center gap-1.5 rounded-[10px] border border-line bg-bg px-3 py-2.5 text-muted">
            <Icon name="search" className="size-4" />
            <input
              placeholder={t("lessons.searchPlaceholder", { level: LEVEL_LABEL[activeLevel] })}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-ink outline-none"
            />
          </label>
          <div ref={lessonAnchor} className="grid scroll-mt-24 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Index across the whole level, so a card keeps its thumbnail tone whichever page it's on. */}
            {lessonPage.items.map((topic, i) => <CourseCard topic={topic} index={lessonPage.from - 1 + i} key={topic.id} />)}
          </div>
          {visible.length === 0 && <p className="mt-4 text-sm text-muted">{t("lessons.noMatches", { query })}</p>}
          <Pagination pagination={lessonPage} label={t("lessons.title")} className="mt-5" />
        </>
      ) : (
        <p className="mt-6 text-sm text-muted">
          {loading ? t("lessons.loading") : t("lessons.noTopicsAssignedContact")}
        </p>
      )}
    </main>
  );
}
