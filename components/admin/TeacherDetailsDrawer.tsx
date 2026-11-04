"use client";

import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { Avatar, StatusPill } from "@/components/admin/shared";
import { formatDate } from "@/lib/format";
import type { TeacherDetail } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Administrator only (Center Admin). Read-only Teacher details plus the way into real management
 * (`ManageTeacherModal`) - mirrors `UserDetailsDrawer`, with the two lightweight counts PROMPT-047 asks for
 * (student/topic count) instead of a role/status-only summary. */
export function TeacherDetailsDrawer({ detail, onClose, onManage }: { detail: TeacherDetail; onClose: () => void; onManage: () => void }) {
  const { t } = useI18n();
  const { teacher, student_count, topic_count } = detail;
  return (
    <Dialog
      onClose={onClose}
      dismissOnBackdropClick
      ariaLabel={t("teacherDetailsDrawer.ariaLabel", { name: teacher.full_name })}
      className="w-[min(480px,92vw)] rounded-2xl border border-line bg-card p-5 shadow-[0_30px_80px_rgba(0,0,0,.25)] backdrop:bg-brand-navy/55 backdrop:backdrop-blur-sm md:p-7"
    >
      <DialogCloseButton />
      <div className="flex items-center gap-3 pe-10">
        <Avatar name={teacher.full_name} size="lg" />
        <div className="min-w-0">
          <h2 className="m-0 truncate text-xl tracking-tight text-ink">{teacher.full_name}</h2>
          <p className="m-0 truncate text-sm text-muted">{teacher.email}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{t("teacherDetailsDrawer.status")}</dt>
          <dd className="mt-1">
            <StatusPill status={teacher.is_active ? t("teacherDetailsDrawer.active") : t("teacherDetailsDrawer.inactive")} tone={teacher.is_active ? "excellent" : "default"} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{t("teacherDetailsDrawer.created")}</dt>
          <dd className="mt-1">{formatDate(teacher.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{t("teacherDetailsDrawer.students")}</dt>
          <dd className="mt-1">{student_count}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{t("teacherDetailsDrawer.topics")}</dt>
          <dd className="mt-1">{topic_count}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onManage}
        className="mt-5 w-full rounded-[10px] bg-brand-blue px-4 py-2.5 text-xs font-bold text-white sm:w-fit"
      >
        {t("teacherDetailsDrawer.manageAccount")}
      </button>
    </Dialog>
  );
}
