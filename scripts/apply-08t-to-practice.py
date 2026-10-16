#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
apply-08t-to-practice.py · 把 practice.module.css 接入 08T 色板
------------------------------------------------------------------
CSS Modules 的类名是哈希化的，无法被 theme-08t.css 从外部覆盖，
所以这里直接改值 —— 但统一改成 `var(--08t变量, 原值)` 形式：

  · 08T 生效时 → 取 theme-08t.css 里的暖纸色
  · 08T 回退时 → 变量未定义，落到原值，与本文件改前完全等价

即：本改动对「回退」是零成本的（不像直接换色会留下孤儿值）。

幂等：每处替换先校验「旧串恰好出现 1 次」，已替换过的会跳过。
用法：python scripts/apply-08t-to-practice.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'src', 'app', 'practice', 'practice.module.css')

# (旧值, 新值, 说明)
REPL = [
    # ── 中性徽章 / 标签：淡紫底 → 暖纸底 ──
    ("color: #62507d; background: #f0ebfa;",
     "color: var(--tint-badge-ink, #62507d); background: var(--tint-badge-bg, #f0ebfa);",
     "stepBadge/count 徽章"),
    ("color: #71558c; background: #f0eafa;",
     "color: var(--tint-badge-ink, #71558c); background: var(--tint-badge-bg, #f0eafa);",
     "tags 标签"),
    ("border-radius: 7px; color: var(--violet); background: #f0eafa;",
     "border-radius: 7px; color: var(--violet); background: var(--tint-badge-bg, #f0eafa);",
     "questionIndex 序号"),

    # ── 悬停 / 普通底：冷紫白 → 暖纸白 ──
    (".source:hover { border-color: #754be65e; background: #fcfaff; }",
     ".source:hover { border-color: var(--ring-violet, #754be65e); background: var(--tint-hover-bg, #fcfaff); }",
     "source 悬停"),
    (".secondaryButton:hover { border-color: #754be65e; background: #f9f6ff; }",
     ".secondaryButton:hover { border-color: var(--ring-violet, #754be65e); background: var(--tint-warm-bg, #f9f6ff); }",
     "次级按钮悬停"),
    (".answer { margin-top: 14px; padding: 17px; border-radius: 12px; background: #f8f5ff; }",
     ".answer { margin-top: 14px; padding: 17px; border-radius: 12px; background: var(--tint-warm-bg, #f8f5ff); }",
     "答案区底"),

    # ── 选中态：保留紫调（与主色同源），只换描边变量 ──
    (".activeTab { border-color: #754be64d; color: var(--violet); background: #f0ebff; }",
     ".activeTab { border-color: var(--ring-violet-weak, #754be64d); color: var(--violet); background: #f0ebff; }",
     "activeTab 描边"),
    (".selectedSource { border-color: #754be65e; background: #f8f5ff; }",
     ".selectedSource { border-color: var(--ring-violet, #754be65e); background: #f8f5ff; }",
     "selectedSource 描边"),
    (".activeDifficulty { border-color: #754be65e; background: #f8f5ff; }",
     ".activeDifficulty { border-color: var(--ring-violet, #754be65e); background: #f8f5ff; }",
     "activeDifficulty 描边"),
    (".setCard:hover { border-color: #754be65e; transform: translateY(-2px); }",
     ".setCard:hover { border-color: var(--ring-violet, #754be65e); transform: translateY(-2px); }",
     "setCard 悬停描边"),

    # ── 绿色系：酸绿 → 08T 橄榄绿 ──
    (".task { border: 1px solid #d7ef6766; color: #526124; background: #f5f9e9; }",
     ".task { border: 1px solid var(--tint-green-line, #d7ef6766); color: var(--tint-green-ink, #526124); background: var(--tint-green-bg, #f5f9e9); }",
     "task 提示条"),
    ("border-radius: 9px; color: #5e4586; background: #eaf3c1;",
     "border-radius: 9px; color: var(--tint-green-ink, #5e4586); background: var(--tint-green-bg, #eaf3c1);",
     "setIcon"),
    ("border-radius: 18px; color: var(--violet); background: #eaf3c1;",
     "border-radius: 18px; color: var(--violet); background: var(--tint-green-bg, #eaf3c1);",
     "detailMark"),

    # ── 危险色：冷红 → 暖红 ──
    (".error { color: #a44234; background: #fff0eb; }",
     ".error { color: var(--tint-danger-ink, #a44234); background: var(--tint-danger-bg, #fff0eb); }",
     "error 条"),

    # ── 其余冷色 / 纯白 ──
    (".empty { padding: 24px; border: 1px dashed #bcb3cb;",
     ".empty { padding: 24px; border: 1px dashed var(--border-dashed, #bcb3cb);",
     "empty 虚线框"),
    (".questionHint { color: #93899d; font-size: 10px; }",
     ".questionHint { color: var(--muted, #93899d); font-size: 10px; }",
     "questionHint"),
    (".imageDialog::backdrop { background: #302a38b3; }",
     ".imageDialog::backdrop { background: var(--scrim, #302a38b3); }",
     "图片弹层遮罩"),
]

# 纯白背景 → 暖纸面（这些是 08T 下唯一会显得「冷」的地方）
WHITE_TARGETS = [
    (".panel { padding: 24px; border: 1px solid var(--line); border-radius: 22px; background: white; }",
     ".panel { padding: 24px; border: 1px solid var(--line); border-radius: 22px; background: var(--paper-raised, white); }",
     "panel 面板"),
    ("border-radius: 18px; background: white; text-decoration: none;",
     "border-radius: 18px; background: var(--paper-raised, white); text-decoration: none;",
     "setCard 卡片"),
    (".questionCard { padding: 25px; border: 1px solid var(--line); border-radius: 20px; background: white; }",
     ".questionCard { padding: 25px; border: 1px solid var(--line); border-radius: 20px; background: var(--paper-raised, white); }",
     "questionCard"),
    ("border-radius: 20px; background: white; }\n.detailHead p",
     "border-radius: 20px; background: var(--paper-raised, white); }\n.detailHead p",
     "detailHead"),
    ("border-radius: 20px; background: white; }\n.imageDialog::backdrop",
     "border-radius: 20px; background: var(--paper-raised, white); }\n.imageDialog::backdrop",
     "imageDialog"),
    (".tab { color: var(--muted); background: #fff; }",
     ".tab { color: var(--muted); background: var(--paper-raised, #fff); }",
     "tab"),
    ("border-radius: 12px; color: var(--violet); background: white; font-size: 11px; font-weight: 800;",
     "border-radius: 12px; color: var(--violet); background: var(--paper-raised, white); font-size: 11px; font-weight: 800;",
     "secondaryButton"),
]


def main():
    if not os.path.exists(TARGET):
        sys.exit('找不到目标文件：%s' % TARGET)
    src = open(TARGET, encoding='utf-8').read()
    original = src

    applied, skipped, failed = 0, 0, []
    for old, new, label in REPL + WHITE_TARGETS:
        if new in src and old not in src:
            skipped += 1
            print('  · 跳过（已应用） %s' % label)
            continue
        n = src.count(old)
        if n != 1:
            failed.append('%s —— 匹配 %d 次（应为 1）' % (label, n))
            continue
        src = src.replace(old, new)
        applied += 1
        print('  ✓ %s' % label)

    if failed:
        print('\n[中止] 以下替换未按预期匹配，文件未写入：')
        for f in failed:
            print('   ! ' + f)
        sys.exit(1)

    if src == original:
        print('\n无变化（全部已应用过）。')
        return

    open(TARGET, 'w', encoding='utf-8').write(src)
    print('\n[done] 已应用 %d 处，跳过 %d 处；文件 %d 字节' % (applied, skipped, len(src.encode('utf-8'))))
    # 自检：剥掉所有 var(...) 表达式后再搜冷色值 —— 残留即为「裸用法」。
    # 不能只搜色值字符串本身：它们现在合法地存在于 var(--x, 原值) 的 fallback 位置。
    stripped = re.sub(r'var\([^)]*\)', '', src)
    cold = ('#f0ebfa', '#f0eafa', '#754be64d', '#754be65e', '#f5f9e9', '#fff0eb', '#eaf3c1')
    naked = [c for c in cold if c in stripped]
    print('       裸色值残留：%s' % (', '.join(naked) if naked else '无 ✓'))
    print('       var() 包装数：%d' % src.count('var(--'))


if __name__ == '__main__':
    main()
