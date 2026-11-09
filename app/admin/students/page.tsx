"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead } from "@/components/layout/PageHead";
import { Icon } from "@/components/ui/Icon";
import { FilterChips } from "@/components/ui/FilterChips";
import { Pagination } from "@/components/ui/Pagination";
import { Avatar, PlanBadge } from "@/components/admin/shared";
import { AssignPlanModal } from "@/components/admin/AssignPlanModal";
import { EmailVerificationStatus } from "@/components/admin/EmailVerificationStatus";
import { useAuth } from "@/lib/auth/AuthContext";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { DEFAULT_ROSTER_FILTERS, filterRoster, hasActiveFilters, rosterFiltersKey, type RosterFilters } from "@/lib/students/rosterFilters";
import { useStudentAlerts } from "@/lib/hooks/useStudentAlerts";
import { usePagination } from "@/lib/hooks/usePagination";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { formatDate } from "@/lib/format";
import type { UserPublic } from "@/lib/api/types";
import { type MessageKey, useI18n } from "@/lib/i18n/LocaleProvider";

const LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;

function classLabel(student: UserPublic, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  if (student.plan === "standard" && student.assigned_level) return LEVEL_LABEL[student.assigned_level];
  if (student.plan === "pro") return t("adminStudents.customPlan", { count: student.assigned_topic_ids.length });
  return t("adminStudents.unassigned");
}

function sessionLimitLabel(student: UserPublic, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  const effective = student.duration_override_minutes ?? student.max_session_duration_minutes;
  return student.duration_override_minutes != null
    ? t("adminStudents.sessionLimitRaised", { minutes: effective })
    : t("adminStudents.sessionLimitMinutes", { minutes: effective });
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value as T)}
        className="h-11 rounded-[10px] border border-line bg-bg px-2.5 text-xs text-ink outline-none focus:border-brand-blue disabled:opacity-40 sm:h-9"
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Real `usersApi`-backed roster (Task #45/Phase 1) - a pending-assignment
 * queue for students with `plan: null`, and a filterable, paged table whose
 * rows navigate to `/admin/students/[id]`. Filters (name/email search, level,
 * plan, email verification, alerts) live in `lib/students/rosterFilters.ts`.
 * Speaking score/challenge/status columns are gone - there's no backend for
 * any of that yet (no AI scoring or challenge system exists), so this shows
 * only what's real. */
export default function AdminStudentsPage() {
  const { t } = useI18n();
  const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
    all: t("adminStudents.allStudents"),
    beginner: LEVEL_LABEL.beginner,
    intermediate: LEVEL_LABEL.intermediate,
    advanced: LEVEL_LABEL.advanced,
  };
  const { students, loading, error, refetch } = useStudentsContext();
  const { state: authState } = useAuth();
  const isTeacher = authState.status === "authenticated" && authState.user.role === "teacher";
  const { alerts } = useStudentAlerts();
  const router = useRouter();
  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_ROSTER_FILTERS);
  const [assigning, setAssigning] = useState<UserPublic | "new" | null>(null);
  const setFilter = <K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) => setFilters(prev => ({ ...prev, [key]: value }));

  const roster = students ?? [];
  const assigned = roster.filter(s => s.plan !== null);
  const pending = roster.filter(s => s.plan === null);
  const proCount = roster.filter(s => s.plan === "pro").length;
  const standardCount = roster.filter(s => s.plan === "standard").length;
  const visible = filterRoster(assigned, filters, alerts);
  const filtersActive = hasActiveFilters(filters);
  const [pendingPage, pendingAnchor] = usePagination(pending);
  const [rosterPage, rosterAnchor] = usePagination(visible, { resetKey: rosterFiltersKey(filters) });

  const query = filters.query.trim();
  const emptyMessage =
    assigned.length === 0
      ? t("adminStudents.noAssignedYet")
      : query
        ? t("adminStudents.noMatches", { query })
        : t("adminStudents.noMatchesFilters");

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead
        eyebrow={t("adminStudents.eyebrow")}
        title={t("adminStudents.titleN", { count: roster.length })}
        desc={t("adminStudents.desc")}
        action={
          <button
            type="button"
            onClick={() => setAssigning("new")}
            className="rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)]"
          >
            {t("adminStudents.inviteStudent")}
          </button>
        }
      />

      {isTeacher && !loading && roster.length === 0 && (
        <section className="mt-4 rounded-2xl border border-brand-blue/30 bg-brand-primary-pale/30 p-4 text-sm">
          <p className="m-0">{t("adminStudents.teacherRosterIsCreatedOnly")}</p>
          <Link href="/admin/my-students" className="mt-2 inline-block font-bold text-brand-blue">{t("adminStudents.goToMyStudents")} →</Link>
        </section>
      )}

      {loading && <p className="mt-4 text-sm text-muted">{t("adminStudents.loading")}</p>}
      {error && !loading && (
        <section role="alert" className="mt-4 rounded-2xl border border-line bg-card p-4 text-sm">
          <p>{t("mobile.error")}</p>
          <button type="button" onClick={refetch} className="mt-2 min-h-11 font-bold text-brand-blue">
            {t("mobile.retry")}
          </button>
        </section>
      )}

      {pending.length > 0 && (
        <section ref={pendingAnchor} className="mt-4 scroll-mt-24 rounded-2xl border border-line bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">🆕</span>
              <h3 className="m-0 text-[15px]">{t("adminStudents.awaitingAssignment")}</h3>
            </div>
            <span className="whitespace-nowrap text-sm text-muted">
              {t(pending.length > 1 ? "adminStudents.newStudents" : "adminStudents.newStudent", { count: pending.length })}
            </span>
          </div>
          <div className="mt-1 grid gap-1">
            {pendingPage.items.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3.5">
                <Avatar name={s.full_name} />
                <div className="flex-1">
                  <b className="block text-sm">{s.full_name}</b>
                  <EmailVerificationStatus user={s} />
                  <small className="text-xs text-muted">{t("adminStudents.signedUpNoClass")}</small>
                </div>
                <button type="button" onClick={() => setAssigning(s)} className="rounded-[10px] bg-brand-blue px-3.5 py-2 text-xs font-bold text-white">
                  {t("adminStudents.assignClass")}
                </button>
              </div>
            ))}
          </div>
          <Pagination pagination={pendingPage} label={t("adminStudents.awaitingAssignment")} className="border-t border-line pt-3" />
        </section>
      )}

      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(
          [
            [t("adminStudents.totalStudents"), String(roster.length), t("adminStudents.allLevels")],
            [t("adminStudents.standardPlans"), String(standardCount), t("adminStudents.wholeLevelCurriculum")],
            [t("adminStudents.proPlans"), String(proCount), t("adminStudents.customBuilt")],
          ] as const
        ).map(([label, value, note]) => (
          <article key={label} className="flex min-w-0 flex-col items-start gap-3.5 rounded-2xl border border-line bg-card p-4 shadow-card">
            <div className="grid size-11 flex-none place-items-center rounded-xl bg-brand-primary-pale text-brand-blue">
              <Icon name="people" />
            </div>
            <div>
              <span className="block text-[13px] text-muted">{label}</span>
              <b className="text-xl">{value}</b>
              <small className="block text-xs text-muted">{note}</small>
            </div>
          </article>
        ))}
      </section>

      <section ref={rosterAnchor} className="mt-4 scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <span className="text-[13px] font-extrabold tracking-wide text-muted">{t("adminStudents.assignedStudents")}</span>
            <h3 className="mt-0.5 text-[15px]">{t("adminStudents.yourRoster")}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 rounded-[10px] border border-line bg-bg px-2.5 text-muted">
              <Icon name="search" className="size-4" />
              <input
                type="search"
                aria-label={t("adminStudents.searchStudents")}
                placeholder={t("adminStudents.searchStudents")}
                value={filters.query}
                onChange={e => setFilter("query", e.target.value)}
                className="h-9 w-40 bg-transparent text-xs outline-none sm:w-48"
              />
            </label>
            <FilterChips
              options={[...LEVELS]}
              value={filters.level}
              onChange={v => setFilter("level", v)}
              labels={LEVEL_LABELS}
              aria-label={t("adminStudents.filterStudents")}
            />
          </div>
        </div>
        <div role="group" aria-label={t("adminStudents.filterStudents")} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
          <FilterSelect
            label={t("adminStudents.planFilter")}
            value={filters.plan}
            onChange={v => setFilter("plan", v)}
            options={[
              ["all", t("adminStudents.allPlans")],
              ["standard", t("shared.planStandard")],
              ["pro", t("shared.planPro")],
            ]}
          />
          <FilterSelect
            label={t("adminStudents.verificationFilter")}
            value={filters.verification}
            onChange={v => setFilter("verification", v)}
            options={[
              ["all", t("adminStudents.anyVerification")],
              ["verified", t("adminStudents.verifiedOnly")],
              ["pending", t("adminStudents.pendingOnly")],
            ]}
          />
          <FilterSelect
            label={t("adminStudents.alertsFilter")}
            value={filters.alerts}
            onChange={v => setFilter("alerts", v)}
            disabled={alerts === null}
            options={[
              ["all", t("adminStudents.anyAlerts")],
              ["with", t("adminStudents.withAlerts")],
              ["without", t("adminStudents.withoutAlerts")],
            ]}
          />
          {filtersActive && (
            <div className="flex items-center gap-3 sm:ms-auto">
              <span aria-live="polite" className="text-xs text-muted">
                {t("adminStudents.filteredCount", { count: visible.length, total: assigned.length })}
              </span>
              <button type="button" onClick={() => setFilters(DEFAULT_ROSTER_FILTERS)} className="min-h-11 text-xs font-bold text-brand-blue sm:min-h-9">
                {t("adminStudents.clearFilters")}
              </button>
            </div>
          )}
        </div>
        <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2 lg:hidden">
          {rosterPage.items.map(s => <article key={s.id} className="min-w-0 rounded-xl border border-line p-4">
            <EmailVerificationStatus user={s} />
            <div className="flex items-start gap-3"><Avatar name={s.full_name} /><div className="min-w-0 flex-1"><Link href={`/admin/students/${s.id}`} className="break-words font-bold text-ink">{s.full_name}</Link><p className="mt-1 break-all text-sm text-muted">{s.email}</p></div></div>
            {alerts?.[s.id]?.has_alerts && <p className="mt-2 text-sm text-brand-coral">{t("adminStudents.hasAlerts")}</p>}
            <dl className="mt-4 grid gap-2 text-sm"><div><dt className="text-muted">{t("adminStudents.colClass")}</dt><dd className="break-words">{classLabel(s,t)}</dd></div><div><dt className="text-muted">{t("adminStudents.colSessionLimit")}</dt><dd>{sessionLimitLabel(s,t)}</dd></div><div><dt className="text-muted">{t("adminStudents.colJoined")}</dt><dd>{formatDate(s.created_at)}</dd></div></dl>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><PlanBadge plan={s.plan === "pro" ? "pro" : "standard"} /><button type="button" onClick={() => setAssigning(s)} className="min-h-11 rounded-xl border border-line px-3 text-sm font-bold text-brand-blue">{t("adminStudents.editPlan")}</button></div>
          </article>)}
          {!loading && visible.length === 0 && <p className="p-2 text-sm text-muted">{emptyMessage}</p>}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                {[t("adminStudents.colStudent"), t("adminStudents.colClass"), t("adminStudents.colPlan"), t("adminStudents.colSessionLimit"), t("adminStudents.colJoined"), ""].map(h => (
                  <th key={h} className="bg-bg px-4 py-2.5 text-left text-[11px] font-normal uppercase tracking-wide text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rosterPage.items.map(s => (
                <tr key={s.id} onClick={() => router.push(`/admin/students/${s.id}`)} className="cursor-pointer hover:bg-bg">
                  <td className="border-t border-line px-4 py-3 text-sm">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={s.full_name} />
                      <Link href={`/admin/students/${s.id}`} className="font-bold text-ink hover:underline" onClick={e => e.stopPropagation()}>
                        {s.full_name}
                      </Link>
                      {alerts?.[s.id]?.has_alerts && (
                        <span title={t("adminStudents.hasAlerts")} aria-label={t("adminStudents.hasAlerts")} className="text-sm">
                          ⚠️
                        </span>
                      )}
                    </span>
                    <EmailVerificationStatus user={s} />
                  </td>
                  <td className="border-t border-line px-4 py-3 text-sm text-muted">{classLabel(s, t)}</td>
                  <td className="border-t border-line px-4 py-3 text-sm">
                    <PlanBadge plan={s.plan === "pro" ? "pro" : "standard"} />
                  </td>
                  <td className="border-t border-line px-4 py-3 text-sm text-muted">{sessionLimitLabel(s, t)}</td>
                  <td className="border-t border-line px-4 py-3 text-sm text-muted">{formatDate(s.created_at)}</td>
                  <td className="border-t border-line px-4 py-3 text-sm">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setAssigning(s);
                      }}
                      className="text-xs font-bold text-muted hover:text-brand-blue"
                    >
                      {t("adminStudents.editPlan")}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-5 text-sm text-muted">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={rosterPage} label={t("adminStudents.yourRoster")} className="border-t border-line px-4 py-3" />
      </section>

      {assigning !== null && (
        <AssignPlanModal
          student={assigning === "new" ? null : assigning}
          onClose={() => setAssigning(null)}
          onSaved={refetch}
        />
      )}
    </main>
  );
}
