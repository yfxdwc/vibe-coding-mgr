---
name: persistent-runtime
description: "修改 scripts/vcm-server.service / vcm-server.plist / install-*.sh / uninstall-*.sh 之一, 或调试 systemd / launchd 守护的 vcm-server 前必读 — 含 env 文件单一事实源、plist EnvironmentVariables 注入、StartLimit* 段位 4 条红线。"
authority: canonical
canonical_ref: ../../adr/0025-persistent-vcm-server.md
tags: [runtime, systemd, launchd, install, supervisor, ops]
---

# Persistent Runtime (vcm-server 守护进程)

> **When to read**: 修改 / 调试 vcm-server 的持久化运行方式 (systemd / launchd / env 文件) 前必读。
> **Authority**: [`ADR-0025`](../../adr/0025-persistent-vcm-server.md) (Linux systemd) + [`ADR-0027`](../../adr/0027-launchd-vcm-server.md) (macOS launchd)

## 1. 范围

- Linux: `scripts/vcm-server.service` + `scripts/install-service.sh` + `scripts/uninstall-service.sh`
- macOS: `scripts/vcm-server.plist` + `scripts/install-launchd.sh` + `scripts/uninstall-launchd.sh`
- 双平台共享: `scripts/vcm-server.env.example` + `~/.vcm/server.env` (env 文件是单一事实源)
- 测试: `tests/daemon.test.js` (systemd) + `tests/launchd.test.js` (macOS)

## 2. 硬约束

- ❌ **不要在 plist 内联 env 值** — launchd 无 `EnvironmentFile=`, 用 `install-launchd.sh` 渲染时从 `~/.vcm/server.env` 读出注入到 `EnvironmentVariables` dict
- ❌ **不要把 `StartLimit*` 写在 [Service] 段** — `man systemd.service` 规定必须在 `[Unit]`
- ❌ **不要让 systemd 单元同时持有 env 与脚本内部默认值** — 以 `~/.vcm/server.env` 为准
- ❌ **不要跳过 install 后 `/api/health` 探测** — 必须 retry (10 × 0.5s), 否则 systemd-active / in-process-bind race 导致误报
- ❌ **不要 uninstall 时一并删 `~/.vcm/server.env`** — env 文件跨平台单一事实源, 必须保留
- ✅ `loginctl enable-linger $USER` (Linux) 是单元 user 级运行的必要条件

## 3. 反模式

- 直接 `kill` 守护进程而不用 `systemctl stop` / `launchctl unload` — PID 漂移
- 在 plist 写死 `VCM_PORT` — 改端口必须改 plist + 重启, 而不是 env 文件
- 在 install 脚本里 `source` 全局 shell rc (`.bashrc` / `.zshrc`) — env 必须来自 `~/.vcm/server.env`
- systemd 单元里写 `ExecStart=/usr/bin/python3` 而不是 `{{VCM_ROOT}}/.venv/bin/python3` — 跑系统 Python 没装依赖

## 4. 验收

```bash
# systemd (Linux)
systemd-analyze verify scripts/vcm-server.service          # 期望 placeholder warning
bash scripts/install-service.sh                              # end-to-end install
curl -s http://127.0.0.1:$(grep ^VCM_PORT ~/.vcm/server.env | cut -d= -f2)/api/health
kill -9 $(pgrep -f vcm-server)                              # crash recovery
systemctl --user status vcm-server                          # 期望 new PID 在 6s 内

# launchd (macOS, or --dry-run on Linux CI)
bash scripts/install-launchd.sh --dry-run
plutil -lint scripts/vcm-server.plist                       # 期望 OK
bash scripts/uninstall-launchd.sh --dry-run

# 通用
bash scripts/routine_coverage.sh                            # exit 0
npm test -- tests/daemon.test.js tests/launchd.test.js      # all passed
```

## 5. 相关文档

- [`ADR-0025`](../../adr/0025-persistent-vcm-server.md) — Linux systemd user unit 决策与验收
- [`ADR-0027`](../../adr/0027-launchd-vcm-server.md) — macOS launchd LaunchAgent 决策
- [`scripts/vcm-server.service`](../../scripts/vcm-server.service) / [`scripts/vcm-server.plist`](../../scripts/vcm-server.plist) — 单元模板
- [`scripts/install-service.sh`](../../scripts/install-service.sh) / [`scripts/install-launchd.sh`](../../scripts/install-launchd.sh) — 安装器
- [`scripts/vcm-server.env.example`](../../scripts/vcm-server.env.example) — env 模板
- `tests/daemon.test.js` + `tests/launchd.test.js` — 平台测试
