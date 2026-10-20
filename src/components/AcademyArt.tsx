/**
 * Decorative image assets generated from the Image 2.0 visual direction.
 * The sprite is a single optimized WebP, so all learning cards share one request.
 * Mathematical constructions and question diagrams remain programmatic and exact.
 */
export type AcademyArtKind = "study" | "practice" | "geometry" | "function" | "books" | "review" | "classroom" | "selfstudy";

const ROUTE_ART: Record<string, AcademyArtKind> = {
  "/wrong-questions/new": "practice",
  "/wrong-questions": "books",
  "/review": "review",
  "/practice": "practice",
  "/practice-sets": "practice",
  "/geometry-lab": "geometry",
  "/geometry-editor": "geometry",
  "/math-studio": "function",
  "/bookings": "classroom",
  "/reports": "books",
  "/account": "selfstudy",
  "/teacher/review": "practice",
  "/teacher/students": "classroom",
  "/teacher/summaries": "books",
  "/admin/students": "classroom",
  "/admin/teachers": "classroom",
  "/admin/slots": "selfstudy",
};

export function academyArtFor(href: string): AcademyArtKind {
  return ROUTE_ART[href] ?? "study";
}

export function AcademyArt({
  kind,
  className = "",
}: {
  kind: AcademyArtKind;
  className?: string;
}) {
  // Images are decorative and intentionally do not appear in the accessibility tree.
  return <span className={`academy-art academy-art--${kind} ${className}`} aria-hidden="true" />;
}
