"use client";

import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { Avatar, StatusPill } from "@/components/admin/shared";
import { formatDate } from "@/lib/format";
import type { UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Read-only account details for one row of the Users dashboard, plus a way into the real management actions
 * (`ManageStudentModal`, reused unchanged - edit email / reset password / delete). Kept separate from that modal
 * so the drawer can show fields (role, status, created date) the modal itself has no reason to carry. */
export function UserDetailsDrawer({ student, onClose, onManage }: { student: UserPublic; onClose: () => void; onManage: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={t("userDetailsDrawer.ariaLabel", { name: student.full_name })}
      className="w-[min(480px,92vw)] rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <DialogCloseButton />
      <div className="flex items-center gap-3 pe-10">
        <Avatar name={student.full_name} size="lg" />
        <div className="min-w-0">
          <h2 className="m-0 truncate text-xl tracking-tight text-ink">{student.full_name}</h2>
          <p className="m-0 truncate text-sm text-muted">{student.email}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{t("userDetailsDrawer.role")}</dt>
          <dd className="mt-1">{t("userDetailsDrawer.roleStudent")}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{t("userDetailsDrawer.status")}</dt>
          <dd className="mt-1">
            <StatusPill status={student.is_active ? t("userDetailsDrawer.active") : t("userDetailsDrawer.inactive")} tone={student.is_active ? "excellent" : "default"} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{t("userDetailsDrawer.created")}</dt>
          <dd className="mt-1">{formatDate(student.created_at)}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onManage}
        className="mt-5 w-full rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white sm:w-fit"
      >
        {t("userDetailsDrawer.manageAccount")}
      </button>
    </Dialog>
  );
}
