#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
代码包留档清理工具 —— sun-nav

保留策略（版本号 X.Y.Z 三段分级保留）：
  X 段（主版本）：全局只保留最新 3 个主版本
  Y 段（次版本）：每个主版本下，只保留最新 3 个次版本
  Z 段（修订号）：每个 (主版本, 次版本) 下，最多保留最新 5 个修订号

用法：
  python3 tools/prune-packages.py                     # 清理默认目录 deploy-public
  python3 tools/prune-packages.py --dir <目录>        # 指定目录
  python3 tools/prune-packages.py --dry-run           # 只预览要删除的文件，不实际删除
  python3 tools/prune-packages.py --list              # 打印保留清单

说明：只识别形如 sun-nav-vX.Y.Z.zip 的文件，其余文件不受影响。

版本历史：
  v1.0.0  2026-10-29  首版：X/Y 各留 3、Z 段留 5 的三级保留策略
"""

import argparse
import os
import re
import sys

FILE_RE = re.compile(r'^sun-nav-v(\d+)\.(\d+)\.(\d+)\.zip$', re.IGNORECASE)

# 各级保留数量
KEEP_MAJOR = 3   # X 段
KEEP_MINOR = 3   # Y 段
KEEP_PATCH = 5   # Z 段


def parse_versions(dirpath):
    """扫描目录，返回 [(version_tuple, filename), ...]，已按升序排序"""
    found = []
    for name in os.listdir(dirpath):
        m = FILE_RE.match(name)
        if not m:
            continue
        ver = tuple(int(x) for x in m.groups())
        found.append((ver, name))
    found.sort(key=lambda x: x[0])
    return found


def pick_keep(entries):
    """按三级策略计算保留集合，返回 (keep_names, drop_names)"""
    if not entries:
        return [], []

    # X 段：全局最新 3 个主版本
    majors = sorted({v[0] for v, _ in entries}, reverse=True)[:KEEP_MAJOR]
    keep = []
    for major in majors:
        major_entries = [e for e in entries if e[0][0] == major]

        # Y 段：该主版本下最新 3 个次版本
        minors = sorted({e[0][1] for e in major_entries}, reverse=True)[:KEEP_MINOR]
        for minor in minors:
            minor_entries = [e for e in major_entries if e[0][1] == minor]

            # Z 段：该 (主版本, 次版本) 下最新 5 个修订号
            keep.extend(minor_entries[-KEEP_PATCH:])

    keep_names = sorted({name for _, name in keep})
    keep_set = set(keep_names)
    drop_names = sorted(name for _, name in entries if name not in keep_set)
    return keep_names, drop_names


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_dir = os.path.join(os.path.dirname(here), 'deploy-public')

    ap = argparse.ArgumentParser(description='sun-nav 代码包留档清理')
    ap.add_argument('--dir', default=default_dir, help='代码包所在目录（默认 ../deploy-public）')
    ap.add_argument('--dry-run', action='store_true', help='只预览，不删除')
    ap.add_argument('--list', action='store_true', help='打印保留清单')
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        print('目录不存在：%s' % args.dir)
        return 1

    entries = parse_versions(args.dir)
    if not entries:
        print('未找到任何 sun-nav-vX.Y.Z.zip 文件')
        return 0

    keep, drop = pick_keep(entries)

    print('扫描目录：%s' % args.dir)
    print('共 %d 个代码包' % len(entries))

    if args.list or args.dry_run:
        print('\n保留 %d 个：' % len(keep))
        for n in keep:
            print('  [保留] %s' % n)

    if not drop:
        print('\n无需删除，全部在保留范围内')
        return 0

    print('\n删除 %d 个（超出保留策略）：' % len(drop))
    removed = 0
    for n in drop:
        path = os.path.join(args.dir, n)
        if args.dry_run:
            print('  [将删除] %s' % n)
            continue
        try:
            os.remove(path)
            print('  [已删除] %s' % n)
            removed += 1
        except OSError as e:
            print('  [删除失败] %s：%s' % (n, e))
    if not args.dry_run:
        print('\n已删除 %d 个，剩余 %d 个' % (removed, len(keep)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
