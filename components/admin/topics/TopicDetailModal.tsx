"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogCloseButton } from "@/components/ui/Dialog";
import { ApiError, topicsApi } from "@/lib/api/client";
import type { TopicAdminDetail } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Who created a topic and which students currently have it assigned -
 * fetched on demand (see `topicsApi.getAdminDetail`) rather than carried on
 * every row of the admin Topics page, which only has the title/shared-badge/
 * transcript-state summary. */
export function TopicDetailModal({ topicId, title, onClose }: { topicId: string; title: string; onClose: () => void }) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<TopicAdminDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    topicsApi
      .getAdminDetail(topicId)
      .then(result => {
        if (!cancelled) setDetail(result);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("adminTopics.detailsFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, t]);

  return (
    <Dialog onClose={onClose} dismissOnBackdropClick ariaLabel={t("adminTopics.detailsTitle")} className="max-w-md rounded-2xl border border-line bg-card p-0">
      <div className="relative border-b border-line p-4.5">
        <DialogCloseButton />
        <span className="text-[10px] font-extrabold tracking-wide text-brand-blue">{t("adminTopics.detailsTitle").toUpperCase()}</span>
        <h3 className="m-0 mt-0.5 truncate pe-8 text-[15px]" title={title}>
          {title}
        </h3>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4.5">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !detail && <p className="text-sm text-muted">{t("adminTopics.detailsLoading")}</p>}
        {detail && (
          <div className="flex flex-col gap-4">
            <section>
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{t("adminTopics.createdBy")}</span>
              {detail.created_by_name ? (
                <div className="mt-1">
                  <p className="m-0 text-sm font-bold text-ink">{detail.created_by_name}</p>
                  {detail.created_by_email && <p className="m-0 text-xs text-muted">{detail.created_by_email}</p>}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">{t("adminTopics.createdByUnknown")}</p>
              )}
            </section>
            <section>
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{t("adminTopics.enrolledStudents")}</span>
              <p className="mt-1 text-xs text-muted">{t("adminTopics.enrolledStudentsCount", { count: detail.enrolled_students.length })}</p>
              {detail.enrolled_students.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("adminTopics.noEnrolledStudents")}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {detail.enrolled_students.map(s => (
                    <li key={s.id} className="rounded-lg border border-line bg-bg px-3 py-2">
                      <p className="m-0 text-sm font-bold text-ink">{s.full_name}</p>
                      <p className="m-0 text-xs text-muted">{s.email}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </Dialog>
  );
}
