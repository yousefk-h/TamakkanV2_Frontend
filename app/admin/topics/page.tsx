"use client";

import { useMemo, useState } from "react";
import { PageHead } from "@/components/layout/PageHead";
import { ApiError, topicsApi } from "@/lib/api/client";
import type { Level, TopicListItem, UnitPublic } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { useUnitsContext } from "@/lib/units/UnitsContext";
import { LEVEL_EMOJI, LEVEL_LABEL, LEVEL_ORDER, TRANSCRIPT_STATE_LABEL } from "@/lib/topics/helpers";
import { ProgramBuilder } from "@/components/admin/topics/builder/ProgramBuilder";
import { TopicDetailModal } from "@/components/admin/topics/TopicDetailModal";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Groups an already-deterministically-sorted (level, unit, order) topic
 * list into per-unit buckets for display - named units first (by their own
 * `order_index`), then one trailing "Unassigned" bucket for legacy/unassigned
 * topics or ones whose unit was since deleted (a dangling `unit_id` that
 * doesn't resolve to any visible unit falls back here too, rather than
 * disappearing). Never re-sorts the topics themselves - the backend's own
 * order is deterministic and is preserved within each bucket. */
function groupTopicsByUnit(
  topics: TopicListItem[],
  units: UnitPublic[],
): { unit: UnitPublic | null; topics: TopicListItem[] }[] {
  const unitsById = new Map(units.map(u => [u.id, u]));
  const byUnitId = new Map<string, TopicListItem[]>();
  const unassigned: TopicListItem[] = [];
  for (const topic of topics) {
    if (topic.unit_id && unitsById.has(topic.unit_id)) {
      (byUnitId.get(topic.unit_id) ?? byUnitId.set(topic.unit_id, []).get(topic.unit_id)!).push(topic);
    } else {
      unassigned.push(topic);
    }
  }
  const namedGroups = [...units]
    .filter(u => byUnitId.has(u.id))
    .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
    .map(unit => ({ unit, topics: byUnitId.get(unit.id)! }));
  return unassigned.length > 0 ? [...namedGroups, { unit: null, topics: unassigned }] : namedGroups;
}

type BuilderTarget = { mode: "create"; level: Level } | { mode: "edit"; topicId: string };

const LEVEL_ICON_TONE = ["bg-brand-cyan/10 text-brand-cyan", "bg-brand-primary-pale text-brand-blue", "bg-accent-pink/10 text-accent-pink"];

/** One level's column - its own component so each level pages
 * independently (a hook per column can't live inside the `LEVEL_ORDER.map`). */
function LevelColumn({
  level,
  position,
  topics,
  units,
  deletingId,
  currentUserId,
  onCreate,
  onEdit,
  onDelete,
  onViewDetails,
}: {
  level: Level;
  position: number;
  topics: TopicListItem[];
  units: UnitPublic[];
  deletingId: string | null;
  currentUserId: string | null;
  onCreate: () => void;
  onEdit: (topicId: string) => void;
  onDelete: (topicId: string, isShared: boolean) => void;
  onViewDetails: (topicId: string, title: string) => void;
}) {
  const { t } = useI18n();
  // Grouped by unit + order - deterministic (never Mongo's/array's natural
  // order): the backend already sorts by (unit_id, order_index, created_at),
  // this only buckets that already-ordered list under its unit headers.
  const groups = useMemo(() => groupTopicsByUnit(topics, units), [topics, units]);
  return (
    <section className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <header className="flex items-center gap-2.5 border-b border-line bg-bg p-4">
        <div className={`grid size-11 flex-none place-items-center rounded-xl text-xl ${LEVEL_ICON_TONE[position]}`}>{LEVEL_EMOJI[level]}</div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-extrabold tracking-wide text-brand-blue">{t("builder.levelN", { n: position + 1 })}</span>
          <h3 className="m-0 text-[15px]">{LEVEL_LABEL[level]}</h3>
        </div>
        <button
          type="button"
          aria-label={t("adminTopics.addTopicTo", { level: LEVEL_LABEL[level] })}
          onClick={onCreate}
          className="grid size-7 flex-none place-items-center rounded-lg border border-line bg-card text-brand-blue"
        >
          ＋
        </button>
      </header>
      <div className="p-3.5">
        <article className="rounded-xl border border-line p-3">
          <span className="text-[10px] font-extrabold text-muted">{t("adminTopics.topicsInLevel")}</span>
          <b className="mt-0.5 block text-sm">{t("adminTopics.learningTopics", { count: topics.length })}</b>
          <div className="mt-2 border-t border-line pt-1">
            {topics.length === 0 && <p className="py-2 text-sm text-muted">{t("adminTopics.noTopicsYet")}</p>}
            {groups.map(group => (
              <div key={group.unit?.id ?? "unassigned"} className="border-b border-line py-2 last:border-0">
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">
                  {group.unit?.name ?? t("adminTopics.unassignedUnit")}
                </span>
                {group.topics.map((topic, j) => {
                  // A legacy topic (no recorded author) is shared - every
                  // teacher sees it, but only Root can edit it (see
                  // `TopicContentService.get_own_topic`). Deleting one is an
                  // explicit exception: any teacher may remove a shared
                  // topic they don't want cluttering their own catalogue
                  // (`get_own_or_shared_topic_for_delete`) - it disappears
                  // for every teacher, not just the one who deleted it.
                  const isOwn = topic.created_by_id !== null && topic.created_by_id === currentUserId;
                  const isShared = topic.created_by_id === null;
                  const canDelete = isOwn || isShared;
                  return (
                    <div key={topic.id} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="grid size-[18px] flex-none place-items-center rounded-[5px] bg-bg text-[10px]">{j + 1}</span>
                        <span className="truncate text-sm text-ink" title={topic.title}>
                          {topic.title}
                        </span>
                        {topic.has_pdf && <span title={t("adminTopics.hasPdfTooltip")} className="flex-none text-xs">📄</span>}
                        <button
                          type="button"
                          title={t("adminTopics.detailsTooltip")}
                          aria-label={t("adminTopics.detailsTooltip")}
                          onClick={() => onViewDetails(topic.id, topic.title)}
                          className="flex-none text-xs text-muted hover:text-brand-blue"
                        >
                          ℹ️
                        </button>
                        {!isOwn && (
                          <span
                            title={t("adminTopics.sharedTooltip")}
                            className="flex-none rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold text-muted"
                          >
                            {t("adminTopics.sharedBadge")}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between pl-[26px]">
                        <small className="text-xs text-muted">{TRANSCRIPT_STATE_LABEL[topic.transcript_state]}</small>
                        {(isOwn || canDelete) && (
                          <span className="flex gap-2.5">
                            {isOwn && (
                              <button type="button" onClick={() => onEdit(topic.id)} className="text-xs font-bold text-brand-blue">
                                {t("adminTopics.edit")}
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                disabled={deletingId === topic.id}
                                onClick={() => onDelete(topic.id, isShared)}
                                className="text-xs font-bold text-brand-blue disabled:opacity-40"
                              >
                                {t("adminTopics.delete")}
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </article>
        <button
          type="button"
          onClick={onCreate}
          className="mt-2.5 w-full rounded-lg border border-dashed border-line bg-bg py-2 text-xs font-bold text-muted"
        >
          ＋ {t("adminTopics.addTopicTo", { level: LEVEL_LABEL[level] })}
        </button>
      </div>
    </section>
  );
}

/** The one already-real admin surface: every topic here is a genuine backend
 * resource, edited/deleted through `topicsApi` and refetched via the shared
 * `TopicsProvider` context rather than local state. */
export default function AdminTopicsPage() {
  const { t } = useI18n();
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;
  const { topics, topicsByLevel, loading, refetch } = useTopicsContext();
  const { unitsByLevel } = useUnitsContext();
  const [builderTarget, setBuilderTarget] = useState<BuilderTarget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ topicId: string; title: string } | null>(null);
  const pendingReviewCount = (topics ?? []).filter(topic => topic.transcript_state === "pending_review").length;

  const handleDelete = async (topicId: string, isShared: boolean) => {
    if (!window.confirm(isShared ? t("adminTopics.deleteSharedConfirm") : t("adminTopics.deleteConfirm"))) return;
    setDeletingId(topicId);
    try {
      await topicsApi.delete(topicId);
      refetch();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : t("adminTopics.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead eyebrow={t("adminTopics.eyebrow")} title={t("adminTopics.title")} desc={t("adminTopics.desc")} />
      {loading && <p className="mt-4 text-muted">{t("adminTopics.loading")}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {LEVEL_ORDER.map((l, i) => (
          <LevelColumn
            key={l}
            level={l}
            position={i}
            topics={topicsByLevel[l] ?? []}
            units={unitsByLevel[l] ?? []}
            deletingId={deletingId}
            currentUserId={currentUserId}
            onCreate={() => setBuilderTarget({ mode: "create", level: l })}
            onEdit={topicId => setBuilderTarget({ mode: "edit", topicId })}
            onDelete={handleDelete}
            onViewDetails={(topicId, title) => setDetailTarget({ topicId, title })}
          />
        ))}
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4.5 shadow-card">
        <h3 className="m-0 text-[15px]">{t("adminTopics.contentPipeline")}</h3>
        <p className="mt-2 text-sm text-muted">
          {t(pendingReviewCount === 1 ? "adminTopics.pendingReview" : "adminTopics.pendingReviewPlural", { count: pendingReviewCount })}
        </p>
      </section>

      {builderTarget && (
        <ProgramBuilder
          topicId={builderTarget.mode === "edit" ? builderTarget.topicId : null}
          initialLevel={builderTarget.mode === "create" ? builderTarget.level : "beginner"}
          onClose={() => setBuilderTarget(null)}
          onSaved={refetch}
        />
      )}

      {detailTarget && (
        <TopicDetailModal key={detailTarget.topicId} topicId={detailTarget.topicId} title={detailTarget.title} onClose={() => setDetailTarget(null)} />
      )}
    </main>
  );
}
