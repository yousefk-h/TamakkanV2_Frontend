"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { TopicListItem } from "@/lib/api/types";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function CourseContentList({ siblings, currentId, onNavigate }: { siblings: TopicListItem[]; currentId: string; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <>
      {siblings.map(sibling => (
        <Link
          key={sibling.id}
          href={`/student/lessons/${sibling.id}`}
          onClick={onNavigate}
          aria-current={sibling.id === currentId ? "page" : undefined}
          className={`grid min-h-12 grid-cols-[26px_1fr] items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 ${sibling.id === currentId ? "bg-brand-primary-pale" : "hover:bg-bg"}`}
        >
          <span className={`grid size-6 place-items-center rounded-[7px] text-xs font-extrabold ${sibling.id === currentId ? "bg-brand-blue text-white" : "bg-line text-muted"}`}>
            {sibling.id === currentId ? "●" : "○"}
          </span>
          <div className="min-w-0">
            <b className="block text-sm">{sibling.title}</b>
            <small className="text-xs text-muted">{t("lessonDetail.videoAndDiscussion")}</small>
          </div>
        </Link>
      ))}
    </>
  );
}

/** Course content for the lesson page.
 * - `xl` and up: the existing right-hand sidebar, unchanged.
 * - Below `xl` (phones and tablets; `part="sheet"`): a compact "Course content" button that opens the lesson list in a bottom
 *   sheet (the shared `Dialog`, styled as a sheet on phones - see `.sheet-dialog` in globals.css), so the lesson
 *   and practice area get the full screen width instead of a stacked list taking space below them. */
export function CourseContent({ siblings, currentId, part }: { siblings: TopicListItem[]; currentId: string; part: "sheet" | "aside" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (part === "sheet") return (
      <div className="xl:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={t("lessonDetail.courseContentCount", { count: siblings.length })}
          onClick={() => setOpen(true)}
          className="flex min-h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full border border-line bg-card px-3.5 py-2 text-start text-xs font-bold text-ink shadow-card"
        >
          {t("lessonDetail.courseContent")}
          <span className="grid min-w-5 place-items-center rounded-full bg-brand-primary-pale px-1.5 text-[11px] font-extrabold leading-5 text-brand-blue">{siblings.length}</span>
          <ChevronDown className="size-4 flex-none text-brand-blue" aria-hidden="true" />
        </button>
        {open && (
          <Dialog onClose={() => setOpen(false)} dismissOnBackdropClick ariaLabel={t("lessonDetail.courseContent")} className="sheet-dialog w-full max-w-[520px] rounded-2xl border border-line bg-card p-0 shadow-card">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-4 py-2">
              <b className="text-sm">{t("lessonDetail.courseContent")}</b>
              <DialogCloseButton className="text-muted" />
            </div>
            <div className="p-2">
              <CourseContentList siblings={siblings} currentId={currentId} onNavigate={() => setOpen(false)} />
            </div>
          </Dialog>
        )}
      </div>
  );

  return (
      <aside className="hidden min-w-0 overflow-hidden rounded-[18px] border border-line bg-card shadow-card xl:sticky xl:top-28 xl:block">
        <div className="flex items-center justify-between border-b border-line px-4.5 py-4">
          <b className="text-xs">{t("lessonDetail.courseContent")}</b>
        </div>
        <div className="max-h-[calc(100vh-120px)] overflow-y-auto p-1.5">
          <CourseContentList siblings={siblings} currentId={currentId} />
        </div>
      </aside>
  );
}
