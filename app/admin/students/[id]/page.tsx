"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { StudentDetailPage } from "@/components/admin/StudentDetailPage";
import { AssignPlanModal } from "@/components/admin/AssignPlanModal";
import { ManageStudentModal } from "@/components/admin/ManageStudentModal";
import { usersApi } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import type { UserPublic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** A dedicated `GET /users/{id}` lookup (authorized the same way "My
 * Students"/the Learning Journey already are - an active Enrollment in a
 * Cohort this caller teaches, OR the existing created_by_id ownership),
 * not a client-side search of an already-fetched roster - that roster
 * (`useStudentsContext`, `GET /users`) is scoped to students this caller
 * personally *created*, which never included a Cohort-enrolled-only
 * student at all and was the real cause of a false "Student not found"
 * for an otherwise fully-authorized Teacher. */
export default function AdminStudentDetailPage() {
  const { t } = useI18n();
  const { state } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [student, setStudent] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [managingAccount, setManagingAccount] = useState(false);

  const refetch = useCallback(async () => {
    try {
      setStudent(await usersApi.getStudent(params.id));
    } catch {
      // 404 (no such student) and 403 (not authorized to view this one)
      // are deliberately shown the same way - neither should ever reveal
      // to this caller whether a student they aren't authorized for
      // actually exists.
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  // Initial fetch; updates happen after requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refetch(); }, [refetch]);

  // A Teacher's natural entry point is their own "My Students" page (no
  // "My Classes"-style legacy roster in their nav at all); an Admin's is
  // the center-wide Students page - "Back" must return to whichever one
  // this caller actually has, not a page only an Admin can use.
  const isTeacher = state.status === "authenticated" && state.user.role === "teacher";
  const backHref = isTeacher ? "/admin/my-students" : "/admin/students";

  if (!student) {
    return (
      <main className="mx-auto max-w-[1510px] px-4 py-7 md:px-7.5">
        <Link href={backHref} className="mb-3.5 inline-block text-sm font-bold text-brand-blue">
          ← {t("adminStudentDetail.backToStudents")}
        </Link>
        <div className="rounded-2xl border border-line bg-card p-8 text-center shadow-card">
          <h2 className="m-0 text-xl">{loading ? t("adminStudentDetail.loading") : t("adminStudentDetail.notFound")}</h2>
          {!loading && notFound && <p className="mt-2 text-muted">{t("adminStudentDetail.notFoundDesc")}</p>}
        </div>
      </main>
    );
  }

  return (
    <>
      <StudentDetailPage
        student={student}
        backHref={backHref}
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
            router.push(backHref);
          }}
        />
      )}
    </>
  );
}
