"use client";
import Link from "next/link";

export interface LinkItem {
  href: string;
  label: string;
  description: string;
}

const symbols: Record<string, string> = {
  "/wrong-questions/new": "+",
  "/wrong-questions": "✎",
  "/review": "✓",
  "/practice-sets": "∑",
  "/bookings": "◷",
  "/reports": "▤",
  "/account": "⚙",
  "/teacher/review": "✓",
  "/teacher/students": "▥",
  "/teacher/summaries": "▤",
  "/admin/students": "▥",
  "/admin/teachers": "♙",
  "/admin/slots": "◷",
};
export function LinkList({ items }: { items: LinkItem[] }) {
  return (
    <div className="quick-grid">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="quick-card">
          <span aria-hidden className="quick-card-icon">{symbols[item.href] ?? "→"}</span>
          <span aria-hidden className="quick-card-arrow">↗</span>
          <span className="quick-card-title">{item.label}</span>
          <span className="quick-card-description">{item.description}</span>
        </Link>
      ))}
    </div>
  );
}
