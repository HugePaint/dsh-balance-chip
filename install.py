#!/usr/bin/env python3
"""
把 dsh-balance-chip 装进 DSH 的 profile。

不需要知道对方用的是「桌面应用」还是「dsh web」：脚本会扫描
$DSH_HOME/profiles/ 下所有已存在的 profile，逐个安装。所以两个都用、
或者以后新装一个端，都不用重来。

用法：
    python3 install.py                  # 自动检测，装到所有已存在的 profile
    python3 install.py --list           # 只看检测到哪些 profile，不改动
    python3 install.py --profile web    # 只装指定 profile（可重复）
    python3 install.py --uninstall      # 摘掉启用条目（包目录保留）
    python3 install.py --purge          # 连包目录一起删

$DSH_HOME 默认是 ~/.dsh，可用环境变量覆盖。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG_NAME = "dsh-balance-chip"
ENTRY_ID = "balance-chip"

PAYLOAD = ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml"]

MARKER = "# 账户余额徽标（由 dsh-balance-chip/install.py 添加）"

# 新条目必须走 insert 形式。裸条目（- id: X）在 patch 语义里是"覆盖已有条目"，
# 而本包不在任何 bundle 里，所以那样写不会被加载。
ENTRY_BLOCK = (
    f"{MARKER}\n"
    "- insert:\n"
    f"    - id: {ENTRY_ID}\n"
    f'      name: "{PKG_NAME}"\n'
)

_ID_LINE = re.compile(rf"^[ \t]*-[ \t]*id:[ \t]*{re.escape(ENTRY_ID)}[ \t]*$", re.M)
_INDENTED = re.compile(r"^[ \t]+\S")
_INSERT_LINE = re.compile(r"^[ \t]*-[ \t]*insert:[ \t]*$")


# ---------------------------------------------------------------- profile 检测

def dsh_home() -> Path:
    """DSH 的主目录；环境变量优先。"""
    env = os.environ.get("DSH_HOME")
    return Path(env).expanduser() if env else Path.home() / ".dsh"


def discover_profiles() -> list[Path]:
    """
    列出所有已初始化的 profile。
    @returns 含 package.json 的 profile 目录，按名字排序。
    """
    root = dsh_home() / "profiles"
    if not root.is_dir():
        return []
    return sorted(
        d for d in root.iterdir()
        if d.is_dir() and (d / "package.json").is_file()
    )


# ---------------------------------------------------------------- patch 读写

def has_entry(text: str) -> bool:
    """本插件是否已经在 patch 里出现（裸条目或 insert 块中的条目都算）。"""
    return _ID_LINE.search(text) is not None


def _skip_block(lines: list[str], i: int) -> int:
    """跳过从 i 开始的 YAML 条目：条目行本身，加上其后所有缩进续行。"""
    i += 1
    while i < len(lines) and _INDENTED.match(lines[i]):
        i += 1
    return i


def strip_entry(text: str) -> str:
    """移除本插件的条目，兼容裸条目与 insert 两种写法，连同标记注释。"""
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip() == MARKER:
            i += 1
            while i < len(lines) and lines[i].strip() == "":
                i += 1
            i = _skip_block(lines, i)
            continue

        if _ID_LINE.match(line):
            i = _skip_block(lines, i)
            continue

        if _INSERT_LINE.match(line):
            j = i + 1
            body: list[str] = []
            while j < len(lines) and _INDENTED.match(lines[j]):
                body.append(lines[j])
                j += 1
            # 只有点名了本插件的 insert 块才丢；别的 insert 原样保留
            if not _ID_LINE.search("\n".join(body)):
                out.append(line)
                out.extend(body)
            i = j
            continue

        out.append(line)
        i += 1

    return re.sub(r"\n{3,}", "\n\n", "\n".join(out))


def add_entry(path: Path) -> bool:
    """写入启用条目；已存在则只做规范化。返回是否为新增。"""
    original = path.read_text() if path.exists() else ""
    present = has_entry(original)
    text = strip_entry(original)
    if not text.strip():
        text = (
            "# Your patch layer for this dsh profile, applied after every bundle layer:\n"
            "# a top-level YAML array of loader patch entries (id-targeted config\n"
            "# overrides, disables, and insert lists; `!!js` expressions allowed).\n"
        )
    # 条目之间恰好留一个空行，反复安装也不会越积越多
    next_text = text.rstrip("\n") + "\n\n" + ENTRY_BLOCK
    if next_text != original:
        path.write_text(next_text)
    return not present


def remove_entry(path: Path) -> bool:
    if not path.exists():
        return False
    text = path.read_text()
    if not has_entry(text):
        return False
    path.write_text(strip_entry(text))
    return True


# ---------------------------------------------------------------- 安装 / 卸载

def copy_payload(profile: Path) -> Path:
    """把包文件复制进 profile 的 node_modules；返回目标目录。"""
    manifest = json.loads((HERE / "package.json").read_text())
    if manifest.get("name") != PKG_NAME:
        sys.exit("package.json 的 name 与安装脚本不一致")

    pkg = profile / "node_modules" / PKG_NAME
    if pkg.exists():
        shutil.rmtree(pkg)
    for rel in PAYLOAD:
        src = HERE / rel
        if not src.is_file():
            sys.exit(f"缺少源文件: {src}")
        dst = pkg / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    return pkg


def install_into(profile: Path) -> str:
    """
    安装到单个 profile。
    @returns 一行结果说明。
    """
    pkg = copy_payload(profile)
    added = add_entry(profile / "cordis.patch.yml")
    return f"✅ {profile.name:<10} 包 -> {pkg}\n   {'已写入' if added else '条目已存在（已规范化）'} cordis.patch.yml"


def uninstall_from(profile: Path, purge: bool) -> str:
    """从单个 profile 移除。"""
    removed = remove_entry(profile / "cordis.patch.yml")
    line = f"✅ {profile.name:<10} 启用条目 {'已移除' if removed else '本来就没有'}"
    if purge:
        pkg = profile / "node_modules" / PKG_NAME
        if pkg.exists():
            shutil.rmtree(pkg)
            line += f"\n   已删除 {pkg}"
    return line


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", action="append", default=None,
                    help="profile 名或路径，可重复；默认自动检测全部")
    ap.add_argument("--list", action="store_true", help="只列出检测到的 profile")
    ap.add_argument("--uninstall", action="store_true", help="摘掉启用条目")
    ap.add_argument("--purge", action="store_true", help="连包目录一起删")
    args = ap.parse_args()

    available = discover_profiles()

    if args.list:
        print(f"DSH_HOME = {dsh_home()}")
        if not available:
            print("  (没有检测到任何 profile)")
        for p in available:
            print(f"  - {p.name:<10} {p}")
        return

    if args.profile:
        targets = []
        for raw in args.profile:
            candidate = Path(raw).expanduser()
            if not candidate.is_dir():
                candidate = dsh_home() / "profiles" / raw
            if not candidate.is_dir():
                sys.exit(f"找不到 profile: {raw}")
            targets.append(candidate.resolve())
    else:
        targets = available

    if not targets:
        sys.exit(
            f"在 {dsh_home() / 'profiles'} 下没有检测到任何 profile。\n"
            "请确认 DSH 至少启动过一次，或用 --profile 显式指定。"
        )

    print(f"DSH_HOME = {dsh_home()}")
    print(f"目标 profile: {', '.join(t.name for t in targets)}\n")

    if args.uninstall or args.purge:
        for t in targets:
            print(uninstall_from(t, args.purge))
        return

    for t in targets:
        print(install_into(t))

    print(
        "\n装好了。让插件生效：\n"
        "  · 桌面应用：⌘Q 完全退出再打开（关窗口不算退出）\n"
        "  · dsh web：重启该命令，或刷新页面\n"
        "重启后看侧边栏左下角、头像上方，应出现一行「余额 ¥xx.xx」。"
    )


if __name__ == "__main__":
    main()
