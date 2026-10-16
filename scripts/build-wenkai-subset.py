#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build-wenkai-subset.py · 08T 皮肤标题字体（霞鹜文楷）子集化
------------------------------------------------------------------
为「黄冠AI Academy」主站生成标题字体子集。

字符集来源（三合一）：
  1. src/ 下全部 .tsx/.ts/.css 中的汉字 —— 覆盖界面固定文案（实测 937 字）
  2. 常见姓氏 —— 覆盖动态人名（学生姓名会出现在标题里）
  3. 基线拉丁 / 数字 / 中英标点 —— 与原型 build-fonts.py 保持一致

为什么不做全量子集：霞鹜文楷全量约 2.5 万字 / 25MB，全量子集 woff2 约 2.5MB；
而标题字号大、字数少，且正文不用文楷（用户已确认的字体策略）。
未覆盖的字符会 fallback 到 --font-geist-sans / 微软雅黑，不缺字、不显豆腐块。

输出：public/fonts/lxgw-wenkai-title.woff2
用法：pyftsubset 由本脚本内部调用（fontTools.subset）
"""
import os, sys, re
from fontTools import subset as _subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
RAW = os.path.join(ROOT, 'deliverables', 'ui-styles-2026-10-13', 'fonts', 'raw',
                   'LXGWWenKai-Medium.ttf')
OUT_DIR = os.path.join(ROOT, 'public', 'fonts')
OUT = os.path.join(OUT_DIR, 'lxgw-wenkai-title.woff2')
CHARS_FILE = os.path.join(ROOT, 'scripts', '.wenkai-chars.txt')

# 常见姓氏（百家姓主干）—— 覆盖动态人名
SURNAMES = (
    "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章"
    "云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常"
    "乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅"
    "庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡"
    "凌霍虞万支柯管卢莫房裘解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊惠甄曲"
    "家封芮储靳松井段富巫乌焦巴弓牧山谷车侯全班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘景詹"
    "束龙叶幸司韶黎薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔胥能苍双闻莘党翟谭贡劳姬申"
    "扶堵冉宰郦雍桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎充连茹习宦艾鱼容向古易慎戈"
    "廖庾终居衡步都耿满弘匡国文寇广禄阙东欧沃利蔚越师巩聂晁勾融冷辛那简饶空曾沙养鞠"
    "须丰巢关相查后荆红游权盖益桓"
)

# 基线：拉丁 / 数字 / 中英标点（与原型 build-fonts.py 同源）
BASELINE = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "
    ".,:;!?()[]{}<>/\\|*+-=%#@&~'\"`^_·—–…。，、；：！？（）《》「」『』“”‘’"
    "①②③④⑤⑥⑦⑧⑨⑩★✦●○△∽∥°±×÷…−√≤≥≠∞△□○"
)


def collect():
    chars = set(BASELINE) | set(SURNAMES)
    files = 0
    for root, dirs, fs in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in ('generated', 'node_modules')]
        for f in fs:
            if f.endswith(('.tsx', '.ts', '.css')):
                files += 1
                try:
                    txt = open(os.path.join(root, f), encoding='utf-8').read()
                except Exception:
                    continue
                chars.update(c for c in txt if '\u4e00' <= c <= '\u9fff')
    for c in ('\n', '\r', '\t', '\u200b'):
        chars.discard(c)
    cjk = sum(1 for c in chars if '\u4e00' <= c <= '\u9fff')
    print('[scan] %d 个源文件，字符集 %d 个（其中汉字 %d）' % (files, len(chars), cjk))
    return ''.join(sorted(chars))


def main():
    if not os.path.exists(RAW):
        sys.exit('缺少原始字体：%s' % RAW)
    os.makedirs(OUT_DIR, exist_ok=True)

    chars = collect()
    open(CHARS_FILE, 'w', encoding='utf-8').write(chars)

    size_before = os.path.getsize(RAW) / 1024 / 1024
    _subset.main([
        RAW,
        '--text-file=%s' % CHARS_FILE,
        '--flavor=woff2',
        "--layout-features=''",
        '--no-hinting',
        '--desubroutinize',
        '--output-file=%s' % OUT,
    ])
    size_after = os.path.getsize(OUT) / 1024
    print('[done] %s' % OUT)
    print('       原始 %.1fMB → 子集 %.1fKB（%.2f%%）' % (
        size_before, size_after, size_after / 1024 / size_before * 100))

    # 覆盖自检：源码里出现过的标题级汉字是否都在子集里
    from fontTools.ttLib import TTFont
    f = TTFont(OUT)
    covered = set()
    for t in f['cmap'].tables:
        covered.update(t.cmap.keys())
    missing = [c for c in chars if ord(c) not in covered]
    print('       子集覆盖 %d 字符，缺失 %d' % (len(covered), len(missing)))
    if missing:
        print('       缺失样例：%s' % ''.join(missing[:40]))


if __name__ == '__main__':
    main()
