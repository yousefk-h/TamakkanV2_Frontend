"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { StudentDetailPage } from "@/components/admin/StudentDetailPage";
import { AssignPlanModal } from "@/components/admin/AssignPlanModal";
import { ManageStudentModal } from "@/components/admin/ManageStudentModal";
import { useStudentsContext } from "@/lib/students/StudentsContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Resolves the student by real backend id within the already-fetched
 * roster (no `GET /users/{id}` endpoint exists - the list already has
 * everything an admin can see, so a client-side lookup is exactly as
 * correct and avoids an extra request). */
export default function AdminStudentDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { students, loading, refetch } = useStudentsContext();
  const [editingPlan, setEditingPlan] = useState(false);
  const [managingAccount, setManagingAccount] = useState(false);
  const student = students?.find(s => s.id === params.id) ?? null;

  if (!student) {
    return (
      <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
        <Link href="/admin/students" className="mb-3.5 inline-block text-sm font-bold text-brand-blue">
          ← {t("adminStudentDetail.backToStudents")}
        </Link>
        <div className="rounded-2xl border border-line bg-card p-8 text-center shadow-card">
          <h2 className="m-0 text-xl">{loading ? t("adminStudentDetail.loading") : t("adminStudentDetail.notFound")}</h2>
          {!loading && <p className="mt-2 text-muted">{t("adminStudentDetail.notFoundDesc")}</p>}
        </div>
      </main>
    );
  }

  return (
    <>
      <StudentDetailPage
        student={student}
        onEditPlan={() => setEditingPlan(true)}
        onManageAccount={() => setManagingAccount(true)}
      />
      {editingPlan && <AssignPlanModal student={student} onClose={() => setEditingPlan(false)} onSaved={refetch} />}
      {managingAccount && (
        <ManageStudentModal
          student={student}
          onClose={() => setManagingAccount(false)}
          onSaved={refetch}
          onDeleted={() => {
            refetch();
            router.push("/admin/students");
          }}
        />
      )}
    </>
  );
}
