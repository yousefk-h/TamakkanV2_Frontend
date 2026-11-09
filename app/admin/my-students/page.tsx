"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHead } from "@/components/layout/PageHead";
import { cohortsApi, programsApi, usersApi } from "@/lib/api/client";
import type { CohortPublic, ProgramPublic, TaughtStudent } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const PAGE_SIZE = 20;

export default function MyStudentsPage() {
  const { state } = useAuth();
  const { t } = useI18n();

  const [programs, setPrograms] = useState<ProgramPublic[]>([]);
  const [cohorts, setCohorts] = useState<CohortPublic[]>([]);
  const [search, setSearch] = useState("");
  const [programId, setProgramId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TaughtStudent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [lastFilterKey, setLastFilterKey] = useState("");

  // The Program/Cohort filter options are just this caller's own teaching
  // reach (same `cohortsApi.list()` the grouped workspace above uses) -
  // never a separate "every Program in the center" fetch for a Teacher.
  useEffect(() => {
    if (state.status !== "authenticated") return;
    void (async () => {
      const [cohortItems, programItems] = await Promise.all([cohortsApi.list(), programsApi.list()]);
      setCohorts(cohortItems);
      const myProgramIds = new Set(cohortItems.map(c => c.program_id));
      setPrograms(programItems.filter(p => myProgramIds.has(p.id)));
    })();
  }, [state.status]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const result = await usersApi.myStudents({
        search: search.trim() || undefined,
        program_id: programId || undefined,
        cohort_id: cohortId || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setLoadError(t("myStudents.loadError"));
    }
  }, [search, programId, cohortId, page, t]);

  // Initial/filter-driven API synchronization; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (state.status === "authenticated") void load(); }, [state.status, load]);

  if (state.status !== "authenticated") return null;

  // Any filter change goes back to page 1 - otherwise a narrower result set
  // could leave the view on a now-empty later page. Adjusted during render
  // (not a second effect) - the same "reset on changed input" pattern
  // `usePagination` already uses elsewhere in this codebase.
  const filterKey = `${search}|${programId}|${cohortId}`;
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cohortsForProgram = programId ? cohorts.filter(c => c.program_id === programId) : cohorts;

  return <main className="mx-auto max-w-5xl p-4 pb-28 md:p-8 lg:pb-8">
    <PageHead eyebrow={t("myStudents.eyebrow")} title={t("myStudents.title")} desc={t("myStudents.description")} />

    <div className="flex flex-wrap gap-2">
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("common.searchPlaceholder")}
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-sm" />
      <select value={programId} onChange={event => { setProgramId(event.target.value); setCohortId(""); }}
        className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm">
        <option value="">{t("myStudents.allPrograms")}</option>
        {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
      </select>
      <select value={cohortId} onChange={event => setCohortId(event.target.value)}
        className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm">
        <option value="">{t("myStudents.allCohorts")}</option>
        {cohortsForProgram.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
      </select>
    </div>

    {loadError && <p role="alert" className="mt-4 rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{loadError}</p>}

    <div className="mt-4 grid gap-3">
      {items === null && <p className="text-sm text-muted">{t("common.loading")}</p>}
      {items !== null && items.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("myStudents.empty")}</p>}
      {items?.map(student => <article key={student.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{student.full_name}</h2>
            <p className="text-xs text-muted">{student.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/students/${student.id}`} className="min-h-10 rounded-lg border border-line px-3 text-sm font-bold text-brand-blue">
              {t("myStudents.viewProfile")}
            </Link>
            <Link href={`/admin/messages?student_id=${student.id}`} className="min-h-10 rounded-lg bg-brand-blue px-3 text-sm font-bold text-white">
              {t("myStudents.sendMessage")}
            </Link>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {student.enrollments.map(enrollment => <span key={enrollment.id} className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-bold text-brand-blue">
            {enrollment.program_name ?? enrollment.program_id} · {enrollment.cohort_name ?? t("myStudents.noCohort")}{enrollment.program_level_name ? ` · ${enrollment.program_level_name}` : ""}
          </span>)}
        </div>
      </article>)}
    </div>

    {total > PAGE_SIZE && <div className="mt-6 flex items-center justify-between gap-3">
      <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue disabled:opacity-40">{t("pagination.previous")}</button>
      <span className="text-sm text-muted">{t("pagination.pageOf", { page, count: pageCount })}</span>
      <button type="button" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold text-brand-blue disabled:opacity-40">{t("pagination.next")}</button>
    </div>}
  </main>;
}
