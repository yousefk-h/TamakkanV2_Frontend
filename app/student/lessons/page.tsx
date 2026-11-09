import { redirect } from "next/navigation";

/** Legacy catalogue entry point.  Individual lesson-player deep links stay
 * at /student/lessons/[topicId]; only the competing list is consolidated.
 */
export default function StudentLessonsPage() {
  redirect("/student/enrollments");
}
