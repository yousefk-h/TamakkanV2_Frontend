"use client";

import { useState } from "react";
import { PageHead } from "@/components/layout/PageHead";
import { Pagination } from "@/components/ui/Pagination";
import { TemplateBuilder } from "@/components/admin/calendars/TemplateBuilder";
import { ApiError, calendarTemplatesApi } from "@/lib/api/client";
import { useCalendarTemplatesContext } from "@/lib/calendarTemplates/CalendarTemplatesContext";
import { usePagination } from "@/lib/hooks/usePagination";
import { GRID_PAGE_SIZES } from "@/lib/pagination";
import { LEVEL_LABEL, LEVEL_ORDER } from "@/lib/topics/helpers";
import type { CalendarTemplate, Level, TemplateKind } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type BuilderTarget = { kind: TemplateKind; level: Level | null; templateId: string | null };

/** One level's Standard templates - its own component so each level pages
 * independently (a hook per level can't live inside the `LEVEL_ORDER.map`). */
function LevelTemplates({
  level,
  templates,
  busyId,
  onCreate,
  onEdit,
  onActivate,
  onDelete,
}: {
  level: Level;
  templates: CalendarTemplate[];
  busyId: string | null;
  onCreate: () => void;
  onEdit: (template: CalendarTemplate) => void;
  onActivate: (template: CalendarTemplate) => void;
  onDelete: (template: CalendarTemplate) => void;
}) {
  const { t } = useI18n();
  const [templatePage, templateAnchor] = usePagination(templates);
  const active = templates.find(template => template.is_active);
  return (
    <section ref={templateAnchor} className="min-w-0 scroll-mt-24 rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm">{LEVEL_LABEL[level]}</b>
        <button type="button" onClick={onCreate} className="text-xs font-bold text-brand-blue">
          {t("adminCalendars.newTemplate")}
        </button>
      </div>
      {active ? (
        <p className="m-0 mt-1 text-xs text-muted">{t("adminCalendars.activeTemplate", { name: active.name })}</p>
      ) : (
        <p className="m-0 mt-1 text-xs text-brand-coral">{t("adminCalendars.noActiveTemplate")}</p>
      )}
      <div className="mt-3 grid min-w-0 gap-2">
        {templates.length === 0 && <p className="m-0 text-xs text-muted">{t("adminCalendars.noTemplatesYet")}</p>}
        {templatePage.items.map(template => (
          <div key={template.id} className="min-w-0 rounded-xl border border-line p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]" title={template.name}>
                {template.name}
              </span>
              {template.is_active && (
                <span className="flex-none rounded-full bg-brand-primary-pale px-2 py-0.5 text-[10px] font-bold text-brand-blue">
                  {t("adminCalendars.active")}
                </span>
              )}
            </div>
            <p className="m-0 mt-0.5 text-[11px] text-muted">{t("adminCalendars.daysScheduled", { count: template.days.length })}</p>
            <div className="mt-1.5 flex flex-wrap gap-3">
              <button type="button" onClick={() => onEdit(template)} className="text-xs font-bold text-brand-blue">
                {t("adminCalendars.edit")}
              </button>
              {!template.is_active && (
                <button
                  type="button"
                  disabled={busyId === template.id}
                  onClick={() => onActivate(template)}
                  className="text-xs font-bold text-brand-blue disabled:opacity-40"
                >
                  {t("adminCalendars.activate")}
                </button>
              )}
              {!template.is_active && (
                <button
                  type="button"
                  disabled={busyId === template.id}
                  onClick={() => onDelete(template)}
                  className="text-xs font-bold text-brand-coral disabled:opacity-40"
                >
                  {t("adminCalendars.delete")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Pagination pagination={templatePage} label={LEVEL_LABEL[level]} variant="compact" className="mt-3 border-t border-line pt-2" />
    </section>
  );
}

/** The teacher-authored calendar library: one active Standard template per
 * level (every Standard student at that level follows it), and a reusable
 * Custom-template library for Pro students (assigned by id from
 * `AssignPlanModal`, not managed here). See `app.models.calendar_template`. */
export default function AdminCalendarsPage() {
  const { t } = useI18n();
  const { standardTemplates, customTemplates, loading, refetch } = useCalendarTemplatesContext();
  const [builderTarget, setBuilderTarget] = useState<BuilderTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [customPage, customAnchor] = usePagination(customTemplates, { pageSizes: GRID_PAGE_SIZES });

  const handleActivate = async (template: CalendarTemplate) => {
    setBusyId(template.id);
    setActionError(null);
    try {
      await calendarTemplatesApi.activate(template.id);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("adminCalendars.actionFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (template: CalendarTemplate) => {
    if (!window.confirm(t("adminCalendars.deleteConfirm"))) return;
    setBusyId(template.id);
    setActionError(null);
    try {
      await calendarTemplatesApi.delete(template.id);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("adminCalendars.actionFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead eyebrow={t("adminCalendars.eyebrow")} title={t("adminCalendars.title")} desc={t("adminCalendars.desc")} />
      {loading && <p className="mt-4 text-muted">{t("adminCalendars.loading")}</p>}

      {actionError && (
        <p role="alert" className="mt-4 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {actionError}
        </p>
      )}

      <section className="mt-6">
        <h2 className="m-0 text-lg tracking-tight">{t("adminCalendars.standardSection")}</h2>
        <p className="m-0 mt-1 text-sm text-muted">{t("adminCalendars.standardSectionDesc")}</p>
      </section>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {LEVEL_ORDER.map(level => (
          <LevelTemplates
            key={level}
            level={level}
            templates={standardTemplates.filter(template => template.level === level)}
            busyId={busyId}
            onCreate={() => setBuilderTarget({ kind: "standard", level, templateId: null })}
            onEdit={template => setBuilderTarget({ kind: "standard", level, templateId: template.id })}
            onActivate={handleActivate}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <section className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-lg tracking-tight">{t("adminCalendars.customSection")}</h2>
          <p className="m-0 mt-1 text-sm text-muted">{t("adminCalendars.customSectionDesc")}</p>
        </div>
        <button
          type="button"
          onClick={() => setBuilderTarget({ kind: "custom", level: null, templateId: null })}
          className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.22)]"
        >
          {t("adminCalendars.newTemplate")}
        </button>
      </section>
      <div ref={customAnchor} className="mt-4 grid scroll-mt-24 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {customTemplates.length === 0 && <p className="text-sm text-muted">{t("adminCalendars.noCustomTemplatesYet")}</p>}
        {customPage.items.map(template => (
          <article key={template.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
            <b className="block truncate text-sm" title={template.name}>
              {template.name}
            </b>
            <p className="m-0 mt-1 text-xs text-muted">{t("adminCalendars.daysScheduled", { count: template.days.length })}</p>
            <div className="mt-2.5 flex gap-3">
              <button
                type="button"
                onClick={() => setBuilderTarget({ kind: "custom", level: null, templateId: template.id })}
                className="text-xs font-bold text-brand-blue"
              >
                {t("adminCalendars.edit")}
              </button>
              <button
                type="button"
                disabled={busyId === template.id}
                onClick={() => handleDelete(template)}
                className="text-xs font-bold text-brand-coral disabled:opacity-40"
              >
                {t("adminCalendars.delete")}
              </button>
            </div>
          </article>
        ))}
      </div>
      <Pagination pagination={customPage} label={t("adminCalendars.customSection")} className="mt-4" />

      {builderTarget && (
        <TemplateBuilder
          templateId={builderTarget.templateId}
          initialKind={builderTarget.kind}
          initialLevel={builderTarget.level}
          onClose={() => setBuilderTarget(null)}
          onSaved={refetch}
        />
      )}
    </main>
  );
}
