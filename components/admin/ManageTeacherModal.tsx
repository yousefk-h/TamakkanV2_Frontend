"use client";

import { useState } from "react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, teachersApi } from "@/lib/api/client";
import type { UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const MIN_PASSWORD_LENGTH = 8;

/** Administrator only (Center Admin). Edit email / reset password / activate-deactivate / delete for one
 * Teacher - same shape and conventions as `ManageStudentModal`, just against the `/teachers` routes. */
export function ManageTeacherModal({
  teacher,
  onClose,
  onSaved,
  onDeleted,
}: {
  teacher: UserPublic;
  onClose: () => void;
  onSaved: (updated: UserPublic) => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();

  const [email, setEmail] = useState(teacher.email);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [activeSaving, setActiveSaving] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const emailChanged = email.trim() !== teacher.email;
  const canSaveEmail = emailChanged && email.trim().length > 0 && email.includes("@");
  const canResetPassword = newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirmPassword;

  const handleSaveEmail = async () => {
    setEmailSaving(true);
    setEmailError(null);
    setEmailSuccess(false);
    try {
      const updated = await teachersApi.updateTeacherEmail(teacher.id, { email: email.trim() });
      onSaved(updated);
      setEmailSuccess(true);
    } catch (err) {
      setEmailError(
        err instanceof ApiError && err.status === 409
          ? t("manageTeacherModal.emailConflict")
          : err instanceof ApiError
            ? err.message
            : t("manageTeacherModal.emailSaveError"),
      );
    } finally {
      setEmailSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      await teachersApi.resetTeacherPassword(teacher.id, { new_password: newPassword });
      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t("manageTeacherModal.passwordSaveError"));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleToggleActive = async () => {
    setActiveSaving(true);
    setActiveError(null);
    try {
      const updated = await teachersApi.setTeacherActive(teacher.id, { is_active: !teacher.is_active });
      onSaved(updated);
    } catch (err) {
      setActiveError(err instanceof ApiError ? err.message : t("manageTeacherModal.activeSaveError"));
    } finally {
      setActiveSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("manageTeacherModal.deleteConfirm", { name: teacher.full_name }))) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await teachersApi.deleteTeacher(teacher.id);
      onDeleted();
      onClose();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("manageTeacherModal.deleteError"));
      setDeleting(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={t("manageTeacherModal.ariaLabel", { name: teacher.full_name })}
      className="max-h-[85vh] w-[min(520px,92vw)] overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <DialogCloseButton />
      <h2 className="mt-1 mb-4 pe-10 text-2xl tracking-tight text-ink">
        {t("manageTeacherModal.title", { name: teacher.full_name })}
      </h2>

      <section className="grid gap-2.5 border-t border-line pt-4">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("manageTeacherModal.emailSectionTitle")}</span>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("manageTeacherModal.emailLabel")}
          <input
            type="email"
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              setEmailSuccess(false);
            }}
            className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
          />
        </label>
        {emailError && <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">{emailError}</p>}
        {emailSuccess && <p className="m-0 text-sm text-brand-blue">{t("manageTeacherModal.emailUpdated")}</p>}
        <button
          type="button"
          disabled={!canSaveEmail || emailSaving}
          onClick={handleSaveEmail}
          className="w-fit rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
        >
          {emailSaving ? t("manageTeacherModal.savingEmail") : t("manageTeacherModal.saveEmail")}
        </button>
      </section>

      <section className="mt-5 grid gap-2.5 border-t border-line pt-4">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("manageTeacherModal.passwordSectionTitle")}</span>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("manageTeacherModal.newPassword")}
          <input
            type="password"
            value={newPassword}
            onChange={e => {
              setNewPassword(e.target.value);
              setPasswordSuccess(false);
            }}
            className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("manageTeacherModal.confirmPassword")}
          <input
            type="password"
            value={confirmPassword}
            onChange={e => {
              setConfirmPassword(e.target.value);
              setPasswordSuccess(false);
            }}
            className="rounded-[9px] border border-line px-3 py-2.5 text-sm outline-brand-blue"
          />
        </label>
        {newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH && (
          <p className="m-0 text-xs text-muted">{t("manageTeacherModal.passwordTooShort")}</p>
        )}
        {newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword && (
          <p className="m-0 text-xs text-brand-coral">{t("manageTeacherModal.passwordMismatch")}</p>
        )}
        {passwordError && <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">{passwordError}</p>}
        {passwordSuccess && <p className="m-0 text-sm text-brand-blue">{t("manageTeacherModal.passwordUpdated")}</p>}
        <button
          type="button"
          disabled={!canResetPassword || passwordSaving}
          onClick={handleResetPassword}
          className="w-fit rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
        >
          {passwordSaving ? t("manageTeacherModal.resettingPassword") : t("manageTeacherModal.resetPassword")}
        </button>
      </section>

      <section className="mt-5 grid gap-2.5 border-t border-line pt-4">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">{t("manageTeacherModal.statusSectionTitle")}</span>
        <p className="m-0 text-sm text-muted">{teacher.is_active ? t("manageTeacherModal.currentlyActive") : t("manageTeacherModal.currentlyInactive")}</p>
        {activeError && <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">{activeError}</p>}
        <button
          type="button"
          disabled={activeSaving}
          onClick={handleToggleActive}
          className="w-fit rounded-[10px] border border-line px-4 py-2.5 text-xs font-bold text-ink disabled:opacity-40"
        >
          {activeSaving ? t("manageTeacherModal.savingActive") : teacher.is_active ? t("manageTeacherModal.deactivate") : t("manageTeacherModal.activate")}
        </button>
      </section>

      <section className="mt-5 grid gap-2.5 border-t border-line pt-4">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-coral">{t("manageTeacherModal.dangerSectionTitle")}</span>
        {deleteError && <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">{deleteError}</p>}
        <button
          type="button"
          disabled={deleting}
          onClick={handleDelete}
          className="w-fit rounded-[10px] border border-brand-coral px-4 py-2.5 text-xs font-bold text-brand-coral disabled:opacity-40"
        >
          {deleting ? t("manageTeacherModal.deleting") : t("manageTeacherModal.deleteTeacher")}
        </button>
      </section>
    </Dialog>
  );
}
