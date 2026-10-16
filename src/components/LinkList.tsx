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
  "/practice": "∑",
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
    <div className="academy-quick-grid">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="academy-quick-card">
          <span aria-hidden className="academy-quick-card-icon">{symbols[item.href] ?? "→"}</span>
          <span aria-hidden className="academy-quick-card-arrow">↗</span>
          <span className="academy-quick-card-title">{item.label}</span>
          <span className="academy-quick-card-description">{item.description}</span>
        </Link>
      ))}
    </div>
  );
}
