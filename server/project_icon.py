# server/project_icon.py — v0.18.3 项目图标自动获取 (ADR-0034 §9.9)
#
# 在添加项目时从 git remote 自动解析图标，服务器不出网：
#   - GitHub   : https://github.com/{owner}.png?size=32   (owner avatar)
#   - GitLab   : https://gitlab.com/{owner}.png?size=32   (owner avatar)
#   - 其它平台 / 无 remote / 目录不存在 : fallback 到 hash 色 monogram
#
# 设计约束 (ADR-0034 §9.9)：
#   - 不发起网络请求：只存 URL，由浏览器 <img> 加载 (离线 / rate-limit 安全)
#   - 解析失败静默降级：永远返回合法 dict，不抛异常 (添加项目主流程不可被图标拖垮)
#   - icon_color 是 HSL 转 hex 的 fallback 色，从项目名 hash 生成，
#     保证同名同色、不同名大概率不同色（识别项目不靠首字母，靠色块）

from __future__ import annotations

import hashlib
import re
import subprocess
from pathlib import Path

# git remote 常见格式 → (host, owner) 提取
#   https://github.com/owner/repo.git
#   git@github.com:owner/repo.git
#   ssh://git@github.com/owner/repo.git
#   https://gitlab.com/group/sub/repo.git  → owner=group (取首个 segment)
_REMOTE_RE = re.compile(
    r"(?:https?://|git@|ssh://git@)?"
    r"(?P<host>[^/:@]+)[:/]"
    r"(?P<owner>[^/]+)/(?P<repo>.+?)(?:\.git)?/?$"
)

# 支持 avatar URL 生成的平台（其余 host 一律 fallback）
_AVATAR_HOSTS = {
    "github.com": lambda owner: f"https://github.com/{owner}.png?size=32",
    "www.github.com": lambda owner: f"https://github.com/{owner}.png?size=32",
    "gitlab.com": lambda owner: f"https://gitlab.com/{owner}.png?size=32",
    "www.gitlab.com": lambda owner: f"https://gitlab.com/{owner}.png?size=32",
}


def _git_remote(path: str) -> str:
    """读取项目 git origin remote URL；非 git 仓库 / 目录缺失 → ''。"""
    try:
        p = Path(path)
        if not p.is_dir():
            return ""
        # timeout 3s：大目录 / 网络文件系统下 git 也可能慢，超时即放弃
        out = subprocess.run(
            ["git", "-C", str(p), "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=3,
        )
        if out.returncode != 0:
            return ""
        return out.stdout.strip()
    except Exception:
        return ""


def _parse_remote(url: str):
    """解析 remote URL → (host, owner)。解析失败返回 None。"""
    if not url:
        return None
    m = _REMOTE_RE.match(url.strip())
    if not m:
        return None
    host = m.group("host")
    owner = m.group("owner")
    if host not in _AVATAR_HOSTS:
        return None
    return host, owner


def _hash_color(name: str) -> str:
    """项目名 → 稳定饱和色 (hex)。HSL: h=[0,360) 由 md5 前 4 字节映射,
    s=48%, l=42%（深色背景可读的中饱和中亮度）。"""
    digest = hashlib.md5(name.encode("utf-8")).digest()
    h = int.from_bytes(digest[:4], "big") % 360
    s, l = 48, 42
    # HSL → RGB → hex（纯计算，无依赖）
    c = (1 - abs(2 * l / 100 - 1)) * s / 100
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l / 100 - c / 2
    if h < 60:
        r, g, b = c, x, 0
    elif h < 120:
        r, g, b = x, c, 0
    elif h < 180:
        r, g, b = 0, c, x
    elif h < 240:
        r, g, b = 0, x, c
    elif h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    return "#{:02x}{:02x}{:02x}".format(
        round((r + m) * 255), round((g + m) * 255), round((b + m) * 255))


def resolve_project_icon(path: str, name: str) -> dict:
    """解析项目图标。永远返回 {'icon_url': str|None, 'icon_color': str}。

    icon_url 命中 GitHub / GitLab → 存头像 URL，浏览器加载；
    否则 icon_url=None，icon_color=hash 色（前端渲染 monogram 块）。
    """
    url = _git_remote(path)
    parsed = _parse_remote(url)
    if parsed:
        host, owner = parsed
        return {"icon_url": _AVATAR_HOSTS[host](owner), "icon_color": None}
    return {"icon_url": None, "icon_color": _hash_color(name)}
