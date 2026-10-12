import { redirect } from "next/navigation";

export default async function LegacyStudentWrongQuestionsPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  redirect(`/wrong-questions?studentId=${encodeURIComponent(studentId)}`);
}
