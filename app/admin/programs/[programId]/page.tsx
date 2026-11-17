"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, cohortsApi, levelProfilesApi, programsApi, teachersApi, topicsApi } from "@/lib/api/client";
import type { CohortPublic, LevelProfilePublic, ProgramPublic, TopicListItem, UnlockPolicy, UserPublic } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { LEVEL_LABEL } from "@/lib/topics/helpers";
import { ProgramTopicManager } from "@/components/admin/programs/ProgramTopicManager";
import { StageListEditor } from "@/components/admin/programs/StageListEditor";

type WorkspaceTab = "overview" | "curriculum" | "batches" | "analytics";

export default function ProgramWorkspacePage() {
  const { state } = useAuth();
  const { t } = useI18n();
  const params = useParams<{ programId: string }>();
  const programId = params.programId;

  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [programs, setPrograms] = useState<ProgramPublic[]>([]);
  const [cohorts, setCohorts] = useState<CohortPublic[]>([]);
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [teachers, setTeachers] = useState<UserPublic[]>([]);
  const [profiles, setProfiles] = useState<LevelProfilePublic[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const isAdmin = state.status === "authenticated" && state.user.role === "administrator";

  const load = useCallback(async () => {
    try {
      // `GET /teachers` is Administrator-only - calling it unconditionally
      // inside this Promise.all made the whole load (and therefore this
      // Program's own data) fail with a 403 for any Teacher opening their
      // own assigned Program, surfacing as a false "This Program wasn't
      // found" instead of the real cause.
      const [programItems, cohortItems, topicItems, profileItems] = await Promise.all([
        programsApi.list(), cohortsApi.list(), topicsApi.list({ limit: 200 }), levelProfilesApi.list(),
      ]);
      setPrograms(programItems); setCohorts(cohortItems.filter(c => c.program_id === programId)); setTopics(topicItems); setProfiles(profileItems);
      if (isAdmin) {
        const teacherPage = await teachersApi.listTeachersPage({ page: 1, limit: 100 });
        setTeachers(teacherPage.items);
      }
    } catch { setLoadFailed(true); }
    finally { setLoaded(true); }
  }, [programId, isAdmin]);

  // Initial API synchronization; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (state.status === "authenticated") void load(); }, [state, load]);

  if (state.status !== "authenticated") return null;
  const canManageProgram = state.user.role === "administrator";
  const program = programs.find(p => p.id === programId);

  if (loaded && (!program || loadFailed)) {
    return <main className="mx-auto max-w-4xl p-4 md:p-8">
      <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("programWorkspace.notFound")}</p>
      <Link href="/admin/programs" className="mt-3 inline-block text-sm font-bold text-brand-blue">{t("programWorkspace.backToPrograms")}</Link>
    </main>;
  }

  const activeCohorts = cohorts.filter(c => c.status === "active");
  const totalStudents = cohorts.reduce((sum, c) => sum + c.student_count, 0);
  const studentsByStage = new Map<string, number>();
  // Honest, real numbers only: per-stage totals come straight from each
  // Cohort's own `student_count` (no invented metric) - a stage with no
  // Cohort running it simply has no row here, not a fabricated zero-chart.
  for (const cohort of cohorts) {
    for (const stageId of cohort.program_level_ids) {
      studentsByStage.set(stageId, (studentsByStage.get(stageId) ?? 0) + cohort.student_count / cohort.program_level_ids.length);
    }
  }

  const TABS: { key: WorkspaceTab; label: string }[] = [
    { key: "overview", label: t("programWorkspace.tabOverview") },
    { key: "curriculum", label: t("programWorkspace.tabCurriculum") },
    { key: "batches", label: t("programWorkspace.tabBatches") },
    { key: "analytics", label: t("programWorkspace.tabAnalytics") },
  ];

  return <main className="mx-auto max-w-6xl p-4 pb-28 md:p-8 lg:pb-8">
    <Link href="/admin/programs" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-blue">
      <span aria-hidden="true" className="me-1.5 inline-block rtl:rotate-180">←</span>{t("programWorkspace.backToPrograms")}
    </Link>
    <header className="mb-6 mt-2">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{program?.language}</p>
      <h1 className="mt-2 text-2xl font-bold md:text-3xl">{program?.name}</h1>
      <p className="mt-1 text-sm text-muted">{program?.description || program?.code}</p>
    </header>

    <nav className="mb-6 flex flex-wrap gap-2 border-b border-line" aria-label={t("programWorkspace.tabsLabel")}>
      {TABS.map(item => (
        <button key={item.key} onClick={() => setTab(item.key)}
          className={`min-h-11 border-b-2 px-3 text-sm font-bold ${tab === item.key ? "border-brand-blue text-brand-blue" : "border-transparent text-muted"}`}>
          {item.label}
        </button>
      ))}
    </nav>

    {!program && !loaded && <p className="text-sm text-muted">{t("common.loading")}</p>}

    {program && tab === "overview" && (
      <section className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{t("programWorkspace.statStages")}</p><p className="mt-1 text-2xl font-bold">{program.levels.length}</p></div>
          <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{t("programWorkspace.statActiveBatches")}</p><p className="mt-1 text-2xl font-bold">{activeCohorts.length}</p></div>
          <div className="rounded-2xl border border-line bg-card p-4"><p className="text-xs text-muted">{t("programWorkspace.statStudents")}</p><p className="mt-1 text-2xl font-bold">{totalStudents}</p></div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold">{t("programWorkspace.stagesHeading")}</h2><p className="mt-1 text-xs text-muted">{t("programWorkspace.durationManagedByBatches")}</p></div><span className="rounded-full bg-bg px-3 py-1 text-xs font-bold">{t("programWorkspace.programLanguage")}: {program.language}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">
            {program.levels.map(stage => <span key={stage.id} className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-bold text-brand-blue">{stage.name} · {LEVEL_LABEL[stage.difficulty_level]}</span>)}
          </div>
          {program.description && <p className="mt-4 text-sm text-muted">{program.description}</p>}
        </div>
        {activeCohorts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-brand-blue bg-brand-primary-pale p-5">
            <p className="text-sm font-bold text-brand-blue">{t("programWorkspace.noBatchesYetTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("programWorkspace.noBatchesYetBody")}</p>
            <button onClick={() => setTab("batches")} className="mt-3 min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">{t("programWorkspace.createFirstBatch")}</button>
          </div>
        )}
      </section>
    )}

    {program && tab === "curriculum" && (
      <section className="grid gap-4">
        <div className="rounded-2xl border border-line bg-card p-5"><ProgramTopicManager program={program} topics={topics} canManage={canManageProgram} /></div>
        {canManageProgram && <details className="rounded-2xl border border-line bg-card p-5">
          <summary className="cursor-pointer text-sm font-bold text-brand-blue">{t("programWorkspace.advancedSettings")}</summary>
          <p className="mt-2 text-sm text-muted">{t("programWorkspace.advancedDescription")}</p>
          <div className="mt-4 border-t border-line pt-4"><ProgramStagesEditor program={program} profiles={profiles} onSaved={load} /></div>
        </details>}
      </section>
    )}

    {program && tab === "batches" && (
      <BatchesTab program={program} cohorts={cohorts} teachers={teachers} onChanged={load} />
    )}

    {program && tab === "analytics" && (
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-sm font-bold">{t("programWorkspace.analyticsHeading")}</h2>
        <p className="mt-1 text-xs text-muted">{t("programWorkspace.analyticsNote")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {program.levels.map(stage => (
            <div key={stage.id} className="rounded-xl border border-line p-4">
              <p className="text-xs font-bold uppercase text-muted">{stage.name}</p>
              <p className="mt-1 text-xl font-bold">{Math.round(studentsByStage.get(stage.id) ?? 0)}</p>
              <p className="text-xs text-muted">{t("programWorkspace.studentsEnrolled")}</p>
            </div>
          ))}
          {program.levels.length === 0 && <p className="text-sm text-muted">{t("programWorkspace.noStages")}</p>}
        </div>
      </section>
    )}
  </main>;
}

function ProgramStagesEditor({ program, profiles, onSaved }: { program: ProgramPublic; profiles: LevelProfilePublic[]; onSaved: () => void }) {
  const { t } = useI18n();
  const [stages, setStages] = useState(program.levels);
  const [unlockPolicy, setUnlockPolicy] = useState<UnlockPolicy>(program.unlock_policy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Keeps the editor in sync after a save elsewhere reloads the Program.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setStages(program.levels); setUnlockPolicy(program.unlock_policy); }, [program.levels, program.unlock_policy]);

  const save = async () => {
    setSaving(true); setError("");
    try {
      await programsApi.update(program.id, {
        code: program.code, name: program.name, language: program.language, description: program.description,
        base_levels: Array.from(new Set(stages.map(stage => stage.difficulty_level))),
        level_profile_ids: Array.from(new Set(stages.filter(stage => stage.level_profile_id).map(stage => stage.level_profile_id as string))),
        levels: stages,
        unlock_policy: unlockPolicy,
      });
      onSaved();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("programs.saveError")); }
    finally { setSaving(false); }
  };

  return <div className="grid gap-3">
    <StageListEditor stages={stages} onChange={setStages} profiles={profiles} />
    <fieldset className="rounded-2xl border border-line bg-page p-4">
      <legend className="px-1 text-sm font-bold">{t("programs.unlockPolicyLabel")}</legend>
      <p className="mb-3 text-sm text-muted">{t("programs.unlockPolicyHelp")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${unlockPolicy === "schedule" ? "border-brand-blue bg-brand-primary-pale text-brand-blue" : "border-line bg-card text-muted"}`}>
          <input type="radio" name="unlock_policy" className="accent-brand-blue" checked={unlockPolicy === "schedule"} onChange={() => setUnlockPolicy("schedule")} />
          {t("programs.unlockPolicySchedule")}
        </label>
        <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${unlockPolicy === "completion" ? "border-brand-blue bg-brand-primary-pale text-brand-blue" : "border-line bg-card text-muted"}`}>
          <input type="radio" name="unlock_policy" className="accent-brand-blue" checked={unlockPolicy === "completion"} onChange={() => setUnlockPolicy("completion")} />
          {t("programs.unlockPolicyCompletion")}
        </label>
      </div>
    </fieldset>
    {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
    <button onClick={save} disabled={saving || stages.length === 0} className="min-h-11 w-fit rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">
      {saving ? t("common.saving") : t("programs.stagesSave")}
    </button>
  </div>;
}

function BatchesTab({ program, cohorts, teachers, onChanged }: {
  program: ProgramPublic; cohorts: CohortPublic[]; teachers: UserPublic[]; onChanged: () => void;
}) {
  const { t } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [leadTeacherId, setLeadTeacherId] = useState("");
  const [teamTeacherIds, setTeamTeacherIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const teacherName = (id: string) => teachers.find(item => item.id === id)?.full_name ?? id;
  const stageName = (id: string) => program.levels.find(level => level.id === id)?.name ?? id;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true); setError("");
    try {
      await cohortsApi.create({
        name: String(data.get("name")),
        program_id: program.id,
        program_level_ids: stageIds,
        lead_teacher_id: leadTeacherId,
        teacher_assignments: teamTeacherIds.map(teacher_id => ({ teacher_id, program_level_ids: [] })),
        start_date: new Date(String(data.get("start_date"))).toISOString(),
        end_date: data.get("end_date") ? new Date(String(data.get("end_date"))).toISOString() : null,
      });
      form.reset(); setStageIds([]); setLeadTeacherId(""); setTeamTeacherIds([]); setShowForm(false);
      onChanged();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("cohorts.saveError")); }
    finally { setSaving(false); }
  };

  return <section className="grid gap-4">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold">{t("programWorkspace.batchesHeading")}</h2>
      <button onClick={() => setShowForm(current => !current)} className="min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">
        {showForm ? t("programs.stagesCancel") : t("programWorkspace.createBatch")}
      </button>
    </div>

    {showForm && (
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-dashed border-brand-blue bg-card p-5">
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.name")}
          <input name="name" required minLength={2} className="min-h-11 rounded-xl border border-line px-3 font-normal" />
        </label>
        <fieldset>
          <legend className="text-sm font-bold">{t("cohorts.stages")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {program.levels.map(stage => <label key={stage.id} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm ${stageIds.includes(stage.id) ? "border-brand-blue bg-brand-primary-pale" : "border-line"}`}>
              <input type="checkbox" checked={stageIds.includes(stage.id)} onChange={event => setStageIds(current => event.target.checked ? [...current, stage.id] : current.filter(id => id !== stage.id))} />
              {stage.name}
            </label>)}
          </div>
        </fieldset>
        <label className="grid gap-1 text-sm font-bold">{t("cohorts.leadTeacher")}
          <select required value={leadTeacherId} onChange={event => setLeadTeacherId(event.target.value)} className="min-h-11 rounded-xl border border-line px-3 font-normal">
            <option value="" disabled>{t("cohorts.selectTeacher")}</option>
            {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
          </select>
        </label>
        <fieldset className="rounded-xl border border-line bg-page p-3"><legend className="px-1 text-sm font-bold">Teaching team <span className="font-normal text-muted">(optional)</span></legend><p className="mb-2 text-xs text-muted">Add teachers who can teach this Batch. The lead teacher manages every selected stage.</p><div className="flex flex-wrap gap-2">{teachers.filter(teacher => teacher.id !== leadTeacherId).map(teacher => <label key={teacher.id} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm ${teamTeacherIds.includes(teacher.id) ? "border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}><input type="checkbox" checked={teamTeacherIds.includes(teacher.id)} onChange={event => setTeamTeacherIds(current => event.target.checked ? [...current, teacher.id] : current.filter(id => id !== teacher.id))} />{teacher.full_name}</label>)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Starts on
          <input name="start_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="min-h-11 rounded-xl border border-line px-3 font-normal" />
        </label><label className="grid gap-1 text-sm font-bold">Ends on <span className="font-normal text-muted">(set later if needed)</span>
          <input name="end_date" type="date" className="min-h-11 rounded-xl border border-line px-3 font-normal" />
        </label></div>
        {error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}
        <button disabled={saving || stageIds.length === 0 || !leadTeacherId} className="min-h-11 w-fit rounded-xl bg-brand-blue px-4 text-sm font-bold text-white disabled:opacity-40">
          {saving ? t("common.saving") : t("cohorts.createSubmit")}
        </button>
      </form>
    )}

    <div className="grid gap-3">
      {cohorts.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-card p-6 text-sm text-muted">{t("programWorkspace.noBatches")}</p>}
      {cohorts.map(cohort => (
        <Link key={cohort.id} href={`/admin/cohorts/${cohort.id}`} className="block rounded-2xl border border-line bg-card p-5 shadow-card hover:border-brand-blue">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{cohort.name}</h3>
              <p className="text-xs text-muted">Teaching team: {teacherName(cohort.lead_teacher_id)}{cohort.teacher_assignments.length ? ` + ${cohort.teacher_assignments.length}` : ""}</p>
              <p className="text-xs text-muted">Starts {new Date(cohort.start_date).toLocaleDateString()} · {cohort.end_date ? `Ends ${new Date(cohort.end_date).toLocaleDateString()}` : "End date to be set"}</p>
            </div>
            <span aria-hidden="true" className="text-brand-blue rtl:rotate-180">→</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {cohort.program_level_ids.map(id => <span key={id} className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-bold text-brand-blue">{stageName(id)}</span>)}
            <span className="rounded-full bg-bg px-3 py-1 text-xs font-bold capitalize text-muted">{cohort.status}</span>
          </div>
        </Link>
      ))}
    </div>
  </section>;
}
