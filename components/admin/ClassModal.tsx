"use client";

import { useState } from "react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, classesApi } from "@/lib/api/client";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import type { ClassKind, CreateLiveClassRequest, LiveClassPublic, UpdateLiveClassRequest } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const DEFAULT_DURATION_MINUTES = 45;

/** `datetime-local`'s value ("YYYY-MM-DDTHH:mm") has no timezone of its own -
 * treated here as UTC wall-clock time directly, matching how every other
 * timestamp in this app is displayed in a fixed UTC (see `formatDate`/
 * `formatDateTime`). What the admin types is exactly what gets stored and
 * shown back - no local-timezone guessing either direction. */
function localInputToIso(value: string): string {
  return new Date(`${value}:00.000Z`).toISOString();
}

function isoToLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

/** Schedule a new Group/1:1 class, or edit an existing one's time/title/Meet
 * link. Participants are only chosen at creation - `kind` decides which of
 * the admin's own students are eligible (Standard for Group, Pro for 1:1,
 * exactly one for 1:1) - editing them afterward isn't supported by the
 * backend; cancel and recreate covers that rare case instead. */
export function ClassModal({
  liveClass,
  onClose,
  onSaved,
}: {
  liveClass: LiveClassPublic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { students } = useStudentsContext();

  const [kind, setKind] = useState<ClassKind>(liveClass?.kind ?? "group");
  const [title, setTitle] = useState(liveClass?.title ?? "");
  const [scheduledAt, setScheduledAt] = useState(liveClass ? isoToLocalInput(liveClass.scheduled_at) : "");
  const [durationMinutes, setDurationMinutes] = useState(liveClass?.duration_minutes ?? DEFAULT_DURATION_MINUTES);
  const [meetLink, setMeetLink] = useState(liveClass?.meet_link ?? "");
  const [participantIds, setParticipantIds] = useState<Set<string>>(() => new Set(liveClass?.participant_ids ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligiblePlan = kind === "group" ? "standard" : "pro";
  const eligibleStudents = (students ?? []).filter(s => s.plan === eligiblePlan);

  const toggleParticipant = (id: string) =>
    setParticipantIds(prev => {
      if (kind === "one_to_one") return prev.has(id) ? new Set() : new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canSave =
    title.trim().length > 0 &&
    scheduledAt.length > 0 &&
    meetLink.trim().length > 0 &&
    (liveClass || participantIds.size > 0);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (liveClass) {
        const body: UpdateLiveClassRequest = {
          title: title.trim(),
          scheduled_at: localInputToIso(scheduledAt),
          duration_minutes: durationMinutes,
          meet_link: meetLink.trim(),
        };
        await classesApi.update(liveClass.id, body);
      } else {
        const body: CreateLiveClassRequest = {
          kind,
          title: title.trim(),
          scheduled_at: localInputToIso(scheduledAt),
          duration_minutes: durationMinutes,
          meet_link: meetLink.trim(),
          participant_ids: Array.from(participantIds),
        };
        await classesApi.create(body);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("classModal.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={liveClass ? t("classModal.editAria") : t("classModal.scheduleAria")}
      className="max-h-[85vh] w-[min(560px,92vw)] overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <DialogCloseButton />
      <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{liveClass ? t("classModal.editClass") : t("classModal.newClass")}</span>
      <h2 className="mt-1 mb-2 pe-10 text-2xl tracking-tight text-ink">{liveClass ? t("classModal.reschedule") : t("classModal.schedule")}</h2>
      <p className="m-0 text-sm leading-relaxed text-muted">{t("classModal.desc")}</p>

      {!liveClass && (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => { setKind("group"); setParticipantIds(new Set()); }}
            className={`rounded-xl border p-3 text-left ${kind === "group" ? "border-2 border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}
          >
            <b className="block text-sm">{t("classModal.groupClass")}</b>
            <small className="text-xs text-muted">{t("classModal.groupClassDesc")}</small>
          </button>
          <button
            type="button"
            onClick={() => { setKind("one_to_one"); setParticipantIds(new Set()); }}
            className={`rounded-xl border p-3 text-left ${kind === "one_to_one" ? "border-2 border-brand-blue bg-brand-primary-pale" : "border-line bg-card"}`}
          >
            <b className="block text-sm">{t("classModal.oneToOneCoaching")}</b>
            <small className="text-xs text-muted">{t("classModal.oneToOneCoachingDesc")}</small>
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("classModal.title")}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t("classModal.titlePlaceholder")}
            autoFocus
            className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold text-ink">
            {t("classModal.dateTime")}
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-ink">
            {t("classModal.duration")}
            <input
              type="number"
              min={10}
              max={180}
              value={durationMinutes}
              onChange={e => setDurationMinutes(Number(e.target.value))}
              className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("classModal.meetLink")}
          <input
            value={meetLink}
            onChange={e => setMeetLink(e.target.value)}
            placeholder={t("classModal.meetLinkPlaceholder")}
            className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
          />
        </label>
      </div>

      {!liveClass && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <b className="text-sm">
            {kind === "group" ? t("classModal.standardStudents") : t("classModal.proStudents")} {t("classModal.selectedCount", { count: participantIds.size })}
          </b>
          <div className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto border-t border-line pt-2">
            {eligibleStudents.length === 0 && (
              <p className="m-0 text-xs text-muted">
                {eligiblePlan === "standard" ? t("classModal.noStandardStudents") : t("classModal.noProStudents")}
              </p>
            )}
            {eligibleStudents.map(s => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type={kind === "one_to_one" ? "radio" : "checkbox"}
                  checked={participantIds.has(s.id)}
                  onChange={() => toggleParticipant(s.id)}
                  className="accent-brand-blue"
                />
                {s.full_name}
              </label>
            ))}
          </div>
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
        {saving ? t("classModal.saving") : liveClass ? t("classModal.saveChanges") : t("classModal.scheduleClass")}
      </button>
    </Dialog>
  );
}
