"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHead } from "@/components/layout/PageHead";
import { Icon } from "@/components/ui/Icon";
import { Pagination } from "@/components/ui/Pagination";
import { Avatar, StatusPill } from "@/components/admin/shared";
import { ManageStudentModal } from "@/components/admin/ManageStudentModal";
import { UserDetailsDrawer } from "@/components/admin/UserDetailsDrawer";
import { AddTeacherModal } from "@/components/admin/AddTeacherModal";
import { ManageTeacherModal } from "@/components/admin/ManageTeacherModal";
import { TeacherDetailsDrawer } from "@/components/admin/TeacherDetailsDrawer";
import { useStudentsPage } from "@/lib/hooks/useStudentsPage";
import { useStudentCounts } from "@/lib/hooks/useStudentCounts";
import { useTeachersPage } from "@/lib/hooks/useTeachersPage";
import { useTeacherCounts } from "@/lib/hooks/useTeacherCounts";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError, teachersApi } from "@/lib/api/client";
import {
  DEFAULT_USERS_FILTERS,
  USERS_PAGE_SIZE,
  USERS_SEARCH_DEBOUNCE_MS,
  hasActiveUsersFilters,
  resultRange,
  toUsersApiParams,
  type UsersFilters,
} from "@/lib/users/usersFilters";
import { formatDate } from "@/lib/format";
import type { StudentStatusFilter, TeacherDetail, UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type Tab = "students" | "teachers";

/** Center Admin Users dashboard (PROMPT-045, roles corrected in PROMPT-047). Administrator-only - a Teacher is
 * redirected to /admin (the nav item is hidden for them too, see `Sidebar`'s `showUsersNav`). Students tab shows
 * every student in the center; Teachers tab shows every teacher. Both are server-paginated/searched/filtered;
 * only the active tab's roster is fetched - the other loads lazily the first time it's opened. */
export default function AdminUsersPage() {
  const { t } = useI18n();
  const { state } = useAuth();
  const router = useRouter();
  const isAdministrator = state.status === "authenticated" && state.user.role === "administrator";

  useEffect(() => {
    if (state.status === "authenticated" && state.user.role !== "administrator") router.replace("/admin");
  }, [state, router]);

  const [tab, setTab] = useState<Tab>("students");
  const [visitedTeachersTab, setVisitedTeachersTab] = useState(false);
  const selectTab = (next: Tab) => {
    setTab(next);
    if (next === "teachers") setVisitedTeachersTab(true);
  };

  const { counts: studentCounts, loading: studentCountsLoading } = useStudentCounts();
  const { counts: teacherCounts, loading: teacherCountsLoading } = useTeacherCounts();

  if (!isAdministrator) return null;

  return (
    <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
      <PageHead eyebrow={t("adminUsers.eyebrow")} title={t("adminUsers.title")} desc={t("adminUsers.desc")} />

      <section className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            [t("adminUsers.totalStudents"), studentCounts ? String(studentCounts.total_students) : null, studentCountsLoading],
            [t("adminUsers.totalTeachers"), teacherCounts ? String(teacherCounts.total_teachers) : null, teacherCountsLoading],
            [t("adminUsers.activeStudents"), studentCounts ? String(studentCounts.active_students) : null, studentCountsLoading],
            [t("adminUsers.activeTeachers"), teacherCounts ? String(teacherCounts.active_teachers) : null, teacherCountsLoading],
          ] as const
        ).map(([label, value, loading]) => (
          <article key={label} className="flex min-w-0 items-center gap-3.5 rounded-2xl border border-line bg-card p-4 shadow-card">
            <div className="grid size-11 flex-none place-items-center rounded-xl bg-brand-primary-pale text-brand-blue">
              <Icon name="userAccount" />
            </div>
            <div>
              <span className="block text-[13px] text-muted">{label}</span>
              {value === null && loading ? (
                <span className="mt-1 block h-6 w-10 animate-pulse rounded bg-bg" aria-hidden="true" />
              ) : (
                <b className="text-xl">{value ?? "—"}</b>
              )}
            </div>
          </article>
        ))}
      </section>

      <div role="tablist" aria-label={t("adminUsers.title")} className="mt-4 flex gap-2 border-b border-line">
        {(["students", "teachers"] as const).map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => selectTab(key)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-bold ${tab === key ? "border-brand-blue text-brand-blue" : "border-transparent text-muted"}`}
          >
            {key === "students" ? t("adminUsers.studentsTab") : t("adminUsers.teachersTab")}
          </button>
        ))}
      </div>

      {tab === "students" ? <StudentsPanel /> : visitedTeachersTab && <TeachersPanel />}
    </main>
  );
}

function StudentsPanel() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<UsersFilters>(DEFAULT_USERS_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<UserPublic | null>(null);
  const [managing, setManaging] = useState<UserPublic | null>(null);

  const debouncedSearch = useDebouncedValue(searchText, USERS_SEARCH_DEBOUNCE_MS);
  const effectiveFilters: UsersFilters = { ...filters, search: debouncedSearch };
  const apiParams = toUsersApiParams(effectiveFilters, page, USERS_PAGE_SIZE);
  const { data, loading, error, refetch } = useStudentsPage(apiParams);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const range = data ? resultRange(total, data.page, data.limit, data.items.length) : null;
  const filtersActive = hasActiveUsersFilters(effectiveFilters);

  const setStatus = (status: StudentStatusFilter | "all") => {
    setFilters(prev => ({ ...prev, status }));
    setPage(1);
  };
  const onSearchText = (text: string) => {
    setSearchText(text);
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(DEFAULT_USERS_FILTERS);
    setSearchText("");
    setPage(1);
  };

  const pagination = {
    page: Math.min(data?.page ?? page, Math.max(1, Math.ceil(total / USERS_PAGE_SIZE))),
    pageSize: USERS_PAGE_SIZE,
    pageSizes: [USERS_PAGE_SIZE] as readonly number[],
    pageCount: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)),
    total,
    from: range?.from ?? 0,
    to: range?.to ?? 0,
    setPage: (next: number) => setPage(next),
    setPageSize: () => {},
  };

  const emptyMessage = filtersActive ? t("adminUsers.noMatches") : t("adminUsers.noStudents");

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <h3 className="m-0 text-[15px]">{t("adminUsers.roster")}</h3>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 rounded-[10px] border border-line bg-bg px-2.5 text-muted">
            <Icon name="search" className="size-4" />
            <input
              type="search"
              aria-label={t("adminUsers.searchPlaceholder")}
              placeholder={t("adminUsers.searchPlaceholder")}
              value={searchText}
              onChange={e => onSearchText(e.target.value)}
              className="h-9 w-40 bg-transparent text-xs outline-none sm:w-48"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            {t("adminUsers.statusFilter")}
            <select
              value={filters.status}
              onChange={e => setStatus(e.target.value as StudentStatusFilter | "all")}
              className="h-9 rounded-[10px] border border-line bg-bg px-2.5 text-xs text-ink outline-none focus:border-brand-blue"
            >
              <option value="all">{t("adminUsers.statusAll")}</option>
              <option value="active">{t("adminUsers.statusActive")}</option>
              <option value="inactive">{t("adminUsers.statusInactive")}</option>
            </select>
          </label>
        </div>
      </div>
      {filtersActive && (
        <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-2.5">
          <span aria-live="polite" className="text-xs text-muted">{t("adminUsers.filteredCount", { count: total })}</span>
          <button type="button" onClick={clearFilters} className="min-h-11 text-xs font-bold text-brand-blue sm:min-h-9">
            {t("adminUsers.clearFilters")}
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="border-t border-line p-4 text-sm">
          <p className="m-0">{t("adminUsers.loadError")}</p>
          <button type="button" onClick={refetch} className="mt-2 min-h-11 font-bold text-brand-blue">{t("adminUsers.retry")}</button>
        </div>
      )}

      {!error && (
        <>
          <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2 lg:hidden">
            {loading && !data && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-bg" aria-hidden="true" />)}
            {items.map(student => (
              <article key={student.id} className="min-w-0 rounded-xl border border-line p-4">
                <button type="button" onClick={() => setViewing(student)} className="flex w-full items-start gap-3 text-start">
                  <Avatar name={student.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate font-bold text-ink">{student.full_name}</p>
                    <p className="m-0 truncate text-sm text-muted">{student.email}</p>
                  </div>
                </button>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-center justify-between"><dt className="text-muted">{t("adminUsers.colStatus")}</dt><dd><StatusPill status={student.is_active ? t("adminUsers.statusActive") : t("adminUsers.statusInactive")} tone={student.is_active ? "excellent" : "default"} /></dd></div>
                  <div className="flex items-center justify-between"><dt className="text-muted">{t("adminUsers.colCreated")}</dt><dd>{formatDate(student.created_at)}</dd></div>
                </dl>
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => setManaging(student)} className="min-h-11 text-sm font-bold text-brand-blue">{t("adminUsers.manage")}</button>
                </div>
              </article>
            ))}
            {!loading && items.length === 0 && <p className="p-2 text-sm text-muted">{emptyMessage}</p>}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  {[t("adminUsers.colName"), t("adminUsers.colEmail"), t("adminUsers.colStatus"), t("adminUsers.colCreated"), ""].map(h => (
                    <th key={h} className="bg-bg px-4 py-2.5 text-left text-[11px] font-normal uppercase tracking-wide text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody aria-busy={loading}>
                {loading && !data && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="border-t border-line px-4 py-3"><div className="h-6 animate-pulse rounded bg-bg" aria-hidden="true" /></td></tr>
                ))}
                {items.map(student => (
                  <tr key={student.id} onClick={() => setViewing(student)} className="cursor-pointer hover:bg-bg">
                    <td className="border-t border-line px-4 py-3 text-sm"><span className="flex items-center gap-2.5"><Avatar name={student.full_name} /><span className="font-bold text-ink">{student.full_name}</span></span></td>
                    <td className="border-t border-line px-4 py-3 text-sm text-muted">{student.email}</td>
                    <td className="border-t border-line px-4 py-3 text-sm"><StatusPill status={student.is_active ? t("adminUsers.statusActive") : t("adminUsers.statusInactive")} tone={student.is_active ? "excellent" : "default"} /></td>
                    <td className="border-t border-line px-4 py-3 text-sm text-muted">{formatDate(student.created_at)}</td>
                    <td className="border-t border-line px-4 py-3 text-sm">
                      <button type="button" onClick={e => { e.stopPropagation(); setManaging(student); }} className="text-xs font-bold text-muted hover:text-brand-blue">{t("adminUsers.manage")}</button>
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && <tr><td colSpan={5} className="p-5 text-sm text-muted">{emptyMessage}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination pagination={pagination} label={t("adminUsers.roster")} className="border-t border-line px-4 py-3" />
        </>
      )}

      {viewing && (
        <UserDetailsDrawer student={viewing} onClose={() => setViewing(null)} onManage={() => { setManaging(viewing); setViewing(null); }} />
      )}
      {managing && (
        <ManageStudentModal student={managing} onClose={() => setManaging(null)} onSaved={refetch} onDeleted={refetch} />
      )}
    </section>
  );
}

function TeachersPanel() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<UsersFilters>(DEFAULT_USERS_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<TeacherDetail | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [managing, setManaging] = useState<UserPublic | null>(null);

  const debouncedSearch = useDebouncedValue(searchText, USERS_SEARCH_DEBOUNCE_MS);
  const effectiveFilters: UsersFilters = { ...filters, search: debouncedSearch };
  const apiParams = toUsersApiParams(effectiveFilters, page, USERS_PAGE_SIZE);
  const { data, loading, error, refetch } = useTeachersPage(apiParams);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const range = data ? resultRange(total, data.page, data.limit, data.items.length) : null;
  const filtersActive = hasActiveUsersFilters(effectiveFilters);

  const setStatus = (status: StudentStatusFilter | "all") => {
    setFilters(prev => ({ ...prev, status }));
    setPage(1);
  };
  const onSearchText = (text: string) => {
    setSearchText(text);
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(DEFAULT_USERS_FILTERS);
    setSearchText("");
    setPage(1);
  };

  const openDetails = async (teacher: UserPublic) => {
    setViewError(null);
    try {
      setViewing(await teachersApi.getTeacher(teacher.id));
    } catch (err) {
      setViewError(err instanceof ApiError ? err.message : t("adminUsers.loadError"));
    }
  };

  const pagination = {
    page: Math.min(data?.page ?? page, Math.max(1, Math.ceil(total / USERS_PAGE_SIZE))),
    pageSize: USERS_PAGE_SIZE,
    pageSizes: [USERS_PAGE_SIZE] as readonly number[],
    pageCount: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)),
    total,
    from: range?.from ?? 0,
    to: range?.to ?? 0,
    setPage: (next: number) => setPage(next),
    setPageSize: () => {},
  };

  const emptyMessage = filtersActive ? t("adminUsers.noTeacherMatches") : t("adminUsers.noTeachers");

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <h3 className="m-0 text-[15px]">{t("adminUsers.teachersRoster")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-[10px] border border-line bg-bg px-2.5 text-muted">
            <Icon name="search" className="size-4" />
            <input
              type="search"
              aria-label={t("adminUsers.searchTeachersPlaceholder")}
              placeholder={t("adminUsers.searchTeachersPlaceholder")}
              value={searchText}
              onChange={e => onSearchText(e.target.value)}
              className="h-9 w-40 bg-transparent text-xs outline-none sm:w-48"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            {t("adminUsers.statusFilter")}
            <select
              value={filters.status}
              onChange={e => setStatus(e.target.value as StudentStatusFilter | "all")}
              className="h-9 rounded-[10px] border border-line bg-bg px-2.5 text-xs text-ink outline-none focus:border-brand-blue"
            >
              <option value="all">{t("adminUsers.statusAll")}</option>
              <option value="active">{t("adminUsers.statusActive")}</option>
              <option value="inactive">{t("adminUsers.statusInactive")}</option>
            </select>
          </label>
          <button type="button" onClick={() => setAdding(true)} className="rounded-[10px] bg-brand-blue px-3.5 py-2 text-xs font-bold text-white">
            {t("adminUsers.addTeacher")}
          </button>
        </div>
      </div>
      {filtersActive && (
        <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-2.5">
          <span aria-live="polite" className="text-xs text-muted">{t("adminUsers.filteredCount", { count: total })}</span>
          <button type="button" onClick={clearFilters} className="min-h-11 text-xs font-bold text-brand-blue sm:min-h-9">
            {t("adminUsers.clearFilters")}
          </button>
        </div>
      )}

      {viewError && <p role="alert" className="border-t border-line px-4 py-2.5 text-sm text-brand-coral">{viewError}</p>}

      {error && (
        <div role="alert" className="border-t border-line p-4 text-sm">
          <p className="m-0">{t("adminUsers.loadError")}</p>
          <button type="button" onClick={refetch} className="mt-2 min-h-11 font-bold text-brand-blue">{t("adminUsers.retry")}</button>
        </div>
      )}

      {!error && (
        <>
          <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2 lg:hidden">
            {loading && !data && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-bg" aria-hidden="true" />)}
            {items.map(teacher => (
              <article key={teacher.id} className="min-w-0 rounded-xl border border-line p-4">
                <button type="button" onClick={() => openDetails(teacher)} className="flex w-full items-start gap-3 text-start">
                  <Avatar name={teacher.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate font-bold text-ink">{teacher.full_name}</p>
                    <p className="m-0 truncate text-sm text-muted">{teacher.email}</p>
                  </div>
                </button>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-center justify-between"><dt className="text-muted">{t("adminUsers.colStatus")}</dt><dd><StatusPill status={teacher.is_active ? t("adminUsers.statusActive") : t("adminUsers.statusInactive")} tone={teacher.is_active ? "excellent" : "default"} /></dd></div>
                  <div className="flex items-center justify-between"><dt className="text-muted">{t("adminUsers.colCreated")}</dt><dd>{formatDate(teacher.created_at)}</dd></div>
                </dl>
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => setManaging(teacher)} className="min-h-11 text-sm font-bold text-brand-blue">{t("adminUsers.manage")}</button>
                </div>
              </article>
            ))}
            {!loading && items.length === 0 && <p className="p-2 text-sm text-muted">{emptyMessage}</p>}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  {[t("adminUsers.colName"), t("adminUsers.colEmail"), t("adminUsers.colStatus"), t("adminUsers.colCreated"), ""].map(h => (
                    <th key={h} className="bg-bg px-4 py-2.5 text-left text-[11px] font-normal uppercase tracking-wide text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody aria-busy={loading}>
                {loading && !data && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="border-t border-line px-4 py-3"><div className="h-6 animate-pulse rounded bg-bg" aria-hidden="true" /></td></tr>
                ))}
                {items.map(teacher => (
                  <tr key={teacher.id} onClick={() => openDetails(teacher)} className="cursor-pointer hover:bg-bg">
                    <td className="border-t border-line px-4 py-3 text-sm"><span className="flex items-center gap-2.5"><Avatar name={teacher.full_name} /><span className="font-bold text-ink">{teacher.full_name}</span></span></td>
                    <td className="border-t border-line px-4 py-3 text-sm text-muted">{teacher.email}</td>
                    <td className="border-t border-line px-4 py-3 text-sm"><StatusPill status={teacher.is_active ? t("adminUsers.statusActive") : t("adminUsers.statusInactive")} tone={teacher.is_active ? "excellent" : "default"} /></td>
                    <td className="border-t border-line px-4 py-3 text-sm text-muted">{formatDate(teacher.created_at)}</td>
                    <td className="border-t border-line px-4 py-3 text-sm">
                      <button type="button" onClick={e => { e.stopPropagation(); setManaging(teacher); }} className="text-xs font-bold text-muted hover:text-brand-blue">{t("adminUsers.manage")}</button>
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && <tr><td colSpan={5} className="p-5 text-sm text-muted">{emptyMessage}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination pagination={pagination} label={t("adminUsers.teachersRoster")} className="border-t border-line px-4 py-3" />
        </>
      )}

      {adding && (
        <AddTeacherModal onClose={() => setAdding(false)} onCreated={refetch} />
      )}
      {viewing && (
        <TeacherDetailsDrawer
          detail={viewing}
          onClose={() => setViewing(null)}
          onManage={() => { setManaging(viewing.teacher); setViewing(null); }}
        />
      )}
      {managing && (
        <ManageTeacherModal teacher={managing} onClose={() => setManaging(null)} onSaved={refetch} onDeleted={refetch} />
      )}
    </section>
  );
}
