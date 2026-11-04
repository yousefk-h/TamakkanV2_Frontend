"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { useI18n, type MessageKey } from "@/lib/i18n/LocaleProvider";
import {
  activeFilterCount,
  DATE_PRESETS,
  REPORT_MODES,
  REPORT_STATUSES,
  hasActiveFilters,
  type ReportFilters,
} from "@/lib/reports/reportFilters";
import type { TopicListItem, UserPublic } from "@/lib/api/types";

const SELECT = "h-11 min-w-0 max-w-full rounded-[10px] border border-line bg-bg px-2.5 text-xs text-ink outline-none focus:border-brand-blue md:h-9";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-muted md:flex md:items-center md:gap-1.5">
      <span>{label}</span>
      {children}
    </label>
  );
}

const STATUS_KEYS: Record<(typeof REPORT_STATUSES)[number], MessageKey> = {
  any: "adminReports.filterAll",
  scored: "adminReports.statusScored",
  not_scored: "adminReports.statusNotScored",
  needs_review: "adminReports.filterNeedsReview",
  reviewed: "adminReports.filterReviewed",
};
const MODE_KEYS: Record<(typeof REPORT_MODES)[number], MessageKey> = {
  topic_discussion: "adminReports.modeAvatar",
  voice_practice: "adminReports.modeVoice",
};
const DATE_KEYS: Record<(typeof DATE_PRESETS)[number], MessageKey> = {
  all: "adminReports.dateAll",
  today: "adminReports.dateToday",
  last7: "adminReports.dateLast7",
  last30: "adminReports.dateLast30",
  custom: "adminReports.dateCustom",
};

/** The five dropdown filters (+ custom date range). Used inline on desktop (changes apply immediately) and inside the
 * mobile sheet (changes apply with the Apply button). */
function FilterFields({
  value,
  onPatch,
  students,
  topics,
}: {
  value: ReportFilters;
  onPatch: (patch: Partial<ReportFilters>) => void;
  students: UserPublic[];
  topics: TopicListItem[];
}) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t("adminReports.studentFilter")}>
        <select value={value.studentId} onChange={e => onPatch({ studentId: e.target.value })} className={SELECT}>
          <option value="">{t("adminReports.allStudents")}</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>
              {s.full_name} ({s.email})
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("adminReports.topicFilter")}>
        <select value={value.topicId} onChange={e => onPatch({ topicId: e.target.value })} className={SELECT}>
          <option value="">{t("adminReports.allTopics")}</option>
          {topics.map(topic => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("adminReports.statusFilter")}>
        <select value={value.status} onChange={e => onPatch({ status: e.target.value as ReportFilters["status"] })} className={SELECT}>
          {REPORT_STATUSES.map(status => (
            <option key={status} value={status}>
              {t(STATUS_KEYS[status])}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("adminReports.modeFilter")}>
        <select value={value.mode} onChange={e => onPatch({ mode: e.target.value as ReportFilters["mode"] })} className={SELECT}>
          <option value="">{t("adminReports.allModes")}</option>
          {REPORT_MODES.map(mode => (
            <option key={mode} value={mode}>
              {t(MODE_KEYS[mode])}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("adminReports.dateFilter")}>
        <select value={value.datePreset} onChange={e => onPatch({ datePreset: e.target.value as ReportFilters["datePreset"], dateFrom: "", dateTo: "" })} className={SELECT}>
          {DATE_PRESETS.map(preset => (
            <option key={preset} value={preset}>
              {t(DATE_KEYS[preset])}
            </option>
          ))}
        </select>
      </Field>
      {value.datePreset === "custom" && (
        <>
          <Field label={t("adminReports.dateFrom")}>
            <input type="date" value={value.dateFrom} max={value.dateTo || undefined} onChange={e => onPatch({ dateFrom: e.target.value })} className={SELECT} />
          </Field>
          <Field label={t("adminReports.dateTo")}>
            <input type="date" value={value.dateTo} min={value.dateFrom || undefined} onChange={e => onPatch({ dateTo: e.target.value })} className={SELECT} />
          </Field>
        </>
      )}
    </>
  );
}

/** Mounted only while open, so its draft starts from the live filters every time and needs no syncing. */
function FilterSheet({
  filters,
  onApply,
  onClear,
  onClose,
  students,
  topics,
}: {
  filters: ReportFilters;
  onApply: (next: ReportFilters) => void;
  onClear: () => void;
  onClose: () => void;
  students: UserPublic[];
  topics: TopicListItem[];
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(filters);
  return (
    <Dialog onClose={onClose} dismissOnBackdropClick ariaLabel={t("adminReports.filtersSheetTitle")} className="sheet-dialog w-full max-w-[520px] rounded-2xl border border-line bg-card p-0 shadow-card">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-4 py-2">
        <b className="text-sm">{t("adminReports.filtersSheetTitle")}</b>
        <DialogCloseButton className="text-muted" />
      </div>
      <div className="grid gap-3 p-4">
        <FilterFields value={draft} onPatch={patch => setDraft(prev => ({ ...prev, ...patch }))} students={students} topics={topics} />
      </div>
      <div className="sticky bottom-0 flex gap-2 border-t border-line bg-card p-3">
        <button type="button" onClick={() => { onClear(); onClose(); }} className="min-h-11 flex-1 rounded-[10px] border border-line px-4 text-sm font-bold text-ink">
          {t("adminReports.clearFilters")}
        </button>
        <button type="button" onClick={() => { onApply(draft); onClose(); }} className="min-h-11 flex-1 rounded-[10px] bg-brand-blue px-4 text-sm font-bold text-white">
          {t("adminReports.apply")}
        </button>
      </div>
    </Dialog>
  );
}

export function ReportFilterBar({
  filters,
  searchText,
  onSearchText,
  onChange,
  onClear,
  students,
  topics,
}: {
  filters: ReportFilters;
  /** What is typed in the box right now (the committed `filters.search` follows it after a short debounce). */
  searchText: string;
  onSearchText: (text: string) => void;
  onChange: (patch: Partial<ReportFilters>) => void;
  onClear: () => void;
  students: UserPublic[];
  topics: TopicListItem[];
}) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = activeFilterCount(filters);
  return (
    <section aria-label={t("adminReports.filterReports")} className="mt-4 rounded-2xl border border-line bg-card p-3 shadow-card">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[10px] border border-line bg-bg px-2.5 text-muted md:max-w-md">
          <Icon name="search" className="size-4 shrink-0" />
          <input
            type="search"
            aria-label={t("adminReports.searchLabel")}
            placeholder={t("adminReports.searchPlaceholder")}
            value={searchText}
            maxLength={100}
            onChange={e => onSearchText(e.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent text-xs text-ink outline-none md:h-9"
          />
        </label>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-card px-3 text-xs font-bold text-brand-blue md:hidden"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {count > 0 ? t("adminReports.filtersWithCount", { count }) : t("adminReports.filters")}
        </button>
      </div>
      <div className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-2 md:flex">
        <FilterFields value={filters} onPatch={onChange} students={students} topics={topics} />
        {hasActiveFilters(filters) && (
          <button type="button" onClick={onClear} className="min-h-9 text-xs font-bold text-brand-blue">
            {t("adminReports.clearFilters")}
          </button>
        )}
      </div>
      {sheetOpen && <FilterSheet filters={filters} onApply={next => onChange(next)} onClear={onClear} onClose={() => setSheetOpen(false)} students={students} topics={topics} />}
    </section>
  );
}

export interface FilterChip {
  key: string;
  label: string;
  /** What removing this chip resets. */
  clear: Partial<ReportFilters>;
}

/** The removable "what is filtered" chips, with Clear all. Shows nothing while no filter is active. */
export function ActiveFilterChips({ chips, onRemove, onClearAll }: { chips: FilterChip[]; onRemove: (clear: Partial<ReportFilters>) => void; onClearAll: () => void }) {
  const { t } = useI18n();
  if (chips.length === 0) return null;
  return (
    <ul aria-label={t("adminReports.activeFilters")} className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
      {chips.map(chip => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onRemove(chip.clear)}
            aria-label={t("adminReports.removeFilter", { label: chip.label })}
            className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-brand-primary-pale px-3 text-xs font-bold text-ink"
          >
            <span className="min-w-0 truncate">{chip.label}</span>
            <X className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={onClearAll} className="min-h-9 text-xs font-bold text-brand-blue">
          {t("adminReports.clearAll")}
        </button>
      </li>
    </ul>
  );
}
