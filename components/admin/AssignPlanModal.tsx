"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { TemplateBuilder } from "@/components/admin/calendars/TemplateBuilder";
import { ApiError, programsApi, usersApi } from "@/lib/api/client";
import { useCalendarTemplatesContext } from "@/lib/calendarTemplates/CalendarTemplatesContext";
import { LEVEL_EMOJI, LEVEL_LABEL } from "@/lib/topics/helpers";
import type { AssignPlanRequest, Level, PlanType, ProgramPublic, ProgramTopicPublic, UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/** Local (not UTC) today as YYYY-MM-DD, for the start-date input's default -
 * `Date#toISOString` is UTC and can read as yesterday/tomorrow depending on
 * the admin's own timezone, which is wrong for a plain date picker. */
function todayLocalIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Standard (whole-level curriculum) vs Pro (a calendar template from the
 * admin's own reusable library) plan builder, opened either to invite a
 * brand-new student (`student === null`) or to edit an existing one's
 * assignment. Both real: creating a student calls `usersApi.createStudent`,
 * assigning a plan calls `usersApi.assignPlan` - Standard with
 * `assigned_level`, Pro with `assigned_plan_template_id` (the backend then
 * derives entitlement from that template's own topic set, so there's one
 * source of truth instead of a hand-picked list that could drift from it -
 * see `UserService.assign_plan`). */
export function AssignPlanModal({
  student,
  onClose,
  onSaved,
}: {
  student: UserPublic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { customTemplates, refetch: refetchTemplates } = useCalendarTemplatesContext();

  const [email, setEmail] = useState(student?.email ?? "");
  const [fullName, setFullName] = useState(student?.full_name ?? "");
  const [password, setPassword] = useState(() => (student ? "" : generatePassword()));
  const [planType, setPlanType] = useState<PlanType>(student?.plan ?? "standard");
  const [programs, setPrograms] = useState<ProgramPublic[]>([]);
  const [programTopics, setProgramTopics] = useState<{ programId: string; items: ProgramTopicPublic[] } | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState(student?.program_id ?? "");
  const [selectedLevel, setSelectedLevel] = useState<Level>(student?.assigned_level ?? "beginner");
  const [selectedProgramLevelId, setSelectedProgramLevelId] = useState(student?.program_level_id ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(student?.assigned_plan_template_id ?? "");
  const [startDate, setStartDate] = useState<string>(student?.program_start_date ?? todayLocalIsoDate());
  const [buildingTemplate, setBuildingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdStudent, setCreatedStudent] = useState<UserPublic | null>(null);

  useEffect(() => { programsApi.list().then(setPrograms).catch(() => undefined); }, []);
  useEffect(() => {
    if (!selectedProgramId) return;
    let active = true;
    programsApi.listTopics(selectedProgramId)
      .then(items => { if (active) setProgramTopics({ programId: selectedProgramId, items }); })
      .catch(() => { if (active) setProgramTopics({ programId: selectedProgramId, items: [] }); });
    return () => { active = false; };
  }, [selectedProgramId]);
  const selectedProgram = useMemo(() => programs.find(program => program.id === selectedProgramId) ?? null, [programs, selectedProgramId]);
  const availableProgramLevels = selectedProgram?.levels ?? [];
  const selectedStageTopics = (programTopics?.programId === selectedProgramId ? programTopics.items : [])
    .filter(item => item.program_level_id === selectedProgramLevelId && item.status === "published");

  const canSave = student
    ? (planType === "standard" ? !!selectedProgramId && !!selectedProgramLevelId : !!selectedTemplateId)
    : email.trim().length > 0 && fullName.trim().length > 0 && password.length > 0 && (planType === "standard" ? !!selectedProgramId && !!selectedProgramLevelId : !!selectedTemplateId);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const account = student ?? createdStudent ?? await usersApi.createStudent({ email: email.trim(), password, full_name: fullName.trim() });
      // A plan error must not make a retry create the same account again.
      if (!student) setCreatedStudent(account);
      const studentId = account.id;
      const planBody: AssignPlanRequest =
        planType === "standard"
          ? { plan: "standard", program_id: selectedProgramId, program_level_id: selectedProgramLevelId, start_date: startDate }
          : { plan: "pro", assigned_plan_template_id: selectedTemplateId, start_date: startDate };
      await usersApi.assignPlan(studentId, planBody);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assignPlanModal.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={t("assignPlanModal.ariaLabel")}
      className="max-h-[85vh] w-[min(560px,92vw)] overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <DialogCloseButton />
      <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{student ? t("assignPlanModal.editPlan") : t("assignPlanModal.newStudent")}</span>
      <h2 className="mt-1 mb-2 pe-10 text-2xl tracking-tight text-ink">
        {student ? t("assignPlanModal.updatePlan", { name: student.full_name }) : t("assignPlanModal.invite")}
      </h2>
      <p className="m-0 text-sm leading-relaxed text-muted">{t("assignPlanModal.desc")}</p>

      {!student && (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-bold text-ink">
            {t("assignPlanModal.fullName")}
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder={t("assignPlanModal.fullNamePlaceholder")}
              autoFocus
              className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-ink">
            {t("assignPlanModal.email")}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t("assignPlanModal.emailPlaceholder")}
              className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
            />
          </label>
          <div className="grid gap-1.5">
            <label htmlFor="tempPassword" className="text-sm font-bold text-ink">
              {t("assignPlanModal.tempPassword")}
            </label>
            <div className="flex gap-2">
              <input
                id="tempPassword"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="min-w-0 flex-1 rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="whitespace-nowrap rounded-[9px] border border-line px-3 py-2.5 text-xs font-bold text-brand-blue"
              >
                {t("assignPlanModal.generate")}
              </button>
            </div>
            <small className="font-medium text-muted">{t("assignPlanModal.sharePassword")}</small>
            <p className="text-sm leading-relaxed text-muted">{t("verification.newAccountNote")}</p>
            {createdStudent?.email_verification_delivery === "failed" && <p role="alert" className="text-sm text-brand-coral">{t("verification.deliveryFailed")}</p>}
          </div>
        </div>
      )}

      {planType === "standard" && <label className="mt-4 grid gap-1.5 text-sm font-bold text-ink">
        {t("assignPlanModal.program")}
        <select value={selectedProgramId} onChange={event => { const id = event.target.value; setSelectedProgramId(id); const next = programs.find(program => program.id === id); const stage = next?.levels[0]; setSelectedProgramLevelId(stage?.id ?? ""); if (stage) setSelectedLevel(stage.difficulty_level); }} required className="rounded-[9px] border border-line bg-card px-3 py-2.5 text-sm outline-brand-blue">
          <option value="">{programs.length ? t("assignPlanModal.chooseProgram") : t("assignPlanModal.noPrograms")}</option>
          {programs.map(program => <option key={program.id} value={program.id}>{program.name} · {program.language}</option>)}
        </select>
        {selectedProgram?.description && <small className="font-medium text-muted">{selectedProgram.description}</small>}
      </label>}

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPlanType("standard")}
          className={`rounded-xl border p-3 text-start ${planType === "standard" ? "border-2 border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}
        >
          <b className="block text-sm">{t("assignPlanModal.standardClass")}</b>
          <small className="text-xs text-muted">{t("assignPlanModal.standardClassDesc")}</small>
        </button>
        <button
          type="button"
          onClick={() => setPlanType("pro")}
          className={`rounded-xl border p-3 text-start ${planType === "pro" ? "border-2 border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}
        >
          <b className="block text-sm">{t("assignPlanModal.proCustomPlan")}</b>
          <small className="text-xs text-muted">{t("assignPlanModal.proCustomPlanDesc")}</small>
        </button>
      </div>

      <label className="mt-4 grid gap-1.5 text-sm font-bold text-ink">
        {t("assignPlanModal.startDate")}
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
        />
        <small className="font-medium text-muted">{t("assignPlanModal.startDateHint")}</small>
      </label>

      {planType === "standard" ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {availableProgramLevels.map((stage, i) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => { setSelectedProgramLevelId(stage.id); setSelectedLevel(stage.difficulty_level); }}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-start ${
                  selectedProgramLevelId === stage.id ? "border-2 border-brand-blue bg-brand-primary-pale" : "border-line bg-card"
                }`}
              >
                <span className="text-xl">{LEVEL_EMOJI[stage.difficulty_level]}</span>
                <div>
                  <small className="block text-[10px] font-extrabold tracking-wide text-brand-blue">{t("builder.levelN", { n: i + 1 })}</small>
                  <b className="text-sm">{stage.name}</b>
                  <p className="m-0 text-xs text-muted">{LEVEL_LABEL[stage.difficulty_level]}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-line p-3">
            <b className="text-sm">{t("assignPlanModal.curriculum", { level: availableProgramLevels.find(stage => stage.id === selectedProgramLevelId)?.name ?? LEVEL_LABEL[selectedLevel] })}</b>
            <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto border-t border-line pt-2">
              {selectedStageTopics.map((topic, j) => (
                <p key={topic.id} className="m-0 flex items-center gap-2 text-xs text-muted">
                  <span className="grid size-[18px] flex-none place-items-center rounded-[5px] bg-bg text-[10px]">{j + 1}</span>
                  {topic.topic_title}
                </p>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <label className="grid gap-1.5 text-sm font-bold text-ink">
            {t("assignPlanModal.customTemplateLabel")}
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
            >
              <option value="">{t("assignPlanModal.chooseTemplate")}</option>
              {customTemplates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} ({t("adminCalendars.daysScheduled", { count: template.days.length })})
                </option>
              ))}
            </select>
          </label>
          {customTemplates.length === 0 && <p className="m-0 mt-2 text-xs text-muted">{t("assignPlanModal.noCustomTemplatesYet")}</p>}
          <button type="button" onClick={() => setBuildingTemplate(true)} className="mt-2.5 text-xs font-bold text-brand-blue">
            + {t("assignPlanModal.createNewTemplate")}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canSave || saving}
        onClick={handleSave}
        className="mt-5 w-full rounded-[10px] bg-brand-blue px-4 py-3 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.22)] disabled:opacity-40"
      >
        {saving
          ? t("assignPlanModal.saving")
          : planType === "standard"
            ? t("assignPlanModal.assignClass", { level: availableProgramLevels.find(stage => stage.id === selectedProgramLevelId)?.name ?? LEVEL_LABEL[selectedLevel] })
            : t("assignPlanModal.saveCustomPlan")}
      </button>

      {buildingTemplate && (
        <TemplateBuilder
          templateId={null}
          initialKind="custom"
          initialLevel={null}
          onClose={() => setBuildingTemplate(false)}
          onSaved={refetchTemplates}
        />
      )}
    </Dialog>
  );
}
