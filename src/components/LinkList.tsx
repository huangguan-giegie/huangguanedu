// 首页快捷入口列表
"use client";

import Link from "next/link";

export interface LinkItem {
  href: string;
  label: string;
  description: string;
}

export function LinkList({ items }: { items: LinkItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5 shadow-sm transition hover:border-[#e8863a] hover:shadow"
        >
          <div className="font-semibold text-[#1e2a3a]">{item.label}</div>
          <div className="mt-1 text-sm text-[#1e2a3a]/60">{item.description}</div>
        </Link>
      ))}
    </div>
  );
}
