// 首页入口：用短标题和轻量图标引导到常用学习功能
"use client";

import Link from "next/link";

import { Icon, type IconName } from "./icons";

export interface LinkItem {
  href: string;
  label: string;
  description: string;
  /**
   * 图标名，必填。
   * 原实现是 `const ICONS = ["→","?","▦","✦"]` + `index % 4` 循环，那意味着
   * 第 5 个卡片和第 1 个卡片长得一样、底色也相同，语义完全错乱。改为由调用方
   * 显式指定，图标与语义绑定。
   */
  icon: IconName;
  /** 卡片图标框的语义色调。缺省 primary。 */
  tone?: "primary" | "warm" | "success" | "info" | "warning";
}

export function LinkList({ items }: { items: LinkItem[] }) {
  return (
    <div className="link-list-grid" data-count={String(items.length)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`link-card link-card--${item.tone ?? "primary"}`}
        >
          <span className="link-card-icon">
            <Icon name={item.icon} size={20} />
          </span>
          <span className="link-card-copy">
            <span className="link-card-label">{item.label}</span>
            <span className="link-card-description">{item.description}</span>
          </span>
          <span className="link-card-arrow">
            <Icon name="arrow-right" size={16} />
          </span>
        </Link>
      ))}
    </div>
  );
}
