import { redirect } from "next/navigation";

export default async function LegacyPracticePage({ searchParams }: { searchParams: Promise<{ studentId?: string; wrongQuestionId?: string; subject?: string }> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.studentId) params.set("studentId", query.studentId);
  if (query.wrongQuestionId) params.set("wrongQuestionId", query.wrongQuestionId);
  if (query.subject) params.set("subject", query.subject);
  redirect(`/practice${params.size ? `?${params}` : ""}`);
}
