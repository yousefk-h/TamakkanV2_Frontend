"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, cohortsApi, programsApi } from "@/lib/api/client";
import type { CohortPublic, ProgramLevelDefinition, ProgramPublic } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";
const DEFAULT_STAGE: ProgramLevelDefinition = { id: "beginner", name: "Beginner", order_index: 0, difficulty_level: "beginner", level_profile_id: null };
const SIMPLE_STAGES: ProgramLevelDefinition[] = [
  DEFAULT_STAGE,
  { id: "intermediate", name: "Intermediate", order_index: 1, difficulty_level: "intermediate", level_profile_id: null },
  { id: "advanced", name: "Advanced", order_index: 2, difficulty_level: "advanced", level_profile_id: null },
];

function programCodeFromName(name: string): string {
  const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52);
  return normalized || `program-${Date.now().toString().slice(-8)}`;
}

/** A clean, searchable catalog - creating and archiving a Program happens
 * here; everything else (stages, Topic Library placement, Batches,
 * analytics) lives in that Program's own Workspace
 * (`/admin/programs/[programId]`), not repeated on every card. */
export default function ProgramsPage() {
  const { state } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [programs, setPrograms] = useState<ProgramPublic[]>([]);
  const [cohorts, setCohorts] = useState<CohortPublic[]>([]);
  const [stages, setStages] = useState<ProgramLevelDefinition[]>([DEFAULT_STAGE]);
  const [programName, setProgramName] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [programItems, cohortItems] = await Promise.all([programsApi.list(), cohortsApi.list()]);
      setPrograms(programItems); setCohorts(cohortItems);
    } catch { setError(t("programs.loadError")); }
  }, [t]);
  useEffect(() => { if (state.status === "authenticated" && state.user.role !== "administrator") router.replace("/admin"); }, [state, router]);
  // Initial API synchronization; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (state.status === "authenticated" && state.user.role === "administrator") void load(); }, [state, load]);
  if (state.status !== "authenticated" || state.user.role !== "administrator") return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const created = await programsApi.create({
        code: String(data.get("code")),
        name: String(data.get("name")),
        language: String(data.get("language")),
        description: String(data.get("description")),
        base_levels: Array.from(new Set(stages.map(stage => stage.difficulty_level))),
        level_profile_ids: Array.from(new Set(stages.filter(stage => stage.level_profile_id).map(stage => stage.level_profile_id as string))),
        levels: stages,
      });
      // Straight into its Workspace - the Overview tab's "Create first Batch"
      // CTA is the obvious next step for a brand-new Program.
      router.push(`/admin/programs/${created.id}`);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t("programs.saveError")); setSaving(false); }
  };

  const filtered = programs.filter(program =>
    !search.trim() || program.name.toLowerCase().includes(search.toLowerCase()) || program.code.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSimpleStage = (stage: ProgramLevelDefinition) => {
    setStages(current => current.some(item => item.id === stage.id)
      ? current.filter(item => item.id !== stage.id)
      : [...current, { ...stage, order_index: current.length }].sort((a, b) => a.order_index - b.order_index).map((item, index) => ({ ...item, order_index: index })));
  };

  return <main className="w-full max-w-none p-4 pb-28 md:px-8 md:py-8 lg:px-10 lg:pb-8">
    <header className="rounded-3xl border border-line bg-card p-5 shadow-card md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">{t("programs.eyebrow")}</p><h1 className="mt-2 text-3xl font-bold md:text-4xl">Programs</h1><p className="mt-2 text-sm leading-6 text-muted">A Program is your reusable curriculum. Create a Batch later to decide the teacher, dates, schedule and students.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowGuide(current => !current)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-brand-blue">How it works</button><button type="button" onClick={() => { setError(""); setProgramName(""); setStages([DEFAULT_STAGE]); setShowCreate(true); }} className="min-h-11 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white">+ Create program</button></div></div>
      {showGuide && <section className="mt-6 grid gap-3 border-t border-line pt-5 md:grid-cols-3"><GuideStep number="1" title="Create a Program" text="Name the curriculum and add its learning stages, such as Beginner or A2." /><GuideStep number="2" title="Build the curriculum" text="Reuse Topics from the Topic Library and place them in the right stage." /><GuideStep number="3" title="Run a Batch" text="Create a Batch for a teacher and dates, then enroll students and set its schedule." /></section>}
    </header>
    <section className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Your programs</h2><p className="mt-1 text-sm text-muted">{programs.length} curriculum program{programs.length === 1 ? "" : "s"} in this center</p></div><div className="w-full sm:w-80"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by program name or code" className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm" /></div></div>
      {filtered.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-line bg-card p-8 text-sm text-muted">{search ? "No programs match this search." : t("programs.empty")}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(program => {
          const programCohorts = cohorts.filter(c => c.program_id === program.id);
          const activeCohorts = programCohorts.filter(c => c.status === "active").length;
          const totalStudents = programCohorts.reduce((sum, c) => sum + c.student_count, 0);
          return (
            <Link key={program.id} href={`/admin/programs/${program.id}`} className="group block min-h-48 rounded-2xl border border-line bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-blue">{program.language}</p>
                  <h2 className="mt-1 text-lg font-bold">{program.name}</h2>
                  <p className="text-xs text-muted">{program.code}</p>
                </div>
                <span aria-hidden="true" className="rounded-full bg-brand-primary-pale px-3 py-1 text-sm font-bold text-brand-blue rtl:rotate-180">→</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center text-xs">
                <span><b className="block text-base">{program.levels.length}</b><span className="text-muted">Stages</span></span>
                <span><b className="block text-base">{activeCohorts}</b><span className="text-muted">Active Batches</span></span>
                <span><b className="block text-base">{totalStudents}</b><span className="text-muted">Students</span></span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
    {showCreate && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-4 md:flex md:items-center md:justify-center" role="dialog" aria-modal="true" aria-label="Create program"><form onSubmit={submit} className="mx-auto my-6 grid w-full max-w-xl gap-5 rounded-3xl bg-card p-5 shadow-2xl md:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-brand-blue">New program</p><h2 className="mt-1 text-2xl font-bold">What will students learn?</h2><p className="mt-1 text-sm text-muted">Give the curriculum a clear name. You will add lessons, then create a Batch for students.</p></div><button type="button" onClick={() => setShowCreate(false)} className="min-h-10 px-2 text-2xl text-muted" aria-label="Close">×</button></div><label className="grid gap-1 text-sm font-bold">Program name<input name="name" value={programName} onChange={event => setProgramName(event.target.value)} required minLength={2} autoFocus placeholder="e.g. English for Work" className="min-h-12 rounded-xl border border-line px-3 font-normal" /></label><input type="hidden" name="code" value={programCodeFromName(programName)} /><label className="grid gap-1 text-sm font-bold">Teaching language<select name="language" defaultValue="English" className="min-h-12 rounded-xl border border-line bg-card px-3 font-normal"><option>English</option><option>Arabic</option><option>French</option><option>German</option><option>Other</option></select></label><label className="grid gap-1 text-sm font-bold">Short description <span className="font-normal text-muted">(optional)</span><textarea name="description" rows={3} placeholder="e.g. Practical English for professionals who use English at work." className="rounded-xl border border-line p-3 font-normal" /></label><fieldset className="rounded-2xl border border-line bg-page p-4"><legend className="px-1 text-sm font-bold">Which stages will this program include?</legend><p className="mb-3 text-sm text-muted">Choose only the stages you need. You can manage the detailed academic settings later.</p><div className="flex flex-wrap gap-2">{SIMPLE_STAGES.map(stage => { const selected = stages.some(item => item.id === stage.id); return <button key={stage.id} type="button" onClick={() => toggleSimpleStage(stage)} className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${selected ? "border-brand-blue bg-brand-primary-pale text-brand-blue" : "border-line bg-card text-muted"}`}>{selected ? "✓ " : "+ "}{stage.name}</button>; })}</div></fieldset>{error && <p role="alert" className="rounded-xl bg-brand-coral-pale p-3 text-sm text-brand-coral">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="min-h-11 rounded-xl px-4 text-sm font-bold text-muted">Cancel</button><button disabled={saving || stages.length === 0} className="min-h-11 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? t("common.saving") : "Create program →"}</button></div></form></div>}
  </main>;
}

function GuideStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="rounded-2xl bg-page p-4"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">{number}</span><h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 text-sm leading-5 text-muted">{text}</p></article>;
}
