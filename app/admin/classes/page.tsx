"use client";

import { useMemo, useState } from "react";
import { PageHead } from "@/components/layout/PageHead";
import { FilterChips } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { Pagination } from "@/components/ui/Pagination";
import { ClassModal } from "@/components/admin/ClassModal";
import { ApiError, classesApi } from "@/lib/api/client";
import { useClassesForAdmin } from "@/lib/hooks/useClasses";
import { usePagination } from "@/lib/hooks/usePagination";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { asUtcIso, formatDateTime } from "@/lib/format";
import type { LiveClassPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const VIEWS = ["Upcoming", "Past"] as const;
type View = (typeof VIEWS)[number];

/** Phase 3: Group classes & 1:1 coaching, real end to end - an
 * Administrator-scheduled slot with a pasted Google Meet link, not an
 * in-app video call. Replaces the old fully-mock page (see
 * DESIGN_SNAPSHOT.md) - the "instructor roster" concept is gone entirely,
 * since a class's host is just the Administrator account itself (Instructor
 * *is* the Administrator platform-wide), not a separate entity. */
export default function AdminClassesPage() {
  const { t } = useI18n();
  const VIEW_LABELS: Record<View, string> = { Upcoming: t("adminClasses.viewUpcoming"), Past: t("adminClasses.viewPast") };
  const [view, setView] = useState<View>("Upcoming");
  const [modalTarget, setModalTarget] = useState<LiveClassPublic | "new" | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { classes, loading, refetch } = useClassesForAdmin();
  const { students } = useStudentsContext();

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    (students ?? []).forEach(s => map.set(s.id, s.full_name));
    return map;
  }, [students]);

  const [now] = useState(() => Date.now());
  const allClasses = classes ?? [];
  const upcoming = allClasses.filter(c => new Date(asUtcIso(c.scheduled_at)).getTime() >= now);
  const past = allClasses.filter(c => new Date(asUtcIso(c.scheduled_at)).getTime() < now);
  const visible = (view === "Upcoming" ? upcoming : past).slice().sort((a, b) => {
    const diff = new Date(asUtcIso(a.scheduled_at)).getTime() - new Date(asUtcIso(b.scheduled_at)).getTime();
    return view === "Upcoming" ? diff : -diff;
  });
  const [classPage, classAnchor] = usePagination(visible, { resetKey: view });

  const handleCancel = async (c: LiveClassPublic) => {
    if (!confirm(t("adminClasses.cancelConfirm", { title: c.title }))) return;
    setCancellingId(c.id);
    setActionError(null);
    try {
      await classesApi.cancel(c.id);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("adminClasses.cancelFailed"));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead
        eyebrow={t("adminClasses.eyebrow")}
        title={t("adminClasses.title")}
        desc={t("adminClasses.desc")}
        action={
          <button
            type="button"
            onClick={() => setModalTarget("new")}
            className="rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
          >
            {t("adminClasses.scheduleClass")}
          </button>
        }
      />

      <section className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            [t("adminClasses.upcomingClasses"), String(upcoming.length), t("adminClasses.onYourSchedule")],
            [t("adminClasses.groupClasses"), String(upcoming.filter(c => c.kind === "group").length), t("adminClasses.upcomingLabel")],
            [t("adminClasses.oneToOneSessions"), String(upcoming.filter(c => c.kind === "one_to_one").length), t("adminClasses.upcomingLabel")],
            [t("adminClasses.pastClasses"), String(past.length), t("adminClasses.heldSoFar")],
          ] as const
        ).map(([label, value, note]) => (
          <article key={label} className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 shadow-card">
            <div className="grid size-11 flex-none place-items-center rounded-xl bg-brand-primary-pale text-brand-blue">
              <Icon name="classes" />
            </div>
            <div>
              <span className="block text-[13px] text-muted">{label}</span>
              <b className="text-xl">{value}</b>
              <small className="block text-xs text-muted">{note}</small>
            </div>
          </article>
        ))}
      </section>

      <section ref={classAnchor} className="mt-4 scroll-mt-24 rounded-2xl border border-line bg-card p-4.5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[15px]">{view === "Upcoming" ? t("adminClasses.viewUpcoming") : t("adminClasses.viewPast")}</h3>
          <FilterChips options={[...VIEWS]} value={view} onChange={setView} labels={VIEW_LABELS} aria-label={t("adminClasses.scheduleViewLabel")} />
        </div>

        {actionError && (
          <p role="alert" className="mt-2 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
            {actionError}
          </p>
        )}
        {loading && <p className="mt-2 text-sm text-muted">{t("adminClasses.loading")}</p>}
        {!loading && visible.length === 0 && (
          <p className="mt-2 text-sm text-muted">
            {view === "Upcoming" ? t("adminClasses.noneUpcoming") : t("adminClasses.nonePast")}
          </p>
        )}

        <div className="mt-1 grid gap-1">
          {classPage.items.map(c => {
            const date = new Date(asUtcIso(c.scheduled_at));
            const participantNames = c.participant_ids.map(id => studentNameById.get(id) ?? t("adminClasses.unknownStudent"));
            return (
              <div key={c.id} className="grid grid-cols-[44px_1fr] items-center gap-3 border-t border-line py-3.5 sm:grid-cols-[44px_1fr_auto]">
                <div className={`grid h-11 w-[42px] place-items-center rounded-[9px] ${c.kind === "one_to_one" ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-primary-pale text-brand-blue"}`}>
                  <b className="text-base leading-none">{date.getUTCDate()}</b>
                  <span className="text-[11px]">{date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <span className={`block text-[11px] font-extrabold ${c.kind === "one_to_one" ? "text-brand-cyan" : "text-brand-blue"}`}>
                    {c.kind === "one_to_one" ? t("adminClasses.oneToOneCoaching") : t("adminClasses.groupClass")}
                  </span>
                  <b className="mt-0.5 block text-sm">{c.title}</b>
                  <p className="m-0 mt-0.5 truncate text-xs text-muted">
                    {formatDateTime(c.scheduled_at)} · {t("adminClasses.minutesAbbrev", { count: c.duration_minutes })} · {participantNames.join(", ") || t("adminClasses.noStudents")}
                  </p>
                </div>
                {view === "Upcoming" ? (
                  <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
                    <a
                      href={c.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-bold text-brand-blue"
                    >
                      {t("adminClasses.openMeet")}
                    </a>
                    <button
                      type="button"
                      onClick={() => setModalTarget(c)}
                      className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-bold text-brand-blue"
                    >
                      {t("adminClasses.edit")}
                    </button>
                    <button
                      type="button"
                      disabled={cancellingId === c.id}
                      onClick={() => handleCancel(c)}
                      className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-bold text-brand-coral disabled:opacity-40"
                    >
                      {t("adminClasses.cancel")}
                    </button>
                  </div>
                ) : (
                  <span className="col-span-2 justify-self-start text-xs font-bold text-muted sm:col-span-1 sm:justify-self-auto">{t("adminClasses.held")}</span>
                )}
              </div>
            );
          })}
        </div>
        <Pagination
          pagination={classPage}
          label={view === "Upcoming" ? t("adminClasses.viewUpcoming") : t("adminClasses.viewPast")}
          className="border-t border-line pt-3.5"
        />
      </section>

      {modalTarget && (
        <ClassModal
          liveClass={modalTarget === "new" ? null : modalTarget}
          onClose={() => setModalTarget(null)}
          onSaved={refetch}
        />
      )}
    </main>
  );
}
