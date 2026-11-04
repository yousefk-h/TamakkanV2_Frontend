import type { CalendarDayEntry } from "../api/types";

export type DayMap = Record<number, string[]>;
export type MinutesMap = Record<number, Record<string, number>>;

/** Scheduled topic ids that are NOT in `validIds` (the topics available for this calendar's level/context). Such ids are
 * invisible in the editor - it only renders topics it can find - yet they used to be submitted on save, and the backend
 * rejects them ("Unknown topic id(s)" for a topic that no longer exists, "aren't in the X level" for another level's). */
export function staleTopicIds(dayMap: DayMap, validIds: ReadonlySet<string>): string[] {
  return Object.values(dayMap).flat().filter(id => !validIds.has(id));
}

/** The `days` payload for create/update: only ids in `validIds`, no empty days, and teacher-set minutes only for ids that
 * are still scheduled. Backend validation is unchanged - this just stops stale ids from being sent in the first place. */
export function daysForSave(dayMap: DayMap, minutesMap: MinutesMap, validIds: ReadonlySet<string>): CalendarDayEntry[] {
  return Object.entries(dayMap)
    .map(([day, topicIds]) => ({ day: Number(day), topicIds: topicIds.filter(id => validIds.has(id)) }))
    .filter(({ topicIds }) => topicIds.length > 0)
    .map(({ day, topicIds }) => ({
      day,
      topic_ids: topicIds,
      custom_minutes: Object.fromEntries(Object.entries(minutesMap[day] ?? {}).filter(([id]) => topicIds.includes(id))),
    }));
}
