#!/usr/bin/env python3
"""
自动更新 ARCHITECTURE.md 中的文件清单区域

扫描 termcat_client/src/ 下所有 .ts/.tsx/.js/.jsx/.css 源文件，
提取文件首行 JSDoc/块注释作为描述，生成树形目录结构，
替换 ARCHITECTURE.md 中 <!-- AUTO-GENERATED:START/END --> 标记之间的内容。

用法：
    python3 termcat_client/scripts/update_architecture_manifest.py

设计：
    - 幂等：多次运行结果一致（除时间戳外）
    - 静默：ARCHITECTURE.md 不存在时 exit 0
    - 路径过滤：通过 CLAUDE_TOOL_USE_INPUT 判断是否在 termcat_client/ 下
    - 轻量：扫描约 80 个文件，<1 秒完成
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# ── 路径配置 ─────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
CLIENT_ROOT = SCRIPT_DIR.parent  # termcat_client/
SRC_ROOT = CLIENT_ROOT / "src"
ARCHITECTURE_MD = CLIENT_ROOT / "claude_refs" / "ARCHITECTURE.md"

# 用于路径过滤的目录名
TRIGGER_DIR = "termcat_client"

# ── 排除规则 ─────────────────────────────────────────────────
EXCLUDE_DIRS = {
    "node_modules",
    "dist",
    "dist-electron",
    "release",
    ".git",
    ".vite",
    "coverage",
    "__tests__",
    "temp",
}

INCLUDE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".css"}

# 项目根级别的配置文件也纳入清单
ROOT_CONFIG_FILES = {
    "package.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "tailwind.config.js",
    "postcss.config.js",
    "index.html",
}

# ── 标记 ─────────────────────────────────────────────────────
START_MARKER = "<!-- AUTO-GENERATED:START -->"
END_MARKER = "<!-- AUTO-GENERATED:END -->"


def should_exclude(path: Path) -> bool:
    """判断路径是否应被排除"""
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
    return False


def extract_jsdoc_first_line(filepath: Path) -> str:
    """
    提取文件首个 JSDoc 块注释（/** ... */）或行注释（// ...）的首行描述。
    仅检查文件前 10 行。
    """
    try:
        lines = filepath.read_text(encoding="utf-8", errors="replace").split("\n")[:10]
    except (OSError, UnicodeDecodeError):
        return ""

    # 查找 /** 开头的块注释
    for line in lines:
        stripped = line.strip()
        # /** 单行 JSDoc: /** description */
        m = re.match(r'/\*\*\s*(.+?)\s*\*/', stripped)
        if m:
            return m.group(1).strip()
        # /** 多行 JSDoc 开头
        if stripped.startswith("/**"):
            continue
        # * 后续行（取第一个非空描述行）
        if stripped.startswith("*"):
            desc = stripped.lstrip("*").strip()
            if desc and not desc.startswith("@"):
                return desc
        # // 行注释（仅在文件首行）
        if stripped.startswith("//"):
            desc = stripped.lstrip("/").strip()
            if desc:
                return desc
            continue
        # 遇到非注释代码行，停止
        if stripped and not stripped.startswith("'use") and not stripped.startswith('"use'):
            break

    return ""


def scan_src_files(src_root: Path) -> list[tuple[Path, str]]:
    """扫描 src/ 目录，返回 (相对于 client_root 的路径, 描述) 列表。"""
    results = []
    for dirpath, dirnames, filenames in os.walk(src_root):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS)
        dp = Path(dirpath)
        for fname in sorted(filenames):
            fpath = dp / fname
            if fpath.suffix not in INCLUDE_EXTENSIONS:
                continue
            rel = fpath.relative_to(CLIENT_ROOT)
            if should_exclude(rel):
                continue
            desc = extract_jsdoc_first_line(fpath)
            results.append((rel, desc))
    return results


def scan_root_configs(client_root: Path) -> list[tuple[Path, str]]:
    """扫描根级配置文件。"""
    results = []
    for fname in sorted(ROOT_CONFIG_FILES):
        fpath = client_root / fname
        if fpath.exists():
            results.append((Path(fname), ""))
    return results


def build_tree_text(files: list[tuple[Path, str]]) -> str:
    """将文件列表渲染为树形文本（带描述）。"""
    tree: dict = {}
    for rel, desc in files:
        parts = rel.parts
        node = tree
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = desc

    lines: list[str] = []
    lines.append("termcat_client/")

    def render(node: dict, prefix: str = ""):
        items = list(node.items())
        for i, (name, value) in enumerate(items):
            is_last = i == len(items) - 1
            connector = "└── " if is_last else "├── "
            extension = "    " if is_last else "│   "

            if isinstance(value, dict):
                lines.append(f"{prefix}{connector}{name}/")
                render(value, prefix + extension)
            else:
                desc_str = value
                if desc_str:
                    entry = f"{prefix}{connector}{name}"
                    padding = max(2, 48 - len(entry))
                    lines.append(f"{entry}{' ' * padding}# {desc_str}")
                else:
                    lines.append(f"{prefix}{connector}{name}")

    render(tree)
    return "\n".join(lines)


def strip_tree_descriptions(tree_text: str) -> str:
    """去除树形文本中的描述部分（# 注释），只保留文件/目录结构用于对比。"""
    lines = []
    for line in tree_text.split("\n"):
        idx = line.find("  # ")
        if idx != -1:
            line = line[:idx]
        lines.append(line.rstrip())
    return "\n".join(lines)


def extract_existing_tree(content: str, start_idx: int, end_idx: int) -> str:
    """从现有标记区域中提取树形文本（去掉注释和代码围栏），用于对比。"""
    region = content[start_idx + len(START_MARKER):end_idx]
    lines = region.strip().split("\n")
    tree_lines = []
    in_code_block = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            continue
        if stripped.startswith("<!--"):
            continue
        if in_code_block:
            tree_lines.append(line)
    return "\n".join(tree_lines).strip()


def update_architecture_md(tree_text: str) -> bool:
    """替换 ARCHITECTURE.md 中标记区域的内容。仅在文件增减时才写入。"""
    if not ARCHITECTURE_MD.exists():
        return False

    content = ARCHITECTURE_MD.read_text(encoding="utf-8")

    start_idx = content.find(START_MARKER)
    end_idx = content.find(END_MARKER)

    if start_idx == -1 or end_idx == -1 or start_idx >= end_idx:
        print(f"WARNING: markers not found or invalid in {ARCHITECTURE_MD}", file=sys.stderr)
        return False

    # 只对比文件/目录路径结构，忽略描述注释 —— 仅文件增减才触发更新
    existing_tree = extract_existing_tree(content, start_idx, end_idx)
    if strip_tree_descriptions(existing_tree) == strip_tree_descriptions(tree_text):
        return False

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    replacement = (
        f"{START_MARKER}\n"
        f"<!-- 自动生成，请勿手动编辑此区域 | Auto-generated, do not edit manually -->\n"
        f"<!-- 最后更新: {timestamp} -->\n"
        f"\n"
        f"```\n"
        f"{tree_text}\n"
        f"```\n"
        f"\n"
    )

    new_content = content[:start_idx] + replacement + content[end_idx:]
    ARCHITECTURE_MD.write_text(new_content, encoding="utf-8")
    return True


def is_triggered_by_relevant_file() -> bool:
    """
    检查 hook 触发的文件是否在 termcat_client/ 下。
    手动调用（无环境变量）时始终执行。
    """
    tool_input_raw = os.environ.get("CLAUDE_TOOL_USE_INPUT")
    if not tool_input_raw:
        return True

    try:
        tool_input = json.loads(tool_input_raw)
        file_path = tool_input.get("file_path", "")
        return TRIGGER_DIR in file_path
    except (json.JSONDecodeError, TypeError):
        return TRIGGER_DIR in tool_input_raw


def main():
    """主入口"""
    if not ARCHITECTURE_MD.exists():
        sys.exit(0)

    if not is_triggered_by_relevant_file():
        sys.exit(0)

    # 扫描文件
    root_configs = scan_root_configs(CLIENT_ROOT)
    src_files = scan_src_files(SRC_ROOT)
    all_files = root_configs + src_files

    # 生成树形文本
    tree_text = build_tree_text(all_files)

    # 更新文档
    success = update_architecture_md(tree_text)

    if success:
        print(f"Updated {ARCHITECTURE_MD} ({len(all_files)} files)")
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
