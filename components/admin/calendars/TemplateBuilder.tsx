"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, calendarTemplatesApi, programsApi } from "@/lib/api/client";
import { useCalendarTemplate } from "@/lib/hooks/useCalendarTemplates";
import { daysForSave, staleTopicIds } from "@/lib/calendarTemplates/days";
import { useTopicsContext } from "@/lib/topics/TopicsContext";
import { LEVEL_LABEL, LEVEL_ORDER } from "@/lib/topics/helpers";
import type { Level, ProgramTopicPublic, TemplateKind, TopicListItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const POOL_DROP_ID = "pool";

function topicLabel(topic: TopicListItem, kind: TemplateKind): string {
  return kind === "custom" ? `${topic.level_name || LEVEL_LABEL[topic.level]} · ${topic.title}` : topic.title;
}

/** The not-yet-scheduled-topics panel - itself a drop target (dropping a
 * scheduled chip here unschedules it). `useDroppable` only registers with
 * the nearest `<DndContext>` when called from one of its actual descendant
 * components, so this has to be its own component rendered inside
 * `DndContext`'s JSX - calling the hook directly in `TemplateBuilder`
 * (DndContext's parent, not a child) silently never registers the drop
 * target at all. */
function PoolPanel({
  poolQuery,
  onPoolQueryChange,
  poolTopics,
  showSearch,
  selectedPoolTopicId,
  onToggleSelect,
  highlight,
  kind,
  t,
}: {
  poolQuery: string;
  onPoolQueryChange: (value: string) => void;
  poolTopics: TopicListItem[];
  showSearch: boolean;
  selectedPoolTopicId: string | null;
  onToggleSelect: (topicId: string) => void;
  highlight: boolean;
  kind: TemplateKind;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex max-h-64 w-full min-w-0 flex-col gap-2 overflow-y-auto rounded-xl border p-3 lg:max-h-[420px] lg:w-56 lg:flex-none ${
        isOver && highlight ? "border-2 border-brand-blue bg-brand-primary-pale/40" : "border-line bg-bg"
      }`}
    >
      <b className="shrink-0 text-xs">{t("adminCalendars.poolTitle")}</b>
      {showSearch && (
        <input
          value={poolQuery}
          onChange={e => onPoolQueryChange(e.target.value)}
          placeholder={t("adminCalendars.poolSearchPlaceholder")}
          aria-label={t("adminCalendars.poolSearchPlaceholder")}
          className="min-h-11 shrink-0 rounded-md border border-line bg-card px-2 py-2 text-ink outline-brand-blue"
        />
      )}
      {poolTopics.length === 0 && <p className="m-0 text-[11px] text-muted">{t("adminCalendars.poolEmpty")}</p>}
      {poolTopics.map(topic => (
        <PoolTopicCard
          key={topic.id}
          topic={topic}
          label={topicLabel(topic, kind)}
          selected={selectedPoolTopicId === topic.id}
          onToggleSelect={() => onToggleSelect(topic.id)}
        />
      ))}
    </div>
  );
}

/** A not-yet-scheduled topic in the pool - draggable onto any day cell, or
 * click-to-arm for the keyboard/screen-reader fallback (see
 * `TemplateBuilder`'s `selectedPoolTopicId`). */
function PoolTopicCard({
  topic,
  label,
  selected,
  onToggleSelect,
}: {
  topic: TopicListItem;
  label: string;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  // No `style={{ transform }}` here - the `DragOverlay` (rendered outside
  // any scrollable ancestor, via a portal) is the only thing that visually
  // follows the cursor. Moving the source node too used to let it slide
  // outside the pool panel's bounds mid-drag, which briefly created a
  // phantom horizontal scroll region that dnd-kit's own auto-scroll then
  // fought over - the pool panel visibly jittering left and snapping back.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pool:${topic.id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      title={label}
      onClick={onToggleSelect}
      className={`block min-h-11 w-full min-w-0 shrink-0 rounded-lg border px-3 py-2 text-start transition-opacity ${
        isDragging ? "opacity-30" : ""
      } ${selected ? "border-2 border-brand-blue bg-brand-primary-pale font-bold text-ink" : "border-line bg-card text-ink"}`}
      {...listeners}
      {...attributes}
      aria-pressed={selected}
    >
      {/* `globals.css`'s unlayered `button { font: inherit }` reset beats any
       * Tailwind text-size utility applied to the button itself (unlayered
       * CSS always wins over `@layer utilities` in Tailwind v4's cascade) -
       * the font-size class has to live on an inner element instead. */}
      <span className="block min-w-0 text-sm [overflow-wrap:anywhere]">{label}</span>
    </button>
  );
}

/** An already-scheduled course's chip - draggable to a different day (or
 * back onto the pool, to unschedule), plus the "×" button/minutes input for
 * the non-drag path. */
function ScheduledChip({
  day,
  topic,
  label,
  customMinutes,
  onRemove,
  onSetMinutes,
  removeLabel,
  minutesLabel,
  automaticPlaceholder,
}: {
  day: number;
  topic: TopicListItem;
  label: string;
  customMinutes: number | undefined;
  onRemove: () => void;
  onSetMinutes: (minutes: number | null) => void;
  removeLabel: string;
  minutesLabel: string;
  automaticPlaceholder: string;
}) {
  // Same reasoning as `PoolTopicCard`: no live `transform` on the source
  // node - only the `DragOverlay` copy should visually follow the cursor.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${day}:${topic.id}` });
  return (
    <li
      ref={setNodeRef}
      className={`min-w-0 rounded-lg bg-brand-primary-pale p-2 text-sm text-ink ${isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 flex-1 cursor-grab touch-none [overflow-wrap:anywhere]" title={label} {...listeners} {...attributes}>
          {label}
        </span>
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg font-bold text-brand-coral">
          ×
        </button>
      </div>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {minutesLabel}
        <input
          type="number"
          min={1}
          max={180}
          value={customMinutes ?? ""}
          placeholder={automaticPlaceholder}
          onChange={e => onSetMinutes(e.target.value ? Number(e.target.value) : null)}
          className="min-h-11 w-20 rounded border border-line bg-card px-2 py-2 text-ink outline-brand-blue"
        />
      </label>
    </li>
  );
}

/** One day's cell - a drop target for pool cards and chips from other days
 * (end-of-week days accept neither), and a click target for the
 * click-to-arm fallback. */
function DayCell({
  day,
  isEndOfWeek,
  scheduledTopics,
  pickHintActive,
  customMinutesForDay,
  kind,
  removeDayTopic,
  setCustomMinutes,
  onCellClick,
  t,
}: {
  day: number;
  isEndOfWeek: boolean;
  scheduledTopics: TopicListItem[];
  pickHintActive: boolean;
  customMinutesForDay: Record<string, number>;
  kind: TemplateKind;
  removeDayTopic: (day: number, topicId: string) => void;
  setCustomMinutes: (day: number, topicId: string, minutes: number | null) => void;
  onCellClick: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, disabled: isEndOfWeek });
  const highlight = !isEndOfWeek && (isOver || pickHintActive);
  const pickable = !isEndOfWeek && pickHintActive;
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border p-2.5 transition-colors ${
        isEndOfWeek ? "border-line bg-bg opacity-60" : highlight ? "border-2 border-brand-blue bg-brand-primary-pale/40" : "border-line bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <b className="text-sm">{t("adminCalendars.dayN", { day })}</b>
        {isEndOfWeek && <span className="text-[10px]">🎥</span>}
      </div>
      {pickable && (
        <button type="button" onClick={onCellClick} className="mt-2 min-h-11 rounded-lg border border-brand-blue px-2 py-2 text-start text-brand-blue">
          <span className="text-sm">{t("adminCalendars.placeHereAriaLabel", { day })}</span>
        </button>
      )}
      {isEndOfWeek ? (
        <p className="m-0 mt-1 text-[11px] text-muted">{t("adminCalendars.endOfWeekReserved")}</p>
      ) : (
        <>
          {scheduledTopics.length === 0 && <p className="m-0 mt-1 text-[11px] text-muted">{t("adminCalendars.unscheduled")}</p>}
          {scheduledTopics.length > 0 && (
            <ul className="mt-1.5 grid min-w-0 gap-1">
              {scheduledTopics.map(topic => (
                <ScheduledChip
                  key={topic.id}
                  day={day}
                  topic={topic}
                  label={topicLabel(topic, kind)}
                  customMinutes={customMinutesForDay[topic.id]}
                  onRemove={() => removeDayTopic(day, topic.id)}
                  onSetMinutes={minutes => setCustomMinutes(day, topic.id, minutes)}
                  removeLabel={t("adminCalendars.removeCourse", { title: topic.title })}
                  minutesLabel={t("adminCalendars.minutesLabel")}
                  automaticPlaceholder={t("adminCalendars.automatic")}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The day-by-day calendar editor, shared by Standard templates (one active
 * per level, topics filtered to that level) and Custom templates (freeform,
 * any topic from any level - see `app.models.calendar_template`). `kind`
 * and, for Standard, `level` are fixed once a template exists (mirrors
 * `Step1Basics`'s `levelLocked` topic-builder pattern) - both only matter at
 * creation, since they decide which topics are even selectable.
 *
 * Scheduling is drag-and-drop: drag a topic out of the pool onto a day, or
 * drag a scheduled chip onto a different day to move it, or onto the pool
 * to unschedule it. A click-to-arm fallback (click a pool card, then click
 * a day) covers keyboard/screen-reader use, since an arbitrary
 * pool-to-many-days drag isn't itself keyboard-operable - both paths call
 * the same `addDayTopic`/`removeDayTopic`, so there's nothing to keep in
 * sync between them. */
export function TemplateBuilder({
  templateId,
  initialKind,
  initialLevel,
  onClose,
  onSaved,
}: {
  templateId: string | null;
  initialKind: TemplateKind;
  initialLevel: Level | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { template } = useCalendarTemplate(templateId);
  const { topics, topicsByLevel, loading: topicsLoading, refetch: refetchTopics } = useTopicsContext();

  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState(30);
  const [restDays, setRestDays] = useState<number[]>([]);
  const [level, setLevel] = useState<Level | null>(initialLevel);
  // One day can hold more than one course - each entry is that day's list of
  // topic ids, in the order they were added.
  const [dayMap, setDayMap] = useState<Record<number, string[]>>({});
  // day -> topic_id -> teacher-set minutes override. A topic missing here
  // (the common case) gets an automatic even split of the daily budget at
  // session-start time - see `ProgressService.get_topic_session_minutes`.
  const [customMinutesMap, setCustomMinutesMap] = useState<Record<number, Record<string, number>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poolQuery, setPoolQuery] = useState("");
  const [selectedPoolTopicId, setSelectedPoolTopicId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [programTopics, setProgramTopics] = useState<{ programId: string; items: ProgramTopicPublic[] } | null>(null);
  const kind = initialKind;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // The topic list is cached for the whole admin section, so a topic deleted (or moved to another level) since it was
  // loaded would still be offered here. Refresh it every time the builder opens.
  useEffect(() => {
    refetchTopics();
  }, [refetchTopics]);

  useEffect(() => {
    if (!template) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(template.name);
    setDurationDays(template.duration_days);
    setRestDays(template.rest_days);
    setLevel(template.level);
    const map: Record<number, string[]> = {};
    const minutesMap: Record<number, Record<string, number>> = {};
    for (const entry of template.days) {
      map[entry.day] = entry.topic_ids;
      if (Object.keys(entry.custom_minutes).length > 0) minutesMap[entry.day] = entry.custom_minutes;
    }
    setDayMap(map);
    setCustomMinutesMap(minutesMap);
  }, [template]);

  useEffect(() => {
    if (!template?.program_id) return;
    let active = true;
    programsApi.listTopics(template.program_id)
      .then(items => { if (active) setProgramTopics({ programId: template.program_id!, items }); })
      .catch(() => { if (active) setProgramTopics({ programId: template.program_id!, items: [] }); });
    return () => { active = false; };
  }, [template?.program_id]);

  const programTopicIds = template?.program_id
    ? new Set((programTopics?.programId === template.program_id ? programTopics.items : []).filter(item => item.status === "published" && (!template.program_level_id || item.program_level_id === template.program_level_id)).map(item => item.topic_id))
    : null;
  const availableTopics = programTopicIds
    ? (topics ?? []).filter(topic => programTopicIds.has(topic.id))
    : kind === "standard" ? (level ? (topicsByLevel[level] ?? []) : []) : (topics ?? []);
  const canSave = name.trim().length > 0 && (kind === "custom" || level !== null) && !topicsLoading;
  // Every topic already scheduled on any day - the calendar is a linear
  // curriculum, so a topic scheduled once shouldn't show up again in the pool.
  const usedTopicIds = new Set(Object.values(dayMap).flat());
  const pickableTopics = availableTopics.filter(topic => !usedTopicIds.has(topic.id));
  const poolTopics = poolQuery.trim()
    ? pickableTopics.filter(topic => topic.title.toLowerCase().includes(poolQuery.trim().toLowerCase()))
    : pickableTopics;
  const topicById = new Map(availableTopics.map(topic => [topic.id, topic]));
  // Only judge scheduled ids against a topic list that has finished refreshing.
  const topicsReady = topics !== null && !topicsLoading;
  const staleIds = topicsReady ? staleTopicIds(dayMap, new Set(topicById.keys())) : [];

  // Topics belong to one level: whatever was scheduled for the previous level must not travel to the new one (those ids
  // would stay in state, invisible because they are not in the new level's list, and still be submitted on save).
  const selectLevel = (next: Level) => {
    if (next === level) return;
    setLevel(next);
    setDayMap({});
    setCustomMinutesMap({});
    setSelectedPoolTopicId(null);
    setPoolQuery("");
    setError(null);
  };

  const addDayTopic = (day: number, topicId: string) => {
    if (!topicId) return;
    setDayMap(prev => {
      const existing = prev[day] ?? [];
      if (existing.includes(topicId)) return prev;
      return { ...prev, [day]: [...existing, topicId] };
    });
  };

  const toggleRestDay = (day: number) => {
    setRestDays(prev => prev.includes(day) ? prev.filter(value => value !== day) : [...prev, day].sort((a, b) => a - b));
    setDayMap(prev => { const next = { ...prev }; delete next[day]; return next; });
    setCustomMinutesMap(prev => { const next = { ...prev }; delete next[day]; return next; });
  };

  const removeDayTopic = (day: number, topicId: string) => {
    setDayMap(prev => {
      const remaining = (prev[day] ?? []).filter(id => id !== topicId);
      const rest = { ...prev };
      if (remaining.length > 0) rest[day] = remaining;
      else delete rest[day];
      return rest;
    });
    setCustomMinutesMap(prev => {
      if (!prev[day]?.[topicId]) return prev;
      const rest = { ...prev[day] };
      delete rest[topicId];
      return { ...prev, [day]: rest };
    });
  };

  const moveDayTopic = (fromDay: number, toDay: number, topicId: string) => {
    if (fromDay === toDay) return;
    const carriedMinutes = customMinutesMap[fromDay]?.[topicId];
    removeDayTopic(fromDay, topicId);
    addDayTopic(toDay, topicId);
    if (carriedMinutes !== undefined) setCustomMinutes(toDay, topicId, carriedMinutes);
  };

  const setCustomMinutes = (day: number, topicId: string, minutes: number | null) => {
    setCustomMinutesMap(prev => {
      const dayMinutes = { ...prev[day] };
      if (minutes === null || minutes <= 0) delete dayMinutes[topicId];
      else dayMinutes[topicId] = minutes;
      return { ...prev, [day]: dayMinutes };
    });
  };

  const handleDragStart = (event: DragStartEvent) => setActiveDragId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const overId = event.over?.id;
    if (!overId) return;
    const activeId = String(event.active.id);

    if (activeId.startsWith("pool:")) {
      const topicId = activeId.slice("pool:".length);
      if (typeof overId === "string" && overId.startsWith("day:")) {
        addDayTopic(Number(overId.slice("day:".length)), topicId);
      }
      return;
    }

    if (activeId.startsWith("chip:")) {
      const [, fromDayStr, topicId] = activeId.split(":");
      const fromDay = Number(fromDayStr);
      if (overId === POOL_DROP_ID) {
        removeDayTopic(fromDay, topicId);
      } else if (typeof overId === "string" && overId.startsWith("day:")) {
        moveDayTopic(fromDay, Number(overId.slice("day:".length)), topicId);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Only topics that exist for this template's level/context are sent; anything stale was announced above the save button.
      const days = daysForSave(dayMap, customMinutesMap, new Set(topicById.keys()));
      if (!templateId) {
        await calendarTemplatesApi.create({ name: name.trim(), kind, level: kind === "standard" ? level : undefined, duration_days: durationDays, rest_days: restDays, days });
      } else {
        await calendarTemplatesApi.update(templateId, { name: name.trim(), duration_days: durationDays, rest_days: restDays, days });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminCalendars.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const draggingChipFromDay = activeDragId?.startsWith("chip:") ? Number(activeDragId.split(":")[1]) : null;
  const activeDragTopic = activeDragId
    ? topicById.get(activeDragId.startsWith("pool:") ? activeDragId.slice("pool:".length) : activeDragId.split(":")[2])
    : undefined;

  return (
    <Dialog
      onClose={onClose}
      ariaLabel={t("adminCalendars.builderAriaLabel")}
      className="max-h-[90vh] w-[min(1040px,96vw)] overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <div className="sticky -top-5 z-10 -mx-5 -mt-5 mb-4 border-b border-line bg-card p-5 pe-16 md:-top-7 md:-mx-7 md:-mt-7 md:p-7 md:pe-16">
        <DialogCloseButton />
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">
          {kind === "standard" ? t("adminCalendars.standardTemplate") : t("adminCalendars.customTemplate")}
        </span>
        <h2 className="mt-1 text-2xl tracking-tight text-ink">{templateId ? t("adminCalendars.editTemplate") : t("adminCalendars.newTemplate")}</h2>
      </div>

      <label className="grid gap-1.5 text-sm font-bold text-ink">
        {t("adminCalendars.templateName")}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t("adminCalendars.templateNamePlaceholder")}
          className="rounded-[10px] border border-line px-3 py-2.5 text-sm text-ink outline-brand-blue"
        />
      </label>

      <div className="mt-4 rounded-xl border border-line bg-bg p-4">
        <label className="grid max-w-xs gap-1.5 text-sm font-bold text-ink">
          Program length (days)
          <input type="number" min={1} max={90} value={durationDays}
            onChange={e => { const next = Math.max(1, Math.min(90, Number(e.target.value) || 1)); setDurationDays(next); setRestDays(days => days.filter(day => day <= next)); }}
            className="min-h-11 rounded-[10px] border border-line bg-card px-3 py-2 text-ink outline-brand-blue" />
        </label>
        <p className="mb-0 mt-2 text-xs text-muted">30 days is only the default. Choose any journey from 1 to 90 days, then mark rest days directly below.</p>
      </div>

      {kind === "standard" && (
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {LEVEL_ORDER.map(l => (
            <button
              key={l}
              type="button"
              disabled={!!templateId}
              onClick={() => selectLevel(l)}
              className={`rounded-xl border p-2.5 text-sm font-bold disabled:opacity-60 ${
                level === l ? "border-2 border-brand-blue bg-brand-primary-pale" : "border-line bg-card"
              }`}
            >
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
      )}

      <p className="mt-5 text-xs font-extrabold tracking-wide text-muted">{t("adminCalendars.dayByDay")}</p>
      <p className="mt-1 text-sm text-muted">{t("adminCalendars.tapToSchedule")}</p>
      {kind === "standard" && !level ? (
        <p className="mt-2 text-sm text-muted">{t("adminCalendars.pickALevelFirst")}</p>
      ) : (
        // `pointerWithin`, not the default `rectIntersection`: a dragged
        // pool card is wider than one day column, so rect-overlap picks
        // whichever cell it happens to cover most - which cell the pointer
        // is actually over is what a user dropping near a border expects,
        // and is what correctly rejects a drop on an end-of-week cell
        // instead of silently landing on its neighbor.
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row">
            <PoolPanel
              poolQuery={poolQuery}
              onPoolQueryChange={setPoolQuery}
              poolTopics={poolTopics}
              showSearch={pickableTopics.length > 3}
              selectedPoolTopicId={selectedPoolTopicId}
              onToggleSelect={topicId => setSelectedPoolTopicId(prev => (prev === topicId ? null : topicId))}
              highlight={draggingChipFromDay !== null}
              kind={kind}
              t={t}
            />

            <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] items-start gap-3">
              {Array.from({ length: durationDays }, (_, i) => i + 1).map(day => {
                const isEndOfWeek = restDays.includes(day);
                const scheduledIds = dayMap[day] ?? [];
                const scheduledTopics = scheduledIds
                  .map(id => topicById.get(id))
                  .filter((topic): topic is NonNullable<typeof topic> => !!topic);
                return (
                  <div key={day} className="grid content-start gap-1">
                    <DayCell
                      day={day}
                      isEndOfWeek={isEndOfWeek}
                      scheduledTopics={scheduledTopics}
                      pickHintActive={selectedPoolTopicId !== null}
                      customMinutesForDay={customMinutesMap[day] ?? {}}
                      kind={kind}
                      removeDayTopic={removeDayTopic}
                      setCustomMinutes={setCustomMinutes}
                      onCellClick={() => {
                        if (!selectedPoolTopicId) return;
                        addDayTopic(day, selectedPoolTopicId);
                        setSelectedPoolTopicId(null);
                      }}
                      t={t}
                    />
                    <button type="button" onClick={() => toggleRestDay(day)} className={`min-h-9 rounded-lg px-2 text-xs font-bold ${isEndOfWeek ? "bg-brand-primary-pale text-brand-blue" : "border border-line text-muted"}`}>
                      {isEndOfWeek ? "Use as lesson day" : "Mark as rest day"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <DragOverlay>
            {activeDragTopic && (
              <div className="rounded-lg border-2 border-brand-blue bg-card px-2 py-1.5 text-[11px] font-bold text-ink shadow-lg">
                {topicLabel(activeDragTopic, kind)}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {staleIds.length > 0 && (
        <p role="status" className="mt-4 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {t("adminCalendars.staleTopicsNotice", { count: staleIds.length })}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {error}
        </p>
      )}

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-5 border-t border-line bg-card p-3 md:-bottom-7 md:-mx-7 md:-mb-7">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
          className="w-full rounded-[10px] bg-brand-blue px-4 py-3 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.22)] disabled:opacity-40"
        >
          {saving ? t("adminCalendars.saving") : t("adminCalendars.saveTemplate")}
        </button>
      </div>
    </Dialog>
  );
}
