// 统一空态：一句话说明现状 + 一句可执行的下一步（+ 可选跳转）。
// 之前各页面写法不一，有的只有一句「暂无 XX」就把用户晾住，
// 这里收敛成一个组件，新增页面直接复用即可保持一致。
import Link from "next/link";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#754be6]/25 bg-white/70 p-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#302a38]/60">{description}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#754be6] px-5 text-sm font-semibold text-white"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
