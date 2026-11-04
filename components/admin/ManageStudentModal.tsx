"use client";

import { useState } from "react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, usersApi } from "@/lib/api/client";
import type { UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const MIN_PASSWORD_LENGTH = 8;

/** Edit email / reset password / delete for one of the admin's own students -
 * the Teacher Student Management feature. All three actions reuse the
 * existing per-student ownership check server-side (`UserService
 * .get_own_student`); this modal just gives them a home in the UI next to
 * the existing "Edit Plan" action on `StudentDetailPage`. */
export function ManageStudentModal({
  student,
  onClose,
  onSaved,
  onDeleted,
}: {
  student: UserPublic;
  onClose: () => void;
  onSaved: (updated: UserPublic) => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();

  const [email, setEmail] = useState(student.email);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const emailChanged = email.trim() !== student.email;
  const canSaveEmail = emailChanged && email.trim().length > 0 && email.includes("@");
  const canResetPassword =
    newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirmPassword;

  const handleSaveEmail = async () => {
    setEmailSaving(true);
    setEmailError(null);
    setEmailSuccess(false);
    try {
      const updated = await usersApi.updateStudentEmail(student.id, { email: email.trim() });
      onSaved(updated);
      setEmailSuccess(true);
    } catch (err) {
      setEmailError(
        err instanceof ApiError && err.status === 409
          ? t("manageStudentModal.emailConflict")
          : err instanceof ApiError
            ? err.message
            : t("manageStudentModal.emailSaveError")
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
      await usersApi.resetStudentPassword(student.id, { new_password: newPassword });
      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t("manageStudentModal.passwordSaveError"));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("manageStudentModal.deleteConfirm", { name: student.full_name }))) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await usersApi.deleteStudent(student.id);
      onDeleted();
      onClose();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("manageStudentModal.deleteError"));
      setDeleting(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={t("manageStudentModal.ariaLabel")}
      className="max-h-[85vh] w-[min(520px,92vw)] overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <DialogCloseButton />
      <h2 className="mt-1 mb-4 pe-10 text-2xl tracking-tight text-ink">
        {t("manageStudentModal.title", { name: student.full_name })}
      </h2>

      <section className="grid gap-2.5 border-t border-line pt-4">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">
          {t("manageStudentModal.emailSectionTitle")}
        </span>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("manageStudentModal.emailLabel")}
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
        {emailError && (
          <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
            {emailError}
          </p>
        )}
        {emailSuccess && <p className="m-0 text-sm text-brand-blue">{t("manageStudentModal.emailUpdated")}</p>}
        <button
          type="button"
          disabled={!canSaveEmail || emailSaving}
          onClick={handleSaveEmail}
          className="w-fit rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
        >
          {emailSaving ? t("manageStudentModal.savingEmail") : t("manageStudentModal.saveEmail")}
        </button>
      </section>

      <section className="mt-5 grid gap-2.5 border-t border-line pt-4">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-blue">
          {t("manageStudentModal.passwordSectionTitle")}
        </span>
        <label className="grid gap-1.5 text-sm font-bold text-ink">
          {t("manageStudentModal.newPassword")}
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
          {t("manageStudentModal.confirmPassword")}
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
          <p className="m-0 text-xs text-muted">{t("manageStudentModal.passwordTooShort")}</p>
        )}
        {newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword && (
          <p className="m-0 text-xs text-brand-coral">{t("manageStudentModal.passwordMismatch")}</p>
        )}
        {passwordError && (
          <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
            {passwordError}
          </p>
        )}
        {passwordSuccess && <p className="m-0 text-sm text-brand-blue">{t("manageStudentModal.passwordUpdated")}</p>}
        <button
          type="button"
          disabled={!canResetPassword || passwordSaving}
          onClick={handleResetPassword}
          className="w-fit rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
        >
          {passwordSaving ? t("manageStudentModal.resettingPassword") : t("manageStudentModal.resetPassword")}
        </button>
      </section>

      <section className="mt-5 grid gap-2.5 border-t border-line pt-4">
        <span className="text-[13px] font-extrabold tracking-wide text-brand-coral">
          {t("manageStudentModal.dangerSectionTitle")}
        </span>
        {deleteError && (
          <p role="alert" className="m-0 rounded-lg bg-brand-coral-pale px-3 py-2 text-sm text-brand-coral">
            {deleteError}
          </p>
        )}
        <button
          type="button"
          disabled={deleting}
          onClick={handleDelete}
          className="w-fit rounded-[10px] border border-brand-coral px-4 py-2.5 text-xs font-bold text-brand-coral disabled:opacity-40"
        >
          {deleting ? t("manageStudentModal.deleting") : t("manageStudentModal.deleteStudent")}
        </button>
      </section>
    </Dialog>
  );
}
