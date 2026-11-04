"use client";

import { useState } from "react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, teachersApi } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/** Administrator only (Center Admin). Create a new Teacher account outright - full name, email, a temporary
 * password set directly, same deliberately narrow shape as inviting a new Student (`AssignPlanModal`'s
 * `student === null` case) and as simple as PROMPT-047 asks: no invitation/onboarding flow. */
export function AddTeacherModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = fullName.trim().length > 0 && email.trim().length > 0 && password.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await teachersApi.createTeacher({ email: email.trim(), password, full_name: fullName.trim() });
      onCreated();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t("addTeacherModal.emailConflict")
          : err instanceof ApiError
            ? err.message
            : t("addTeacherModal.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={t("addTeacherModal.ariaLabel")}
      className="max-h-[85vh] w-[min(480px,92vw)] overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <DialogCloseButton />
      <h2 className="mt-1 mb-2 pe-10 text-2xl tracking-tight text-ink">{t("addTeacherModal.title")}</h2>
      <p className="m-0 text-sm leading-relaxed text-muted">{t("addTeacherModal.desc")}</p>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("addTeacherModal.fullName")}
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            autoFocus
            className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("addTeacherModal.email")}
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t("addTeacherModal.emailPlaceholder")}
            className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
          />
        </label>
        <div className="grid gap-1.5">
          <label htmlFor="teacherTempPassword" className="text-sm font-bold text-ink">
            {t("addTeacherModal.tempPassword")}
          </label>
          <div className="flex gap-2">
            <input
              id="teacherTempPassword"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="min-w-0 flex-1 rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="whitespace-nowrap rounded-[9px] border border-line px-3 py-2.5 text-xs font-bold text-brand-blue"
            >
              {t("addTeacherModal.generate")}
            </button>
          </div>
          <small className="font-medium text-muted">{t("addTeacherModal.sharePassword")}</small>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canSave || saving}
        onClick={handleSave}
        className="mt-5 w-fit rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
      >
        {saving ? t("addTeacherModal.saving") : t("addTeacherModal.save")}
      </button>
    </Dialog>
  );
}
