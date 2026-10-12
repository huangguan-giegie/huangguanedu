// 首页入口：用短标题和轻量图标引导到常用学习功能
"use client";

import Link from "next/link";

export interface LinkItem {
  href: string;
  label: string;
  description: string;
}

const ICONS = ["↗", "?", "▦", "✦"];

export function LinkList({ items }: { items: LinkItem[] }) {
  return (
    <div className="link-list-grid">
      {items.map((item, index) => (
        <Link
          key={item.href}
          href={item.href}
          className={`link-card link-card--${index % ICONS.length}`}
        >
          <span className="link-card-icon" aria-hidden="true">{ICONS[index % ICONS.length]}</span>
          <span className="link-card-copy">
            <span className="link-card-label">{item.label}</span>
            <span className="link-card-description">{item.description}</span>
          </span>
          <span className="link-card-arrow" aria-hidden="true">↗</span>
        </Link>
      ))}
    </div>
  );
}
