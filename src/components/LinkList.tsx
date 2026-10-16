"use client";
import Link from "next/link";
import { Icon } from "./icons";
import { navigationIcon } from "./academy-navigation";

export interface LinkItem {
  href: string;
  label: string;
  description: string;
}

export function LinkList({ items }: { items: LinkItem[] }) {
  return (
    <div className="academy-quick-grid">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="academy-quick-card">
          <span className="academy-quick-card-icon"><Icon name={navigationIcon(item.href)} size={22} /></span>
          <span className="academy-quick-card-arrow"><Icon name="arrow-right" size={20} /></span>
          <span className="academy-quick-card-title">{item.label}</span>
          <span className="academy-quick-card-description">{item.description}</span>
        </Link>
      ))}
    </div>
  );
}
