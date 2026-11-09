"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError, cohortsApi, topicsApi } from "@/lib/api/client";
import type { CalendarTemplate, CohortPublic, Level, ProgramPublic, ProgramTopicPublic, TopicListItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { ProgramBuilder } from "@/components/admin/topics/builder/ProgramBuilder";

const PAGE_SIZE = 24;

export function BatchCurriculumTab({ cohort, program, assignments, templates, canOpenProgram, onChanged, onOpenSchedule }: {
  cohort: CohortPublic;
  program: ProgramPublic;
  assignments: ProgramTopicPublic[];
  templates: CalendarTemplate[];
  canOpenProgram: boolean;
  onChanged: () => Promise<void> | void;
  onOpenSchedule: (stageId: string) => void;
}) {
  const { t } = useI18n();
  const accessibleStages = cohort.accessible_program_level_ids?.length
    ? cohort.accessible_program_level_ids
    : cohort.program_level_ids;
  const [stageId, setStageId] = useState(accessibleStages[0] ?? "");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [items, setItems] = useState<TopicListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [addedTopic, setAddedTopic] = useState<string | null>(null);

  const stage = program.levels.find(item => item.id === stageId);
  const assignedIds = useMemo(
    () => new Set(assignments.filter(item => item.program_level_id === stageId).map(item => item.topic_id)),
    [assignments, stageId],
  );
  const scheduledIds = useMemo(() => new Set(
    templates.filter(template => template.program_level_id === stageId).flatMap(template => template.days.flatMap(day => day.topic_ids)),
  ), [templates, stageId]);

  const load = useCallback(async (reset: boolean, offset = 0) => {
    setLoading(true);
    setError("");
    try {
      const next = await topicsApi.list({
        limit: PAGE_SIZE,
        skip: reset ? 0 : offset,
        search: search || undefined,
        level: level || undefined,
      });
      setItems(current => reset ? next : [...current, ...next.filter(item => !current.some(old => old.id === item.id))]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("batchCurriculum.loadError"));
    } finally {
      setLoading(false);
    }
  }, [level, search, t]);

  // Keep results synchronized with the selected filters. Search itself is
  // submitted explicitly so typing does not generate an API request per key.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(true); }, [load]);

  const assign = async (topicId: string) => {
    if (!stageId) return;
    setError("");
    try {
      await cohortsApi.assignTopic(cohort.id, {
        topic_id: topicId,
        program_level_id: stageId,
        status: "published",
      });
      setAddedTopic(topicId);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("batchCurriculum.assignError"));
      throw cause;
    }
  };

  return <section className="grid gap-4">
    <div className="rounded-2xl border border-line bg-card p-4 md:p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h2 className="text-lg font-bold">{t("batchWorkspace.batchCurriculumHeading")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("batchWorkspace.batchCurriculumDescription")}</p>
          {canOpenProgram && <Link href={`/admin/programs/${program.id}`} className="mt-2 inline-block text-sm font-bold text-brand-blue">{t("batchWorkspace.openProgramCurriculum")} →</Link>}
        </div>
        <button type="button" onClick={() => setBuilderOpen(true)} disabled={!stage}
          className="min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">
          {t("batchCurriculum.createTopic")}
        </button>
      </div>

      <label className="mt-5 grid gap-1 text-sm font-bold md:max-w-sm">{t("batchCurriculum.programStage")}
        <select value={stageId} onChange={event => { setStageId(event.target.value); setAddedTopic(null); }}
          className="min-h-11 rounded-xl border border-line bg-bg px-3 font-normal">
          {accessibleStages.map(id => <option key={id} value={id}>{program.levels.find(item => item.id === id)?.name ?? id}</option>)}
        </select>
      </label>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-bg p-3"><p className="text-xs font-bold text-muted">{t("batchWorkspace.sharedProgramCurriculum")}</p><p className="mt-1 text-sm">{assignedIds.size} {t("batchWorkspace.statTopics")}</p></div>
        <div className="rounded-xl border border-line bg-bg p-3"><p className="text-xs font-bold text-muted">{t("batchWorkspace.batchSchedule")}</p><p className="mt-1 text-sm">{scheduledIds.size} {t("batchWorkspace.scheduledLessons")}</p></div>
      </div>

      <form onSubmit={event => { event.preventDefault(); setSearch(searchDraft.trim()); }} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input value={searchDraft} onChange={event => setSearchDraft(event.target.value)}
          placeholder={t("batchCurriculum.searchPlaceholder")} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm" />
        <select value={level} onChange={event => setLevel(event.target.value as Level | "")}
          className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm">
          <option value="">{t("batchCurriculum.allDifficulties")}</option>
          <option value="beginner">{t("batchCurriculum.beginner")}</option>
          <option value="intermediate">{t("batchCurriculum.intermediate")}</option>
          <option value="advanced">{t("batchCurriculum.advanced")}</option>
        </select>
        <button type="submit" className="min-h-11 rounded-xl border border-brand-blue px-4 text-sm font-bold text-brand-blue">
          {t("batchCurriculum.search")}
        </button>
      </form>
    </div>

    {addedTopic && <div role="status" className="flex flex-col justify-between gap-3 rounded-2xl border border-[#10ab91]/40 bg-[#10ab91]/10 p-4 sm:flex-row sm:items-center">
      <p className="text-sm font-bold text-[#087a69]">{t("batchCurriculum.added")}</p>
      <button type="button" onClick={() => onOpenSchedule(stageId)} className="min-h-10 rounded-xl bg-[#10ab91] px-4 text-sm font-bold text-white">
        {t("batchCurriculum.openSchedule")}
      </button>
    </div>}

    {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(topic => {
        const assigned = assignedIds.has(topic.id);
        return <article key={topic.id} className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="aspect-[16/7] bg-brand-primary-pale">
            {topic.thumbnail_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={topic.thumbnail_url} alt="" className="h-full w-full object-cover" />
              : <div className="grid h-full place-items-center text-3xl" aria-hidden="true">📘</div>}
          </div>
          <div className="grid gap-3 p-4">
            <div>
              <h3 className="line-clamp-2 font-bold">{topic.title}</h3>
              <p className="mt-1 text-xs text-muted">{topic.author_name ?? t("batchCurriculum.sharedTopic")}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-muted">
              <span className="rounded-full bg-bg px-2 py-1">{topic.level_name || topic.level}</span>
              <span className="rounded-full bg-bg px-2 py-1">{t("batchCurriculum.exerciseCount", { count: String(topic.exercise_count) })}</span>
              {topic.has_video && <span className="rounded-full bg-bg px-2 py-1">{t("batchCurriculum.video")}</span>}
              {topic.has_pdf && <span className="rounded-full bg-bg px-2 py-1">PDF</span>}
              {topic.has_audio && <span className="rounded-full bg-bg px-2 py-1">{t("batchCurriculum.audio")}</span>}
            </div>
            <button type="button" disabled={assigned || loading || !stageId} onClick={() => void assign(topic.id)}
              className={`min-h-10 rounded-xl px-3 text-sm font-bold ${assigned ? "bg-[#10ab91]/10 text-[#087a69]" : "bg-brand-blue text-white"} disabled:opacity-60`}>
              {assigned ? (scheduledIds.has(topic.id) ? t("batchWorkspace.scheduledLessons") : t("batchWorkspace.unscheduledLessons")) : t("batchCurriculum.addExisting")}
            </button>
          </div>
        </article>;
      })}
    </div>

    {!loading && items.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("batchCurriculum.empty")}</p>}
    {loading && <p className="text-sm text-muted">{t("common.loading")}</p>}
    {hasMore && !loading && <button type="button" onClick={() => void load(false, items.length)} className="mx-auto min-h-11 rounded-xl border border-line bg-card px-5 text-sm font-bold">
      {t("batchCurriculum.loadMore")}
    </button>}

    {builderOpen && stage && <ProgramBuilder
      topicId={null}
      initialLevel={stage.difficulty_level}
      hideProgramAssignments
      onSaved={() => void load(true)}
      onComplete={assign}
      onClose={() => setBuilderOpen(false)}
    />}
  </section>;
}
