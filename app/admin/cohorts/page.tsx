"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, cohortsApi, programsApi, teachersApi, usersApi } from "@/lib/api/client";
import type { CohortPublic, EnrollmentPublic, LateJoinMode, ProgramPublic, ProgramTopicPublic, UserPublic } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function stageName(program: ProgramPublic | undefined, stageId: string): string {
  return program?.levels.find(level => level.id === stageId)?.name ?? stageId;
}

function teacherName(teachers: UserPublic[], teacherId: string, currentUser?: { id: string; full_name: string }): string {
  if (currentUser && currentUser.id === teacherId) return currentUser.full_name;
  return teachers.find(t => t.id === teacherId)?.full_name ?? teacherId;
}

function CohortRoster({ cohort, program, isAdmin, students }: {
  cohort: CohortPublic; program: ProgramPublic | undefined; isAdmin: boolean; students: UserPublic[];
}) {
  const { t } = useI18n();
  const [roster, setRoster] = useState<EnrollmentPublic[] | null>(null);
  const [topics, setTopics] = useState<ProgramTopicPublic[] | null>(null);
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState(cohort.program_level_ids[0] ?? "");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [lateJoinMode, setLateJoinMode] = useState<LateJoinMode>("current_day");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [rosterItems, topicItems] = await Promise.all([
      cohortsApi.roster(cohort.id),
      isAdmin ? Promise.resolve(null) : cohortsApi.topics(cohort.id),
    ]);
    setRoster(rosterItems);
    if (topicItems) setTopics(topicItems);
  }, [cohort.id, isAdmin]);

  // Initial roster/topics fetch on open; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) void load(); }, [open, load]);

  const enrolledIds = new Set((roster ?? []).map(e => e.student_id));
  const filtered = students.filter(s =>
    !enrolledIds.has(s.id) && (s.full_name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()))
  );

  const submitEnroll = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      await cohortsApi.enrollStudents(cohort.id, { student_ids: picked, program_level_id: stageId, late_join_mode: lateJoinMode });
      setPicked([]); setSearch("");
      await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("cohorts.saveError")); }
    finally { setSaving(false); }
  };

  return <div className="mt-4 border-t border-line pt-3">
    <button onClick={() => setOpen(current => !current)} className="min-h-10 text-sm font-bold text-brand-blue">
      {open ? t("cohorts.rosterHide") : t("cohorts.rosterShow")}
    </button>
    {open && <div className="mt-3 grid gap-3">
      <ul className="grid gap-1">
        {(roster ?? []).length === 0 && <li className="text-sm text-muted">{t("cohorts.rosterEmpty")}</li>}
        {(roster ?? []).map(enrollment => (
          <li key={enrollment.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
            <span>{enrollment.student_name ? `${enrollment.student_name} (${enrollment.student_email})` : enrollment.student_id} — {stageName(program, enrollment.program_level_id)}</span>
            {isAdmin && <button onClick={async () => { await cohortsApi.removeStudent(cohort.id, enrollment.student_id); await load(); }} className="text-xs font-bold text-brand-coral">{t("cohorts.removeStudent")}</button>}
          </li>
        ))}
      </ul>

      {!isAdmin && topics && <div className="grid gap-1">
        <h3 className="text-sm font-bold">{t("cohorts.teachableLessons")}</h3>
        {topics.length === 0 && <p className="text-sm text-muted">{t("cohorts.teachableLessonsEmpty")}</p>}
        <ul className="grid gap-1">{topics.map(item => <li key={item.id} className="rounded-xl border border-line px-3 py-2 text-sm">{item.topic_title} — {stageName(program, item.program_level_id ?? "")}</li>)}</ul>
      </div>}

      {isAdmin && <form onSubmit={submitEnroll} className="grid gap-2 rounded-xl border border-dashed border-brand-blue p-3">
        <h3 className="text-sm font-bold">{t("cohorts.enrollStudents")}</h3>
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.stage")}
          <select value={stageId} onChange={event => setStageId(event.target.value)} className="min-h-10 rounded-lg border border-line px-2 font-normal">
            {cohort.program_level_ids.map(id => <option key={id} value={id}>{stageName(program, id)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.lateJoinMode")}
          <select value={lateJoinMode} onChange={event => setLateJoinMode(event.target.value as LateJoinMode)} className="min-h-10 rounded-lg border border-line px-2 font-normal">
            <option value="current_day">{t("cohorts.lateJoinCurrentDay")}</option>
            <option value="day_one">{t("cohorts.lateJoinDayOne")}</option>
          </select>
        </label>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("cohorts.searchStudents")} className="min-h-10 rounded-lg border border-line px-2 text-sm font-normal" />
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-line p-2">
          {filtered.slice(0, 50).map(student => <label key={student.id} className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={picked.includes(student.id)} onChange={event => setPicked(current => event.target.checked ? [...current, student.id] : current.filter(id => id !== student.id))} />
            {student.full_name} ({student.email})
          </label>)}
          {filtered.length === 0 && <p className="text-sm text-muted">{t("cohorts.noMatchingStudents")}</p>}
        </div>
        <p className="text-xs text-muted">{t("cohorts.selectedCount", { count: String(picked.length) })}</p>
        {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-2 text-sm text-brand-coral">{error}</p>}
        <button disabled={saving || picked.length === 0} className="min-h-10 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">
          {saving ? t("common.saving") : t("cohorts.enrollSubmit")}
        </button>
      </form>}
    </div>}
  </div>;
}

export default function CohortsPage() {
  const { state } = useAuth();
  const { t } = useI18n();
  const isAdmin = state.status === "authenticated" && state.user.role === "administrator";

  const [cohorts, setCohorts] = useState<CohortPublic[]>([]);
  const [programs, setPrograms] = useState<ProgramPublic[]>([]);
  const [teachers, setTeachers] = useState<UserPublic[]>([]);
  const [students, setStudents] = useState<UserPublic[]>([]);

  const [programId, setProgramId] = useState("");
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [leadTeacherId, setLeadTeacherId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [groupSearch, setGroupSearch] = useState("");
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [cohortItems, programItems] = await Promise.all([cohortsApi.list(), programsApi.list()]);
    setCohorts(cohortItems);
    setPrograms(programItems);
    if (isAdmin) {
      const [teacherPage, studentItems] = await Promise.all([
        teachersApi.listTeachersPage({ page: 1, limit: 100 }),
        usersApi.listMyStudents(),
      ]);
      setTeachers(teacherPage.items);
      setStudents(studentItems);
    }
  }, [isAdmin]);

  // Initial API synchronization; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (state.status === "authenticated") void load(); }, [state, load]);

  if (state.status !== "authenticated") return null;

  const selectedProgram = programs.find(p => p.id === programId);

  // Program -> Cohorts hierarchy: a teacher's (or admin's) flat Cohort list
  // grouped by the Program it belongs to, so "which classes am I actually
  // teaching, in which Program" reads as a few clear sections instead of one
  // long undifferentiated list. Reuses the existing Cohort/Program API
  // responses as-is - no new backend grouping endpoint needed.
  const needle = groupSearch.trim().toLowerCase();
  const visibleCohorts = needle
    ? cohorts.filter(cohort => {
        const program = programs.find(p => p.id === cohort.program_id);
        return cohort.name.toLowerCase().includes(needle) || (program?.name.toLowerCase().includes(needle) ?? false);
      })
    : cohorts;
  const groupsById = new Map<string, { key: string; program: ProgramPublic | undefined; cohorts: CohortPublic[] }>();
  for (const cohort of visibleCohorts) {
    const key = cohort.program_id;
    if (!groupsById.has(key)) groupsById.set(key, { key, program: programs.find(p => p.id === key), cohorts: [] });
    groupsById.get(key)!.cohorts.push(cohort);
  }
  const programGroups = Array.from(groupsById.values()).sort((a, b) => (a.program?.name ?? a.key).localeCompare(b.program?.name ?? b.key));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await cohortsApi.create({
        name: String(data.get("name")),
        program_id: programId,
        program_level_ids: stageIds,
        lead_teacher_id: leadTeacherId,
        teacher_assignments: [],
        start_date: new Date(String(data.get("start_date"))).toISOString(),
      });
      // `event.currentTarget` is nulled by React once the event has finished
      // dispatching, which already happened by the time this `await` above
      // resumes - the form reference captured before it stays valid.
      form.reset(); setProgramId(""); setStageIds([]); setLeadTeacherId("");
      await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("cohorts.saveError")); }
    finally { setSaving(false); }
  };

  return <main className="mx-auto max-w-6xl p-4 pb-28 md:p-8 lg:pb-8">
    <header className="mb-6">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("cohorts.eyebrow")}</p>
      <h1 className="mt-2 text-2xl font-bold md:text-3xl">{isAdmin ? t("cohorts.title") : t("cohorts.myTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{isAdmin ? t("cohorts.description") : t("cohorts.myDescription")}</p>
    </header>
    <div className={isAdmin ? "grid gap-6 lg:grid-cols-[400px_1fr]" : "grid gap-4"}>
      {isAdmin && <form onSubmit={submit} className="grid h-fit gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold">{t("cohorts.create")}</h2>
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.name")}
          <input name="name" required minLength={2} className="min-h-11 rounded-xl border border-line px-3 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.program")}
          <select required value={programId} onChange={event => { setProgramId(event.target.value); setStageIds([]); }} className="min-h-11 rounded-xl border border-line px-3 font-normal">
            <option value="" disabled>{t("cohorts.selectProgram")}</option>
            {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        {selectedProgram && <fieldset>
          <legend className="text-sm font-bold">{t("cohorts.stages")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedProgram.levels.map(stage => <label key={stage.id} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm ${stageIds.includes(stage.id) ? "border-brand-blue bg-brand-primary-pale" : "border-line"}`}>
              <input type="checkbox" checked={stageIds.includes(stage.id)} onChange={event => setStageIds(current => event.target.checked ? [...current, stage.id] : current.filter(id => id !== stage.id))} />
              {stage.name}
            </label>)}
          </div>
        </fieldset>}
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.leadTeacher")}
          <select required value={leadTeacherId} onChange={event => setLeadTeacherId(event.target.value)} className="min-h-11 rounded-xl border border-line px-3 font-normal">
            <option value="" disabled>{t("cohorts.selectTeacher")}</option>
            {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.startDate")}
          <input name="start_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="min-h-11 rounded-xl border border-line px-3 font-normal" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
        <button disabled={saving || stageIds.length === 0 || !leadTeacherId} className="min-h-12 rounded-xl bg-brand-blue px-4 font-bold text-white disabled:opacity-40">
          {saving ? t("common.saving") : t("cohorts.createSubmit")}
        </button>
      </form>}

      <section className="grid content-start gap-5">
        {cohorts.length > 0 && <input value={groupSearch} onChange={event => setGroupSearch(event.target.value)}
          placeholder={t("common.searchPlaceholder")} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm" />}
        {cohorts.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("cohorts.empty")}</p>}
        {programGroups.map(group => {
          const isOpen = expandedPrograms[group.program?.id ?? group.key] ?? true;
          const totalStudents = group.cohorts.reduce((sum, cohort) => sum + cohort.student_count, 0);
          const allStages = Array.from(new Set(group.cohorts.flatMap(cohort => cohort.program_level_ids)));
          return <div key={group.key} className="rounded-2xl border border-line bg-bg">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <button type="button" onClick={() => setExpandedPrograms(current => ({ ...current, [group.program?.id ?? group.key]: !isOpen }))}
                className="flex min-w-0 flex-1 items-center gap-2 text-start">
                <span className="text-lg">{isOpen ? "▾" : "▸"}</span>
                <span className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-ink">{group.program?.name ?? group.key}</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {t("cohorts.programGroupCohortCount", { count: String(group.cohorts.length) })}
                    {" · "}{t("cohorts.programGroupStudentCount", { count: String(totalStudents) })}
                    {allStages.length > 0 && ` · ${t("cohorts.programGroupStages")}: ${allStages.map(id => stageName(group.program, id)).join(", ")}`}
                  </p>
                </span>
              </button>
              {group.program && <Link href={`/admin/programs/${group.program.id}`} className="shrink-0 text-sm font-bold text-brand-blue">{t("cohorts.openProgramWorkspace")}</Link>}
            </div>
            {isOpen && <div className="grid gap-3 border-t border-line p-4 pt-4">
              {group.cohorts.map(cohort => <article key={cohort.id} className="rounded-2xl border border-line bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{cohort.name}</h3>
                    <p className="text-xs text-muted">{t("cohorts.leadTeacherLabel")}: {teacherName(teachers, cohort.lead_teacher_id, state.user)}</p>
                    <p className="text-xs text-muted">{t("cohorts.studentCount", { count: String(cohort.student_count) })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/cohorts/${cohort.id}`} className="min-h-10 text-sm font-bold text-brand-blue">{t("cohorts.openWorkspace")}</Link>
                    {isAdmin && <button onClick={async () => { await cohortsApi.archive(cohort.id); await load(); }} className="min-h-10 text-sm font-bold text-brand-coral">{t("cohorts.archive")}</button>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {cohort.program_level_ids.map(id => <span key={id} className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-bold text-brand-blue">{stageName(group.program, id)}</span>)}
                </div>
                <CohortRoster cohort={cohort} program={group.program} isAdmin={isAdmin} students={students} />
              </article>)}
            </div>}
          </div>;
        })}
      </section>
    </div>
  </main>;
}
