"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, calendarTemplatesApi, cohortsApi, homeworkApi, programsApi, teachersApi } from "@/lib/api/client";
import type { CalendarTemplate, CohortPublic, CohortStudentCandidate, CohortTeacherAssignment, EnrollmentPage, HomeworkPublic, LateJoinMode, ProgramPublic, ProgramTopicPublic, UserPublic } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { BatchCurriculumTab } from "@/components/admin/cohorts/BatchCurriculumTab";

type BatchTab = "overview" | "curriculum" | "students" | "teachers" | "schedule" | "homework" | "progress";

function stageName(program: ProgramPublic | undefined, stageId: string): string {
  return program?.levels.find(level => level.id === stageId)?.name ?? stageId;
}

function displayDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function batchDayDate(startDate: string, day: number, locale: string): string {
  const value = new Date(startDate);
  value.setDate(value.getDate() + day - 1);
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(value);
}

export default function BatchWorkspacePage() {
  const { state } = useAuth();
  const { t } = useI18n();
  const params = useParams<{ cohortId: string }>();
  const cohortId = params.cohortId;
  const isAdmin = state.status === "authenticated" && state.user.role === "administrator";

  const [tab, setTab] = useState<BatchTab>("overview");
  const [cohort, setCohort] = useState<CohortPublic | null>(null);
  const [program, setProgram] = useState<ProgramPublic | undefined>(undefined);
  const [teachers, setTeachers] = useState<UserPublic[]>([]);
  const [topics, setTopics] = useState<ProgramTopicPublic[]>([]);
  const [templates, setTemplates] = useState<CalendarTemplate[]>([]);
  const [homework, setHomework] = useState<HomeworkPublic[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scheduleFocusStageId, setScheduleFocusStageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const cohortItem = await cohortsApi.get(cohortId);
      setCohort(cohortItem);
      const [programs, cohortTopics, calendarTemplates] = await Promise.all([
        programsApi.list(),
        cohortsApi.topics(cohortId),
        calendarTemplatesApi.list(),
      ]);
      setProgram(programs.find(p => p.id === cohortItem.program_id));
      setTopics(cohortTopics);
      setTemplates(calendarTemplates.filter(tpl => tpl.cohort_id === cohortId));
      if (isAdmin) {
        const [teacherPage, homeworkItems] = await Promise.all([
          teachersApi.listTeachersPage({ page: 1, limit: 100 }),
          homeworkApi.listForStaff(),
        ]);
        setTeachers(teacherPage.items);
        setHomework(homeworkItems.filter(item => item.cohort_id === cohortId));
      } else {
        const homeworkItems = await homeworkApi.listForStaff();
        setHomework(homeworkItems.filter(item => item.cohort_id === cohortId));
      }
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) setNotFound(true);
      else throw cause;
    } finally {
      setLoaded(true);
    }
  }, [cohortId, isAdmin]);

  // Initial API synchronization; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (state.status === "authenticated") void load(); }, [state, load]);

  if (state.status !== "authenticated") return null;

  if (notFound) {
    return <main className="mx-auto max-w-4xl p-4 md:p-8">
      <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("batchWorkspace.notFound")}</p>
      <Link href="/admin/cohorts" className="mt-3 inline-block text-sm font-bold text-brand-blue">{t("batchWorkspace.backToBatches")}</Link>
    </main>;
  }

  const TABS: { key: BatchTab; label: string }[] = [
    { key: "overview", label: t("batchWorkspace.tabOverview") },
    { key: "curriculum", label: t("batchWorkspace.tabCurriculum") },
    { key: "students", label: t("batchWorkspace.tabStudents") },
    { key: "teachers", label: t("batchWorkspace.tabTeachers") },
    { key: "schedule", label: t("batchWorkspace.tabSchedule") },
    { key: "homework", label: t("batchWorkspace.tabHomework") },
    { key: "progress", label: t("batchWorkspace.tabProgress") },
  ];

  return <main className="w-full max-w-none p-4 pb-28 md:px-8 md:py-8 lg:px-10 lg:pb-8">
    <Link href={isAdmin && program ? `/admin/programs/${program.id}` : "/admin/cohorts"} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-blue">
      <span aria-hidden="true" className="me-1.5 inline-block rtl:rotate-180">←</span>
      {isAdmin && program ? program.name : t("batchWorkspace.backToBatches")}
    </Link>
    <header className="mb-6 mt-2">
      {program && <p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{program.name}</p>}
      <h1 className="mt-2 text-2xl font-bold md:text-3xl">{cohort?.name}</h1>
      {cohort && <p className="mt-1 text-sm text-muted">{t("cohorts.studentCount", { count: String(cohort.student_count) })} · {cohort.status}</p>}
    </header>

    <nav className="mb-6 flex flex-wrap gap-2 border-b border-line" aria-label={t("batchWorkspace.tabsLabel")}>
      {TABS.map(item => (
        <button key={item.key} onClick={() => setTab(item.key)}
          className={`min-h-11 border-b-2 px-3 text-sm font-bold ${tab === item.key ? "border-brand-blue text-brand-blue" : "border-transparent text-muted"}`}>
          {item.label}
        </button>
      ))}
    </nav>

    {!loaded && <p className="text-sm text-muted">{t("common.loading")}</p>}

    {loaded && cohort && tab === "overview" && (
      <section className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{t("batchWorkspace.statStages")}</p><p className="mt-1 text-2xl font-bold">{cohort.program_level_ids.length}</p></div>
          <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{t("batchWorkspace.statStudents")}</p><p className="mt-1 text-2xl font-bold">{cohort.student_count}</p></div>
          <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{t("batchWorkspace.statTopics")}</p><p className="mt-1 text-2xl font-bold">{topics.length}</p></div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-muted">{t("batchWorkspace.relatedProgram")}</p><p className="mt-1 font-bold">{program?.name ?? "—"}</p></div>
            <div><p className="text-xs text-muted">{t("batchWorkspace.leadTeacher")}</p><p className="mt-1 font-bold">{cohort.lead_teacher_name ?? teachers.find(tc => tc.id === cohort.lead_teacher_id)?.full_name ?? (state.user.id === cohort.lead_teacher_id ? state.user.full_name : "—")}</p></div>
            <div><p className="text-xs text-muted">{t("batchWorkspace.dates")}</p><p className="mt-1 text-sm font-semibold">{displayDate(cohort.start_date)} — {displayDate(cohort.end_date)}</p></div>
            <div><p className="text-xs text-muted">{t("batchWorkspace.status")}</p><p className="mt-1 text-sm font-semibold capitalize">{cohort.status}</p></div>
          </div>
          <div className="mt-4"><p className="text-xs text-muted">{t("batchWorkspace.selectedLevels")}</p><div className="mt-2 flex flex-wrap gap-2">{cohort.program_level_ids.map(id => <span key={id} className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-bold text-brand-blue">{stageName(program, id)}</span>)}</div></div>
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => setTab("curriculum")} className="min-h-10 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">{t("programWorkspace.openCurriculum")}</button><button type="button" onClick={() => setTab("schedule")} className="min-h-10 rounded-xl border border-brand-blue px-4 text-sm font-bold text-brand-blue">{t("batchCurriculum.openSchedule")}</button></div>
        </div>
        <BatchSettingsCard key={cohort.updated_at} cohort={cohort} onChanged={load} />
      </section>
    )}

    {loaded && cohort && program && tab === "curriculum" && (
      <BatchCurriculumTab cohort={cohort} program={program} assignments={topics} templates={templates} canOpenProgram={isAdmin} onChanged={load}
        onOpenSchedule={stageId => { setScheduleFocusStageId(stageId); setTab("schedule"); }} />
    )}

    {loaded && cohort && tab === "students" && (
      <StudentsTab cohort={cohort} isAdmin={isAdmin} canEnroll program={program} onChanged={load} />
    )}

    {loaded && cohort && tab === "teachers" && (
      <TeachersTab cohort={cohort} teachers={teachers} isAdmin={isAdmin} onChanged={load} />
    )}

    {loaded && cohort && tab === "schedule" && (
      <ScheduleTab cohort={cohort} program={program} templates={templates} topics={topics} focusStageId={scheduleFocusStageId} onChanged={load} />
    )}

    {loaded && tab === "homework" && (
      <section className="grid gap-3">
        {homework.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("batchWorkspace.noHomework")}</p>}
        {homework.map(item => (
          <div key={item.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-bold">{item.title}</p>
            <p className="text-xs text-muted">{t("homework.due", { date: new Date(item.due_at).toLocaleDateString() })}</p>
          </div>
        ))}
      </section>
    )}

    {loaded && tab === "progress" && (
      <section className="rounded-2xl border border-dashed border-line bg-card p-6">
        <p className="text-sm text-muted">{t("batchWorkspace.progressNotReady")}</p>
      </section>
    )}
  </main>;
}

function StudentsTab({ cohort, isAdmin, canEnroll, program, onChanged }: {
  cohort: CohortPublic; isAdmin: boolean; canEnroll: boolean; program: ProgramPublic | undefined; onChanged: () => void;
}) {
  const { t } = useI18n();
  const [candidateSearch, setCandidateSearch] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [stageId, setStageId] = useState(cohort.program_level_ids[0] ?? "");
  const [academicLevelId, setAcademicLevelId] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [lateJoinMode, setLateJoinMode] = useState<LateJoinMode>("current_day");
  const [candidatePage, setCandidatePage] = useState(1);
  const [rosterPage, setRosterPage] = useState(1);
  const [candidates, setCandidates] = useState<CohortStudentCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [roster, setRoster] = useState<EnrollmentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRoster = useCallback(async () => {
    const result = await cohortsApi.rosterPage(cohort.id, { search: rosterSearch, page: rosterPage, limit: 20 });
    setRoster(result);
  }, [cohort.id, rosterPage, rosterSearch]);

  const loadCandidates = useCallback(async () => {
    if (!canEnroll) return;
    const result = await cohortsApi.candidates(cohort.id, {
      search: candidateSearch, academic_level_id: academicLevelId || undefined,
      unassigned_only: unassignedOnly, page: candidatePage, limit: 25,
    });
    setCandidates(result.items); setCandidateTotal(result.total);
  }, [academicLevelId, candidatePage, candidateSearch, canEnroll, cohort.id, unassignedOnly]);

  // A search/filter is a deliberate user action; reset its page in that
  // event handler rather than synchronizing state after render.
  useEffect(() => {
    const loadData = async () => {
      try { await Promise.all([loadRoster(), loadCandidates()]); }
      catch (cause) { setError(cause instanceof ApiError ? cause.message : t("cohorts.saveError")); }
      finally { setLoading(false); }
    };
    void loadData();
  }, [loadCandidates, loadRoster, t]);

  const selectedOnPage = candidates.filter(student => picked.includes(student.id));
  const refresh = async () => { await Promise.all([loadRoster(), loadCandidates()]); onChanged(); };

  const enroll = async () => {
    setSaving(true); setError("");
    try {
      const result = await cohortsApi.enrollStudentsBulk(cohort.id, { student_ids: picked, program_level_id: stageId, late_join_mode: lateJoinMode });
      setPicked([]); setNotice(result.already_enrolled_student_ids.length
        ? `${result.created.length} enrolled; ${result.already_enrolled_student_ids.length} were already in this Batch.`
        : `${result.created.length} student${result.created.length === 1 ? "" : "s"} enrolled.`);
      await refresh();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("cohorts.saveError")); }
    finally { setSaving(false); }
  };

  const toggleVisible = (checked: boolean) => setPicked(current => checked
    ? [...new Set([...current, ...candidates.map(student => student.id)])]
    : current.filter(id => !candidates.some(student => student.id === id)));

  return <section className="grid gap-6">
    {!canEnroll && <p className="rounded-2xl border border-line bg-brand-primary-pale p-4 text-sm text-muted">You can view this Batch roster. A Center Admin manages enrollment.</p>}
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Batch roster</h3><span className="text-xs text-muted">{roster?.total ?? cohort.student_count} students</span></div>
      <input value={rosterSearch} onChange={event => { setRosterSearch(event.target.value); setRosterPage(1); }} placeholder="Search enrolled students" className="mb-3 min-h-10 w-full rounded-lg border border-line px-3 text-sm" />
      {loading && !roster && <p className="text-sm text-muted">{t("common.loading")}</p>}
      <ul className="grid gap-2">
      {roster?.items.length === 0 && <li className="text-sm text-muted">{t("cohorts.rosterEmpty")}</li>}
      {roster?.items.map(enrollment => (
        <li key={enrollment.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
          <span><strong>{enrollment.student_name ?? enrollment.student_id}</strong>{enrollment.student_email ? ` · ${enrollment.student_email}` : ""}<span className="text-muted"> · {stageName(program, enrollment.program_level_id)} · Joined {displayDate(enrollment.joined_at)}</span></span>
          {isAdmin && <button onClick={async () => { await cohortsApi.removeStudent(cohort.id, enrollment.student_id); await refresh(); }} className="text-xs font-bold text-brand-coral">{t("cohorts.removeStudent")}</button>}
        </li>
      ))}
      </ul>
      {roster && <Pagination page={roster.page} total={roster.total} limit={roster.limit} onPage={setRosterPage} />}
    </section>

    {canEnroll && (
      <div className="grid gap-3 rounded-2xl border border-dashed border-brand-blue bg-card p-4">
        <div><h3 className="text-sm font-bold">{t("cohorts.enrollStudents")}</h3><p className="mt-1 text-xs text-muted">{isAdmin ? "Search the center roster." : "You can enroll students assigned to you."} Students already in this Batch are shown above and cannot be selected again.</p></div>
        <select value={stageId} onChange={event => setStageId(event.target.value)} className="min-h-10 rounded-lg border border-line px-2 font-normal">
          {cohort.program_level_ids.map(id => <option key={id} value={id}>{stageName(program, id)}</option>)}
        </select>
        <select value={lateJoinMode} onChange={event => setLateJoinMode(event.target.value as LateJoinMode)} className="min-h-10 rounded-lg border border-line px-2 font-normal">
          <option value="current_day">{t("cohorts.lateJoinCurrentDay")}</option>
          <option value="day_one">{t("cohorts.lateJoinDayOne")}</option>
        </select>
        <div className="grid gap-2 sm:grid-cols-2"><input value={candidateSearch} onChange={event => { setCandidateSearch(event.target.value); setCandidatePage(1); }} placeholder={t("cohorts.searchStudents")} className="min-h-10 rounded-lg border border-line px-2 text-sm font-normal" />
          <select value={academicLevelId} onChange={event => { setAcademicLevelId(event.target.value); setCandidatePage(1); }} className="min-h-10 rounded-lg border border-line px-2 text-sm"><option value="">All academic levels</option>{cohort.program_level_ids.map(id => <option key={id} value={id}>{stageName(program, id)}</option>)}</select></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unassignedOnly} onChange={event => { setUnassignedOnly(event.target.checked); setCandidatePage(1); }} /> Only unassigned students</label>
        <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-line p-2">
          {candidates.length > 0 && <label className="flex min-h-9 items-center gap-2 border-b border-line pb-1 text-xs font-bold"><input type="checkbox" checked={selectedOnPage.length === candidates.length} onChange={event => toggleVisible(event.target.checked)} /> Select visible ({candidates.length})</label>}
          {candidates.length === 0 && !loading && <p className="p-2 text-sm text-muted">No eligible students found.</p>}
          {candidates.map(student => <label key={student.id} className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={picked.includes(student.id)} onChange={event => setPicked(current => event.target.checked ? [...current, student.id] : current.filter(id => id !== student.id))} />
            <span>{student.full_name} <span className="text-muted">({student.email}) · {student.academic_level_name ?? (student.is_unassigned ? "Unassigned" : "No mapped level")}</span></span>
          </label>)}
        </div>
        <Pagination page={candidatePage} total={candidateTotal} limit={25} onPage={setCandidatePage} />
        <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-bold">{picked.length} selected</span>{picked.length > 0 && <button type="button" onClick={() => setPicked([])} className="text-xs font-bold text-brand-blue">Clear selection</button>}</div>
        {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-2 text-sm text-brand-coral">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-brand-primary-pale p-2 text-sm text-brand-blue">{notice}</p>}
        <button onClick={enroll} disabled={saving || picked.length === 0} className="min-h-10 w-fit rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">
          {saving ? t("common.saving") : t("cohorts.enrollSubmit")}
        </button>
      </div>
    )}
  </section>;
}

function Pagination({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages === 1) return null;
  return <div className="mt-3 flex items-center justify-end gap-3 text-sm"><span className="text-muted">Page {page} of {pages}</span><button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className="min-h-9 rounded-lg border border-line px-3 disabled:opacity-40">Previous</button><button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} className="min-h-9 rounded-lg border border-line px-3 disabled:opacity-40">Next</button></div>;
}

function BatchSettingsCard({ cohort, onChanged }: { cohort: CohortPublic; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [startDate, setStartDate] = useState(cohort.start_date.slice(0, 10));
  const [endDate, setEndDate] = useState(cohort.end_date?.slice(0, 10) ?? "");
  const [status, setStatus] = useState(cohort.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setSaving(true); setError("");
    try {
      await cohortsApi.update(cohort.id, {
        start_date: new Date(`${startDate}T00:00:00`).toISOString(),
        end_date: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
        status,
      });
      setEditing(false); await onChanged();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "We could not save this Batch."); }
    finally { setSaving(false); }
  };
  return <section className="rounded-2xl border border-line bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Batch settings</p><h3 className="mt-1 text-lg font-bold">Dates and availability</h3><p className="mt-1 text-sm text-muted">Set when this Batch starts. An end date is optional and can be decided later.</p></div><button type="button" onClick={() => setEditing(current => !current)} className="min-h-10 rounded-xl border border-brand-blue px-4 text-sm font-bold text-brand-blue">{editing ? "Cancel" : "Edit Batch"}</button></div>
    {editing && <div className="mt-5 grid gap-4 md:grid-cols-3"><label className="grid gap-1 text-sm font-bold">Starts on<input required type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="min-h-11 rounded-xl border border-line px-3 font-normal" /></label><label className="grid gap-1 text-sm font-bold">Ends on <span className="font-normal text-muted">(optional)</span><input type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} className="min-h-11 rounded-xl border border-line px-3 font-normal" /></label><label className="grid gap-1 text-sm font-bold">Status<select value={status} onChange={event => setStatus(event.target.value as CohortPublic["status"])} className="min-h-11 rounded-xl border border-line px-3 font-normal"><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option><option value="completed">COMPLETED</option><option value="archived">ARCHIVED</option></select></label><div className="md:col-span-3 flex flex-wrap items-center gap-3">{error && <p role="alert" className="text-sm text-brand-coral">{error}</p>}<button type="button" disabled={saving || !startDate} onClick={() => void save()} className="min-h-11 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving…" : "Save Batch settings"}</button></div></div>}
  </section>;
}

function TeachersTab({ cohort, teachers, isAdmin, onChanged }: { cohort: CohortPublic; teachers: UserPublic[]; isAdmin: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const [leadTeacherId, setLeadTeacherId] = useState(cohort.lead_teacher_id);
  const [assignments, setAssignments] = useState<CohortTeacherAssignment[]>(cohort.teacher_assignments);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Keeps the editor in sync after a save elsewhere reloads the Cohort.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLeadTeacherId(cohort.lead_teacher_id); setAssignments(cohort.teacher_assignments); }, [cohort]);
  const teacherName = (id: string) => teachers.find(tc => tc.id === id)?.full_name ?? id;

  const save = async () => {
    setSaving(true); setError("");
    try {
      await cohortsApi.update(cohort.id, { lead_teacher_id: leadTeacherId, teacher_assignments: assignments });
      onChanged();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("cohorts.saveError")); }
    finally { setSaving(false); }
  };

  const addAssignment = (teacherId: string) => {
    if (!teacherId || assignments.some(a => a.teacher_id === teacherId) || teacherId === leadTeacherId) return;
    setAssignments(current => [...current, { teacher_id: teacherId, program_level_ids: [] }]);
  };

  if (!isAdmin) {
    return <section className="rounded-2xl border border-line bg-card p-5">
      <p className="text-xs text-muted">{t("cohorts.leadTeacherLabel")}</p>
      <p className="mt-1 font-bold">{teacherName(cohort.lead_teacher_id)}</p>
      <ul className="mt-4 grid gap-1">
        {assignments.map(a => <li key={a.teacher_id} className="text-sm">{teacherName(a.teacher_id)} — {a.program_level_ids.length ? a.program_level_ids.join(", ") : t("batchWorkspace.allStages")}</li>)}
      </ul>
    </section>;
  }

  return <section className="grid gap-4 rounded-2xl border border-line bg-card p-5">
    <label className="grid gap-1 text-sm font-bold">{t("cohorts.leadTeacher")}
      <select value={leadTeacherId} onChange={event => setLeadTeacherId(event.target.value)} className="min-h-11 rounded-xl border border-line px-3 font-normal">
        {teachers.map(tc => <option key={tc.id} value={tc.id}>{tc.full_name}</option>)}
      </select>
    </label>
    <div>
      <p className="text-sm font-bold">{t("batchWorkspace.additionalTeachers")}</p>
      <ul className="mt-2 grid gap-2">
        {assignments.map(a => (
          <li key={a.teacher_id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
            {teacherName(a.teacher_id)}
            <button onClick={() => setAssignments(current => current.filter(item => item.teacher_id !== a.teacher_id))} className="text-xs font-bold text-brand-coral">{t("cohorts.removeStudent")}</button>
          </li>
        ))}
      </ul>
      <select onChange={event => { addAssignment(event.target.value); event.target.value = ""; }} className="mt-2 min-h-10 rounded-lg border border-dashed border-line px-2 text-sm font-normal" defaultValue="">
        <option value="" disabled>{t("batchWorkspace.addTeacher")}</option>
        {teachers.filter(tc => tc.id !== leadTeacherId && !assignments.some(a => a.teacher_id === tc.id)).map(tc => <option key={tc.id} value={tc.id}>{tc.full_name}</option>)}
      </select>
    </div>
    {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
    <button onClick={save} disabled={saving} className="min-h-11 w-fit rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? t("common.saving") : t("common.save")}</button>
  </section>;
}

function ScheduleTab({ cohort, program, templates, topics, focusStageId, onChanged }: {
  cohort: CohortPublic; program: ProgramPublic | undefined; templates: CalendarTemplate[]; topics: ProgramTopicPublic[]; focusStageId: string | null; onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const stages = [...(cohort.accessible_program_level_ids?.length ? cohort.accessible_program_level_ids : cohort.program_level_ids)];
  const [selectedStageId, setSelectedStageId] = useState(focusStageId && stages.includes(focusStageId) ? focusStageId : stages[0] ?? "");
  const [week, setWeek] = useState(0);
  const [composerDay, setComposerDay] = useState<number | null>(null);
  const [composerTopicId, setComposerTopicId] = useState("");
  const [homeworkDay, setHomeworkDay] = useState<number | null>(null);
  const [homeworkTitle, setHomeworkTitle] = useState("");
  const [homeworkInstructions, setHomeworkInstructions] = useState("");
  const [homeworkTime, setHomeworkTime] = useState("20:00");
  const template = templates.find(item => item.program_level_id === selectedStageId);
  const stageTopics = topics.filter(item => item.program_level_id === selectedStageId && item.status === "published");

  const save = async (next: Partial<Pick<CalendarTemplate, "days" | "rest_days" | "duration_days">>) => {
    if (!template) return;
    setSaving(template.id); setError("");
    try { await calendarTemplatesApi.update(template.id, next); await onChanged(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : t("cohorts.saveError")); }
    finally { setSaving(null); }
  };

  const addToDay = async (day: number, topicId: string) => {
    if (!template || !topicId || template.rest_days.includes(day)) return;
    const days = template.days.map(entry => ({ ...entry, topic_ids: [...entry.topic_ids], custom_minutes: { ...entry.custom_minutes } }));
    const entry = days.find(item => item.day === day);
    if (entry) { if (!entry.topic_ids.includes(topicId)) entry.topic_ids.push(topicId); }
    else days.push({ day, topic_ids: [topicId], custom_minutes: {} });
    await save({ days }); setComposerDay(null); setComposerTopicId("");
  };

  const removeFromDay = async (day: number, topicId: string) => {
    if (!template) return;
    const days = template.days.map(entry => entry.day === day
      ? { ...entry, topic_ids: entry.topic_ids.filter(id => id !== topicId), custom_minutes: Object.fromEntries(Object.entries(entry.custom_minutes).filter(([id]) => id !== topicId)) }
      : entry).filter(entry => entry.topic_ids.length > 0);
    await save({ days });
  };

  const toggleRestDay = async (day: number) => {
    if (!template) return;
    const rests = template.rest_days.includes(day) ? template.rest_days.filter(item => item !== day) : [...template.rest_days, day].sort((a, b) => a - b);
    // A rest day cannot contain lessons; remove that day's placement in the
    // same atomic template update instead of leaving an invalid schedule.
    await save({ rest_days: rests, days: template.days.filter(entry => entry.day !== day) });
  };

  const addHomework = async () => {
    if (homeworkDay === null || !homeworkTitle.trim()) return;
    setSaving(template?.id ?? "homework"); setError("");
    try {
      const due = new Date(cohort.start_date);
      due.setDate(due.getDate() + homeworkDay - 1);
      const [hours, minutes] = homeworkTime.split(":").map(Number);
      due.setHours(hours || 0, minutes || 0, 0, 0);
      await homeworkApi.create({ title: homeworkTitle.trim(), instructions: homeworkInstructions.trim(), kind: "writing", due_at: due.toISOString(), participant_ids: [], cohort_id: cohort.id, program_level_id: selectedStageId });
      setHomeworkDay(null); setHomeworkTitle(""); setHomeworkInstructions("");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "We could not create this homework."); }
    finally { setSaving(null); }
  };

  if (!template) return <section className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("batchWorkspace.noSchedule")}</section>;
  const startDay = week * 7 + 1;
  const visibleDays = Array.from({ length: Math.min(7, template.duration_days - startDay + 1) }, (_, index) => startDay + index);
  const weeks = Math.ceil(template.duration_days / 7);

  return <section className="grid gap-4">
    {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Batch stages">
      {stages.map(stageId => <button key={stageId} type="button" onClick={() => { setSelectedStageId(stageId); setWeek(0); }} className={`min-h-10 rounded-xl px-4 text-sm font-bold ${selectedStageId === stageId ? "bg-brand-blue text-white" : "border border-line bg-card text-muted"}`}>{stageName(program, stageId)}</button>)}
    </div>
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-page px-5 py-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">Batch planner</p><h3 className="mt-1 text-lg font-bold">Weekly schedule</h3><p className="mt-1 text-sm text-muted">Place published lessons, then students follow this Batch calendar.</p></div>
        <label className="flex items-center gap-2 text-sm font-bold">Plan length <select value={template.duration_days} disabled={saving === template.id} onChange={event => { const duration_days = Number(event.target.value); void save({ duration_days, rest_days: template.rest_days.filter(day => day <= duration_days), days: template.days.filter(entry => entry.day <= duration_days) }); }} className="min-h-11 rounded-xl border border-line bg-card px-3 font-normal">{[7, 14, 21, 28, 30, 45, 60, 90].map(days => <option key={days} value={days}>{days} days</option>)}</select></label>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4"><button type="button" disabled={week === 0 || saving === template.id} onClick={() => setWeek(current => current - 1)} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold disabled:opacity-40">← Previous week</button><div className="text-center"><p className="text-xs font-bold uppercase tracking-wide text-muted">Schedule view</p><p className="mt-0.5 text-sm font-bold">Week {week + 1} of {weeks}</p></div><button type="button" disabled={week >= weeks - 1 || saving === template.id} onClick={() => setWeek(current => current + 1)} className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-bold disabled:opacity-40">Next week →</button></div>
      <div className="overflow-x-auto border-t border-line bg-page p-5">
      <div className="grid min-w-[1120px] grid-cols-7 gap-3">
        {visibleDays.map(day => {
          const isRest = template.rest_days.includes(day);
          const entry = template.days.find(item => item.day === day);
          return <article key={day} className={`flex min-h-64 flex-col rounded-2xl border p-4 shadow-sm ${isRest ? "border-amber-200 bg-amber-50" : "border-line bg-card"}`}>
            <div className="flex items-start justify-between gap-2 border-b border-line pb-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted">Day {day}</p><p className="mt-1 text-base font-bold">{isRest ? "Rest day" : "Learning day"}</p><p className="mt-1 text-xs font-semibold text-brand-blue">{batchDayDate(cohort.start_date, day, locale)}</p></div><button type="button" onClick={() => void toggleRestDay(day)} disabled={saving === template.id} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-brand-blue hover:bg-brand-primary-pale disabled:opacity-40">{isRest ? "Make learning" : "Mark rest"}</button></div>
            {!isRest && <><div className="mt-4 grid flex-1 content-start gap-2">{entry?.topic_ids.map(topicId => <span key={topicId} className="group flex items-center justify-between gap-2 rounded-xl bg-brand-primary-pale px-3 py-2.5 text-sm font-bold text-brand-blue"><span className="min-w-0 truncate">{topics.find(item => item.topic_id === topicId)?.topic_title ?? topicId}</span><button type="button" onClick={() => void removeFromDay(day, topicId)} aria-label={`Remove ${topicId}`} className="shrink-0 text-base text-brand-coral">×</button></span>)}{!entry && <p className="pt-3 text-sm text-muted">No lessons scheduled</p>}</div><div className="mt-4 grid gap-2"><button type="button" onClick={() => { setComposerDay(day); setComposerTopicId(""); }} disabled={saving === template.id || stageTopics.filter(item => !entry?.topic_ids.includes(item.topic_id)).length === 0} className="min-h-11 w-full rounded-xl border border-dashed border-brand-blue px-3 text-sm font-bold text-brand-blue hover:bg-brand-primary-pale disabled:opacity-40">+ Add lesson</button><button type="button" onClick={() => { setHomeworkDay(day); setHomeworkTitle(""); setHomeworkInstructions(""); setHomeworkTime("20:00"); }} disabled={saving === template.id} className="min-h-10 w-full rounded-xl border border-dashed border-amber-500 px-3 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40">+ Add homework</button></div></>}
          </article>;
        })}
      </div>
      </div>
    </div>
    {composerDay !== null && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/35 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={`Add a lesson to day ${composerDay}`}>
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Batch schedule</p><h3 className="mt-1 text-lg font-bold">Add lesson to Day {composerDay}</h3><p className="mt-1 text-sm text-muted">Choose a published lesson from this stage.</p></div><button type="button" onClick={() => setComposerDay(null)} className="min-h-10 px-2 text-xl text-muted" aria-label="Close">×</button></div><label className="mt-5 grid gap-2 text-sm font-bold">Published lesson<select value={composerTopicId} onChange={event => setComposerTopicId(event.target.value)} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm font-normal"><option value="">Choose a lesson…</option>{stageTopics.filter(item => !template.days.find(entry => entry.day === composerDay)?.topic_ids.includes(item.topic_id)).map(item => <option key={item.topic_id} value={item.topic_id}>{item.topic_title}</option>)}</select></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setComposerDay(null)} className="min-h-10 rounded-xl px-4 text-sm font-bold text-muted">Cancel</button><button type="button" onClick={() => void addToDay(composerDay, composerTopicId)} disabled={!composerTopicId || saving === template.id} className="min-h-10 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">Add lesson</button></div></div>
    </div>}
    {homeworkDay !== null && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/35 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={`Add homework to day ${homeworkDay}`}>
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-amber-700">Batch homework</p><h3 className="mt-1 text-lg font-bold">Homework for Day {homeworkDay}</h3><p className="mt-1 text-sm text-muted">This goes to the selected stage in this Batch. Choose the due time yourself.</p></div><button type="button" onClick={() => setHomeworkDay(null)} className="grid size-10 place-items-center rounded-xl border border-brand-coral bg-brand-coral-pale text-xl font-bold text-brand-coral" aria-label="Close">×</button></div><label className="mt-5 grid gap-2 text-sm font-bold">Homework title<input autoFocus value={homeworkTitle} onChange={event => setHomeworkTitle(event.target.value)} className="min-h-11 rounded-xl border border-line px-3 font-normal" placeholder="e.g. Write about your routine" /></label><label className="mt-4 grid gap-2 text-sm font-bold">Due time<input required type="time" value={homeworkTime} onChange={event => setHomeworkTime(event.target.value)} className="min-h-11 rounded-xl border border-line px-3 font-normal" /></label><label className="mt-4 grid gap-2 text-sm font-bold">Instructions <span className="font-normal text-muted">(optional)</span><textarea value={homeworkInstructions} onChange={event => setHomeworkInstructions(event.target.value)} rows={4} className="rounded-xl border border-line p-3 font-normal" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setHomeworkDay(null)} className="min-h-10 rounded-xl px-4 text-sm font-bold text-muted">Cancel</button><button type="button" onClick={() => void addHomework()} disabled={!homeworkTitle.trim() || !homeworkTime || saving !== null} className="min-h-10 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-40">Create homework</button></div></div>
    </div>}
  </section>;
}
